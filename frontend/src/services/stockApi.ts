import { ChartData } from '../types'

const API_BASE_URL = '/api'

export interface StockPrice {
  symbol: string
  current_price: number
  change: number
  change_percent: number
  volume: number
  market_cap?: number
  high_52w?: number
  low_52w?: number
  change_week?: number
  change_month?: number
}

export interface CompanyProfile {
  symbol: string
  company_name: string
  sector: string
  industry: string
  market_cap?: number
  description?: string
  country?: string
  exchange: string
}

class StockApiService {
  async getStockPrice(symbol: string): Promise<StockPrice> {
    const response = await fetch(`${API_BASE_URL}/stocks/prices/${symbol}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch stock price for ${symbol}`)
    }
    return response.json()
  }

  async getMultipleStockPrices(symbols: string[]): Promise<Record<string, StockPrice>> {
    const params = new URLSearchParams()
    symbols.forEach(symbol => params.append('symbols', symbol))
    
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
    
    try {
      const response = await fetch(`${API_BASE_URL}/stocks/prices?${params}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch stock prices: ${response.status}`)
      }
      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out - too many symbols or API is slow')
      }
      throw error
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const response = await fetch(`${API_BASE_URL}/stocks/profile/${symbol}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch company profile for ${symbol}`)
    }
    return response.json()
  }

  async getMultipleCompanyProfiles(symbols: string[]): Promise<Record<string, CompanyProfile>> {
    const params = new URLSearchParams()
    symbols.forEach(symbol => params.append('symbols', symbol))
    
    const response = await fetch(`${API_BASE_URL}/stocks/profiles?${params}`)
    if (!response.ok) {
      throw new Error('Failed to fetch company profiles')
    }
    return response.json()
  }

  async getCacheStats() {
    const response = await fetch(`${API_BASE_URL}/stocks/cache-stats`)
    if (!response.ok) {
      throw new Error('Failed to fetch cache stats')
    }
    return response.json()
  }

  async clearCache() {
    const response = await fetch(`${API_BASE_URL}/stocks/clear-cache`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error('Failed to clear cache')
    }
    return response.json()
  }

  async getCandles(symbol: string, range: string = '6m'): Promise<ChartData[]> {
    const params = new URLSearchParams({ symbol, range })
    const response = await fetch(`${API_BASE_URL}/market/candles?${params}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch candle data for ${symbol}`)
    }
    
    const data = await response.json()
    
    // Convert API format to ChartData format
    return data.bars.map((bar: any) => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }))
  }
}

export const stockApi = new StockApiService()
