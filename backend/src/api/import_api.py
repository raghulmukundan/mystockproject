from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from src.services.stooq_importer import stooq_importer
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

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

class ImportErrorResponse(BaseModel):
    id: int
    occurred_at: str
    file_path: str
    line_number: Optional[int]
    error_type: str
    error_message: str

@router.post("/api/import/start", response_model=ImportStartResponse)
async def start_import(request: ImportStartRequest, background_tasks: BackgroundTasks):
    """
    Start importing OHLCV data from Stooq CSV folder structure
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
        # Start import in background
        import_job_id = stooq_importer.start_import(folder_path)
        
        logger.info(f"Started import job {import_job_id} for folder: {folder_path}")
        
        return ImportStartResponse(
            import_job_id=import_job_id,
            message=f"Import job {import_job_id} started successfully"
        )
        
    except Exception as e:
        logger.error(f"Failed to start import for folder {folder_path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start import: {str(e)}")

@router.get("/api/import/status/{import_job_id}", response_model=ImportStatusResponse)
async def get_import_status(import_job_id: int):
    """
    Get status of an import job
    """
    try:
        status = stooq_importer.get_import_status(import_job_id)
        
        if not status:
            raise HTTPException(status_code=404, detail=f"Import job {import_job_id} not found")
        
        return ImportStatusResponse(**status)
        
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
        errors = stooq_importer.get_import_errors(import_job_id)
        
        return [ImportErrorResponse(**error) for error in errors]
        
    except Exception as e:
        logger.error(f"Failed to get import errors for job {import_job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get import errors: {str(e)}")

@router.get("/api/import/status", response_model=List[ImportStatusResponse])
async def list_import_jobs():
    """
    List all import jobs (recent first)
    """
    try:
        # Get all import jobs - this would need to be implemented in the importer service
        # For now, return empty list as this requires additional database queries
        return []
        
    except Exception as e:
        logger.error(f"Failed to list import jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list import jobs: {str(e)}")