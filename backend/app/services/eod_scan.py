import logging
import os
import time
from datetime import datetime, timedelta
from typing import List

from app.core.database import get_db
from app.models.symbol import Symbol
from app.services.symbol_filter import filter_symbols, is_excluded_symbol
from app.services.prices.upsert import upsert_daily
from src.db.models import EodScan, EodScanError
from src.services.schwab.auth import SchwabTokenManager
from src.services.prices.providers.schwab_history import ProviderError
from src.services.prices.providers.schwab_history import SchwabHistoryProvider
# Job status tracking removed - now handled by separate jobs service

logger = logging.getLogger(__name__)


def _today_range_chicago() -> tuple[str, str]:
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Chicago")
    except Exception:
        tz = None
    now = datetime.now(tz) if tz else datetime.now()
    day = now.strftime("%Y-%m-%d")
    return day, day


def run_eod_scan_all_symbols(
    batch_size: int = 100,
    sleep_ms: int | None = None,
    eod_scan_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Fetch today's daily OHLC for all symbols and upsert into prices_daily.

    - Uses Schwab price history provider
    - Processes in batches to respect rate limits
    - Returns summary counts
    """
    # Allow dedicated EOD sleep override; fallback to Schwab client sleep
    sleep_ms = sleep_ms if sleep_ms is not None else int(os.getenv("EOD_REQ_SLEEP_MS", os.getenv("SCHWAB_REQ_SLEEP_MS", "250")))

    if start_date and end_date:
        start, end = start_date, end_date
    else:
        start, end = _today_range_chicago()
    logger.info(f"EOD scan starting for {start}..{end}")

    # Rate limiting and concurrency
    max_workers = int(os.getenv("EOD_WORKERS", "5"))
    max_rps = float(os.getenv("EOD_MAX_RPS", "3"))  # overall target requests/sec

    from collections import deque
    import threading
    class RateLimiter:
        def __init__(self, max_per_sec: float):
            self.max_per_sec = max(0.1, max_per_sec)
            self.win = deque()
            self.lock = threading.Lock()
        def acquire(self):
            with self.lock:
                now = time.time()
                # Drop entries older than 1 second
                while self.win and now - self.win[0] > 1.0:
                    self.win.popleft()
                # If at capacity, wait until oldest expires
                if len(self.win) >= self.max_per_sec:
                    sleep_for = 1.0 - (now - self.win[0])
                    if sleep_for > 0:
                        time.sleep(sleep_for)
                    # Recalculate window after sleep
                    now = time.time()
                    while self.win and now - self.win[0] > 1.0:
                        self.win.popleft()
                self.win.append(time.time())

    limiter = RateLimiter(max_rps)
    total_inserted = total_updated = total_skipped = total_errors = 0

    # Create or load EodScan row
    db = next(get_db())
    try:
        date_label = start if start == end else f"{start}..{end}"
        if eod_scan_id is None:
            scan = EodScan(
                started_at=datetime.utcnow(),
                status='running',
                scan_date=date_label,
                symbols_requested=0,
                symbols_fetched=0,
                error_count=0,
            )
            db.add(scan)
            db.commit()
            db.refresh(scan)
            eod_scan_id = scan.id
        else:
            scan = db.query(EodScan).filter(EodScan.id == eod_scan_id).first()
            if not scan:
                # fallback: create
                scan = EodScan(
                    started_at=datetime.utcnow(),
                    status='running',
                    scan_date=date_label,
                    symbols_requested=0,
                    symbols_fetched=0,
                    error_count=0,
                )
                db.add(scan)
                db.commit()
                db.refresh(scan)
                eod_scan_id = scan.id
    finally:
        db.close()

    # Load symbols and filter out test issues and unwanted suffix types
    db = next(get_db())
    try:
        rows = db.query(Symbol.symbol, Symbol.test_issue).all()
        symbols: List[str] = filter_symbols(rows)
    finally:
        db.close()

    # Optional cap for testing/soak tuning
    max_symbols = int(os.getenv("EOD_MAX_SYMBOLS", "0"))
    if max_symbols > 0:
        symbols = symbols[:max_symbols]

    # Update requested count
    db = next(get_db())
    try:
        scan = db.query(EodScan).filter(EodScan.id == eod_scan_id).first()
        if scan:
            scan.symbols_requested = len(symbols)
            db.commit()
    finally:
        db.close()

    logger.info(f"EOD scan will process {len(symbols)} symbols in batches of {batch_size}")

    # Pre-warm Schwab access token (reduces concurrent refresh attempts)
    try:
        SchwabTokenManager().get_access_token()
    except Exception as e:
        logger.error(f"Pre-warm Schwab token failed: {e}")
        # Mark scan failed early to avoid flooding errors when auth is down
        dbf = next(get_db())
        try:
            scanf = dbf.query(EodScan).filter(EodScan.id == eod_scan_id).first()
            if scanf:
                scanf.status = 'failed'
                scanf.completed_at = datetime.utcnow()
                dbf.commit()
            err = EodScanError(
                eod_scan_id=eod_scan_id,
                symbol='AUTH',
                error_type='auth',
                error_message=str(e),
                http_status=None,
            )
            dbf.add(err)
            dbf.commit()
        finally:
            dbf.close()
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 1,
        }

    import concurrent.futures as cf
    started_t = time.time()
    calls_made = 0

    def worker(sym: str):
        # rate limit and per-call sleep if configured
        limiter.acquire()
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000.0)
        # Use a fresh provider per worker call to avoid session/thread issues
        prov = SchwabHistoryProvider()
        bars = prov.get_daily_history(sym, start, end)
        if not bars:
            # Record no-data case for diagnostics
            db_nd = next(get_db())
            try:
                err = EodScanError(
                    eod_scan_id=eod_scan_id,
                    symbol=sym,
                    error_type='no_data',
                    error_message=f'No candles for {sym} in range {start}..{end}',
                    http_status=None,
                )
                db_nd.add(err)
                scan_nd = db_nd.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                if scan_nd:
                    scan_nd.error_count = (scan_nd.error_count or 0) + 1
                db_nd.commit()
            finally:
                db_nd.close()
            # Continue; treat as processed but with no insert
            return sym, {"inserted": 0, "updated": 0, "skipped": 0}
        counts = upsert_daily(sym, bars, source="schwab", update_if_changed=False)
        return sym, counts

    for i in range(0, len(symbols), batch_size):
        batch = symbols[i : i + batch_size]
        with cf.ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = [ex.submit(worker, sym) for sym in batch]
            for fut in cf.as_completed(futures):
                try:
                    sym, counts = fut.result()
                    calls_made += 1
                    total_inserted += counts["inserted"]
                    total_updated += counts["updated"]
                    total_skipped += counts["skipped"]
                    # Increment fetched count
                    db2 = next(get_db())
                    try:
                        scan2 = db2.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                        if scan2:
                            scan2.symbols_fetched = (scan2.symbols_fetched or 0) + 1
                            db2.commit()
                    finally:
                        db2.close()
                except ProviderError as e:
                    total_errors += 1
                    logger.warning(f"EOD upsert failed for symbol in batch: {e.message}")
                    db3 = next(get_db())
                    try:
                        err = EodScanError(
                            eod_scan_id=eod_scan_id,
                            symbol=sym if 'sym' in locals() else 'unknown',
                            error_type='provider_error',
                            error_message=e.message,
                            http_status=getattr(e, 'status_code', None),
                        )
                        db3.add(err)
                        scan3 = db3.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                        if scan3:
                            scan3.error_count = (scan3.error_count or 0) + 1
                        db3.commit()
                    finally:
                        db3.close()
                except Exception as e:
                    total_errors += 1
                    logger.warning(f"EOD upsert failed for symbol in batch: {e}")
                    db3 = next(get_db())
                    try:
                        err = EodScanError(
                            eod_scan_id=eod_scan_id,
                            symbol=sym if 'sym' in locals() else 'unknown',
                            error_type='provider_error',
                            error_message=str(e),
                            http_status=None,
                        )
                        db3.add(err)
                        scan3 = db3.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                        if scan3:
                            scan3.error_count = (scan3.error_count or 0) + 1
                        db3.commit()
                    finally:
                        db3.close()

        elapsed = max(0.001, time.time() - started_t)
        rate = calls_made / elapsed
        logger.info(
            f"EOD batch {(i//batch_size)+1}: ins={total_inserted} upd={total_updated} skip={total_skipped} err={total_errors} | calls={calls_made}, elapsed={elapsed:.1f}s, rate={rate:.2f}/s, workers={max_workers}, rps={max_rps}"
        )

    # Final retry pass for provider_error symbols (likely transient 401/429/5xx/DNS)
    try:
        db = next(get_db())
        errs = db.query(EodScanError).filter(EodScanError.eod_scan_id == eod_scan_id, EodScanError.error_type == 'provider_error').all()
        retry_syms = []
        for e in errs:
            # Retry when HTTP status is 401, 429, >=500 or unknown (DNS, network)
            if e.http_status is None or e.http_status in (401, 429) or (isinstance(e.http_status, int) and e.http_status >= 500):
                if e.symbol and e.symbol != 'unknown':
                    retry_syms.append(e.symbol)
    finally:
        try:
            db.close()
        except Exception:
            pass

    if retry_syms:
        logger.info(f"Retrying {len(retry_syms)} transient failures with reduced rate…")
        retry_workers = max(1, int(os.getenv("EOD_RETRY_WORKERS", "3")))
        retry_rps = max(0.5, float(os.getenv("EOD_RETRY_MAX_RPS", "1")))

        retry_limiter = RateLimiter(retry_rps)

        def retry_worker(sym: str):
            retry_limiter.acquire()
            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)
            prov = SchwabHistoryProvider()
            bars = prov.get_daily_history(sym, start, end)
            if not bars:
                raise ProviderError(None, f"No candles on retry for {sym} {start}..{end}")
            return sym, upsert_daily(sym, bars, source="schwab", update_if_changed=False)

        import concurrent.futures as cf2
        with cf2.ThreadPoolExecutor(max_workers=retry_workers) as ex2:
            futs = [ex2.submit(retry_worker, s) for s in retry_syms]
            for f in cf2.as_completed(futs):
                try:
                    sym, counts = f.result()
                    total_inserted += counts["inserted"]
                    total_updated += counts["updated"]
                    total_skipped += counts["skipped"]
                    # On success, remove prior error rows and decrement error_count
                    db4 = next(get_db())
                    try:
                        del_cnt = db4.query(EodScanError).filter(EodScanError.eod_scan_id == eod_scan_id, EodScanError.symbol == sym, EodScanError.error_type == 'provider_error').delete()
                        scan4 = db4.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                        if scan4 and del_cnt:
                            scan4.error_count = max(0, (scan4.error_count or 0) - del_cnt)
                        db4.commit()
                    finally:
                        db4.close()
                except Exception as e:
                    logger.warning(f"Retry still failed: {e}")

    # Finalize scan record and prune history to last 5
    try:
        logger.info(
            f"EOD scan done: inserted={total_inserted}, updated={total_updated}, skipped={total_skipped}, errors={total_errors}"
        )
        dbf = next(get_db())
        try:
            scan = dbf.query(EodScan).filter(EodScan.id == eod_scan_id).first()
            if scan:
                scan.completed_at = datetime.utcnow()
                scan.status = 'completed'
                dbf.commit()
        finally:
            dbf.close()
    except Exception:
        pass

    # Keep only last 5 EOD scans (and related errors)
    prune_eod_scans(keep=5)

    return {
        "inserted": total_inserted,
        "updated": total_updated,
        "skipped": total_skipped,
        "errors": total_errors,
    }

def retry_failed_for_scan(eod_scan_id: int) -> dict:
    """Retry previously failed provider_error symbols for a scan, using the stored date range.

    Returns a summary counts dict.
    """
    # Determine date range from scan.scan_date ("YYYY-MM-DD" or "start..end")
    db = next(get_db())
    try:
        scan = db.query(EodScan).filter(EodScan.id == eod_scan_id).first()
        if not scan:
            return {"message": "scan not found", "retried": 0}
        if scan.scan_date and ".." in scan.scan_date:
            start, end = scan.scan_date.split("..", 1)
        else:
            start = scan.scan_date
            end = scan.scan_date
    finally:
        db.close()

    # Collect retryable symbols
    db = next(get_db())
    try:
        errs = db.query(EodScanError).filter(EodScanError.eod_scan_id == eod_scan_id, EodScanError.error_type == 'provider_error').all()
        retry_syms = []
        for e in errs:
            if e.http_status is None or e.http_status in (401, 429) or (isinstance(e.http_status, int) and e.http_status >= 500):
                if e.symbol and e.symbol != 'unknown':
                    retry_syms.append(e.symbol)
    finally:
        db.close()

    if not retry_syms:
        return {"message": "no retryable symbols", "retried": 0}

    logger.info(f"Manual retry for scan {eod_scan_id}: {len(retry_syms)} symbols")

    # Pre-warm token
    try:
        SchwabTokenManager().get_access_token()
    except Exception:
        pass

    # Use reduced rate
    retry_workers = max(1, int(os.getenv("EOD_RETRY_WORKERS", "3")))
    retry_rps = max(0.5, float(os.getenv("EOD_RETRY_MAX_RPS", "1")))

    from collections import deque
    import threading
    class RateLimiter2:
        def __init__(self, max_per_sec: float):
            self.max_per_sec = max(0.1, max_per_sec)
            self.win = deque()
            self.lock = threading.Lock()
        def acquire(self):
            with self.lock:
                now = time.time()
                while self.win and now - self.win[0] > 1.0:
                    self.win.popleft()
                if len(self.win) >= self.max_per_sec:
                    sleep_for = 1.0 - (now - self.win[0])
                    if sleep_for > 0:
                        time.sleep(sleep_for)
                    now = time.time()
                    while self.win and now - self.win[0] > 1.0:
                        self.win.popleft()
                self.win.append(time.time())

    limiter = RateLimiter2(retry_rps)

    import concurrent.futures as cf
    inserted = updated = skipped = failed = 0

    def w(sym: str):
        limiter.acquire()
        prov = SchwabHistoryProvider()
        bars = prov.get_daily_history(sym, start, end)
        counts = upsert_daily(sym, bars, source="schwab", update_if_changed=False)
        return sym, counts

    with cf.ThreadPoolExecutor(max_workers=retry_workers) as ex:
        futs = [ex.submit(w, s) for s in retry_syms]
        for f in cf.as_completed(futs):
            try:
                sym, counts = f.result()
                inserted += counts["inserted"]
                updated += counts["updated"]
                skipped += counts["skipped"]
                # clear error rows
                db4 = next(get_db())
                try:
                    del_cnt = db4.query(EodScanError).filter(EodScanError.eod_scan_id == eod_scan_id, EodScanError.symbol == sym, EodScanError.error_type == 'provider_error').delete()
                    scan4 = db4.query(EodScan).filter(EodScan.id == eod_scan_id).first()
                    if scan4 and del_cnt:
                        scan4.error_count = max(0, (scan4.error_count or 0) - del_cnt)
                    db4.commit()
                finally:
                    db4.close()
            except Exception as e:
                failed += 1
                logger.warning(f"Manual retry failed for symbol: {e}")

    return {"retried": len(retry_syms), "inserted": inserted, "updated": updated, "skipped": skipped, "failed": failed}
