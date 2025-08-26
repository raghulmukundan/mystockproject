from datetime import datetime, timedelta
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.models import Alert, AlertType, AlertSeverity
from app.services.alert_service import SmartAlertService

router = APIRouter()

# Pydantic models for API responses
class AlertResponse(BaseModel):
    id: int
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    watchlist_id: Optional[int]
    symbol: Optional[str]
    value: Optional[float]
    threshold: Optional[float]
    is_active: bool
    is_read: bool
    created_at: datetime
    resolved_at: Optional[datetime]
    context_data: Optional[str]

class AlertSummary(BaseModel):
    total_alerts: int
    unread_alerts: int
    critical_alerts: int
    high_alerts: int
    medium_alerts: int
    low_alerts: int

class AlertAction(BaseModel):
    action: str  # "read" or "dismiss"

class CreateAlertRequest(BaseModel):
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    watchlist_id: Optional[int] = None
    symbol: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None

@router.get("/", response_model=List[AlertResponse])
async def get_alerts(
    limit: int = 50,
    unread_only: bool = False,
    severity: Optional[AlertSeverity] = None,
    alert_type: Optional[AlertType] = None,
    watchlist_id: Optional[int] = None,
    recent_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get alerts with optional filtering"""
    query = db.query(Alert).filter(Alert.is_active == True)
    
    if unread_only:
        query = query.filter(Alert.is_read == False)
    
    if severity:
        query = query.filter(Alert.severity == severity)
    
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    
    if watchlist_id:
        query = query.filter(Alert.watchlist_id == watchlist_id)
    
    if recent_only:
        # Only show alerts from last 7 days by default
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        query = query.filter(Alert.created_at > cutoff_date)
    
    alerts = query.order_by(Alert.created_at.desc()).limit(limit).all()
    
    return [AlertResponse(
        id=alert.id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        watchlist_id=alert.watchlist_id,
        symbol=alert.symbol,
        value=alert.value,
        threshold=alert.threshold,
        is_active=alert.is_active,
        is_read=alert.is_read,
        created_at=alert.created_at,
        resolved_at=alert.resolved_at,
        context_data=alert.context_data
    ) for alert in alerts]

@router.get("/old", response_model=List[AlertResponse])
async def get_old_alerts(
    limit: int = 100,
    days_old: int = 7,
    db: Session = Depends(get_db)
):
    """Get old alerts (older than specified days)"""
    cutoff_date = datetime.utcnow() - timedelta(days=days_old)
    
    alerts = db.query(Alert).filter(
        Alert.is_active == True,
        Alert.created_at <= cutoff_date
    ).order_by(Alert.created_at.desc()).limit(limit).all()
    
    return [AlertResponse(
        id=alert.id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        watchlist_id=alert.watchlist_id,
        symbol=alert.symbol,
        value=alert.value,
        threshold=alert.threshold,
        is_active=alert.is_active,
        is_read=alert.is_read,
        created_at=alert.created_at,
        resolved_at=alert.resolved_at,
        context_data=alert.context_data
    ) for alert in alerts]

@router.get("/by-watchlist", response_model=Dict[str, List[AlertResponse]])
async def get_alerts_by_watchlist(
    recent_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get alerts grouped by watchlist"""
    from app.models.watchlist import Watchlist
    
    query = db.query(Alert).filter(Alert.is_active == True)
    
    if recent_only:
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        query = query.filter(Alert.created_at > cutoff_date)
    
    alerts = query.order_by(Alert.created_at.desc()).all()
    
    # Group alerts by watchlist
    watchlist_alerts = {}
    manual_alerts = []
    
    for alert in alerts:
        if alert.watchlist_id:
            watchlist = db.query(Watchlist).filter(Watchlist.id == alert.watchlist_id).first()
            watchlist_name = watchlist.name if watchlist else f"Watchlist {alert.watchlist_id}"
            
            if watchlist_name not in watchlist_alerts:
                watchlist_alerts[watchlist_name] = []
            
            watchlist_alerts[watchlist_name].append(AlertResponse(
                id=alert.id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                title=alert.title,
                message=alert.message,
                watchlist_id=alert.watchlist_id,
                symbol=alert.symbol,
                value=alert.value,
                threshold=alert.threshold,
                is_active=alert.is_active,
                is_read=alert.is_read,
                created_at=alert.created_at,
                resolved_at=alert.resolved_at,
                context_data=alert.context_data
            ))
        else:
            # Manual alerts (no watchlist_id)
            manual_alerts.append(AlertResponse(
                id=alert.id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                title=alert.title,
                message=alert.message,
                watchlist_id=alert.watchlist_id,
                symbol=alert.symbol,
                value=alert.value,
                threshold=alert.threshold,
                is_active=alert.is_active,
                is_read=alert.is_read,
                created_at=alert.created_at,
                resolved_at=alert.resolved_at,
                context_data=alert.context_data
            ))
    
    if manual_alerts:
        watchlist_alerts["Manual Alerts"] = manual_alerts
    
    return watchlist_alerts

@router.get("/summary", response_model=AlertSummary)
async def get_alert_summary(db: Session = Depends(get_db)):
    """Get summary statistics of current alerts"""
    active_alerts = db.query(Alert).filter(Alert.is_active == True).all()
    
    total_alerts = len(active_alerts)
    unread_alerts = len([a for a in active_alerts if not a.is_read])
    
    # Count by severity
    critical_alerts = len([a for a in active_alerts if a.severity == AlertSeverity.CRITICAL])
    high_alerts = len([a for a in active_alerts if a.severity == AlertSeverity.HIGH])
    medium_alerts = len([a for a in active_alerts if a.severity == AlertSeverity.MEDIUM])
    low_alerts = len([a for a in active_alerts if a.severity == AlertSeverity.LOW])
    
    return AlertSummary(
        total_alerts=total_alerts,
        unread_alerts=unread_alerts,
        critical_alerts=critical_alerts,
        high_alerts=high_alerts,
        medium_alerts=medium_alerts,
        low_alerts=low_alerts
    )

@router.post("/analyze")
async def trigger_alert_analysis(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Manually trigger analysis to create missing alerts only"""
    alert_service = SmartAlertService(db)
    
    # Run missing alerts analysis in background
    background_tasks.add_task(alert_service.analyze_missing_alerts_only)
    
    return {"message": "Missing alerts analysis started in background"}

@router.post("/analyze/full")
async def trigger_full_alert_analysis(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Full alert analysis (creates all alerts, may create duplicates)"""
    alert_service = SmartAlertService(db)
    
    # Run full analysis in background
    background_tasks.add_task(alert_service.analyze_and_create_alerts)
    
    return {"message": "Full alert analysis started in background"}

@router.put("/{alert_id}/action")
async def perform_alert_action(
    alert_id: int,
    action: AlertAction,
    db: Session = Depends(get_db)
):
    """Perform an action on an alert (mark as read or dismiss)"""
    alert_service = SmartAlertService(db)
    
    if action.action == "read":
        success = alert_service.mark_alert_as_read(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"message": "Alert marked as read"}
    
    elif action.action == "dismiss":
        success = alert_service.dismiss_alert(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"message": "Alert dismissed"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'read' or 'dismiss'")

@router.delete("/{alert_id}")
async def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    """Delete an alert permanently"""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    db.delete(alert)
    db.commit()
    
    return {"message": "Alert deleted successfully"}

@router.get("/types", response_model=List[str])
async def get_alert_types():
    """Get all available alert types"""
    return [alert_type.value for alert_type in AlertType]

@router.get("/severities", response_model=List[str])
async def get_alert_severities():
    """Get all available alert severities"""
    return [severity.value for severity in AlertSeverity]

@router.post("/cleanup")
async def cleanup_old_alerts(
    days_old: int = 30,
    db: Session = Depends(get_db)
):
    """Clean up old alerts (mark as inactive)"""
    alert_service = SmartAlertService(db)
    
    cleaned_count = alert_service.cleanup_old_alerts(days_old)
    
    return {"message": f"Cleaned up {cleaned_count} alerts older than {days_old} days"}

@router.post("/", response_model=AlertResponse)
async def create_alert(
    alert_request: CreateAlertRequest,
    db: Session = Depends(get_db)
):
    """Create a manual alert"""
    alert = Alert(
        alert_type=alert_request.alert_type,
        severity=alert_request.severity,
        title=alert_request.title,
        message=alert_request.message,
        watchlist_id=alert_request.watchlist_id,
        symbol=alert_request.symbol,
        value=alert_request.value,
        threshold=alert_request.threshold,
        created_at=datetime.utcnow()
    )
    
    db.add(alert)
    db.commit()
    db.refresh(alert)
    
    return AlertResponse(
        id=alert.id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        watchlist_id=alert.watchlist_id,
        symbol=alert.symbol,
        value=alert.value,
        threshold=alert.threshold,
        is_active=alert.is_active,
        is_read=alert.is_read,
        created_at=alert.created_at,
        resolved_at=alert.resolved_at,
        context_data=alert.context_data
    )