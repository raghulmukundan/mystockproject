"""
EOD scan implementation for jobs-service
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timedelta
from typing import List
from collections import deque
import threading
import concurrent.futures as cf

from app.core.database import SessionLocal
from app.db.models import Symbol, EodScan, EodScanError
from app.services.symbol_filter import filter_symbols
from app.services.prices.upsert import upsert_daily
from app.services.prices.providers.external_api_provider import ExternalApiProvider, ProviderError
from app.services.eod_scan_utils import prune_eod_scans

logger = logging.getLogger(__name__)

def _eod_scan_date_range_chicago() -> tuple[str, str]:
    """Get the appropriate date range for EOD scan.

    For EOD scans at 5:30 PM CST, we want the current trading day's data.
    If it's after market close (4 PM CST), use today's date.
    If it's before market open (9:30 AM CST), use previous trading day.
    """
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Chicago")
    except Exception:
        tz = None

    now = datetime.now(tz) if tz else datetime.now()

    # Check if it's a weekend
    if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
        # Go back to Friday
        days_back = now.weekday() - 4  # Friday = 4
        target_date = now - timedelta(days=days_back)
    else:
        # Check time of day
        market_close_hour = 16  # 4 PM CST

        if now.hour >= market_close_hour:
            # After market close, use today's data
            target_date = now
        else:
            # Before market close, check if it's Monday
            if now.weekday() == 0:  # Monday
                # Use Friday's data
                target_date = now - timedelta(days=3)
            else:
                # Use previous day's data
                target_date = now - timedelta(days=1)

    day = target_date.strftime("%Y-%m-%d")
    return day, day

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

async def run_eod_scan_all_symbols(
    batch_size: int = 100,
    sleep_ms: int | None = None,
    eod_scan_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Fetch today's daily OHLC for all symbols and upsert into prices_daily_ohlc.

    - Uses external-apis service for price data
    - Processes in batches to respect rate limits
    - Returns summary counts
    """
    # Allow dedicated EOD sleep override
    sleep_ms = sleep_ms if sleep_ms is not None else int(os.getenv("EOD_REQ_SLEEP_MS", "250"))

    if start_date and end_date:
        start, end = start_date, end_date
    else:
        start, end = _eod_scan_date_range_chicago()
    logger.info(f"EOD scan starting for {start}..{end}")

    # Rate limiting and concurrency
    max_workers = int(os.getenv("EOD_WORKERS", "5"))
    max_rps = float(os.getenv("EOD_MAX_RPS", "3"))  # overall target requests/sec

    limiter = RateLimiter(max_rps)
    total_inserted = total_updated = total_skipped = total_errors = 0

    # Create or load EodScan row
    db = SessionLocal()
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
    db = SessionLocal()
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
    db = SessionLocal()
    try:
        scan = db.query(EodScan).filter(EodScan.id == eod_scan_id).first()
        if scan:
            scan.symbols_requested = len(symbols)
            db.commit()
    finally:
        db.close()

    logger.info(f"EOD scan will process {len(symbols)} symbols in batches of {batch_size}")

    started_t = time.time()
    calls_made = 0

    async def worker(sym: str):
        # rate limit and per-call sleep if configured
        limiter.acquire()
        if sleep_ms > 0:
            await asyncio.sleep(sleep_ms / 1000.0)

        # Use external API provider
        provider = ExternalApiProvider()
        bars = await provider.get_daily_history(sym, start, end)

        if not bars:
            # Record no-data case for diagnostics
            db_nd = SessionLocal()
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

    # Process in batches
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i : i + batch_size]

        # Create tasks for async processing
        tasks = [worker(sym) for sym in batch]

        # Process batch
        for task in asyncio.as_completed(tasks):
            try:
                sym, counts = await task
                calls_made += 1
                total_inserted += counts["inserted"]
                total_updated += counts["updated"]
                total_skipped += counts["skipped"]
                # Increment fetched count
                db2 = SessionLocal()
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
                db3 = SessionLocal()
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
                db3 = SessionLocal()
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

    # Finalize scan record and prune history to last 5
    try:
        logger.info(
            f"EOD scan done: inserted={total_inserted}, updated={total_updated}, skipped={total_skipped}, errors={total_errors}"
        )
        dbf = SessionLocal()
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
        "symbols_requested": len(symbols),
        "symbols_fetched": total_inserted + total_updated + total_skipped,
    }