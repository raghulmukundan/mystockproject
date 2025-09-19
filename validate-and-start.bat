@echo off
REM Stock Project Docker Management for Windows
REM This script validates configurations and manages Docker services safely

if "%1"=="" goto help
if "%1"=="help" goto help
if "%1"=="validate" goto validate
if "%1"=="validate-configs" goto validate-configs
if "%1"=="test-proxy-configs" goto test-proxy-configs
if "%1"=="start-docker" goto start-docker
if "%1"=="build-docker" goto build-docker
if "%1"=="stop-docker" goto stop-docker
if "%1"=="restart-docker" goto restart-docker
if "%1"=="clean" goto clean
if "%1"=="logs" goto logs
if "%1"=="status" goto status
if "%1"=="dev" goto dev
if "%1"=="ci" goto ci
if "%1"=="quick-check" goto quick-check

:help
echo.
echo 📋 Stock Project Docker Management
echo.
echo 🔍 Validation Commands:
echo   validate-and-start.bat validate           - Run full validation pipeline
echo   validate-and-start.bat validate-configs   - Validate proxy configurations only
echo   validate-and-start.bat test-proxy-configs - Run enhanced proxy config tests
echo.
echo 🐳 Docker Commands:
echo   validate-and-start.bat start-docker       - Validate configs then start Docker
echo   validate-and-start.bat build-docker       - Build and start Docker with fresh images
echo   validate-and-start.bat stop-docker        - Stop all Docker services
echo   validate-and-start.bat restart-docker     - Restart Docker services
echo   validate-and-start.bat clean              - Stop and remove all containers/images
echo.
echo 📊 Monitoring Commands:
echo   validate-and-start.bat logs               - Show Docker logs
echo   validate-and-start.bat status             - Show Docker status
echo.
echo 🚀 Quick Commands:
echo   validate-and-start.bat dev                - Full dev environment setup
echo   validate-and-start.bat ci                 - CI/CD validation pipeline
echo   validate-and-start.bat quick-check        - Quick config validation
echo.
goto end

:validate
echo 🔍 Validating proxy configurations...
echo.
cd frontend
call npm test config-validator -- --run --reporter=verbose
if errorlevel 1 (
    echo.
    echo ❌ Configuration validation failed!
    echo 🔧 Please fix the issues above before starting Docker
    echo.
    goto end
)
cd ..
echo.
echo ✅ All validations passed - ready for Docker operations
goto end

:validate-configs
echo 🔍 Validating proxy configurations...
echo.
cd frontend
call npm test config-validator -- --run --reporter=verbose
cd ..
echo.
echo ✅ Configuration validation completed
goto end

:test-proxy-configs
echo 🧪 Running enhanced proxy configuration tests...
echo.
cd frontend
call npm test -- --run --reporter=verbose
cd ..
echo.
goto end

:start-docker
call %0 validate
if errorlevel 1 goto end
echo.
echo 🚀 Starting Docker services...
echo.
echo 📋 Configuration Summary:
echo ├── Frontend: localhost:3000
echo ├── Backend API: localhost:8000
echo ├── Proxy: /api → backend:8000
echo └── Network: app-network
echo.
docker-compose up -d
echo.
echo ✅ Docker services started successfully
echo 🌐 Frontend: http://localhost:3000
echo 🔗 Backend API: http://localhost:8000
echo.
echo 📊 Service Status:
docker-compose ps
goto end

:build-docker
call %0 validate
if errorlevel 1 goto end
echo.
echo 🏗️  Building fresh Docker images...
echo.
docker-compose down --remove-orphans
docker-compose up --build -d
echo.
echo ✅ Docker services built and started
echo 🌐 Frontend: http://localhost:3000
echo 🔗 Backend API: http://localhost:8000
echo.
echo 📊 Service Status:
docker-compose ps
goto end

:stop-docker
echo 🛑 Stopping Docker services...
docker-compose down
echo ✅ Docker services stopped
goto end

:restart-docker
call %0 validate
if errorlevel 1 goto end
echo.
echo 🔄 Restarting Docker services...
docker-compose restart
echo ✅ Docker services restarted
echo.
echo 📊 Service Status:
docker-compose ps
goto end

:clean
echo 🧹 Cleaning up Docker environment...
echo.
echo ⚠️  This will:
echo    - Stop all containers
echo    - Remove all containers
echo    - Remove all images
echo    - Remove all volumes
echo.
set /p confirm="Are you sure? (y/N): "
if not "%confirm%"=="y" goto end
docker-compose down --remove-orphans --volumes
docker system prune -f
echo ✅ Docker environment cleaned
goto end

:logs
echo 📋 Docker Logs (last 50 lines):
echo.
docker-compose logs --tail=50
goto end

:status
echo 📊 Docker Status:
echo.
echo 🔹 Services:
docker-compose ps
echo.
echo 🔹 Images:
docker images | findstr mystockproject
echo.
echo 🔹 Networks:
docker network ls | findstr mystockproject
goto end

:dev
call %0 build-docker
echo.
echo 🎯 Development environment ready!
echo.
echo Quick commands:
echo   validate-and-start.bat logs     - View logs
echo   validate-and-start.bat status   - Check status
echo   validate-and-start.bat restart-docker - Restart services
echo   validate-and-start.bat stop-docker    - Stop services
goto end

:ci
call %0 validate
if errorlevel 1 goto end
call %0 test-proxy-configs
echo.
echo ✅ CI/CD validation pipeline completed successfully
echo 🚀 Ready for deployment
goto end

:quick-check
call %0 validate-configs
echo.
echo ⚡ Quick configuration check completed
goto end

:end