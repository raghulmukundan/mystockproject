from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import threading

from app.core.database import get_db
from src.db.models import EodScan, EodScanError
from app.services.eod_scan import run_eod_scan_all_symbols, retry_failed_for_scan
# Job status tracking removed - now handled by separate jobs service

router = APIRouter()


class EodScanSummary(BaseModel):
    id: int
    status: str
    scan_date: str
    started_at: Optional[str]
    completed_at: Optional[str]
    symbols_requested: int
    symbols_fetched: int
    error_count: int


class EodScanErrorResponse(BaseModel):
    id: int
    occurred_at: str
    symbol: str
    error_type: str
    error_message: str
    http_status: Optional[int]


def _to_summary(row: EodScan) -> EodScanSummary:
    # Treat naive datetimes as UTC for consistent client rendering
    def _iso_utc(dt: datetime | None) -> str | None:
        if not dt:
            return None
        try:
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc).isoformat()
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            return dt.isoformat()

    return EodScanSummary(
        id=row.id,
        status=row.status,
        scan_date=row.scan_date,
        started_at=_iso_utc(row.started_at),
        completed_at=_iso_utc(row.completed_at),
        symbols_requested=row.symbols_requested or 0,
        symbols_fetched=row.symbols_fetched or 0,
        error_count=row.error_count or 0,
    )


class EodScanStartRequest(BaseModel):
    start: str | None = None  # YYYY-MM-DD
    end: str | None = None    # YYYY-MM-DD


@router.post("/api/eod/scan/start", response_model=EodScanSummary)
def start_eod_scan_now(req: EodScanStartRequest):
    db = next(get_db())
    try:
        date_label = (req.start or '') if (req.start == req.end) else (f"{req.start}..{req.end}" if req.start and req.end else datetime.utcnow().strftime('%Y-%m-%d'))
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

        def _runner(scan_id: int):
            try:
                # Note: Job status tracking moved to separate jobs service
                result = run_eod_scan_all_symbols(eod_scan_id=scan_id, start_date=req.start, end_date=req.end)
            except Exception:
                db2 = next(get_db())
                try:
                    s = db2.query(EodScan).filter(EodScan.id == scan_id).first()
                    if s:
                        s.status = 'failed'
                        db2.commit()
                finally:
                    db2.close()

        t = threading.Thread(target=_runner, args=(scan.id,), daemon=True)
        t.start()

        return _to_summary(scan)
    finally:
        db.close()


@router.delete("/api/prices/daily/truncate")
def truncate_prices_daily():
    """Dangerous: truncate the prices_daily_ohlc table."""
    from sqlalchemy import text
    db = next(get_db())
    try:
        db.execute(text("TRUNCATE TABLE prices_daily_ohlc"))
        db.commit()
        return {"message": "prices_daily_ohlc truncated"}
    finally:
        db.close()


@router.get("/api/eod/scan/list", response_model=List[EodScanSummary])
def list_recent_eod_scans(limit: int = 20):
    db = next(get_db())
    try:
        rows = db.query(EodScan).order_by(EodScan.started_at.desc()).limit(limit).all()
        return [_to_summary(r) for r in rows]
    finally:
        db.close()


@router.get("/api/eod/scan/errors/{scan_id}", response_model=List[EodScanErrorResponse])
def get_eod_scan_errors(scan_id: int, limit: int = 100):
    db = next(get_db())
    try:
        rows = db.query(EodScanError).filter(EodScanError.eod_scan_id == scan_id).order_by(EodScanError.occurred_at.desc()).limit(limit).all()
        return [
            EodScanErrorResponse(
                id=r.id,
                occurred_at=r.occurred_at.isoformat(),
                symbol=r.symbol,
                error_type=r.error_type,
                error_message=r.error_message,
                http_status=r.http_status,
            )
            for r in rows
        ]
    finally:
        db.close()


class RetryResponse(BaseModel):
    retried: int
    inserted: int
    updated: int
    skipped: int
    failed: int


@router.post("/api/eod/scan/retry/{scan_id}", response_model=RetryResponse)
def retry_failed(scan_id: int):
    # Kick off retry in background thread
    result: dict = {}
    def _runner():
        nonlocal result
        result = retry_failed_for_scan(scan_id)
    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    # Optimistically return a placeholder; clients can poll list/errors to see progress
    return RetryResponse(retried=0, inserted=0, updated=0, skipped=0, failed=0)
