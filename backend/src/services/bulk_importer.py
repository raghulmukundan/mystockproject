import os
import csv
import glob
import tempfile
import logging
from datetime import datetime
from typing import List, Tuple, Optional
from sqlalchemy import text
from src.db.models import ImportJob, ImportError, get_db
import psycopg2
from psycopg2.extras import execute_values

logger = logging.getLogger(__name__)

class BulkImporter:
    """Ultra-fast bulk importer using native PostgreSQL COPY command"""
    
    def __init__(self):
        pass
    
    def create_bulk_import_job(self, folder_path: str) -> int:
        """Create a new bulk import job record"""
        normalized_path = os.path.normpath(folder_path)
        
        if not os.path.exists(normalized_path):
            raise ValueError(f"Folder path does not exist: {normalized_path}")
        
        if not os.path.isdir(normalized_path):
            raise ValueError(f"Path is not a directory: {normalized_path}")
        
        with next(get_db()) as db:
            import_job = ImportJob(
                started_at=datetime.utcnow(),
                status='running',
                folder_path=normalized_path,
                total_files=0,
                processed_files=0,
                total_rows=0,
                inserted_rows=0,
                error_count=0
            )
            
            db.add(import_job)
            db.commit()
            db.refresh(import_job)
            
            logger.info(f"Created bulk import job {import_job.id} for path: {normalized_path}")
            return import_job.id
    
    def run_bulk_import(self, import_job_id: int, folder_path: str):
        """Run the ultra-fast bulk import process using native PostgreSQL COPY"""
        try:
            with next(get_db()) as db:
                import_job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
                
                if not import_job:
                    raise ValueError(f"Import job {import_job_id} not found")
                
                logger.info(f"Starting bulk import for job {import_job_id}")
                
                # Step 1: Find all CSV files
                logger.info("Step 1: Discovering files...")
                csv_files = self._find_all_csv_files(folder_path)
                
                import_job.total_files = len(csv_files)
                db.commit()
                
                logger.info(f"Found {len(csv_files)} files to process")
                
                # Step 2: Create chunked CSV files
                logger.info("Step 2: Preprocessing files into chunked bulk format...")
                chunk_files, total_rows = self._create_chunked_csvs(
                    csv_files, import_job_id, folder_path, chunk_size_rows=500_000
                )

                import_job.total_rows = total_rows
                import_job.processed_files = len(csv_files)  # All files processed in preprocessing
                db.commit()
                
                logger.info(f"Created {len(chunk_files)} chunk file(s) with {total_rows} rows total")
                
                # Step 3: Bulk import using chunked COPY into temp table then INSERT into final table
                logger.info("Step 3: Executing chunked COPY -> INSERT into historical_prices...")
                # Update current status indicators so UI reflects COPY phase
                try:
                    import_job.current_folder = f"COPY => historical_prices"
                    import_job.current_file = f"{len(chunk_files)} chunk(s)"
                    db.commit()
                except Exception:
                    db.rollback()
                inserted_rows = self._execute_chunked_copy(chunk_files, import_job_id)

                # Update job status based on results
                import_job.inserted_rows = inserted_rows
                # Treat reruns that find only duplicates as completed (no-op) instead of failed
                import_job.status = 'completed'
                import_job.completed_at = datetime.utcnow()
                db.commit()
                
                # Clean up chunk files
                for p in chunk_files:
                    try:
                        os.unlink(p)
                    except Exception:
                        pass
                
                logger.info(f"Bulk import job {import_job_id} completed successfully! Inserted {inserted_rows} rows")
                
        except Exception as e:
            logger.error(f"Bulk import job {import_job_id} failed: {e}")
            with next(get_db()) as db:
                import_job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
                if import_job:
                    import_job.status = 'failed'
                    import_job.completed_at = datetime.utcnow()
                    import_job.error_count = 1
                    db.commit()
            raise
    
    def _find_all_csv_files(self, folder_path: str) -> List[str]:
        """Find all CSV files in the folder structure"""
        supported_files = []
        for pattern in ["**/*.csv", "**/*.us", "**/*.txt"]:
            supported_files.extend(glob.glob(os.path.join(folder_path, pattern), recursive=True))
        
        return [f for f in supported_files if os.path.isfile(f)]
    
    def _create_consolidated_csv(self, csv_files: List[str], import_job_id: int, base_folder: str) -> Tuple[str, int]:
        """Create a single consolidated CSV file ready for PostgreSQL COPY.

        Also updates import job progress frequently so the UI can display live status.
        """
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', encoding='utf-8')
        temp_path = temp_file.name
        
        total_rows = 0
        files_done = 0
        
        try:
            # Write CSV header for historical_prices table (no header for COPY)
            writer = csv.writer(temp_file)
            
            for csv_file in csv_files:
                try:
                    file_rows = self._process_file_for_bulk(csv_file, base_folder, writer)
                    total_rows += file_rows
                    files_done += 1

                    # Periodically update job progress so UI shows movement
                    # Update on every file to keep it responsive without excessive DB churn.
                    rel_folder = os.path.dirname(csv_file).replace(base_folder, '').strip('/')
                    self._update_job_progress(
                        import_job_id=import_job_id,
                        processed_files=files_done,
                        total_rows=total_rows,
                        current_file=os.path.basename(csv_file),
                        current_folder=rel_folder or '/'
                    )
                    
                    if total_rows and total_rows % 100000 == 0:
                        logger.info(f"Preprocessed {total_rows} rows so far...")
                        
                except Exception as e:
                    logger.warning(f"Skipping problematic file {csv_file}: {e}")
                    # Log file-level error for later review/retry
                    self._log_import_error(
                        import_job_id,
                        file_path=csv_file,
                        error_type='preprocess_error',
                        error_message=str(e)
                    )
                    continue
            
            temp_file.close()
            logger.info(f"Consolidated CSV created at {temp_path} with {total_rows} rows")
            return temp_path, total_rows
            
        except Exception as e:
            temp_file.close()
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise e
    
    def _process_file_for_bulk(self, csv_file: str, base_folder: str, writer) -> int:
        """Process a single CSV file and write to consolidated file"""
        rows_written = 0
        
        # Extract metadata from file path
        symbol, country, asset_type = self._extract_metadata_from_path(csv_file, base_folder)
        original_filename = os.path.basename(csv_file)
        relative_folder = os.path.dirname(csv_file).replace(base_folder, '').strip('/')
        
        try:
            with open(csv_file, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                
                # Skip header row if present
                first_row = next(reader, None)
                if first_row and any('<' in cell for cell in first_row):
                    pass  # Skip header row
                else:
                    # Process first row as data
                    if first_row:
                        row_data = self._parse_row_to_bulk_format(
                            first_row, symbol, country, asset_type, 
                            original_filename, relative_folder
                        )
                        if row_data:
                            writer.writerow(row_data)
                            rows_written += 1
                
                # Process remaining rows
                for row in reader:
                    if len(row) >= 9:  # Ensure minimum required columns
                        row_data = self._parse_row_to_bulk_format(
                            row, symbol, country, asset_type, 
                            original_filename, relative_folder
                        )
                        if row_data:
                            writer.writerow(row_data)
                            rows_written += 1
                            
        except Exception as e:
            logger.warning(f"Error processing file {csv_file}: {e}")
        
        return rows_written
    
    def _extract_metadata_from_path(self, file_path: str, base_folder: str) -> Tuple[str, str, str]:
        """Extract symbol, country, asset_type from file path"""
        # Remove base folder and get relative path
        relative_path = file_path.replace(base_folder, '').strip('/')
        
        # Extract filename and remove extension
        filename = os.path.basename(file_path)
        symbol_with_country = os.path.splitext(filename)[0]  # e.g., 'aapl.us'
        
        # Split symbol and country
        parts = symbol_with_country.split('.')
        symbol = parts[0].upper() if parts else 'UNKNOWN'
        country = parts[1].lower() if len(parts) > 1 else 'us'
        
        # Determine asset type from folder structure
        path_lower = relative_path.lower()
        if 'etfs' in path_lower or 'etf' in path_lower:  # Check ETFs first, more specific
            asset_type = 'etf'
        elif 'stocks' in path_lower or 'stock' in path_lower:
            asset_type = 'stock'
        elif 'index' in path_lower:
            asset_type = 'index'
        else:
            asset_type = 'stock'  # Default
        
        return symbol, country, asset_type
    
    def _parse_row_to_bulk_format(self, row: List[str], symbol: str, country: str,
                                  asset_type: str, original_filename: str,
                                  folder_path: str) -> Optional[List]:
        """Parse a CSV row into bulk import format"""
        try:
            if len(row) < 9:
                return None
            
            # Parse date from YYYYMMDD format
            date_str = row[2]  # DATE column
            if len(date_str) == 8:
                formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
            else:
                return None  # Skip invalid dates
            
            # Convert numeric values
            open_price = float(row[4])
            high_price = float(row[5])
            low_price = float(row[6])
            close_price = float(row[7])
            volume = int(float(row[8])) if row[8] else 0
            open_interest = int(float(row[9])) if len(row) > 9 and row[9] else 0
            
            return [
                symbol,
                formatted_date,
                country,
                asset_type,
                open_price,
                high_price,
                low_price,
                close_price,
                volume,
                open_interest,
                'stooq',
                original_filename,
                folder_path
            ]
            
        except (ValueError, IndexError) as e:
            return None  # Skip invalid rows

    def _execute_native_copy(self, csv_file_path: str, import_job_id: int) -> int:
        """Execute native PostgreSQL COPY command for maximum speed.

        Returns the number of rows newly inserted into historical_prices based on table counts,
        not cursor.rowcount, which can be unreliable for INSERT..SELECT with ON CONFLICT.
        """
        import os
        # Reuse the same SQLAlchemy engine the app uses to avoid URL parsing issues
        from src.db.models import engine as sa_engine
        
        try:
            # Obtain DBAPI connection (psycopg2) from SQLAlchemy engine
            conn = sa_engine.raw_connection()
            cursor = conn.cursor()
            
            # Use COPY command for maximum speed with ON CONFLICT handling
            logger.info("Executing native PostgreSQL COPY...")

            # First, create a temporary table for the import
            temp_table = f"temp_import_{os.getpid()}"

            # Ensure we operate in the expected schema
            try:
                cursor.execute("SET LOCAL search_path TO public")
            except Exception:
                pass

            # Create a temp table with matching columns but WITHOUT constraints/indexes
            # to avoid PK violations during COPY if duplicates exist in source files.
            create_temp_table_sql = f"""
                CREATE TEMPORARY TABLE {temp_table} (
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    country TEXT NOT NULL,
                    asset_type TEXT NOT NULL,
                    open DOUBLE PRECISION NOT NULL,
                    high DOUBLE PRECISION NOT NULL,
                    low DOUBLE PRECISION NOT NULL,
                    close DOUBLE PRECISION NOT NULL,
                    volume BIGINT NOT NULL DEFAULT 0,
                    open_interest BIGINT DEFAULT 0,
                    source TEXT NOT NULL,
                    original_filename TEXT,
                    folder_path TEXT
                ) ON COMMIT DROP
            """
            cursor.execute(create_temp_table_sql)
            
            # Use COPY to load data into temp table
            with open(csv_file_path, 'r', encoding='utf-8') as f:
                copy_sql = f"""
                    COPY {temp_table} (symbol, date, country, asset_type, open, high, low, close, volume, open_interest, source, original_filename, folder_path)
                    FROM STDIN WITH CSV
                """
                cursor.copy_expert(copy_sql, f)

            # Count rows staged in the temp table
            cursor.execute(f"SELECT COUNT(*) FROM {temp_table}")
            staged_count = cursor.fetchone()[0]
            logger.info(f"Staged {staged_count} rows in temp table {temp_table}")
            try:
                print(f"[BulkImport] Staged rows: {staged_count} in {temp_table}", flush=True)
            except Exception:
                pass

            # Base count before insert
            cursor.execute("SELECT COUNT(*) FROM historical_prices")
            base_count = cursor.fetchone()[0]
            
            # Insert from temp table with conflict resolution (explicit columns)
            insert_sql = f"""
                INSERT INTO historical_prices (
                    symbol, date, country, asset_type, open, high, low, close, volume,
                    open_interest, source, original_filename, folder_path
                )
                SELECT symbol, date, country, asset_type, open, high, low, close, volume,
                       open_interest, source, original_filename, folder_path
                FROM {temp_table}
                ON CONFLICT (symbol, date, country, asset_type) DO NOTHING
            """
            cursor.execute(insert_sql)
            # Compute inserted rows by delta count to avoid rowcount ambiguity
            cursor.execute("SELECT COUNT(*) FROM historical_prices")
            after_count = cursor.fetchone()[0]
            inserted_count = max(0, after_count - base_count)
            try:
                print(f"[BulkImport] Inserted rows delta: {inserted_count}", flush=True)
            except Exception:
                pass
            
            # Commit the transaction
            conn.commit()
            
            try:
                cursor.close()
            finally:
                conn.close()
            
            logger.info(f"Native COPY completed. Inserted {inserted_count} new rows")
            return inserted_count
            
        except Exception as e:
            logger.error(f"Native COPY failed: {e}")
            try:
                if 'conn' in locals():
                    conn.rollback()
            finally:
                if 'conn' in locals():
                    conn.close()
            # Also persist a high-level error row for visibility
            self._log_import_error(
                import_job_id=import_job_id,
                file_path=os.path.basename(csv_file_path),
                error_type='copy_error',
                error_message=str(e)
            )
            raise e

    def _update_job_progress(self, import_job_id: int, processed_files: Optional[int] = None,
                              total_rows: Optional[int] = None, current_file: Optional[str] = None,
                              current_folder: Optional[str] = None, inserted_rows: Optional[int] = None):
        """Update import job progress fields safely."""
        try:
            with next(get_db()) as db:
                job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
                if not job:
                    return
                if processed_files is not None:
                    job.processed_files = processed_files
                if total_rows is not None:
                    job.total_rows = total_rows
                if current_file is not None:
                    job.current_file = current_file
                if current_folder is not None:
                    job.current_folder = current_folder
                if inserted_rows is not None:
                    job.inserted_rows = inserted_rows
                db.commit()
        except Exception as e:
            # Don't fail the whole import for a UI/progress update issue
            logger.debug(f"Progress update skipped due to error: {e}")

    def _log_import_error(self, import_job_id: int, file_path: str, error_type: str,
                          error_message: str, line_number: Optional[int] = None):
        """Insert a row into import_errors for visibility and retry tracking."""
        try:
            with next(get_db()) as db:
                err = ImportError(
                    import_job_id=import_job_id,
                    occurred_at=datetime.utcnow(),
                    file_path=file_path,
                    line_number=line_number,
                    error_type=error_type,
                    error_message=error_message
                )
                db.add(err)
                db.commit()
        except Exception as e:
            logger.debug(f"Failed to log import error for {file_path}: {e}")

    def _create_chunked_csvs(self, csv_files: List[str], import_job_id: int, base_folder: str,
                              chunk_size_rows: int = 500_000) -> Tuple[List[str], int]:
        """Create multiple chunk CSV files (no headers), each up to chunk_size_rows rows.

        Returns list of chunk file paths and total rows staged. Updates job progress.
        """
        temp_dir = tempfile.mkdtemp(prefix="bulk_chunks_")
        chunk_paths: List[str] = []
        total_rows = 0
        files_done = 0

        def new_chunk_file(index: int):
            path = os.path.join(temp_dir, f"chunk_{index:04d}.csv")
            f = open(path, 'w', encoding='utf-8', newline='')
            w = csv.writer(f)
            return path, f, w

        chunk_index = 0
        chunk_rows = 0
        chunk_path, chunk_fp, chunk_writer = new_chunk_file(chunk_index)
        chunk_paths.append(chunk_path)

        try:
            for csv_file in csv_files:
                try:
                    # Extract metadata from file path
                    symbol, country, asset_type = self._extract_metadata_from_path(csv_file, base_folder)
                    original_filename = os.path.basename(csv_file)
                    relative_folder = os.path.dirname(csv_file).replace(base_folder, '').strip('/')

                    with open(csv_file, 'r', encoding='utf-8', errors='ignore') as f:
                        reader = csv.reader(f)
                        first_row = next(reader, None)
                        if first_row and any('<' in cell for cell in first_row):
                            pass
                        else:
                            if first_row:
                                row_data = self._parse_row_to_bulk_format(
                                    first_row, symbol, country, asset_type, original_filename, relative_folder
                                )
                                if row_data:
                                    chunk_writer.writerow(row_data)
                                    total_rows += 1
                                    chunk_rows += 1
                        for row in reader:
                            if len(row) >= 9:
                                row_data = self._parse_row_to_bulk_format(
                                    row, symbol, country, asset_type, original_filename, relative_folder
                                )
                                if row_data:
                                    chunk_writer.writerow(row_data)
                                    total_rows += 1
                                    chunk_rows += 1
                                    if chunk_rows >= chunk_size_rows:
                                        # rotate chunk
                                        chunk_fp.close()
                                        chunk_index += 1
                                        chunk_rows = 0
                                        chunk_path, chunk_fp, chunk_writer = new_chunk_file(chunk_index)
                                        chunk_paths.append(chunk_path)

                    files_done += 1
                    self._update_job_progress(
                        import_job_id=import_job_id,
                        processed_files=files_done,
                        total_rows=total_rows,
                        current_file=os.path.basename(csv_file),
                        current_folder=relative_folder or '/'
                    )

                    if total_rows and (total_rows % 1_000_000 == 0):
                        logger.info(f"Preprocessed {total_rows} rows so far into {len(chunk_paths)} chunk(s)...")
                        try:
                            print(f"[BulkImport] Preprocessed rows: {total_rows}, chunks: {len(chunk_paths)}")
                        except Exception:
                            pass

                except Exception as e:
                    logger.warning(f"Skipping problematic file {csv_file}: {e}")
                    self._log_import_error(import_job_id, csv_file, 'preprocess_error', str(e))
                    continue

            # Close the last chunk file if open
            try:
                if not chunk_fp.closed:
                    chunk_fp.close()
            except Exception:
                pass

            logger.info(f"Chunked CSVs created in {temp_dir}: {len(chunk_paths)} file(s), total rows {total_rows}")
            return chunk_paths, total_rows

        except Exception as e:
            try:
                if not chunk_fp.closed:
                    chunk_fp.close()
            except Exception:
                pass
            # Best-effort cleanup of partial files
            for p in chunk_paths:
                try:
                    os.unlink(p)
                except Exception:
                    pass
            raise e

    def _execute_chunked_copy(self, chunk_files: List[str], import_job_id: int) -> int:
        """COPY each chunk into a reusable temp table, INSERT into historical_prices, commit per chunk.

        Returns cumulative inserted rows (based on table count delta per chunk).
        """
        from src.db.models import engine as sa_engine
        total_inserted = 0

        conn = None
        cursor = None
        try:
            conn = sa_engine.raw_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("SET LOCAL search_path TO public")
            except Exception:
                pass

            temp_table = f"temp_import_{os.getpid()}"
            create_temp_table_sql = f"""
                CREATE TEMPORARY TABLE IF NOT EXISTS {temp_table} (
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    country TEXT NOT NULL,
                    asset_type TEXT NOT NULL,
                    open DOUBLE PRECISION NOT NULL,
                    high DOUBLE PRECISION NOT NULL,
                    low DOUBLE PRECISION NOT NULL,
                    close DOUBLE PRECISION NOT NULL,
                    volume BIGINT NOT NULL DEFAULT 0,
                    open_interest BIGINT DEFAULT 0,
                    source TEXT NOT NULL,
                    original_filename TEXT,
                    folder_path TEXT
                )
            """
            cursor.execute(create_temp_table_sql)
            conn.commit()

            # Base count before starting
            cursor.execute("SELECT COUNT(*) FROM historical_prices")
            base_total = cursor.fetchone()[0]

            zero_insert_streak = 0
            for idx, path in enumerate(chunk_files, start=1):
                # Update progress for UI
                self._update_job_progress(
                    import_job_id=import_job_id,
                    current_folder=f"COPY chunk {idx}/{len(chunk_files)} => historical_prices",
                    current_file=os.path.basename(path)
                )

                # Load chunk into temp table
                with open(path, 'r', encoding='utf-8') as f:
                    copy_sql = f"""
                        COPY {temp_table} (symbol, date, country, asset_type, open, high, low, close, volume, open_interest, source, original_filename, folder_path)
                        FROM STDIN WITH CSV
                    """
                    cursor.copy_expert(copy_sql, f)

                # Insert with conflict handling
                insert_sql = f"""
                    INSERT INTO historical_prices (
                        symbol, date, country, asset_type, open, high, low, close, volume,
                        open_interest, source, original_filename, folder_path
                    )
                    SELECT symbol, date, country, asset_type, open, high, low, close, volume,
                           open_interest, source, original_filename, folder_path
                    FROM {temp_table}
                    ON CONFLICT (symbol, date, country, asset_type) DO NOTHING
                """
                cursor.execute(insert_sql)

                # Determine per-chunk counts based on INSERT result
                inserted_this_chunk = cursor.rowcount if hasattr(cursor, "rowcount") else None
                # If rowcount unavailable, fall back to table delta
                if inserted_this_chunk is None:
                    cursor.execute("SELECT COUNT(*) FROM historical_prices")
                    after = cursor.fetchone()[0]
                    inserted_this_chunk = max(0, after - base_total)
                    base_total = after

                # Compute size of the staged chunk to estimate skips
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {temp_table}")
                    staged_rows = cursor.fetchone()[0]
                except Exception:
                    staged_rows = None

                total_inserted += inserted_this_chunk

                conn.commit()

                # Log progress including skipped estimate when available
                try:
                    if staged_rows is not None:
                        skipped = max(0, staged_rows - inserted_this_chunk)
                        logger.info(
                            f"Chunk {idx}/{len(chunk_files)}: inserted {inserted_this_chunk}, skipped {skipped} (cumulative inserted {total_inserted})"
                        )
                        print(
                            f"[BulkImport] Chunk {idx}/{len(chunk_files)}: inserted {inserted_this_chunk}, skipped {skipped} (cumulative inserted {total_inserted})",
                            flush=True,
                        )
                    else:
                        logger.info(
                            f"Chunk {idx}/{len(chunk_files)} inserted {inserted_this_chunk} rows (cumulative {total_inserted})"
                        )
                        print(
                            f"[BulkImport] Chunk {idx}/{len(chunk_files)} inserted {inserted_this_chunk} rows (cumulative {total_inserted})",
                            flush=True,
                        )
                except Exception:
                    pass

                # Update job with cumulative inserted rows
                try:
                    self._update_job_progress(import_job_id=import_job_id, inserted_rows=total_inserted)
                except Exception:
                    pass

                # Clear temp table for next chunk
                cursor.execute(f"TRUNCATE {temp_table}")
                conn.commit()

            # Final progress update
            self._update_job_progress(import_job_id=import_job_id, current_folder="COPY => historical_prices", current_file="done")

            return total_inserted

        except Exception as e:
            logger.error(f"Chunked COPY failed: {e}")
            try:
                if conn:
                    conn.rollback()
            finally:
                if conn:
                    conn.close()
            self._log_import_error(import_job_id, file_path="chunked_copy", error_type="copy_error", error_message=str(e))
            raise
        finally:
            try:
                if cursor:
                    cursor.close()
            except Exception:
                pass
            try:
                if conn:
                    conn.close()
            except Exception:
                pass

# Create global instance
bulk_importer = BulkImporter()
