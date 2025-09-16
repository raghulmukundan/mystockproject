from typing import Dict
from sqlalchemy.orm import Session

from src.db.models import SessionLocal, TechnicalDaily, TechnicalLatest


def upsert_latest(db: Session, row: dict) -> int:
    """Upsert into technical_latest by symbol."""
    sym = row["symbol"]
    rec = db.query(TechnicalLatest).filter(TechnicalLatest.symbol == sym).first()
    if rec is None:
        rec = TechnicalLatest(**row)
        db.add(rec)
        db.commit()
        return 1
    # Update fields
    for k, v in row.items():
        setattr(rec, k, v)
    db.commit()
    return 1


def upsert_daily(db: Session, rows: list[dict]) -> int:
    """Upsert one or more rows into technical_daily (PK symbol+date)."""
    count = 0
    for row in rows:
        sym = row["symbol"]
        date = row["date"]
        rec = db.query(TechnicalDaily).filter(TechnicalDaily.symbol == sym, TechnicalDaily.date == date).first()
        if rec is None:
            rec = TechnicalDaily(**row)
            db.add(rec)
            count += 1
        else:
            for k, v in row.items():
                setattr(rec, k, v)
            count += 1
    db.commit()
    return count

