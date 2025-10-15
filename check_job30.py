import psycopg2, os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv('backend/.env')
conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'localhost'),
    port=os.getenv('POSTGRES_PORT', '5432'),
    database=os.getenv('POSTGRES_DB'),
    user=os.getenv('POSTGRES_USER'),
    password=os.getenv('POSTGRES_PASSWORD')
)
cur = conn.cursor()

# Check if Job 30 exists and get its details
cur.execute('SELECT id, started_at, finished_at, status, updated_symbols, total_symbols FROM tech_jobs WHERE id = 30')
job30 = cur.fetchone()

if not job30:
    print("Job 30 not found in database!")
    conn.close()
    exit(1)

print("=" * 80)
print(f"Job 30 Details:")
print(f"  Status: {job30[3]}")
print(f"  Started: {job30[1]}")
print(f"  Finished: {job30[2]}")
print(f"  Updated: {job30[4]}/{job30[5]} symbols")
print("=" * 80)

# Get the FIRST symbol updated in Job 30 (to see the earliest update)
cur.execute('''
    SELECT symbol, created_at
    FROM tech_job_successes
    WHERE tech_job_id = 30
    ORDER BY created_at ASC
    LIMIT 1
''')
first_symbol = cur.fetchone()

# Get the LAST symbol updated in Job 30
cur.execute('''
    SELECT symbol, created_at
    FROM tech_job_successes
    WHERE tech_job_id = 30
    ORDER BY created_at DESC
    LIMIT 1
''')
last_symbol = cur.fetchone()

print(f"\nFirst updated: {first_symbol[0]} at {first_symbol[1]}")
print(f"Last updated:  {last_symbol[0]} at {last_symbol[1]}")

# Test AAPL specifically
print("\n" + "=" * 80)
print("Testing AAPL from Job 30:")
print("-" * 80)

cur.execute('''
    SELECT tl.symbol, tl.close, tl.donch20_high, tl.donch20_low, tl.high_252,
           tl.distance_to_52w_high, tjs.created_at
    FROM technical_latest tl
    LEFT JOIN tech_job_successes tjs ON tjs.symbol = tl.symbol AND tjs.tech_job_id = 30
    WHERE tl.symbol = 'AAPL'
''')

row = cur.fetchone()
if row:
    sym, close, dh, dl, h52, dist, updated_at = row

    print(f"Last updated: {updated_at}")
    print(f"Close:        ${close:.2f}")
    print(f"Donch High:   ${dh:.2f}")
    print(f"Donch Low:    ${dl:.2f}")
    print(f"52w High:     ${h52:.2f}")
    print(f"Dist to 52w:  {dist*100:+.2f}%")
    print()

    # Validate fixes
    donch_ok = dh >= close
    donch_order_ok = dh >= dl
    dist_ok = dist <= 0

    print("Validation:")
    print(f"  Donch high >= close:  {'PASS' if donch_ok else 'FAIL'} ({dh:.2f} {'>=' if donch_ok else '<'} {close:.2f})")
    print(f"  Donch high >= low:    {'PASS' if donch_order_ok else 'FAIL'} ({dh:.2f} {'>=' if donch_order_ok else '<'} {dl:.2f})")
    print(f"  Distance <= 0:        {'PASS' if dist_ok else 'FAIL'} ({dist*100:+.2f}%)")
    print()

    if donch_ok and donch_order_ok and dist_ok:
        print("SUCCESS - All fixes verified!")
    else:
        print("FAILED - Fixes not applied in Job 30")
        if updated_at:
            print(f"Note: AAPL WAS updated in Job 30 at {updated_at}, but with old code")
        else:
            print("Note: AAPL was NOT found in Job 30 successes")
else:
    print("AAPL not found in technical_latest!")

conn.close()
