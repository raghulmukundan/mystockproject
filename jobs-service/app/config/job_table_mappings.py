"""
Job table mappings configuration for TTL cleanup.

This file defines the relationships between job tables and their related child tables.
Each job type has a parent table and zero or more child tables that reference it.

Used by:
- TTL cleanup job to know which tables to clean up together
- Validation tests to ensure all referenced tables exist
- Future job monitoring and reporting features
"""

# Main job table mappings
JOB_TABLE_MAPPINGS = {
    "technical_compute": {
        "parent": "tech_jobs",
        "children": [
            {"table": "tech_job_errors", "fk": "tech_job_id"},
            {"table": "tech_job_skips", "fk": "tech_job_id"},
            {"table": "tech_job_successes", "fk": "tech_job_id"}
        ]
    },
    "eod_scan": {
        "parent": "eod_scans",
        "children": [
            {"table": "eod_scan_errors", "fk": "eod_scan_id"}
        ]
    },
    "data_import": {
        "parent": "import_jobs",
        "children": [
            {"table": "import_errors", "fk": "import_job_id"},
            {"table": "processed_files", "fk": "import_job_id"},
            {"table": "failed_files", "fk": "import_job_id"}
        ]
    },
    "daily_signals": {
        "parent": "daily_signals_jobs",
        "children": []
    },
    "weekly_bars": {
        "parent": "weekly_bars_jobs",
        "children": []
    },
    "weekly_technicals": {
        "parent": "weekly_technicals_jobs",
        "children": [
            {"table": "weekly_technicals_job_errors", "fk": "job_id"}
        ]
    },
    "weekly_signals": {
        "parent": "weekly_signals_jobs",
        "children": []
    },
    # General job execution tracking (standalone table)
    "general_jobs": {
        "parent": "job_execution_status",
        "children": []
    }
}

def get_all_parent_tables():
    """Get list of all parent tables from mappings"""
    return [mapping["parent"] for mapping in JOB_TABLE_MAPPINGS.values()]

def get_all_child_tables():
    """Get list of all child tables from mappings"""
    child_tables = []
    for mapping in JOB_TABLE_MAPPINGS.values():
        child_tables.extend([child["table"] for child in mapping["children"]])
    return child_tables

def get_all_tables():
    """Get list of all tables (parent + children) from mappings"""
    return get_all_parent_tables() + get_all_child_tables()

def get_job_mapping(job_type):
    """Get mapping for a specific job type"""
    return JOB_TABLE_MAPPINGS.get(job_type)

def get_cleanup_order(job_type):
    """Get tables in order for cleanup (children first, then parent)"""
    mapping = get_job_mapping(job_type)
    if not mapping:
        return []

    # Children first (for referential integrity), then parent
    tables = []
    for child in mapping["children"]:
        tables.append({
            "table": child["table"],
            "fk": child["fk"],
            "is_parent": False
        })

    tables.append({
        "table": mapping["parent"],
        "fk": None,
        "is_parent": True
    })

    return tables