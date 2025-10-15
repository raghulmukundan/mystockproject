import psycopg2, os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv('backend/.env')
conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'localhost'),
    port=os.getenv('POSTGRES_PORT', '5432'),
    database=os.getenv('POSTGRES_DB', 'stockwatchlist'),
    user=os.getenv('POSTGRES_USER', 'stockuser'),
    password=os.getenv('POSTGRES_PASSWORD', 'stockpass123')
)

# Check latest tech job
cur = conn.cursor()
cur.execute("""
    SELECT id, started_at, finished_at, status, updated_symbols, total_symbols, errors
    FROM tech_jobs
    ORDER BY id DESC
    LIMIT 5
""")
print("Recent Tech Jobs:")
print("-" * 100)
for row in cur.fetchall():
    print(f"Job {row[0]}: {row[3]} | Updated {row[4]}/{row[5]} | Started: {row[1]} | Errors: {row[6]}")

# Check most recently updated symbols
print("\n" + "=" * 100)
print("Recently Updated Symbols (from tech_job_successes):")
print("-" * 100)
cur.execute("""
    SELECT tjs.symbol, tjs.date, tjs.created_at, tjs.tech_job_id
    FROM tech_job_successes tjs
    ORDER BY tjs.created_at DESC
    LIMIT 10
""")
recent_symbols = []
for row in cur.fetchall():
    print(f"  {row[0]:6s} | Date: {row[1]} | Updated: {row[2]} | Job: {row[3]}")
    recent_symbols.append(row[0])

# Now check one of these recently updated symbols
if recent_symbols:
    test_symbol = recent_symbols[0]
    print("\n" + "=" * 100)
    print(f"Validating {test_symbol} (most recently updated symbol):")
    print("-" * 100)

    cur.execute("""
        SELECT symbol, close, donch20_high, donch20_low, high_252, distance_to_52w_high
        FROM technical_latest
        WHERE symbol = %s
    """, (test_symbol,))

    row = cur.fetchone()
    if row:
        sym, close, dh, dl, h52, dist = row
        print(f"Close:         ${close:.2f}")
        print(f"Donch High:    ${dh:.2f}")
        print(f"Donch Low:     ${dl:.2f}")
        print(f"52w High:      ${h52:.2f}")
        print(f"Dist to 52w:   {dist*100:+.2f}%")
        print()

        # Validation
        donch_ok = dh >= close
        dist_ok = dist <= 0

        print(f"  Donch high >= close: {'PASS' if donch_ok else 'FAIL'} ({dh:.2f} {'>=' if donch_ok else '<'} {close:.2f})")
        print(f"  Distance <= 0:       {'PASS' if dist_ok else 'FAIL'} ({dist*100:+.2f}%)")

        if donch_ok and dist_ok:
            print("\n  FIXES VERIFIED - All calculations are correct!")
        else:
            print("\n  FIXES NOT APPLIED - Old calculations still in database")

conn.close()
