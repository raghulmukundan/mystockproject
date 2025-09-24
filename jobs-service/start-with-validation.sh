#!/bin/bash

# Startup script that validates job table mappings before starting the service

set -e  # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Jobs Service with table mapping validation..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until python -c "
import sys
sys.path.insert(0, '/app')
try:
    from app.core.database import get_db
    from sqlalchemy import text
    db = next(get_db())
    db.execute(text('SELECT 1'))
    db.close()
    print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database not ready: {e}')
    exit(1)
" ; do
    echo "⏳ Database not ready, waiting 2 seconds..."
    sleep 2
done

# Run table mapping validation
echo "🔍 Validating job table mappings..."
python validate_job_tables.py

if [ $? -eq 0 ]; then
    echo "✅ Table mapping validation passed!"
else
    echo "❌ Table mapping validation failed!"
    echo "🚨 Cannot start service with invalid table mappings."
    exit 1
fi

# Start the main application
echo "🚀 Starting Jobs Service..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8004