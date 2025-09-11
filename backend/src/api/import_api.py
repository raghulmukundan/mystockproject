from fastapi import APIRouter, HTTPException, BackgroundTasks
import threading
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from datetime import datetime
from src.services.bulk_importer import bulk_importer
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter()

def run_bulk_import_with_error_handling(import_job_id: int, folder_path: str):
    """Wrapper function for bulk import with error handling"""
    try:
        logger.info(f"Thread started for bulk import job {import_job_id}")
        bulk_importer.run_bulk_import(import_job_id, folder_path)
        logger.info(f"Thread completed for bulk import job {import_job_id}")
    except Exception as e:
        logger.error(f"Bulk import thread failed for job {import_job_id}: {str(e)}")
        # Update job status to failed
        try:
            from src.db.models import ImportJob, get_db
            with next(get_db()) as db:
                import_job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
                if import_job:
                    import_job.status = 'failed'
                    import_job.completed_at = datetime.utcnow()
                    import_job.error_count = 1
                    db.commit()
        except Exception as db_error:
            logger.error(f"Failed to update job status: {str(db_error)}")
        raise e

"""Only bulk import is supported now. Legacy normal import removed."""

class ImportStartRequest(BaseModel):
    folder_path: str

class ImportStartResponse(BaseModel):
    import_job_id: int
    message: str

class ImportStatusResponse(BaseModel):
    id: int
    status: str
    started_at: Optional[str]
    completed_at: Optional[str]
    folder_path: str
    total_files: int
    processed_files: int
    total_rows: int
    inserted_rows: int
    error_count: int
    current_file: Optional[str] = None
    current_folder: Optional[str] = None

class ImportErrorResponse(BaseModel):
    id: int
    occurred_at: str
    file_path: str
    line_number: Optional[int]
    error_type: str
    error_message: str

# Legacy /api/import/start removed

