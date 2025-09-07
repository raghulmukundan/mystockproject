import os
import csv
import glob
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from src.db.models import HistoricalPrice, ImportJob, ImportError, get_db
import logging

logger = logging.getLogger(__name__)

class StooqImporter:
    """Service for importing OHLCV data from Stooq CSV folder structure"""
    
    def __init__(self):
        self.db = next(get_db())
    
    def start_import(self, folder_path: str) -> int:
        """
        Start importing CSV files from Stooq folder structure
        Returns import_job_id for tracking
        """
        if not os.path.exists(folder_path):
            raise ValueError(f"Folder path does not exist: {folder_path}")
        
        # Create import job record
        import_job = ImportJob(
            folder_path=folder_path,
            status='running'
        )
        self.db.add(import_job)
        self.db.commit()
        self.db.refresh(import_job)
        
        logger.info(f"Started import job {import_job.id} for folder: {folder_path}")
        
        try:
            self._process_folder(import_job)
            
            # Mark job as completed
            import_job.status = 'completed'
            import_job.completed_at = datetime.utcnow()
            self.db.commit()
            
            logger.info(f"Completed import job {import_job.id}")
            
        except Exception as e:
            logger.error(f"Import job {import_job.id} failed: {str(e)}")
            
            # Log error
            error = ImportError(
                import_job_id=import_job.id,
                file_path=folder_path,
                error_type='GENERAL_ERROR',
                error_message=str(e)
            )
            self.db.add(error)
            
            # Mark job as failed
            import_job.status = 'failed'
            import_job.completed_at = datetime.utcnow()
            import_job.error_count += 1
            
            self.db.commit()
            raise
        
        return import_job.id
    
    def _process_folder(self, import_job: ImportJob) -> None:
        """Process all CSV files in the folder structure"""
        folder_path = import_job.folder_path
        
        # Find all CSV files recursively
        csv_files = glob.glob(os.path.join(folder_path, "**/*.csv"), recursive=True)
        
        import_job.total_files = len(csv_files)
        self.db.commit()
        
        logger.info(f"Found {len(csv_files)} CSV files to process")
        
        for csv_file in csv_files:
            try:
                self._process_csv_file(import_job, csv_file)
                import_job.processed_files += 1
                self.db.commit()
                
            except Exception as e:
                logger.error(f"Error processing file {csv_file}: {str(e)}")
                
                error = ImportError(
                    import_job_id=import_job.id,
                    file_path=csv_file,
                    error_type='FILE_PROCESSING_ERROR',
                    error_message=str(e)
                )
                self.db.add(error)
                import_job.error_count += 1
                self.db.commit()
    
    def _process_csv_file(self, import_job: ImportJob, csv_file: str) -> None:
        """Process a single CSV file"""
        # Extract symbol from file path
        # Stooq format: /path/to/data/daily/us/nasdaq/aapl.us.txt
        # We want: AAPL (without .us extension)
        filename = os.path.basename(csv_file)
        symbol_with_ext = filename.replace('.txt', '').replace('.csv', '')
        
        # Remove .us suffix if present
        if symbol_with_ext.endswith('.us'):
            symbol = symbol_with_ext[:-3].upper()
        else:
            symbol = symbol_with_ext.upper()
        
        logger.debug(f"Processing {csv_file} for symbol {symbol}")
        
        with open(csv_file, 'r', encoding='utf-8') as f:
            # Skip header if present
            first_line = f.readline().strip()
            if first_line.startswith('Date') or first_line.startswith('<TICKER>'):
                csv_reader = csv.reader(f)
            else:
                # No header, reset file pointer
                f.seek(0)
                csv_reader = csv.reader(f)
            
            row_count = 0
            for row_number, row in enumerate(csv_reader, start=2 if first_line.startswith(('Date', '<TICKER>')) else 1):
                try:
                    self._process_csv_row(import_job, symbol, row, row_number, csv_file)
                    row_count += 1
                    
                except Exception as e:
                    logger.warning(f"Error processing row {row_number} in {csv_file}: {str(e)}")
                    
                    error = ImportError(
                        import_job_id=import_job.id,
                        file_path=csv_file,
                        line_number=row_number,
                        error_type='ROW_PARSING_ERROR',
                        error_message=str(e)
                    )
                    self.db.add(error)
                    import_job.error_count += 1
            
            import_job.total_rows += row_count
            import_job.inserted_rows += row_count
            self.db.commit()
    
    def _process_csv_row(self, import_job: ImportJob, symbol: str, row: List[str], row_number: int, csv_file: str) -> None:
        """Process a single CSV row"""
        if len(row) < 6:
            raise ValueError(f"Insufficient columns in row: {row}")
        
        # Stooq CSV format: Date,Open,High,Low,Close,Volume
        date_str = row[0].strip()
        open_price = float(row[1])
        high_price = float(row[2])
        low_price = float(row[3])
        close_price = float(row[4])
        volume = int(float(row[5])) if row[5] else 0
        
        # Validate date format (YYYY-MM-DD)
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}")
        
        # Check if record already exists
        existing = self.db.query(HistoricalPrice).filter(
            HistoricalPrice.symbol == symbol,
            HistoricalPrice.date == date_str
        ).first()
        
        if existing:
            # Update existing record with Stooq data
            existing.open = open_price
            existing.high = high_price
            existing.low = low_price
            existing.close = close_price
            existing.volume = volume
            existing.source = 'stooq'
        else:
            # Insert new record
            price_record = HistoricalPrice(
                symbol=symbol,
                date=date_str,
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=volume,
                source='stooq'
            )
            self.db.add(price_record)
    
    def get_import_status(self, import_job_id: int) -> Optional[Dict[str, Any]]:
        """Get status of an import job"""
        import_job = self.db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
        if not import_job:
            return None
        
        return {
            'id': import_job.id,
            'status': import_job.status,
            'started_at': import_job.started_at.isoformat() if import_job.started_at else None,
            'completed_at': import_job.completed_at.isoformat() if import_job.completed_at else None,
            'folder_path': import_job.folder_path,
            'total_files': import_job.total_files,
            'processed_files': import_job.processed_files,
            'total_rows': import_job.total_rows,
            'inserted_rows': import_job.inserted_rows,
            'error_count': import_job.error_count
        }
    
    def get_import_errors(self, import_job_id: int) -> List[Dict[str, Any]]:
        """Get errors for an import job"""
        errors = self.db.query(ImportError).filter(
            ImportError.import_job_id == import_job_id
        ).order_by(ImportError.occurred_at.desc()).all()
        
        return [
            {
                'id': error.id,
                'occurred_at': error.occurred_at.isoformat(),
                'file_path': error.file_path,
                'line_number': error.line_number,
                'error_type': error.error_type,
                'error_message': error.error_message
            }
            for error in errors
        ]

# Singleton instance
stooq_importer = StooqImporter()