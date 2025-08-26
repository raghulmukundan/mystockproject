import json
import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from app.models import Watchlist, WatchlistItem, Alert, AlertType, AlertSeverity
from app.services.stock_data import StockDataService
import logging

logger = logging.getLogger(__name__)

class SmartAlertService:
    def __init__(self, db: Session):
        self.db = db
        self.stock_service = StockDataService()
    
    async def analyze_and_create_alerts(self) -> List[Alert]:
        """Main method to analyze all watchlists and create smart alerts"""
        try:
            all_alerts = []
            watchlists = self.db.query(Watchlist).all()
            logger.info(f"Analyzing {len(watchlists)} watchlists for alerts")
            
            for watchlist in watchlists:
                logger.info(f"Analyzing watchlist: {watchlist.name} (ID: {watchlist.id}) with {len(watchlist.items)} items")
                alerts = await self._analyze_watchlist(watchlist)
                logger.info(f"Generated {len(alerts)} alerts for watchlist {watchlist.name}")
                all_alerts.extend(alerts)
            
            # Portfolio-wide alerts (across all watchlists)
            portfolio_alerts = await self._analyze_portfolio(watchlists)
            logger.info(f"Generated {len(portfolio_alerts)} portfolio-wide alerts")
            all_alerts.extend(portfolio_alerts)
            
            # Save alerts to database
            new_alerts_count = 0
            for alert in all_alerts:
                # Check if similar alert already exists (avoid duplicates)
                if not self._alert_exists(alert):
                    self.db.add(alert)
                    new_alerts_count += 1
                else:
                    logger.info(f"Skipping duplicate alert: {alert.title}")
            
            self.db.commit()
            logger.info(f"Created {new_alerts_count} new alerts out of {len(all_alerts)} generated")
            return all_alerts
            
        except Exception as e:
            logger.error(f"Error in analyze_and_create_alerts: {e}")
            self.db.rollback()
            return []
    
    async def _analyze_watchlist(self, watchlist: Watchlist) -> List[Alert]:
        """Analyze a single watchlist for various alert conditions"""
        alerts = []
        
        if not watchlist.items:
            return alerts
        
        # Get current prices for all symbols
        symbols = [item.symbol for item in watchlist.items]
        try:
            price_data = await self.stock_service.get_multiple_stock_prices(symbols)
        except Exception as e:
            logger.error(f"Failed to get prices for watchlist {watchlist.id}: {e}")
            return alerts
        
        # 1. Sector Concentration Analysis
        sector_alert = self._check_sector_concentration(watchlist, price_data)
        if sector_alert:
            alerts.append(sector_alert)
        
        # 2. Performance Outlier Detection
        performance_alerts = self._check_performance_outliers(watchlist, price_data)
        alerts.extend(performance_alerts)
        
        # 3. Volume Anomaly Detection
        volume_alerts = self._check_volume_anomalies(watchlist, price_data)
        alerts.extend(volume_alerts)
        
        # 4. Price Target/Stop Loss Breaches
        target_alerts = self._check_price_targets(watchlist, price_data)
        alerts.extend(target_alerts)
        
        return alerts
    
    def _check_sector_concentration(self, watchlist: Watchlist, price_data: Dict) -> Optional[Alert]:
        """Check if portfolio is too concentrated in one sector"""
        sector_weights = {}
        total_value = 0
        
        logger.info(f"Checking sector concentration for watchlist {watchlist.name}")
        logger.info(f"Price data available for: {list(price_data.keys())}")
        
        for item in watchlist.items:
            logger.info(f"Checking item {item.symbol} - sector: {item.sector}, in price_data: {item.symbol in price_data}")
            if item.symbol in price_data and item.sector:
                current_price = price_data[item.symbol].current_price
                position_value = current_price * 100  # Assume 100 shares
                
                sector = item.sector
                sector_weights[sector] = sector_weights.get(sector, 0) + position_value
                total_value += position_value
                logger.info(f"Added {item.symbol} ({sector}): ${position_value:.2f}")
        
        logger.info(f"Sector breakdown: {sector_weights}")
        logger.info(f"Total value: ${total_value:.2f}")
        
        if total_value == 0:
            logger.info("No valid positions found for sector analysis")
            return None
        
        # Calculate sector percentages
        max_sector_weight = 0
        dominant_sector = ""
        
        for sector, weight in sector_weights.items():
            percentage = (weight / total_value) * 100
            logger.info(f"Sector {sector}: {percentage:.1f}%")
            if percentage > max_sector_weight:
                max_sector_weight = percentage
                dominant_sector = sector
        
        logger.info(f"Dominant sector: {dominant_sector} at {max_sector_weight:.1f}%")
        
        # Alert if any sector is over 40%
        if max_sector_weight > 40:
            severity = AlertSeverity.HIGH if max_sector_weight > 60 else AlertSeverity.MEDIUM
            logger.info(f"Sector concentration alert triggered for {dominant_sector}")
            
            return Alert(
                alert_type=AlertType.SECTOR_CONCENTRATION,
                severity=severity,
                title=f"High {dominant_sector} Concentration",
                message=f"Watchlist '{watchlist.name}' is {max_sector_weight:.1f}% concentrated in {dominant_sector}. Consider diversifying to reduce sector risk.",
                watchlist_id=watchlist.id,
                value=max_sector_weight,
                threshold=40.0,
                context_data=json.dumps({"sector_breakdown": sector_weights})
            )
        else:
            logger.info(f"No sector concentration alert needed (max: {max_sector_weight:.1f}%)")
        
        return None
    
    def _check_performance_outliers(self, watchlist: Watchlist, price_data: Dict) -> List[Alert]:
        """Detect stocks with unusual performance compared to portfolio average"""
        alerts = []
        performances = []
        
        # Calculate performance for each stock
        for item in watchlist.items:
            if item.symbol in price_data and item.entry_price:
                current_price = price_data[item.symbol].current_price
                entry_price = float(item.entry_price)  # Convert Decimal to float
                performance = ((current_price - entry_price) / entry_price) * 100
                performances.append((item, performance))
        
        if len(performances) < 3:  # Need at least 3 stocks for outlier detection
            return alerts
        
        # Calculate mean and standard deviation
        perf_values = [perf for _, perf in performances]
        mean_perf = sum(perf_values) / len(perf_values)
        variance = sum((p - mean_perf) ** 2 for p in perf_values) / len(perf_values)
        std_dev = math.sqrt(variance)
        
        # Find outliers (more than 2 standard deviations from mean)
        for item, performance in performances:
            z_score = abs(performance - mean_perf) / std_dev if std_dev > 0 else 0
            
            if z_score > 2:  # Significant outlier
                if performance > mean_perf:
                    # Positive outlier
                    alerts.append(Alert(
                        alert_type=AlertType.PERFORMANCE_OUTLIER,
                        severity=AlertSeverity.LOW,
                        title=f"{item.symbol} Outperforming",
                        message=f"{item.symbol} is significantly outperforming your portfolio average ({performance:+.1f}% vs {mean_perf:+.1f}% avg). Consider taking profits or rebalancing.",
                        watchlist_id=watchlist.id,
                        symbol=item.symbol,
                        value=performance,
                        threshold=mean_perf + 2 * std_dev
                    ))
                else:
                    # Negative outlier
                    alerts.append(Alert(
                        alert_type=AlertType.PERFORMANCE_OUTLIER,
                        severity=AlertSeverity.MEDIUM,
                        title=f"{item.symbol} Underperforming",
                        message=f"{item.symbol} is significantly underperforming your portfolio average ({performance:+.1f}% vs {mean_perf:+.1f}% avg). Review fundamentals or consider stop-loss.",
                        watchlist_id=watchlist.id,
                        symbol=item.symbol,
                        value=performance,
                        threshold=mean_perf - 2 * std_dev
                    ))
        
        return alerts
    
    def _check_volume_anomalies(self, watchlist: Watchlist, price_data: Dict) -> List[Alert]:
        """Detect unusual volume spikes"""
        alerts = []
        
        for item in watchlist.items:
            if item.symbol in price_data:
                stock_data = price_data[item.symbol]
                
                # Simple volume spike detection (you could enhance this with historical data)
                if hasattr(stock_data, 'volume') and hasattr(stock_data, 'avg_volume'):
                    if stock_data.volume > stock_data.avg_volume * 3:  # 3x average volume
                        alerts.append(Alert(
                            alert_type=AlertType.VOLUME_ANOMALY,
                            severity=AlertSeverity.MEDIUM,
                            title=f"{item.symbol} Volume Spike",
                            message=f"{item.symbol} trading volume is {stock_data.volume / stock_data.avg_volume:.1f}x higher than average. Unusual activity detected.",
                            watchlist_id=watchlist.id,
                            symbol=item.symbol,
                            value=stock_data.volume,
                            threshold=stock_data.avg_volume * 3
                        ))
        
        return alerts
    
    def _check_price_targets(self, watchlist: Watchlist, price_data: Dict) -> List[Alert]:
        """Check for price target and stop-loss breaches"""
        alerts = []
        
        for item in watchlist.items:
            if item.symbol in price_data:
                current_price = price_data[item.symbol].current_price
                
                # Target price breach
                if item.target_price and current_price >= float(item.target_price):
                    alerts.append(Alert(
                        alert_type=AlertType.PRICE_TARGET_BREACH,
                        severity=AlertSeverity.HIGH,
                        title=f"{item.symbol} Hit Target Price",
                        message=f"{item.symbol} reached your target price of ${float(item.target_price):.2f} (current: ${current_price:.2f}). Consider taking profits.",
                        watchlist_id=watchlist.id,
                        symbol=item.symbol,
                        value=current_price,
                        threshold=float(item.target_price)
                    ))
                
                # Stop loss breach
                if item.stop_loss and current_price <= float(item.stop_loss):
                    alerts.append(Alert(
                        alert_type=AlertType.PRICE_TARGET_BREACH,
                        severity=AlertSeverity.CRITICAL,
                        title=f"{item.symbol} Hit Stop Loss",
                        message=f"{item.symbol} fell below your stop loss of ${float(item.stop_loss):.2f} (current: ${current_price:.2f}). Consider selling to limit losses.",
                        watchlist_id=watchlist.id,
                        symbol=item.symbol,
                        value=current_price,
                        threshold=float(item.stop_loss)
                    ))
        
        return alerts
    
    async def _analyze_portfolio(self, watchlists: List[Watchlist]) -> List[Alert]:
        """Analyze portfolio-wide metrics across all watchlists"""
        alerts = []
        
        if not watchlists:
            return alerts
        
        # Get all unique symbols across all watchlists
        all_symbols = set()
        total_positions = 0
        
        for watchlist in watchlists:
            for item in watchlist.items:
                all_symbols.add(item.symbol)
                total_positions += 1
        
        # Diversification check
        unique_symbols = len(all_symbols)
        if total_positions > 0:
            diversification_ratio = unique_symbols / total_positions
            
            if diversification_ratio < 0.7 and total_positions > 10:  # Many duplicate holdings
                alerts.append(Alert(
                    alert_type=AlertType.DIVERSIFICATION_WARNING,
                    severity=AlertSeverity.MEDIUM,
                    title="Low Portfolio Diversification",
                    message=f"You have {total_positions} positions but only {unique_symbols} unique stocks. Consider reducing duplicate holdings across watchlists.",
                    value=diversification_ratio,
                    threshold=0.7,
                    context_data=json.dumps({
                        "total_positions": total_positions,
                        "unique_symbols": unique_symbols,
                        "duplicate_holdings": total_positions - unique_symbols
                    })
                ))
        
        return alerts
    
    def _alert_exists(self, new_alert: Alert) -> bool:
        """Check if a similar alert already exists to avoid duplicates"""
        # Look for alerts of same type for same watchlist/symbol in last 24 hours
        cutoff_time = datetime.utcnow() - timedelta(hours=24)
        
        existing = self.db.query(Alert).filter(
            Alert.alert_type == new_alert.alert_type,
            Alert.watchlist_id == new_alert.watchlist_id,
            Alert.symbol == new_alert.symbol,
            Alert.created_at > cutoff_time,
            Alert.is_active == True
        ).first()
        
        return existing is not None
    
    def get_active_alerts(self, limit: int = 50) -> List[Alert]:
        """Get all active alerts, most recent first"""
        return self.db.query(Alert).filter(
            Alert.is_active == True
        ).order_by(Alert.created_at.desc()).limit(limit).all()
    
    def mark_alert_as_read(self, alert_id: int) -> bool:
        """Mark an alert as read"""
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.is_read = True
            self.db.commit()
            return True
        return False
    
    def dismiss_alert(self, alert_id: int) -> bool:
        """Dismiss (deactivate) an alert"""
        alert = self.db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.is_active = False
            alert.resolved_at = datetime.utcnow()
            self.db.commit()
            return True
        return False
    
    async def analyze_specific_watchlist(self, watchlist_id: int) -> List[Alert]:
        """Analyze alerts for a specific watchlist (for automatic creation)"""
        try:
            watchlist = self.db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
            if not watchlist:
                logger.warning(f"Watchlist {watchlist_id} not found")
                return []
            
            logger.info(f"Auto-analyzing watchlist: {watchlist.name} (ID: {watchlist_id})")
            alerts = await self._analyze_watchlist(watchlist)
            
            # Save only new alerts (avoid duplicates)
            new_alerts_count = 0
            for alert in alerts:
                if not self._alert_exists(alert):
                    self.db.add(alert)
                    new_alerts_count += 1
            
            self.db.commit()
            logger.info(f"Auto-created {new_alerts_count} new alerts for watchlist {watchlist.name}")
            return alerts
            
        except Exception as e:
            logger.error(f"Error in analyze_specific_watchlist: {e}")
            self.db.rollback()
            return []
    
    async def analyze_missing_alerts_only(self) -> List[Alert]:
        """Modified version that only creates alerts that don't already exist"""
        try:
            all_alerts = []
            watchlists = self.db.query(Watchlist).all()
            logger.info(f"Checking for missing alerts across {len(watchlists)} watchlists")
            
            for watchlist in watchlists:
                # Generate potential alerts for this watchlist
                potential_alerts = await self._analyze_watchlist(watchlist)
                
                # Only keep alerts that don't already exist
                new_alerts = []
                for alert in potential_alerts:
                    if not self._alert_exists(alert):
                        new_alerts.append(alert)
                        self.db.add(alert)
                
                all_alerts.extend(new_alerts)
                logger.info(f"Found {len(new_alerts)} missing alerts for watchlist {watchlist.name}")
            
            # Portfolio-wide alerts
            portfolio_alerts = await self._analyze_portfolio(watchlists)
            for alert in portfolio_alerts:
                if not self._alert_exists(alert):
                    all_alerts.append(alert)
                    self.db.add(alert)
            
            self.db.commit()
            logger.info(f"Created {len(all_alerts)} missing alerts")
            return all_alerts
            
        except Exception as e:
            logger.error(f"Error in analyze_missing_alerts_only: {e}")
            self.db.rollback()
            return []
    
    def cleanup_old_alerts(self, days_old: int = 30) -> int:
        """Remove alerts older than specified days and mark as inactive"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            # Mark old alerts as inactive instead of deleting
            old_alerts = self.db.query(Alert).filter(
                Alert.created_at < cutoff_date,
                Alert.is_active == True
            ).all()
            
            count = 0
            for alert in old_alerts:
                alert.is_active = False
                alert.resolved_at = datetime.utcnow()
                count += 1
            
            self.db.commit()
            logger.info(f"Cleaned up {count} old alerts (older than {days_old} days)")
            return count
            
        except Exception as e:
            logger.error(f"Error in cleanup_old_alerts: {e}")
            self.db.rollback()
            return 0