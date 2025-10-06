import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

export interface DailyMoverStock {
  id: number
  date: string
  symbol: string
  sector?: string
  market_cap_category?: string
  mover_type: 'gainer' | 'loser'
  rank_in_category: number
  open_price: number
  close_price: number
  high_price: number
  low_price: number
  price_change: number
  price_change_percent: number
  volume: number
  market_cap?: number
  week_52_high?: number
  week_52_low?: number
  distance_to_52w_high?: number
  distance_to_52w_low?: number
  rsi?: number
  relative_volume?: number
}

export interface MoversGroup {
  category: string
  category_type: 'sector' | 'market_cap'
  gainers: DailyMoverStock[]
  losers: DailyMoverStock[]
}

export interface DailyMoversResponse {
  date: string
  sectors: MoversGroup[]
  market_caps: MoversGroup[]
  total_movers: number
  total_gainers?: number
  total_losers?: number
}

export const dailyMoversApi = {
  // Get latest daily movers
  async getLatest(): Promise<DailyMoversResponse> {
    const response = await api.get('/daily-movers/latest')
    return response.data
  },

  // Get daily movers for specific date
  async getByDate(date: string): Promise<DailyMoversResponse> {
    const response = await api.get(`/daily-movers/${date}`)
    return response.data
  },

  // Get available dates
  async getAvailableDates(): Promise<{ available_dates: string[], total_dates: number }> {
    const response = await api.get('/daily-movers/available-dates')
    return response.data
  },

  // Get stats
  async getStats(): Promise<any> {
    const response = await api.get('/daily-movers/stats')
    return response.data
  },

  // Get raw data for summary calculations
  async getRawSummary(date: string): Promise<{total_movers: number, total_gainers: number, total_losers: number}> {
    const response = await api.get(`/daily-movers/raw/${date}`)
    return response.data
  }
}

export default dailyMoversApi