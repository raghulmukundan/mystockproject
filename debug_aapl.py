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

# Check what date AAPL has in technical_latest
cur.execute("SELECT symbol, date, close, donch20_high, high_252, distance_to_52w_high FROM technical_latest WHERE symbol = 'AAPL'")
row = cur.fetchone()

print("AAPL in technical_latest:")
print(f"  Date: {row[1]}")
print(f"  Close: ${row[2]:.2f}")
print(f"  Donch High: ${row[3]:.2f}")
print(f"  52w High: ${row[4]:.2f}")
print(f"  Distance: {row[5]*100:+.2f}%")
print()

# Check technical_daily for AAPL's most recent entries
cur.execute("""
    SELECT date, close, donch20_high, high_252
    FROM technical_daily
    WHERE symbol = 'AAPL'
    ORDER BY date DESC
    LIMIT 5
""")

print("AAPL recent entries in technical_daily:")
for row in cur.fetchall():
    print(f"  {row[0]}: close=${row[1]:.2f} donch=${row[2]:.2f if row[2] else 'NULL'} 52w=${row[3]:.2f if row[3] else 'NULL'}")

# Check what's the latest trade date
cur.execute("SELECT MAX(date) FROM technical_latest")
latest_date = cur.fetchone()[0]
print(f"\nLatest date in technical_latest: {latest_date}")

# Check Job 31 details
cur.execute("SELECT id, latest_trade_date, updated_symbols FROM tech_jobs WHERE id = 31")
job = cur.fetchone()
if job:
    print(f"\nJob 31: latest_trade_date={job[1]}, updated={job[2]} symbols")

conn.close()
