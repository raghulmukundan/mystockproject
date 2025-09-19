# 🔍 Configuration Validation System

This validation system ensures critical proxy configurations are correct before starting Docker services. It prevents the "Failed to load watchlists" issue by validating all configuration files.

## 🚀 Quick Start

### Windows (Recommended)
```bash
# Validate configs and start Docker
validate-and-start.bat build-docker

# Just validate configurations
validate-and-start.bat validate

# Full development setup
validate-and-start.bat dev
```

### Linux/Mac (with make)
```bash
# Validate configs and start Docker
make build-docker

# Just validate configurations
make validate

# Full development setup
make dev
```

### Manual Validation
```bash
# Run enhanced validation tests
cd frontend
npm test config-validator -- --run --reporter=verbose
```

## 📋 What Gets Validated

### ✅ Docker Compose Configuration (`docker-compose.yml`)
- `VITE_API_URL=http://backend:8000` environment variable
- Frontend port mapping: `3000:3000`
- Backend port mapping: `8000:8000`
- Network configuration
- Service dependencies

### ✅ Vite Proxy Configuration (`frontend/vite.config.ts`)
- Proxy target: `http://backend:8000`
- Server host: `0.0.0.0`
- Server port: `3000`
- Proxy options: `changeOrigin`, `secure`, `ws`

### ✅ API Configuration (`frontend/src/services/api.ts`)
- Base URL: `http://localhost:8000/api`
- Headers: `Content-Type` and `Accept` as `application/json`
- Response type: `json`
- Timeout configuration

## 🔧 Fix Suggestions

When validation fails, the system provides specific fix suggestions:

### Example: Wrong VITE_API_URL
```
🚨 VALIDATION FAILED: VITE_API_URL has incorrect value
📍 Current value: http://localhost:8000
✅ Expected value: http://backend:8000
🔧 Fix suggestion:
Update docker-compose.yml frontend environment:
  Change: VITE_API_URL=http://localhost:8000
  To: VITE_API_URL=http://backend:8000
```

### Example: Missing Proxy Configuration
```
🚨 VALIDATION FAILED: Vite proxy for /api not found
🔧 Fix suggestion:
Add to vite.config.ts server.proxy:
  '/api': {
    target: 'http://backend:8000',
    changeOrigin: true,
    secure: false
  }
```

## 📊 Validation Pipeline

The validation system follows this pipeline:

```
1. 🔍 Configuration Validation
   ├── Docker Compose check
   ├── Vite config check
   └── API config check

2. ✅ All Valid?
   ├── Yes → Start Docker Services
   └── No → Show Fix Suggestions

3. 🐳 Docker Operations
   ├── Build fresh images (if requested)
   ├── Start services
   └── Show status
```

## 🎯 Available Commands

### Windows (`validate-and-start.bat`)

| Command | Description |
|---------|-------------|
| `validate` | Run full validation pipeline |
| `validate-configs` | Validate proxy configurations only |
| `test-proxy-configs` | Run all proxy config tests |
| `start-docker` | Validate then start Docker |
| `build-docker` | Validate, build fresh, then start |
| `stop-docker` | Stop all Docker services |
| `restart-docker` | Validate then restart Docker |
| `clean` | Stop and remove all containers/images |
| `logs` | Show Docker logs |
| `status` | Show Docker status |
| `dev` | Full development environment setup |
| `ci` | CI/CD validation pipeline |
| `quick-check` | Quick config validation |

### Linux/Mac (`Makefile`)

Same commands available with `make` prefix:
```bash
make validate
make build-docker
make dev
# etc.
```

## 🔄 Typical Workflows

### First Time Setup
```bash
# Windows
validate-and-start.bat dev

# Linux/Mac
make dev
```

### Daily Development
```bash
# Quick validation before starting work
validate-and-start.bat quick-check

# Start services
validate-and-start.bat start-docker
```

### After Configuration Changes
```bash
# Validate changes
validate-and-start.bat validate

# Rebuild if needed
validate-and-start.bat build-docker
```

### CI/CD Pipeline
```bash
# Full validation pipeline
validate-and-start.bat ci
```

## 🚨 Critical Configurations Protected

### Why These Matter
The validation protects configurations that solve the Docker networking issue:

1. **Browser Access**: Browser at `localhost:3000` → Frontend container
2. **API Calls**: Frontend makes direct calls to `localhost:8000` → Backend
3. **Container Communication**: Vite proxy uses `backend:8000` for internal routing
4. **Service Discovery**: Docker Compose manages service name resolution

### The Problem We Prevent
Without proper configuration:
- Browser gets `net::ERR_NAME_NOT_RESOLVED` for `backend:8000`
- Frontend shows "Failed to load watchlists"
- API calls fail with network errors

### The Solution We Protect
With correct configuration:
- Browser accesses frontend at `localhost:3000` ✅
- Frontend makes API calls to `localhost:8000/api` ✅
- Vite proxy handles container routing to `backend:8000` ✅
- Watchlists load successfully ✅

## 📝 Test Output Example

```
📋 CONFIGURATION SUMMARY:
├── docker-compose.yml
│   ├── VITE_API_URL=http://backend:8000
│   ├── frontend ports: 3000:3000
│   └── backend ports: 8000:8000
├── vite.config.ts
│   ├── proxy /api → http://backend:8000
│   ├── host: 0.0.0.0
│   └── port: 3000
└── src/services/api.ts
    ├── baseURL: http://localhost:8000/api
    ├── headers: application/json
    └── responseType: json

✅ All validations passed - ready for Docker operations
```

## 🐛 Troubleshooting

### Tests Fail
1. **Read the fix suggestions** - They provide exact changes needed
2. **Check file paths** - Ensure all config files exist
3. **Verify syntax** - YAML/TypeScript syntax must be valid

### Docker Won't Start
1. **Run validation first**: `validate-and-start.bat validate`
2. **Check Docker is running** on your system
3. **Look at logs**: `validate-and-start.bat logs`

### Still Getting "Failed to load watchlists"
1. **Verify all tests pass**: `validate-and-start.bat test-proxy-configs`
2. **Check browser network tab** for actual request URLs
3. **Restart with fresh build**: `validate-and-start.bat build-docker`

## 🔒 Security Notes

- The validation system only reads configuration files
- No sensitive data is logged or exposed
- All operations are local to your development environment
- Docker credentials and secrets are not accessed

## 🚀 Next Steps

After successful validation:
1. **Access frontend**: http://localhost:3000
2. **Test API**: http://localhost:8000
3. **Monitor logs**: `validate-and-start.bat logs`
4. **Check status**: `validate-and-start.bat status`

The validation system ensures your development environment is configured correctly and prevents the networking issues that cause "Failed to load watchlists" errors.