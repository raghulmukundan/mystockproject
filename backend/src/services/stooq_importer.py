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
        self._metadata_cache = set()  # Track processed metadata to avoid duplicates
    
    def start_import(self, folder_path: str) -> int:
        """
        Start importing CSV files from Stooq folder structure
        Returns import_job_id for tracking
        """
        # Clear metadata cache for new import job
        self._metadata_cache.clear()
        
        # Debug the path validation
        logger.info(f"Checking folder path: {repr(folder_path)}")
        logger.info(f"Path exists: {os.path.exists(folder_path)}")
        logger.info(f"Is directory: {os.path.isdir(folder_path)}")
        
        # Normalize the path to handle different path separators
        normalized_path = os.path.normpath(folder_path)
        logger.info(f"Normalized path: {repr(normalized_path)}")
        logger.info(f"Normalized exists: {os.path.exists(normalized_path)}")
        
        if not os.path.exists(normalized_path):
            raise ValueError(f"Folder path does not exist: {normalized_path}")
        
        if not os.path.isdir(normalized_path):
            raise ValueError(f"Path is not a directory: {normalized_path}")
        
        # Use the normalized path for processing
        folder_path = normalized_path
        
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
        """Process all files in the nested folder structure"""
        folder_path = import_job.folder_path
        
        # Find all supported files recursively (both .csv and .us extensions)
        supported_files = []
        for pattern in ["**/*.csv", "**/*.us", "**/*.txt"]:
            supported_files.extend(glob.glob(os.path.join(folder_path, pattern), recursive=True))
        
        # Filter out directories and ensure we have actual files
        csv_files = [f for f in supported_files if os.path.isfile(f)]
        
        import_job.total_files = len(csv_files)
        self.db.commit()
        
        logger.info(f"Found {len(csv_files)} files to process in folder structure")
        
        for csv_file in csv_files:
            try:
                # Update current progress
                import_job.current_file = os.path.basename(csv_file)
                import_job.current_folder = os.path.dirname(csv_file).replace(folder_path, '').strip('/')
                self.db.commit()
                
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
        """Process a single CSV file with enhanced metadata extraction"""
        # Parse folder structure to extract metadata
        # Expected structure: /root/daily/{country}/{exchange_or_type}/{asset_type}/{subfolders}/symbol.{country}
        # Examples:
        # - /data/daily/us/nasdaq/stocks/1/aapl.us
        # - /data/daily/us/nyse/etfs/1/spy.us
        
        file_info = self._extract_file_metadata(csv_file)
        symbol = file_info['symbol']
        country = file_info['country'] 
        asset_type = file_info['asset_type']
        exchange = file_info['exchange']
        
        logger.debug(f"Processing {csv_file}: {symbol} ({asset_type}) from {country}/{exchange}")
        
        with open(csv_file, 'r', encoding='utf-8') as f:
            # Skip header if present
            first_line = f.readline().strip()
            has_header = (first_line.startswith('<TICKER>') or 
                         first_line.startswith('Date') or
                         'TICKER' in first_line.upper())
            
            if has_header:
                csv_reader = csv.reader(f)
            else:
                # No header, reset file pointer
                f.seek(0)
                csv_reader = csv.reader(f)
            
            row_count = 0
            for row_number, row in enumerate(csv_reader, start=2 if has_header else 1):
                try:
                    self._process_csv_row(import_job, file_info, row, row_number, csv_file)
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
    
    def _extract_file_metadata(self, csv_file: str) -> dict:
        """Extract metadata from file path and filename"""
        # Get relative path parts
        path_parts = os.path.normpath(csv_file).split(os.sep)
        filename = os.path.basename(csv_file)
        
        # Remove file extensions (.us, .csv, .txt)
        symbol_with_country = filename
        for ext in ['.us', '.uk', '.de', '.csv', '.txt']:
            if symbol_with_country.endswith(ext):
                symbol_with_country = symbol_with_country[:-len(ext)]
                break
        
        # Extract country from filename (e.g., 'aapl.us' -> country='us', symbol='aapl')
        country = 'us'  # default
        symbol = symbol_with_country.upper()
        
        if '.' in symbol_with_country:
            parts = symbol_with_country.split('.')
            if len(parts) == 2 and len(parts[1]) <= 3:  # likely country code
                symbol = parts[0].upper()
                country = parts[1].lower()
        
        # Extract asset type and exchange from folder structure
        asset_type = 'stock'  # default
        exchange = 'unknown'
        
        # Look for common folder patterns
        path_lower = [p.lower() for p in path_parts]
        
        for i, part in enumerate(path_lower):
            if part in ['stocks', 'stock']:
                asset_type = 'stock'
            elif part in ['etfs', 'etf']:
                asset_type = 'etf'
            elif part in ['index', 'indices']:
                asset_type = 'index'
            elif part in ['bonds', 'bond']:
                asset_type = 'bond'
            elif part in ['commodities', 'commodity']:
                asset_type = 'commodity'
            elif part in ['forex', 'fx']:
                asset_type = 'forex'
            elif part in ['nasdaq', 'nyse', 'lse', 'tsx', 'asx']:
                exchange = part
        
        # Try to detect country from path
        for part in path_lower:
            if part in ['us', 'usa', 'united_states']:
                country = 'us'
            elif part in ['uk', 'gb', 'gbr', 'united_kingdom']:
                country = 'uk'
            elif part in ['de', 'ger', 'germany']:
                country = 'de'
            elif part in ['ca', 'can', 'canada']:
                country = 'ca'
            elif part in ['au', 'aus', 'australia']:
                country = 'au'
        
        return {
            'symbol': symbol,
            'country': country,
            'asset_type': asset_type,
            'exchange': exchange,
            'filename': filename,
            'folder_path': os.path.dirname(csv_file).replace(os.sep, '/')
        }
    
    def _process_csv_row(self, import_job: ImportJob, file_info: dict, row: List[str], row_number: int, csv_file: str) -> None:
        """Process a single CSV row with new format: TICKER,PER,DATE,TIME,OPEN,HIGH,LOW,CLOSE,VOL,OPENINT"""
        if len(row) < 9:
            raise ValueError(f"Insufficient columns in row (expected 10, got {len(row)}): {row}")
        
        # New CSV format: <TICKER>,<PER>,<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOL>,<OPENINT>
        try:
            ticker = row[0].strip()
            period = row[1].strip()  # e.g., 'D' for daily
            date_str = row[2].strip()
            time_str = row[3].strip() 
            open_price = float(row[4]) if row[4] else 0.0
            high_price = float(row[5]) if row[5] else 0.0
            low_price = float(row[6]) if row[6] else 0.0
            close_price = float(row[7]) if row[7] else 0.0
            volume = int(float(row[8])) if row[8] else 0
            open_interest = int(float(row[9])) if len(row) > 9 and row[9] else 0
        except (ValueError, IndexError) as e:
            raise ValueError(f"Error parsing row values: {e}")
        
        # Parse date - could be YYYY-MM-DD or YYYYMMDD
        try:
            if '-' in date_str:
                parsed_date = datetime.strptime(date_str, '%Y-%m-%d')
            else:
                parsed_date = datetime.strptime(date_str, '%Y%m%d')
            date_normalized = parsed_date.strftime('%Y-%m-%d')
        except ValueError:
            raise ValueError(f"Invalid date format: {date_str}")
        
        symbol = file_info['symbol']
        country = file_info['country']
        asset_type = file_info['asset_type']
        
        # For now, use the existing primary key (symbol + date) 
        # TODO: Update to proper compound key in future migration
        existing = self.db.query(HistoricalPrice).filter(
            HistoricalPrice.symbol == symbol,
            HistoricalPrice.date == date_normalized
        ).first()
        
        if existing:
            # Update existing record with Stooq data
            existing.open = open_price
            existing.high = high_price
            existing.low = low_price
            existing.close = close_price
            existing.volume = volume
            existing.open_interest = open_interest
            existing.source = 'stooq'
            existing.original_filename = file_info['filename']
            existing.folder_path = file_info['folder_path']
        else:
            # Insert new record with enhanced schema
            price_record = HistoricalPrice(
                symbol=symbol,
                date=date_normalized,
                country=country,
                asset_type=asset_type,
                open=open_price,
                high=high_price,
                low=low_price,
                close=close_price,
                volume=volume,
                open_interest=open_interest,
                source='stooq',
                original_filename=file_info['filename'],
                folder_path=file_info['folder_path']
            )
            self.db.add(price_record)
            
        # Also update/create asset metadata
        self._update_asset_metadata(file_info)
    
    def _update_asset_metadata(self, file_info: dict) -> None:
        """Update or create asset metadata"""
        from src.db.models import AssetMetadata
        
        symbol = file_info['symbol']
        country = file_info['country']
        asset_type = file_info['asset_type']
        exchange = file_info['exchange']
        
        # Use cache to avoid duplicate processing
        cache_key = f"{symbol}_{country}"
        if cache_key in self._metadata_cache:
            return
        
        try:
            # Check if metadata already exists
            existing_metadata = self.db.query(AssetMetadata).filter(
                AssetMetadata.symbol == symbol,
                AssetMetadata.country == country
            ).first()
            
            if existing_metadata:
                # Update existing metadata
                existing_metadata.asset_type = asset_type
                existing_metadata.exchange = exchange
                existing_metadata.updated_at = datetime.utcnow()
            else:
                # Create new metadata record
                metadata = AssetMetadata(
                    symbol=symbol,
                    country=country,
                    asset_type=asset_type,
                    exchange=exchange,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                self.db.add(metadata)
                
                # Flush to ensure the record is inserted but don't commit yet
                self.db.flush()
            
            # Add to cache after successful processing
            self._metadata_cache.add(cache_key)
                
        except Exception as e:
            # If there's a unique constraint violation, rollback and try to fetch existing
            self.db.rollback()
            existing_metadata = self.db.query(AssetMetadata).filter(
                AssetMetadata.symbol == symbol,
                AssetMetadata.country == country
            ).first()
            
            if existing_metadata:
                # Update the existing record that was created by another transaction
                existing_metadata.asset_type = asset_type
                existing_metadata.exchange = exchange
                existing_metadata.updated_at = datetime.utcnow()
                # Add to cache after successful processing
                self._metadata_cache.add(cache_key)
            else:
                # Re-raise the exception if it's not a constraint issue
                raise e
    
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
            'error_count': import_job.error_count,
            'current_file': getattr(import_job, 'current_file', None),
            'current_folder': getattr(import_job, 'current_folder', None)
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