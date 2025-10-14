/**
 * Screener API Service
 * Interfaces with the FastAPI screener endpoint
 */

// Use relative URL to leverage Vite proxy in development
// In production, API requests go directly to backend
const API_BASE_URL = ''

export interface ScreenerFilters {
  // Price filters
  minPrice?: number
  maxPrice?: number

  // Volume filters
  minAvgVol20?: number
  minRelVolume?: number

  // Position filter
  maxDistanceTo52wHigh?: number

  // Market cap filters
  minMarketCap?: number
  maxMarketCap?: number

  // Asset type filter
  assetType?: string

  // Boolean signal filters
  aboveSMA200?: boolean
  smaBullStack?: boolean
  macdCrossUp?: boolean
  donchBreakout?: boolean
  highTightZone?: boolean
  bull?: boolean
  weeklyStrong?: boolean
  bear?: boolean
  weakening?: boolean

  // Score filters
  minTrendScoreD?: number
  minTrendScoreW?: number

  // Sorting and pagination
  sort?: string
  page: number
  pageSize: number
}

export interface ScreenerResult {
  symbol: string
  daily_date: string | null
  weekly_date: string | null

  // Price and volume (Decimal fields come as strings from API)
  close: string | number | null
  volume: number | null
  avg_vol20: string | number | null
  rel_volume: string | number | null

  // Daily technicals (Decimal fields come as strings)
  sma20: string | number | null
  sma50: string | number | null
  sma200: string | number | null
  rsi14: string | number | null
  adx14: string | number | null
  atr14: string | number | null
  donch20_high: string | number | null
  donch20_low: string | number | null
  macd: string | number | null
  macd_signal: string | number | null
  macd_hist: string | number | null
  high_252: string | number | null
  distance_to_52w_high: string | number | null
  sma_slope: string | number | null

  // Daily signals
  sma20_cross_50_up: boolean | null
  price_above_200: boolean | null
  rsi_cross_50_up: boolean | null
  macd_cross_up: boolean | null
  donch20_breakout: boolean | null
  high_tight_zone: boolean | null
  below_200_sma: boolean | null
  macd_cross_down: boolean | null
  rsi_cross_50_down: boolean | null
  trend_score_d: number | null

  // Trade levels (Decimal fields come as strings)
  proposed_entry: string | number | null
  proposed_stop: string | number | null
  target1: string | number | null
  target2: string | number | null
  risk_reward_ratio: string | number | null
  daily_notes: string | null

  // Weekly technicals (Decimal fields come as strings)
  sma10w: string | number | null
  sma30w: string | number | null
  sma40w: string | number | null
  rsi14w: string | number | null
  adx14w: string | number | null
  atr14w: string | number | null
  donch20w_high: string | number | null
  donch20w_low: string | number | null
  macd_w: string | number | null
  macd_signal_w: string | number | null
  macd_hist_w: string | number | null
  avg_vol10w: string | number | null
  high_52w: string | number | null
  distance_to_52w_high_w: string | number | null
  sma_w_slope: string | number | null

  // Weekly signals
  stack_10_30_40: boolean | null
  close_above_30w: boolean | null
  donch20w_breakout: boolean | null
  macd_w_cross_up: boolean | null
  rsi14w_gt_50: boolean | null
  below_30w_ma: boolean | null
  macd_w_cross_down: boolean | null
  stack_broken: boolean | null
  rsi14w_lt_50: boolean | null
  trend_score_w: number | null

  // Derived fields
  sma_bull_stack: boolean | null
  weekly_strong: boolean | null
  combined_score: number | null
  distance_from_entry_pct: string | number | null
  pct_from_52w_high: string | number | null

  // Asset metadata
  asset_type: string | null
  sector: string | null
  industry: string | null
  market_cap: string | null
  market_cap_category: string | null
  market_cap_numeric: number | null
}

export interface ScreenerResponse {
  results: ScreenerResult[]
  total_count: number
  page: number
  page_size: number
  total_pages: number
}

class ScreenerApi {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  /**
   * Query screener for a specific symbol
   */
  async querySymbol(symbol: string): Promise<ScreenerResponse> {
    const params = new URLSearchParams()
    params.append('symbol', symbol.toUpperCase())
    params.append('page', '1')
    params.append('pageSize', '1')

    const response = await fetch(`${this.baseUrl}/api/screener?${params.toString()}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `Screener request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Query screener with filters
   */
  async query(filters: ScreenerFilters): Promise<ScreenerResponse> {
    const params = new URLSearchParams()

    // Price filters
    if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice.toString())
    if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString())

    // Volume filters
    if (filters.minAvgVol20 !== undefined) params.append('minAvgVol20', filters.minAvgVol20.toString())
    if (filters.minRelVolume !== undefined) params.append('minRelVolume', filters.minRelVolume.toString())

    // Position filter
    if (filters.maxDistanceTo52wHigh !== undefined) {
      params.append('maxDistanceTo52wHigh', filters.maxDistanceTo52wHigh.toString())
    }

    // Market cap filters
    if (filters.minMarketCap !== undefined) params.append('minMarketCap', filters.minMarketCap.toString())
    if (filters.maxMarketCap !== undefined) params.append('maxMarketCap', filters.maxMarketCap.toString())

    // Asset type filter
    if (filters.assetType) params.append('assetType', filters.assetType)

    // Boolean signal filters
    if (filters.aboveSMA200 === true) params.append('aboveSMA200', 'true')
    if (filters.smaBullStack === true) params.append('smaBullStack', 'true')
    if (filters.macdCrossUp === true) params.append('macdCrossUp', 'true')
    if (filters.donchBreakout === true) params.append('donchBreakout', 'true')
    if (filters.highTightZone === true) params.append('highTightZone', 'true')
    if (filters.bull === true) params.append('bull', 'true')
    if (filters.weeklyStrong === true) params.append('weeklyStrong', 'true')
    if (filters.bear === true) params.append('bear', 'true')
    if (filters.weakening === true) params.append('weakening', 'true')

    // Score filters
    if (filters.minTrendScoreD !== undefined) {
      params.append('minTrendScoreD', filters.minTrendScoreD.toString())
    }
    if (filters.minTrendScoreW !== undefined) {
      params.append('minTrendScoreW', filters.minTrendScoreW.toString())
    }

    // Sorting and pagination
    if (filters.sort) params.append('sort', filters.sort)
    params.append('page', filters.page.toString())
    params.append('pageSize', filters.pageSize.toString())

    const response = await fetch(`${this.baseUrl}/api/screener?${params.toString()}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `Screener request failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`)

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`)
    }

    return response.json()
  }
}

export const screenerApi = new ScreenerApi(API_BASE_URL)
