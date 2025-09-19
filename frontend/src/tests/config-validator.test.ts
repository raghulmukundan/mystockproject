import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

/**
 * Configuration Validator with Fix Suggestions
 *
 * This test suite validates critical proxy configurations and provides
 * specific fix suggestions when configurations are incorrect.
 */

interface ValidationResult {
  isValid: boolean
  message: string
  fixSuggestion?: string
  currentValue?: any
  expectedValue?: any
}

class ConfigValidator {
  private dockerComposeConfig: any = null
  private viteConfigPath: string
  private apiConfigPath: string

  constructor() {
    this.viteConfigPath = path.resolve(__dirname, '../../vite.config.ts')
    this.apiConfigPath = path.resolve(__dirname, '../services/api.ts')
  }

  async loadConfigs() {
    try {
      const dockerComposePath = path.resolve(__dirname, '../../../docker-compose.yml')
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8')
      this.dockerComposeConfig = yaml.load(dockerComposeContent)
    } catch (error) {
      console.warn('Could not load docker-compose.yml:', error)
    }
  }

  validateDockerComposeViteApiUrl(): ValidationResult {
    if (!this.dockerComposeConfig) {
      return {
        isValid: false,
        message: 'docker-compose.yml not found',
        fixSuggestion: 'Ensure docker-compose.yml exists in the project root'
      }
    }

    const frontend = this.dockerComposeConfig.services?.frontend
    if (!frontend) {
      return {
        isValid: false,
        message: 'Frontend service not found in docker-compose.yml',
        fixSuggestion: 'Add frontend service to docker-compose.yml services section'
      }
    }

    const env = frontend.environment
    let viteApiUrl: string | undefined

    if (Array.isArray(env)) {
      const envVar = env.find((e: string) => e.startsWith('VITE_API_URL='))
      viteApiUrl = envVar?.split('=')[1]
    } else if (typeof env === 'object') {
      viteApiUrl = env.VITE_API_URL
    }

    const expectedValue = 'http://backend:8000'

    if (!viteApiUrl) {
      return {
        isValid: false,
        message: 'VITE_API_URL environment variable not set',
        currentValue: undefined,
        expectedValue,
        fixSuggestion: `Add to docker-compose.yml frontend service environment:\n  - VITE_API_URL=${expectedValue}`
      }
    }

    if (viteApiUrl !== expectedValue) {
      return {
        isValid: false,
        message: 'VITE_API_URL has incorrect value',
        currentValue: viteApiUrl,
        expectedValue,
        fixSuggestion: `Update docker-compose.yml frontend environment:\n  Change: VITE_API_URL=${viteApiUrl}\n  To: VITE_API_URL=${expectedValue}`
      }
    }

    return { isValid: true, message: 'VITE_API_URL correctly configured' }
  }

  validateDockerComposePorts(): ValidationResult {
    if (!this.dockerComposeConfig) {
      return { isValid: false, message: 'docker-compose.yml not found' }
    }

    const frontend = this.dockerComposeConfig.services?.frontend
    const backend = this.dockerComposeConfig.services?.backend

    // Check frontend ports
    if (!frontend?.ports?.includes('3000:3000')) {
      return {
        isValid: false,
        message: 'Frontend port mapping incorrect',
        currentValue: frontend?.ports,
        expectedValue: ['3000:3000'],
        fixSuggestion: 'Add to frontend service in docker-compose.yml:\n  ports:\n    - "3000:3000"'
      }
    }

    // Check backend ports
    if (!backend?.ports?.includes('8000:8000')) {
      return {
        isValid: false,
        message: 'Backend port mapping incorrect',
        currentValue: backend?.ports,
        expectedValue: ['8000:8000'],
        fixSuggestion: 'Add to backend service in docker-compose.yml:\n  ports:\n    - "8000:8000"'
      }
    }

    return { isValid: true, message: 'Port mappings correctly configured' }
  }

  validateViteConfig(): ValidationResult {
    try {
      const viteConfigContent = fs.readFileSync(this.viteConfigPath, 'utf8')

      // Check for required proxy configuration
      const hasApiProxy = viteConfigContent.includes("'/api':")
      if (!hasApiProxy) {
        return {
          isValid: false,
          message: 'Vite proxy for /api not found',
          fixSuggestion: `Add to vite.config.ts server.proxy:\n  '/api': {\n    target: 'http://backend:8000',\n    changeOrigin: true,\n    secure: false\n  }`
        }
      }

      // Check proxy target
      const hasCorrectTarget = viteConfigContent.includes('http://backend:8000')
      if (!hasCorrectTarget) {
        return {
          isValid: false,
          message: 'Vite proxy target incorrect',
          fixSuggestion: 'Update vite.config.ts proxy target to: http://backend:8000'
        }
      }

      // Check server configuration
      const hasCorrectHost = viteConfigContent.includes("host: '0.0.0.0'")
      if (!hasCorrectHost) {
        return {
          isValid: false,
          message: 'Vite server host incorrect',
          fixSuggestion: "Update vite.config.ts server.host to: '0.0.0.0'"
        }
      }

      const hasCorrectPort = viteConfigContent.includes('port: 3000')
      if (!hasCorrectPort) {
        return {
          isValid: false,
          message: 'Vite server port incorrect',
          fixSuggestion: 'Update vite.config.ts server.port to: 3000'
        }
      }

      return { isValid: true, message: 'Vite configuration is correct' }
    } catch (error) {
      return {
        isValid: false,
        message: 'Could not read vite.config.ts',
        fixSuggestion: 'Ensure vite.config.ts exists and is readable'
      }
    }
  }

