# Stock Project Docker Management
# This Makefile validates configurations and manages Docker services safely

.PHONY: help validate validate-configs test-proxy-configs start-docker build-docker stop-docker restart-docker clean logs status

# Default target
help:
	@echo "📋 Stock Project Docker Management"
	@echo ""
	@echo "🔍 Validation Commands:"
	@echo "  make validate           - Run full validation pipeline"
	@echo "  make validate-configs   - Validate proxy configurations only"
	@echo "  make test-proxy-configs - Run enhanced proxy config tests"
	@echo ""
	@echo "🐳 Docker Commands:"
	@echo "  make start-docker       - Validate configs then start Docker"
	@echo "  make build-docker       - Build and start Docker with fresh images"
	@echo "  make stop-docker        - Stop all Docker services"
	@echo "  make restart-docker     - Restart Docker services"
	@echo "  make clean              - Stop and remove all containers/images"
	@echo ""
	@echo "📊 Monitoring Commands:"
	@echo "  make logs               - Show Docker logs"
	@echo "  make status             - Show Docker status"
	@echo ""

# Validate configurations before Docker operations
validate: validate-configs
	@echo "✅ All validations passed - ready for Docker operations"

# Validate proxy configurations
validate-configs:
	@echo "🔍 Validating proxy configurations..."
	@echo ""
	@cd frontend && npm test config-validator -- --run --reporter=verbose
	@echo ""
	@echo "✅ Configuration validation completed"

# Run enhanced proxy config tests with detailed output
test-proxy-configs:
	@echo "🧪 Running enhanced proxy configuration tests..."
	@echo ""
	@cd frontend && npm test -- --run --reporter=verbose
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