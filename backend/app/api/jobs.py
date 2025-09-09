from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db
from src.db.models import JobConfiguration, JobExecutionStatus

router = APIRouter()

class JobConfigurationResponse(BaseModel):
    id: int
    job_name: str
    description: str
    enabled: bool
    schedule_type: str
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    cron_day_of_week: Optional[str] = None
    cron_hour: Optional[int] = None
    cron_minute: Optional[int] = None
    only_market_hours: bool
    market_start_hour: Optional[int] = None
    market_end_hour: Optional[int] = None
    created_at: str
    updated_at: str

class JobConfigurationUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedule_type: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    cron_day_of_week: Optional[str] = None
    cron_hour: Optional[int] = None
    cron_minute: Optional[int] = None
    only_market_hours: Optional[bool] = None
    market_start_hour: Optional[int] = None
    market_end_hour: Optional[int] = None

class JobStatusResponse(BaseModel):
    id: int
    job_name: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[int] = None
    records_processed: Optional[int] = None
    error_message: Optional[str] = None
    next_run_at: Optional[str] = None

class JobSummaryResponse(BaseModel):
    job_name: str
    description: str
    enabled: bool
    schedule_display: str
    last_run: Optional[JobStatusResponse] = None

@router.get("/jobs", response_model=List[JobConfigurationResponse])
def get_all_jobs(db: Session = Depends(get_db)):
    """Get all job configurations"""
    jobs = db.query(JobConfiguration).all()
    return [
        JobConfigurationResponse(
            id=job.id,
            job_name=job.job_name,
            description=job.description,
            enabled=job.enabled,
            schedule_type=job.schedule_type,
            interval_value=job.interval_value,
            interval_unit=job.interval_unit,
            cron_day_of_week=job.cron_day_of_week,
            cron_hour=job.cron_hour,
            cron_minute=job.cron_minute,
            only_market_hours=job.only_market_hours,
            market_start_hour=job.market_start_hour,
            market_end_hour=job.market_end_hour,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat()
        )
        for job in jobs
    ]

@router.get("/jobs/summary", response_model=List[JobSummaryResponse])
def get_jobs_summary(db: Session = Depends(get_db)):
    """Get job summaries with last run status"""
    jobs = db.query(JobConfiguration).all()
    result = []
    
    for job in jobs:
        # Get last execution status
        last_status = db.query(JobExecutionStatus).filter(
            JobExecutionStatus.job_name == job.job_name
        ).order_by(JobExecutionStatus.started_at.desc()).first()
        
        # Format schedule display
        if job.schedule_type == 'interval':
            schedule_display = f"Every {job.interval_value} {job.interval_unit}"
            if job.only_market_hours:
                schedule_display += " (market hours only)"
        else:  # cron
            if job.cron_day_of_week == 'sun':
                day_display = "Sunday"
            elif job.cron_day_of_week == 'mon,tue,wed,thu,fri':
                day_display = "Weekdays"
            else:
                day_display = job.cron_day_of_week
            schedule_display = f"{day_display} at {job.cron_hour:02d}:{job.cron_minute:02d}"
        
        last_run_response = None
        if last_status:
            last_run_response = JobStatusResponse(
                id=last_status.id,
                job_name=last_status.job_name,
                status=last_status.status,
                started_at=last_status.started_at.isoformat(),
                completed_at=last_status.completed_at.isoformat() if last_status.completed_at else None,
                duration_seconds=last_status.duration_seconds,
                records_processed=last_status.records_processed,
                error_message=last_status.error_message,
                next_run_at=last_status.next_run_at.isoformat() if last_status.next_run_at else None
            )
        
        result.append(JobSummaryResponse(
            job_name=job.job_name,
            description=job.description,
            enabled=job.enabled,
            schedule_display=schedule_display,
            last_run=last_run_response
        ))
    
    return result

@router.put("/jobs/{job_name}", response_model=JobConfigurationResponse)
def update_job_configuration(job_name: str, update: JobConfigurationUpdate, db: Session = Depends(get_db)):
    """Update job configuration"""
    job = db.query(JobConfiguration).filter(JobConfiguration.job_name == job_name).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Update fields if provided
    if update.enabled is not None:
        job.enabled = update.enabled
    if update.schedule_type is not None:
        job.schedule_type = update.schedule_type
    if update.interval_value is not None:
        job.interval_value = update.interval_value
    if update.interval_unit is not None:
        job.interval_unit = update.interval_unit
    if update.cron_day_of_week is not None:
        job.cron_day_of_week = update.cron_day_of_week
    if update.cron_hour is not None:
        job.cron_hour = update.cron_hour
    if update.cron_minute is not None:
        job.cron_minute = update.cron_minute
    if update.only_market_hours is not None:
        job.only_market_hours = update.only_market_hours
    if update.market_start_hour is not None:
        job.market_start_hour = update.market_start_hour
    if update.market_end_hour is not None:
        job.market_end_hour = update.market_end_hour
    
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    
    # TODO: Trigger scheduler update when scheduler supports dynamic updates
    # from app.core.scheduler import update_job_schedule
    # update_job_schedule(job_name)
    
    return JobConfigurationResponse(
        id=job.id,
        job_name=job.job_name,
        description=job.description,
        enabled=job.enabled,
        schedule_type=job.schedule_type,
        interval_value=job.interval_value,
        interval_unit=job.interval_unit,
        cron_day_of_week=job.cron_day_of_week,
        cron_hour=job.cron_hour,
        cron_minute=job.cron_minute,
        only_market_hours=job.only_market_hours,
        market_start_hour=job.market_start_hour,
        market_end_hour=job.market_end_hour,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat()
    )

@router.get("/jobs/{job_name}/status", response_model=List[JobStatusResponse])
def get_job_status_history(job_name: str, limit: int = 10, db: Session = Depends(get_db)):
    """Get job execution status history"""
    statuses = db.query(JobExecutionStatus).filter(
        JobExecutionStatus.job_name == job_name
    ).order_by(JobExecutionStatus.started_at.desc()).limit(limit).all()
    
    return [
        JobStatusResponse(
            id=status.id,
            job_name=status.job_name,
            status=status.status,
            started_at=status.started_at.isoformat(),
            completed_at=status.completed_at.isoformat() if status.completed_at else None,
            duration_seconds=status.duration_seconds,
            records_processed=status.records_processed,
            error_message=status.error_message,
            next_run_at=status.next_run_at.isoformat() if status.next_run_at else None
        )
        for status in statuses
    ]