  validateApiConfig(): ValidationResult {
    try {
      const apiConfigContent = fs.readFileSync(this.apiConfigPath, 'utf8')

      // Check baseURL
      const hasCorrectBaseUrl = apiConfigContent.includes('http://localhost:8000/api')
      if (!hasCorrectBaseUrl) {
        return {
          isValid: false,
          message: 'API baseURL incorrect',
          fixSuggestion: "Update src/services/api.ts baseURL to: 'http://localhost:8000/api'"
        }
      }

      // Check JSON headers
      const hasJsonHeaders = apiConfigContent.includes("'Content-Type': 'application/json'") &&
                           apiConfigContent.includes("'Accept': 'application/json'")
      if (!hasJsonHeaders) {
        return {
          isValid: false,
          message: 'API headers incorrect',
          fixSuggestion: "Add to axios headers:\n  'Content-Type': 'application/json',\n  'Accept': 'application/json'"
        }
      }

      // Check response type
      const hasResponseType = apiConfigContent.includes("responseType: 'json'")
      if (!hasResponseType) {
        return {
          isValid: false,
          message: 'API responseType not set',
          fixSuggestion: "Add to axios config: responseType: 'json'"
        }
      }

      return { isValid: true, message: 'API configuration is correct' }
    } catch (error) {
      return {
        isValid: false,
        message: 'Could not read api.ts',
        fixSuggestion: 'Ensure src/services/api.ts exists and is readable'
      }
    }
  }

  async validateAll(): Promise<ValidationResult[]> {
    await this.loadConfigs()

    return [
      this.validateDockerComposeViteApiUrl(),
      this.validateDockerComposePorts(),
      this.validateViteConfig(),
      this.validateApiConfig()
    ]
  }
}

describe('Configuration Validator with Fix Suggestions', () => {
  let validator: ConfigValidator
  let validationResults: ValidationResult[]

  beforeAll(async () => {
    validator = new ConfigValidator()
    validationResults = await validator.validateAll()
  })

  it('should have correct VITE_API_URL in docker-compose.yml', () => {
    const result = validationResults[0]

    if (!result.isValid) {
      console.error('\n🚨 VALIDATION FAILED:', result.message)
      if (result.currentValue !== undefined) {
        console.error('📍 Current value:', result.currentValue)
      }
      if (result.expectedValue !== undefined) {
        console.error('✅ Expected value:', result.expectedValue)
      }
      if (result.fixSuggestion) {
        console.error('🔧 Fix suggestion:')
        console.error(result.fixSuggestion)
      }
      console.error('')
    }

    expect(result.isValid).toBe(true)
  })

  it('should have correct port mappings in docker-compose.yml', () => {
    const result = validationResults[1]

    if (!result.isValid) {
      console.error('\n🚨 VALIDATION FAILED:', result.message)
      if (result.currentValue !== undefined) {
        console.error('📍 Current value:', result.currentValue)
      }
      if (result.expectedValue !== undefined) {
        console.error('✅ Expected value:', result.expectedValue)
      }
      if (result.fixSuggestion) {
        console.error('🔧 Fix suggestion:')
        console.error(result.fixSuggestion)
      }
      console.error('')
    }

    expect(result.isValid).toBe(true)
  })

  it('should have correct Vite proxy configuration', () => {
    const result = validationResults[2]

    if (!result.isValid) {
      console.error('\n🚨 VALIDATION FAILED:', result.message)
      if (result.fixSuggestion) {
        console.error('🔧 Fix suggestion:')
        console.error(result.fixSuggestion)
      }
      console.error('')
    }

    expect(result.isValid).toBe(true)
  })

  it('should have correct API configuration', () => {
    const result = validationResults[3]

    if (!result.isValid) {
      console.error('\n🚨 VALIDATION FAILED:', result.message)
      if (result.fixSuggestion) {
        console.error('🔧 Fix suggestion:')
        console.error(result.fixSuggestion)
      }
      console.error('')
    }

    expect(result.isValid).toBe(true)
  })

  it('should document all critical configurations', () => {
    console.log('\n📋 CONFIGURATION SUMMARY:')
    console.log('├── docker-compose.yml')
    console.log('│   ├── VITE_API_URL=http://backend:8000')
    console.log('│   ├── frontend ports: 3000:3000')
    console.log('│   └── backend ports: 8000:8000')
    console.log('├── vite.config.ts')
    console.log('│   ├── proxy /api → http://backend:8000')
    console.log('│   ├── host: 0.0.0.0')
    console.log('│   └── port: 3000')
    console.log('└── src/services/api.ts')
    console.log('    ├── baseURL: http://localhost:8000/api')
    console.log('    ├── headers: application/json')
    console.log('    └── responseType: json')
    console.log('')

    expect(true).toBe(true)
  })
})