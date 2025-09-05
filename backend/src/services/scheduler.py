import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz
from dotenv import load_dotenv

from src.services.universe.service import UniverseService

load_dotenv()

class UniverseScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.universe_service = UniverseService()
        self.timezone = os.getenv("TIMEZONE", "America/Chicago")
        
    def refresh_job(self):
        """Scheduled job to refresh universe data"""
        try:
            print(f"Starting scheduled universe refresh...")
            result = self.universe_service.refresh_symbols(download=True)
            print(f"Scheduled refresh completed: {result}")
        except Exception as e:
            print(f"Scheduled refresh failed: {e}")
    
    def start(self):
        """Start the scheduler with weekly refresh job"""
        # Configure timezone
        tz = pytz.timezone(self.timezone)
        
        # Schedule weekly refresh: Sundays at 08:00 
        self.scheduler.add_job(
            func=self.refresh_job,
            trigger=CronTrigger(
                day_of_week='sun',  # Sunday
                hour=8,             # 08:00
                minute=0,
                timezone=tz
            ),
            id='universe_refresh',
            name='Weekly Universe Refresh',
            replace_existing=True
        )
        
        print(f"Scheduler configured for weekly refresh: Sundays at 08:00 {self.timezone}")
        self.scheduler.start()
        print("Scheduler started successfully")
    
    def shutdown(self):
        """Gracefully shutdown the scheduler"""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=True)
            print("Scheduler shutdown completed")
    
    def trigger_refresh_now(self):
        """Manually trigger a refresh job for testing"""
        return self.universe_service.refresh_symbols(download=True)

# Global scheduler instance
_scheduler_instance = None

def get_scheduler() -> UniverseScheduler:
    """Get the global scheduler instance"""
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = UniverseScheduler()
    return _scheduler_instance

def startup_scheduler():
    """Start the scheduler on application startup"""
    scheduler = get_scheduler()
    scheduler.start()

def shutdown_scheduler():
    """Shutdown the scheduler on application shutdown"""
    global _scheduler_instance
    if _scheduler_instance:
        _scheduler_instance.shutdown()
        _scheduler_instance = None