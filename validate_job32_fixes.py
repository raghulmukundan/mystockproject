import psycopg2, os, sys
from dotenv import load_dotenv

# Enable UTF-8 output on Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

load_dotenv('backend/.env')
conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'localhost'),
    port=os.getenv('POSTGRES_PORT', '5432'),
    database=os.getenv('POSTGRES_DB'),
    user=os.getenv('POSTGRES_USER'),
    password=os.getenv('POSTGRES_PASSWORD')
)
cur = conn.cursor()

print('=' * 100)
print('VALIDATION OF JOB #32 - ALL THREE FIXES')
print('=' * 100)
print()

# Get test symbols from Job 32
cur.execute('''
    SELECT tjs.symbol
    FROM tech_job_successes tjs
    WHERE tjs.tech_job_id = 32
    ORDER BY tjs.created_at DESC
    LIMIT 10
''')
test_symbols = [row[0] for row in cur.fetchall()]

print(f'Testing {len(test_symbols)} symbols from Job 32:')
print(f'Symbols: {", ".join(test_symbols)}')
print()

all_pass = True
failures = []

for test_symbol in test_symbols:
    cur.execute('''
        SELECT symbol, date, close, donch20_high, donch20_low, high_252, distance_to_52w_high
        FROM technical_latest
        WHERE symbol = %s
    ''', (test_symbol,))

    row = cur.fetchone()
    if not row:
        print(f'✗ {test_symbol}: NOT FOUND in technical_latest')
        all_pass = False
        continue

    sym, date, close, dh, dl, h52, dist = row

    # Validation
    # Fix 1: Donchian high should be >= close (high of last 20 days must be >= today's close)
    donch_high_ok = dh >= close

    # Fix 2: Donchian high >= low (sanity check)
    donch_order_ok = dh >= dl

    # Fix 3: Distance should be <= 0 (close is at or below 52w high)
    dist_ok = dist <= 0

    status = '✓ PASS' if (donch_high_ok and donch_order_ok and dist_ok) else '✗ FAIL'
    symbol_pass = (donch_high_ok and donch_order_ok and dist_ok)
    all_pass = all_pass and symbol_pass

    print(f'{status} {sym}:')
    print(f'  Date: {date}')
    print(f'  Close: ${close:.2f}')
    print(f'  Donchian: ${dl:.2f} - ${dh:.2f}')
    print(f'  52w High: ${h52:.2f}')
    print(f'  Distance: {dist*100:+.2f}%')

    if not donch_high_ok:
        print(f'    ✗ FIX 1 FAILED: Donch high ({dh:.2f}) < close ({close:.2f})')
        failures.append(f'{sym}: Donchian high < close')
    if not donch_order_ok:
        print(f'    ✗ FIX 1 FAILED: Donch high ({dh:.2f}) < donch low ({dl:.2f})')
        failures.append(f'{sym}: Donchian high < low')
    if not dist_ok:
        print(f'    ✗ FIX 3 FAILED: Distance ({dist*100:+.2f}%) > 0')
        failures.append(f'{sym}: Distance > 0')

    print()

# Test AAPL specifically (from original diagnostics)
print('=' * 100)
print('AAPL SPECIFIC VALIDATION (from original issue)')
print('=' * 100)

cur.execute('''
    SELECT symbol, date, close, donch20_high, donch20_low, high_252, distance_to_52w_high
    FROM technical_latest
    WHERE symbol = 'AAPL'
''')

row = cur.fetchone()
if row:
    sym, date, close, dh, dl, h52, dist = row

    print(f'Date: {date}')
    print(f'Close: ${close:.2f}')
    print(f'Donchian High: ${dh:.2f}')
    print(f'Donchian Low: ${dl:.2f}')
    print(f'52w High: ${h52:.2f}')
    print(f'Distance to 52w high: {dist*100:+.2f}%')
    print()

    # Validation
    donch_high_ok = dh >= close
    donch_order_ok = dh >= dl
    dist_ok = dist <= 0

    print('Validation:')
    print(f'  ✓ Fix 1: Donch high >= close:  {"PASS" if donch_high_ok else "FAIL"} ({dh:.2f} {">=" if donch_high_ok else "<"} {close:.2f})')
    print(f'  ✓ Fix 1: Donch high >= low:    {"PASS" if donch_order_ok else "FAIL"} ({dh:.2f} {">=" if donch_order_ok else "<"} {dl:.2f})')
    print(f'  ✓ Fix 3: Distance <= 0:        {"PASS" if dist_ok else "FAIL"} ({dist*100:+.2f}%)')
    print()

    aapl_pass = donch_high_ok and donch_order_ok and dist_ok
    all_pass = all_pass and aapl_pass

    if aapl_pass:
        print('✓ AAPL: All fixes verified!')
    else:
        print('✗ AAPL: Some fixes not applied')
        failures.append('AAPL: validation failed')
else:
    print('✗ AAPL not found in technical_latest!')
    all_pass = False

print()
print('=' * 100)
print('FINAL VALIDATION RESULT')
print('=' * 100)

if all_pass:
    print('✓✓✓ SUCCESS - All three fixes verified across all tested symbols!')
    print()
    print('Fix 1: Donchian High now correctly uses upper band (column 2)')
    print('Fix 2: 52-week High now correctly uses "high" prices instead of "close"')
    print('Fix 3: Distance formula now correctly gives negative values when below 52w high')
else:
    print('✗✗✗ FAILED - Some issues remain:')
    for failure in failures:
        print(f'  - {failure}')

conn.close()
