# Proxy Configuration Protection Tests

## 🚨 CRITICAL: DO NOT MODIFY THESE TESTS WITHOUT UNDERSTANDING THE IMPACT

These tests protect the critical proxy configurations that resolve the "Failed to load watchlists" issue. Modifying these configurations can break frontend-backend communication in the Docker environment.

## Test Files

### `proxy-config.test.ts`
Protects the critical configurations in:
- `vite.config.ts` - Vite proxy settings
- `src/services/api.ts` - Axios configuration

### `docker-config.test.ts`
Validates the Docker Compose configuration in:
- `docker-compose.yml` - Environment variables and networking

## Critical Configurations Protected

### 1. Vite Proxy Configuration (`vite.config.ts`)
```typescript
proxy: {
  '/api': {
    target: 'http://backend:8000',  // CRITICAL: Must be backend service name
    changeOrigin: true,             // CRITICAL: Required for Docker networking
    secure: false,                  // CRITICAL: Required for HTTP
    ws: true                        // CRITICAL: WebSocket support
  }
}
```

### 2. Axios Configuration (`src/services/api.ts`)
```typescript
const api = axios.create({
  baseURL: 'http://localhost:8000/api',  // CRITICAL: Direct to backend for host browser
  headers: {
    'Content-Type': 'application/json', // CRITICAL: JSON communication
    'Accept': 'application/json'        // CRITICAL: JSON parsing
  },
  timeout: 10000,                       // CRITICAL: Prevent hanging
  responseType: 'json'                  // CRITICAL: Auto JSON parsing
})
```

### 3. Docker Compose Environment (`docker-compose.yml`)
```yaml
frontend:
  environment:
    - VITE_API_URL=http://backend:8000  # CRITICAL: Backend service reference
  ports:
    - "3000:3000"                       # CRITICAL: Frontend access
backend:
  ports:
    - "8000:8000"                       # CRITICAL: Backend API access
```

## Why These Configurations Are Critical

### The Problem We Solved
- **Issue**: "Failed to load watchlists" due to `net::ERR_NAME_NOT_RESOLVED`
- **Root Cause**: Browser couldn't resolve Docker service names (`backend:8000`)
- **Solution**: Direct axios calls to `localhost:8000` from host browser

### Configuration Chain
1. **Host Browser** → `http://localhost:3000` (Frontend access)
2. **Frontend API Calls** → `http://localhost:8000/api` (Direct to backend)
3. **Vite Proxy** → `http://backend:8000` (Container-to-container communication)
4. **Docker Environment** → `VITE_API_URL=http://backend:8000` (Service reference)

### Why Each Configuration Matters
- **`localhost:8000` in API**: Bypasses Docker networking limitations when browser accesses from host
- **`backend:8000` in proxy**: Enables container-to-container communication within Docker network
- **Port mappings**: Exposes services to host machine for browser access
- **Same network**: Allows Docker service name resolution between containers
- **`depends_on`**: Ensures backend is ready before frontend starts

## Running the Tests

```bash
# Run all tests
npm test

# Run only proxy config tests
npm test proxy-config

# Run only Docker config tests
npm test docker-config

# Run tests in CI mode
npm test -- --run
```

## Test Results Example

```
✓ Docker Compose Configuration Protection
  ✓ should have frontend service with correct VITE_API_URL environment variable
  ✓ should have frontend service with correct port mapping
  ✓ should have backend service with correct port mapping
  ✓ should have services connected to the same network
  ✓ should have frontend depending on backend service

✓ Vite Proxy Configuration Protection
  ✓ should document correct proxy target for /api routes
  ✓ should document correct server configuration
  ✓ should document proxy configuration requirements

✓ API Configuration Protection
  ✓ should maintain correct axios baseURL for host browser access
  ✓ should document required headers for JSON communication
  ✓ should document JSON response type requirement
  ✓ should document timeout configuration requirement
```

## Adding New Tests

When adding new tests, ensure they:
1. **Document** the expected configuration values
2. **Explain** why each setting is critical
3. **Reference** the original issue that was resolved
4. **Include** comments about what happens if the config changes

## Troubleshooting

If tests fail:
1. **Check** that the configuration files exist
2. **Verify** Docker Compose YAML is valid
3. **Ensure** all critical values match expectations
4. **Review** recent changes to proxy configurations

## Configuration History

- **Issue**: `net::ERR_NAME_NOT_RESOLVED` for `backend:8000`
- **Solution**: Direct axios calls to `localhost:8000`
- **Result**: Frontend successfully loads watchlists
- **Protection**: These tests prevent regression

## DO NOT MODIFY

❌ **Do not change these configurations without:**
- Understanding the complete Docker networking setup
- Testing in both development and production environments
- Updating these protection tests accordingly
- Documenting the reason for the change

✅ **If you must modify:**
1. Update the tests first
2. Explain why in the test comments
3. Test thoroughly in Docker environment
4. Verify browser access still works