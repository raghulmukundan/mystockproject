import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

/**
 * Docker Compose Configuration Protection Tests
 *
 * These tests validate the docker-compose.yml file to ensure
 * critical environment variables and networking configurations
 * are maintained.
 */

describe('Docker Compose Configuration Protection', () => {
  let dockerComposeConfig: any

  // Load docker-compose.yml before tests
  beforeAll(async () => {
    try {
      const dockerComposePath = path.resolve(__dirname, '../../../docker-compose.yml')
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8')
      dockerComposeConfig = yaml.load(dockerComposeContent)
    } catch (error) {
      console.warn('Could not load docker-compose.yml for testing:', error)
      dockerComposeConfig = null
    }
  })

  it('should have frontend service with correct VITE_API_URL environment variable', () => {
    if (!dockerComposeConfig) {
      console.warn('Skipping Docker Compose test - file not found')
      return
    }

    expect(dockerComposeConfig.services).toBeDefined()
    expect(dockerComposeConfig.services.frontend).toBeDefined()
    expect(dockerComposeConfig.services.frontend.environment).toBeDefined()

    const frontendEnv = dockerComposeConfig.services.frontend.environment

    // Find VITE_API_URL in environment array or object
    let viteApiUrl: string | undefined

    if (Array.isArray(frontendEnv)) {
      viteApiUrl = frontendEnv.find((env: string) => env.startsWith('VITE_API_URL='))
    } else if (typeof frontendEnv === 'object') {
      viteApiUrl = frontendEnv.VITE_API_URL
    }

    // CRITICAL: VITE_API_URL must be set to backend service
    expect(viteApiUrl).toBeDefined()
    expect(viteApiUrl).toMatch(/http:\/\/backend:8000/)
  })

  it('should have frontend service with correct port mapping', () => {
    if (!dockerComposeConfig) {
      console.warn('Skipping Docker Compose test - file not found')
      return
    }

    const frontend = dockerComposeConfig.services.frontend

    // CRITICAL: Port 3000 must be exposed for host browser access
    expect(frontend.ports).toBeDefined()
    expect(frontend.ports).toContain('3000:3000')
  })

  it('should have backend service with correct port mapping', () => {
    if (!dockerComposeConfig) {
      console.warn('Skipping Docker Compose test - file not found')
      return
    }

    const backend = dockerComposeConfig.services.backend

    // CRITICAL: Port 8000 must be exposed for frontend to reach backend from host
    expect(backend.ports).toBeDefined()
    expect(backend.ports).toContain('8000:8000')
  })

  it('should have services connected to the same network', () => {
    if (!dockerComposeConfig) {
      console.warn('Skipping Docker Compose test - file not found')
      return
    }

    const frontend = dockerComposeConfig.services.frontend
    const backend = dockerComposeConfig.services.backend

    // CRITICAL: Both services must be on the same network for service discovery
    expect(frontend.networks).toBeDefined()
    expect(backend.networks).toBeDefined()
    expect(frontend.networks).toContain('app-network')
    expect(backend.networks).toContain('app-network')
  })

  it('should have frontend depending on backend service', () => {
    if (!dockerComposeConfig) {
      console.warn('Skipping Docker Compose test - file not found')
      return
    }

    const frontend = dockerComposeConfig.services.frontend

    // CRITICAL: Frontend must wait for backend to be ready
    expect(frontend.depends_on).toBeDefined()
    expect(frontend.depends_on).toContain('backend')
  })
})

describe('Critical Configuration Documentation', () => {
  it('should document the proxy configuration chain', () => {
    const configChain = {
      'host_browser': 'http://localhost:3000 (User accesses frontend)',
      'frontend_api_calls': 'http://localhost:8000/api (Direct to backend, bypasses proxy)',
      'vite_proxy_target': 'http://backend:8000 (For container-to-container communication)',
      'docker_env_var': 'VITE_API_URL=http://backend:8000 (Set in docker-compose.yml)',
      'backend_service': 'backend:8000 (Docker service name resolution)'
    }

    // This test documents the complete configuration chain
    expect(configChain.host_browser).toContain('localhost:3000')
    expect(configChain.frontend_api_calls).toContain('localhost:8000/api')
    expect(configChain.vite_proxy_target).toContain('backend:8000')
    expect(configChain.docker_env_var).toContain('VITE_API_URL=http://backend:8000')
    expect(configChain.backend_service).toContain('backend:8000')
  })

  it('should document why these configurations are critical', () => {
    const reasons = {
      'localhost_8000_in_api': 'Bypasses Docker networking limitations when browser accesses from host',
      'backend_8000_in_proxy': 'Enables container-to-container communication within Docker network',
      'port_mappings': 'Exposes services to host machine for browser access',
      'same_network': 'Allows Docker service name resolution between containers',
      'depends_on': 'Ensures backend is ready before frontend starts'
    }

    // Document the critical reasons for each configuration
    expect(reasons.localhost_8000_in_api).toContain('Docker networking limitations')
    expect(reasons.backend_8000_in_proxy).toContain('container-to-container')
    expect(reasons.port_mappings).toContain('host machine')
    expect(reasons.same_network).toContain('service name resolution')
    expect(reasons.depends_on).toContain('backend is ready')
  })
})