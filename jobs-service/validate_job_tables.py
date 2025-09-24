#!/usr/bin/env python3
"""
Validation script for job table mappings.

This script validates that all tables referenced in job_table_mappings.py
actually exist in the database. It runs before Docker startup to catch
configuration errors early.

Usage:
    python validate_job_tables.py

Exit codes:
    0: All tables exist and are valid
    1: Missing tables or configuration errors
    2: Database connection error
"""

import sys
import os
import logging
from typing import List, Dict

# Add app to Python path
sys.path.insert(0, '/app')

try:
    from app.config.job_table_mappings import JOB_TABLE_MAPPINGS, get_all_tables
    from app.core.database import get_db
    from sqlalchemy import text, inspect
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're running this from the jobs-service container")
    sys.exit(2)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def check_database_connection():
    """Check if we can connect to the database"""
    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db.close()
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False

def get_existing_tables():
    """Get list of all existing tables in the database"""
    try:
        db = next(get_db())
        inspector = inspect(db.bind)
        tables = inspector.get_table_names()
        db.close()
        return set(tables)
    except Exception as e:
        logger.error(f"Failed to get table list: {e}")
        return set()

def validate_table_mappings() -> tuple[bool, List[str]]:
    """
    Validate that all tables in job mappings exist in database.
    Returns (is_valid, list_of_errors)
    """
    errors = []

    # Get all tables from mappings
    mapped_tables = set(get_all_tables())

    # Get existing tables from database
    existing_tables = get_existing_tables()

    if not existing_tables:
        errors.append("Could not retrieve table list from database")
        return False, errors

    # Check for missing tables
    missing_tables = mapped_tables - existing_tables

    if missing_tables:
        errors.append(f"Missing tables in database: {', '.join(sorted(missing_tables))}")

    # Validate mapping structure
    for job_type, mapping in JOB_TABLE_MAPPINGS.items():
        if not isinstance(mapping, dict):
            errors.append(f"Job '{job_type}': mapping must be a dictionary")
            continue

        if "parent" not in mapping:
            errors.append(f"Job '{job_type}': missing 'parent' key")
            continue

        if "children" not in mapping:
            errors.append(f"Job '{job_type}': missing 'children' key")
            continue

        if not isinstance(mapping["children"], list):
            errors.append(f"Job '{job_type}': 'children' must be a list")
            continue

        # Validate child table structure
        for i, child in enumerate(mapping["children"]):
            if not isinstance(child, dict):
                errors.append(f"Job '{job_type}': child {i} must be a dictionary")
                continue

            if "table" not in child:
                errors.append(f"Job '{job_type}': child {i} missing 'table' key")

            if "fk" not in child:
                errors.append(f"Job '{job_type}': child {i} missing 'fk' key")

    return len(errors) == 0, errors

def print_summary():
    """Print summary of all mappings"""
    print("\n📋 Current Job Table Mappings:")
    print("=" * 50)

    for job_type, mapping in JOB_TABLE_MAPPINGS.items():
        print(f"\n🔧 {job_type}:")
        print(f"   Parent: {mapping['parent']}")
        if mapping['children']:
            print(f"   Children:")
            for child in mapping['children']:
                print(f"     - {child['table']} (FK: {child['fk']})")
        else:
            print(f"   Children: None")

def main():
    """Main validation function"""
    print("🔍 Validating job table mappings...")

    # Check database connection
    if not check_database_connection():
        print("❌ Cannot connect to database")
        sys.exit(2)

    # Validate mappings
    is_valid, errors = validate_table_mappings()

    if is_valid:
        print("✅ All job table mappings are valid!")
        print(f"✅ Verified {len(get_all_tables())} tables exist in database")
        print_summary()
        sys.exit(0)
    else:
        print("❌ Job table mapping validation failed!")
        for error in errors:
            print(f"   • {error}")
        print_summary()
        sys.exit(1)

if __name__ == "__main__":
    main()