import psycopg2, os
from dotenv import load_dotenv
load_dotenv('backend/.env')
conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'localhost'),
    port=os.getenv('POSTGRES_PORT', '5432'),
    database=os.getenv('POSTGRES_DB'),
    user=os.getenv('POSTGRES_USER'),
    password=os.getenv('POSTGRES_PASSWORD')
)
cur = conn.cursor()

# Check job 29
cur.execute('SELECT id, started_at, status, updated_symbols, total_symbols FROM tech_jobs WHERE id = 29')
row = cur.fetchone()
if row:
    print(f'Job 29: Status={row[2]} Updated={row[3]}/{row[4]}')
    print()

# Get a few recently updated symbols from job 29
cur.execute('''
    SELECT tjs.symbol
    FROM tech_job_successes tjs
    WHERE tjs.tech_job_id = 29
    ORDER BY tjs.created_at DESC
    LIMIT 5
''')
test_symbols = [row[0] for row in cur.fetchall()]

print(f'Testing {len(test_symbols)} symbols from Job 29:')
print('=' * 80)

all_pass = True
for test_symbol in test_symbols:
    cur.execute('''
        SELECT symbol, close, donch20_high, donch20_low, high_252, distance_to_52w_high
        FROM technical_latest
        WHERE symbol = %s
    ''', (test_symbol,))

    row = cur.fetchone()
    sym, close, dh, dl, h52, dist = row

    # Validation
    donch_ok = dh >= close
    donch_order_ok = dh >= dl
    dist_ok = dist <= 0

    status = 'PASS' if (donch_ok and donch_order_ok and dist_ok) else 'FAIL'
    all_pass = all_pass and (donch_ok and donch_order_ok and dist_ok)

    print(f'\n{sym}:')
    print(f'  Close: ${close:.2f} | Donch: ${dl:.2f} - ${dh:.2f} | 52w High: ${h52:.2f} | Dist: {dist*100:+.2f}%')
    print(f'  Donch high >= close:  {donch_ok} ({dh:.2f} {">=" if donch_ok else "<"} {close:.2f})')
    print(f'  Donch high >= low:    {donch_order_ok} ({dh:.2f} {">=" if donch_order_ok else "<"} {dl:.2f})')
    print(f'  Distance <= 0:        {dist_ok} ({dist*100:+.2f}%)')
    print(f'  Status: {status}')

print('\n' + '=' * 80)
if all_pass:
    print('SUCCESS - All fixes verified across all tested symbols!')
else:
    print('FAILED - Some symbols still have incorrect calculations')

conn.close()
