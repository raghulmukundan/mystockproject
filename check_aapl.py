import psycopg2, os
from dotenv import load_dotenv
load_dotenv('backend/.env')
conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'localhost'),
    port=os.getenv('POSTGRES_PORT', '5432'),
    database=os.getenv('POSTGRES_DB', 'stockwatchlist'),
    user=os.getenv('POSTGRES_USER', 'stockuser'),
    password=os.getenv('POSTGRES_PASSWORD', 'stockpass123')
)
cur = conn.cursor()
cur.execute("SELECT symbol, close, donch20_high, donch20_low, high_252, distance_to_52w_high FROM technical_latest WHERE symbol = 'AAPL'")
row = cur.fetchone()
sym, close, dh, dl, h52, dist = row
print(f'AAPL: close=${close:.2f} donch_high=${dh:.2f} 52w_high=${h52:.2f} dist={dist*100:+.2f}%')
print('Donch check:', 'FIXED!' if dh >= close else 'BROKEN')
print('Distance check:', 'FIXED!' if dist <= 0 else 'BROKEN')
conn.close()