@router.get("/api/import/status/{import_job_id}", response_model=ImportStatusResponse)
async def get_import_status(import_job_id: int):
    """
    Get status of an import job
    """
    try:
        from src.db.models import ImportJob, get_db
        with next(get_db()) as db:
            job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
            if not job:
                raise HTTPException(status_code=404, detail=f"Import job {import_job_id} not found")
            return ImportStatusResponse(
                id=job.id,
                status=job.status,
                started_at=job.started_at.isoformat() if job.started_at else None,
                completed_at=job.completed_at.isoformat() if job.completed_at else None,
                folder_path=job.folder_path,
                total_files=job.total_files,
                processed_files=job.processed_files,
                total_rows=job.total_rows,
                inserted_rows=job.inserted_rows,
                error_count=job.error_count,
                current_file=job.current_file,
                current_folder=job.current_folder,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get import status for job {import_job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get import status: {str(e)}")

@router.get("/api/import/errors/{import_job_id}", response_model=List[ImportErrorResponse])
async def get_import_errors(import_job_id: int):
    """
    Get errors for an import job
    """
    try:
        from src.db.models import ImportError as ImportErrorModel, get_db
        with next(get_db()) as db:
            rows = db.query(ImportErrorModel).filter(
                ImportErrorModel.import_job_id == import_job_id
            ).order_by(ImportErrorModel.occurred_at.desc()).all()
            return [
                ImportErrorResponse(
                    id=row.id,
                    occurred_at=row.occurred_at.isoformat(),
                    file_path=row.file_path,
                    line_number=row.line_number,
                    error_type=row.error_type,
                    error_message=row.error_message,
                )
                for row in rows
            ]
    except Exception as e:
        logger.error(f"Failed to get import errors for job {import_job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get import errors: {str(e)}")

@router.get("/api/import/status", response_model=List[ImportStatusResponse])
async def list_import_jobs():
    """
    List all import jobs (recent first)
    """
    try:
        from src.db.models import ImportJob, get_db
        
        db = next(get_db())
        
        # Get all import jobs ordered by most recent first
        import_jobs = db.query(ImportJob).order_by(ImportJob.started_at.desc()).all()
        
        result = []
        for job in import_jobs:
            result.append(ImportStatusResponse(
                id=job.id,
                status=job.status,
                started_at=job.started_at.isoformat() if job.started_at else None,
                completed_at=job.completed_at.isoformat() if job.completed_at else None,
                folder_path=job.folder_path,
                total_files=job.total_files,
                processed_files=job.processed_files,
                total_rows=job.total_rows,
                inserted_rows=job.inserted_rows,
                error_count=job.error_count,
                current_file=job.current_file,
                current_folder=job.current_folder
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to list import jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list import jobs: {str(e)}")

@router.delete("/api/import/cleanup")
async def cleanup_import_data():
    """
    Clean up all import jobs, errors, and processed files from database
    """
    try:
        from src.db.models import ImportJob, ImportError, ProcessedFile, FailedFile, HistoricalPrice, get_db
        
        db = next(get_db())
        
        # Delete all import errors
        deleted_errors = db.query(ImportError).delete()
        
        # Delete all failed files
        deleted_failed_files = db.query(FailedFile).delete()
        
        # Delete all processed files
        deleted_files = db.query(ProcessedFile).delete()
        
        # Delete all import jobs
        deleted_jobs = db.query(ImportJob).delete()
        
        # Delete all historical prices for fresh start
        deleted_prices = db.query(HistoricalPrice).delete()
        
        db.commit()
        
        return {
            "message": "Import data cleaned up successfully",
            "deleted_jobs": deleted_jobs,
            "deleted_files": deleted_files,
            "deleted_errors": deleted_errors,
            "deleted_failed_files": deleted_failed_files,
            "deleted_prices": deleted_prices
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup import data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup import data: {str(e)}")

@router.post("/api/import/bulk-start", response_model=ImportStartResponse)
async def start_bulk_import(request: ImportStartRequest, background_tasks: BackgroundTasks):
    """
    Start ultra-fast bulk import using PostgreSQL COPY command
    """
    folder_path = request.folder_path.strip()
    
    # Validate folder path
    if not folder_path:
        raise HTTPException(status_code=400, detail="Folder path is required")
    
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=400, detail=f"Folder path does not exist: {folder_path}")
    
    if not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {folder_path}")
    
    try:
        # Create import job record first
        import_job_id = bulk_importer.create_bulk_import_job(folder_path)
        
        # Start the actual bulk import in background using threading        
        bulk_thread = threading.Thread(
            target=run_bulk_import_with_error_handling,
            args=(import_job_id, folder_path),
            daemon=True
        )
        bulk_thread.start()
        
        logger.info(f"Started bulk import job {import_job_id} for folder: {folder_path}")
        
        return ImportStartResponse(
            import_job_id=import_job_id,
            message=f"Bulk import job {import_job_id} started successfully (ultra-fast mode)"
        )
        
    except Exception as e:
        logger.error(f"Failed to start bulk import for folder {folder_path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start bulk import: {str(e)}")

@router.get("/api/import/diag")
async def import_diag():
    """Return diagnostic info about DB connection and table counts."""
    try:
        from src.db.models import get_db
        db = next(get_db())
        info = {}
        try:
            # Current DB, user, and search_path
            info_row = db.execute(text("SELECT current_database(), current_user, current_setting('search_path')")).fetchone()
            info["current_database"] = info_row[0]
            info["current_user"] = info_row[1]
            info["search_path"] = info_row[2]
        except Exception as e:
            info["db_info_error"] = str(e)

        try:
            jobs_count = db.execute(text("SELECT COUNT(*) FROM public.import_jobs")).scalar()
        except Exception as e:
            jobs_count = None
            info["import_jobs_count_error"] = str(e)

        try:
            hp_count = db.execute(text("SELECT COUNT(*) FROM public.historical_prices")).scalar()
        except Exception as e:
            hp_count = None
            info["historical_prices_count_error"] = str(e)

        info["import_jobs_count"] = jobs_count
        info["historical_prices_count"] = hp_count

        print("[ImportDiag]", info)
        return info
    except Exception as e:
        logger.error(f"/api/import/diag failed: {e}")
        raise HTTPException(status_code=500, detail=f"diag failed: {str(e)}")
