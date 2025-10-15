# Stock Project Management
# Docker services, analytics pipeline, and database migrations

.PHONY: help validate validate-configs test-proxy-configs start-docker build-docker stop-docker restart-docker clean logs status
.PHONY: migrate migrate-daily migrate-screener weekly-bars weekly-tech weekly-signals weekly-all daily-signals screener-api verify

# Database configuration
DB_DSN ?= postgresql://stockuser:stockpass123@localhost:5432/stockwatchlist
PYTHON := python3

# Default target
help:
	@echo "📋 Stock Project Management"
	@echo ""
	@echo "🔍 Validation Commands:"
	@echo "  make validate           - Run full validation pipeline"
	@echo "  make validate-configs   - Validate proxy configurations only"
	@echo ""
	@echo "🐳 Docker Commands:"
	@echo "  make start-docker       - Validate configs then start Docker"
	@echo "  make build-docker       - Build and start Docker with fresh images"
	@echo "  make stop-docker        - Stop all Docker services"
	@echo "  make restart-docker     - Restart Docker services"
	@echo "  make clean              - Stop and remove all containers/images"
	@echo "  make logs               - Show Docker logs"
	@echo "  make status             - Show Docker status"
	@echo ""
	@echo "📊 Analytics Pipeline:"
	@echo "  make migrate            - Run weekly schema migrations"
	@echo "  make migrate-daily      - Run daily signals migrations"
	@echo "  make migrate-screener   - Run screener view + indexes"
	@echo "  make weekly-all         - Run complete weekly pipeline"
	@echo "  make daily-signals      - Compute daily signals"
	@echo "  make verify             - Verify data counts"
	@echo ""

# Validate configurations before Docker operations
validate: validate-configs
	@echo "✅ All validations passed - ready for Docker operations"

# Validate proxy configurations
validate-configs:
	@echo "🔍 Validating proxy configurations..."
	@echo ""
	@cd frontend && npm install --no-fund --no-audit && npm run test -- config-validator --run --reporter=verbose
	@echo ""
	@echo "✅ Configuration validation completed"

# Run enhanced proxy config tests with detailed output
test-proxy-configs:
	@echo "🧪 Running enhanced proxy configuration tests..."
	@echo ""
	@cd frontend && npm install --no-fund --no-audit && npm run test -- --run --reporter=verbose
	@echo ""

# Validate and start Docker services
start-docker: validate
	@echo "🚀 Starting Docker services..."
	@echo ""
	@echo "📋 Configuration Summary:"
	@echo "├── Frontend: localhost:3000"
	@echo "├── Backend API: localhost:8000"
	@echo "├── Proxy: /api → backend:8000"
	@echo "└── Network: app-network"
	@echo ""
	@docker-compose up -d
	@echo ""
	@echo "✅ Docker services started successfully"
	@echo "🌐 Frontend: http://localhost:3000"
	@echo "🔗 Backend API: http://localhost:8000"
	@echo ""
	@echo "📊 Service Status:"
	@docker-compose ps

# Build fresh images and start Docker
build-docker: validate
	@echo "🏗️  Building fresh Docker images..."
	@echo ""
	@docker-compose down --remove-orphans
	@docker-compose up --build -d
	@echo ""
	@echo "✅ Docker services built and started"
	@echo "🌐 Frontend: http://localhost:3000"
	@echo "🔗 Backend API: http://localhost:8000"
	@echo ""
	@echo "📊 Service Status:"
	@docker-compose ps

# Stop Docker services
stop-docker:
	@echo "🛑 Stopping Docker services..."
	@docker-compose down
	@echo "✅ Docker services stopped"

# Restart Docker services with validation
restart-docker: validate
	@echo "🔄 Restarting Docker services..."
	@docker-compose restart
	@echo "✅ Docker services restarted"
	@echo ""
	@echo "📊 Service Status:"
	@docker-compose ps

# Clean up everything
clean:
	@echo "🧹 Cleaning up Docker environment..."
	@echo ""
	@echo "⚠️  This will:"
	@echo "   - Stop all containers"
	@echo "   - Remove all containers"
	@echo "   - Remove all images"
	@echo "   - Remove all volumes"
	@echo ""
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	@docker-compose down --remove-orphans --volumes
	@docker system prune -f
	@echo "✅ Docker environment cleaned"

# Show Docker logs
logs:
	@echo "📋 Docker Logs (last 50 lines):"
	@echo ""
	@docker-compose logs --tail=50

# Show Docker status
status:
	@echo "📊 Docker Status:"
	@echo ""
	@echo "🔹 Services:"
	@docker-compose ps
	@echo ""
	@echo "🔹 Images:"
	@docker images | grep mystockproject || echo "No mystockproject images found"
	@echo ""
	@echo "🔹 Networks:"
	@docker network ls | grep mystockproject || echo "No mystockproject networks found"

# Development workflow shortcuts
dev: build-docker
	@echo ""
	@echo "🎯 Development environment ready!"
	@echo ""
	@echo "Quick commands:"
	@echo "  make logs     - View logs"
	@echo "  make status   - Check status"
	@echo "  make restart-docker - Restart services"
	@echo "  make stop-docker    - Stop services"

# CI/CD pipeline simulation
ci: validate test-proxy-configs
	@echo ""
	@echo "✅ CI/CD validation pipeline completed successfully"
	@echo "🚀 Ready for deployment"

# Quick validation without Docker
quick-check: validate-configs
	@echo ""
	@echo "⚡ Quick configuration check completed"

# ============================================================================
# Analytics Pipeline
# ============================================================================

migrate:
	@echo "Running weekly schema migrations..."
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < migrations/001_weekly.sql
	@echo "✅ Weekly migrations complete"

migrate-daily:
	@echo "Running daily signals schema migrations..."
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < migrations/002_daily_signals.sql
	@echo "✅ Daily signals migrations complete"

migrate-screener:
	@echo "Running screener view and indexes migrations..."
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < sql/screener_latest_view.sql
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < migrations/003_indexes.sql
	@echo "✅ Screener migrations complete"

weekly-bars:
	@echo "Running weekly bars ETL..."
	@DB_DSN=$(DB_DSN) $(PYTHON) jobs/weekly_bars_etl.py --weeks=120
	@echo "✅ Weekly bars ETL complete"

weekly-tech:
	@echo "Running weekly technicals ETL..."
	@DB_DSN=$(DB_DSN) $(PYTHON) jobs/weekly_technicals_etl.py
	@echo "✅ Weekly technicals ETL complete"

weekly-signals:
	@echo "Running weekly signals computation..."
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < sql/weekly_signals_upsert.sql
	@echo "✅ Weekly signals complete"

weekly-all: weekly-bars weekly-tech weekly-signals
	@echo ""
	@echo "✅ WEEKLY PIPELINE COMPLETE"

daily-signals:
	@echo "Running daily signals computation..."
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -f - < sql/daily_signals_upsert.sql
	@echo "✅ Daily signals complete"

verify:
	@echo "Data Verification:"
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -c "SELECT COUNT(*) AS technical_latest FROM technical_latest;"
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -c "SELECT COUNT(*) AS signals_daily FROM signals_daily_latest;"
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -c "SELECT COUNT(*) AS weekly_signals FROM weekly_signals_latest;"
	@docker-compose exec -T postgres psql -U stockuser -d stockwatchlist -c "SELECT COUNT(*) AS screener FROM screener_latest;"
