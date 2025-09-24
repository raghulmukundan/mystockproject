#!/usr/bin/env python3
"""Analyze job execution times and validate scheduled runs"""

from datetime import datetime
import pytz

def convert_utc_to_cst(utc_time_str):
    """Convert UTC timestamp to CST"""
    # Parse UTC time
    utc_time = datetime.fromisoformat(utc_time_str.replace('Z', '+00:00'))

    # Convert to CST
    cst = pytz.timezone('America/Chicago')
    cst_time = utc_time.astimezone(cst)

    return cst_time

def analyze_jobs():
    print("=== Job Scheduling Analysis ===\n")

    # Scheduled times (configured)
    print("SCHEDULED TIMES:")
    print("  EOD price scan: 17:30 (5:30 PM CST) on mon-fri")
    print("  Technical analysis: 18:00 (6:00 PM CST) on mon-fri")
    print()

    # EOD Scan #29 execution
    eod_start = "2025-09-22T22:30:00.077189"
    eod_end = "2025-09-22T23:19:56.488337"

    eod_start_cst = convert_utc_to_cst(eod_start + "Z")
    eod_end_cst = convert_utc_to_cst(eod_end + "Z")

    print("EOD SCAN #29 EXECUTION:")
    print(f"  Started: {eod_start_cst.strftime('%Y-%m-%d %H:%M:%S %Z')} ({eod_start} UTC)")
    print(f"  Ended:   {eod_end_cst.strftime('%Y-%m-%d %H:%M:%S %Z')} ({eod_end} UTC)")
    print(f"  Duration: {(eod_end_cst - eod_start_cst).total_seconds() / 60:.1f} minutes")
    print()

    # Technical Analysis #5 execution
    tech_start = "2025-09-22T23:00:00.119957+00:00"
    tech_end = "2025-09-22T23:03:43.471503+00:00"

    tech_start_cst = convert_utc_to_cst(tech_start)
    tech_end_cst = convert_utc_to_cst(tech_end)

    print("TECHNICAL ANALYSIS #5 EXECUTION:")
    print(f"  Started: {tech_start_cst.strftime('%Y-%m-%d %H:%M:%S %Z')} ({tech_start})")
    print(f"  Ended:   {tech_end_cst.strftime('%Y-%m-%d %H:%M:%S %Z')} ({tech_end})")
    print(f"  Duration: {(tech_end_cst - tech_start_cst).total_seconds() / 60:.1f} minutes")
    print()

    # Analysis
    print("ANALYSIS:")

    # Check EOD timing
    expected_eod_time = datetime(2025, 9, 22, 17, 30, 0)  # 5:30 PM CST
    actual_eod_time = eod_start_cst.replace(tzinfo=None)
    eod_delay = (actual_eod_time - expected_eod_time).total_seconds() / 3600

    print(f"  EOD Scan:")
    print(f"    Expected: 2025-09-22 17:30:00 CST (5:30 PM)")
    print(f"    Actual:   {actual_eod_time.strftime('%Y-%m-%d %H:%M:%S')} CST")
    print(f"    Delay:    {eod_delay:.1f} hours ({'LATE' if eod_delay > 0 else 'EARLY'})")

    # Check Technical timing
    expected_tech_time = datetime(2025, 9, 22, 18, 0, 0)  # 6:00 PM CST
    actual_tech_time = tech_start_cst.replace(tzinfo=None)
    tech_delay = (actual_tech_time - expected_tech_time).total_seconds() / 3600

    print(f"  Technical Analysis:")
    print(f"    Expected: 2025-09-22 18:00:00 CST (6:00 PM)")
    print(f"    Actual:   {actual_tech_time.strftime('%Y-%m-%d %H:%M:%S')} CST")
    print(f"    Delay:    {tech_delay:.1f} hours ({'LATE' if tech_delay > 0 else 'EARLY'})")

    # Check sequence
    gap_minutes = (tech_start_cst - eod_start_cst).total_seconds() / 60
    print(f"  Execution Gap: {gap_minutes:.0f} minutes (EOD start to Tech start)")

    print()
    print("CONCLUSION:")
    if eod_delay > 4:  # More than 4 hours late
        print("  [X] EOD scan did NOT run at scheduled 5:30 PM CST")
        print(f"     It ran {eod_delay:.1f} hours late at {actual_eod_time.strftime('%I:%M %p')} CST")
    else:
        print("  [OK] EOD scan ran close to scheduled time")

    if tech_delay > 4:  # More than 4 hours late
        print("  [X] Technical analysis did NOT run at scheduled 6:00 PM CST")
        print(f"     It ran {tech_delay:.1f} hours late at {actual_tech_time.strftime('%I:%M %p')} CST")
    else:
        print("  [OK] Technical analysis ran close to scheduled time")

    print()
    print("RECOMMENDATIONS:")
    print("  1. Check scheduler timezone configuration (should be CST/CDT)")
    print("  2. Verify cron expressions are correct for CST timezone")
    print("  3. Consider adding timezone-aware logging")
    print("  4. Add scheduled vs actual time tracking to job status display")

if __name__ == "__main__":
    analyze_jobs()