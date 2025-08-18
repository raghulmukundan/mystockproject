from sqlalchemy.orm import Session
from app.core.database import SessionLocal, init_db
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from app.models.rule import Rule

def seed_database():
    init_db()
    
    db = SessionLocal()
    try:
        existing_watchlist = db.query(Watchlist).first()
        if existing_watchlist:
            print("Database already seeded")
            return
        
        demo_watchlist = Watchlist(
            name="Demo Tech Stocks",
            description="Sample watchlist with popular tech stocks"
        )
        db.add(demo_watchlist)
        db.flush()
        
        demo_items = [
            WatchlistItem(
                watchlist_id=demo_watchlist.id,
                symbol="AAPL",
                company_name="Apple Inc.",
                entry_price=150.00,
                target_price=200.00,
                stop_loss=140.00
            ),
            WatchlistItem(
                watchlist_id=demo_watchlist.id,
                symbol="GOOGL",
                company_name="Alphabet Inc.",
                entry_price=2500.00,
                target_price=3000.00,
                stop_loss=2300.00
            ),
            WatchlistItem(
                watchlist_id=demo_watchlist.id,
                symbol="MSFT",
                company_name="Microsoft Corporation",
                entry_price=300.00,
                target_price=400.00,
                stop_loss=280.00
            ),
            WatchlistItem(
                watchlist_id=demo_watchlist.id,
                symbol="TSLA",
                company_name="Tesla, Inc.",
                entry_price=800.00,
                target_price=1000.00,
                stop_loss=700.00
            )
        ]
        
        db.add_all(demo_items)
        db.flush()
        
        demo_rule = Rule(
            watchlist_item_id=demo_items[0].id,
            name="SMA Crossover",
            expression="price crosses_above SMA(20)",
            is_active=True
        )
        
        db.add(demo_rule)
        db.commit()
        
        print("Database seeded successfully with demo data")
        
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()