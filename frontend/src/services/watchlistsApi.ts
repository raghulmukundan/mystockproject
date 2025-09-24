import axios, { AxiosInstance } from 'axios'

// Backend API instance for watchlists
const watchlistsApi: AxiosInstance = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000,
  responseType: 'json',
})

export interface WatchlistItem {
  id: number
  symbol: string
  company_name?: string
  sector?: string
  industry?: string
  market_cap?: number
  entry_price?: number
  target_price?: number
  stop_loss?: number
  created_at: string
  current_price?: number
  change?: number
  change_percent?: number
  volume?: number
}

export interface Watchlist {
  id: number
  name: string
  description?: string
  created_at: string
  updated_at?: string
  items: WatchlistItem[]
  total_value?: number
  total_change?: number
  total_change_percent?: number
}

export interface WatchlistCreateRequest {
  name: string
  description?: string
}

export interface WatchlistItemRequest {
  symbol: string
  company_name?: string
  sector?: string
  industry?: string
  market_cap?: number
  entry_price?: number
  target_price?: number
  stop_loss?: number
}

export interface StockPrice {
  symbol: string
  current_price: number
  change: number
  change_percent: number
  volume: number
  market_cap?: number
}

export interface SymbolSearchResult {
  symbol: string
  security_name: string
  listing_exchange?: string
  market_category?: string
}

export const watchlistsApiService = {
  // Get all watchlists
  async getWatchlists(): Promise<Watchlist[]> {
    const response = await watchlistsApi.get('/watchlists')
    return response.data
  },

  // Get a specific watchlist
  async getWatchlist(id: number): Promise<Watchlist> {
    const response = await watchlistsApi.get(`/watchlists/${id}`)
    return response.data
  },

  // Create a new watchlist
  async createWatchlist(data: WatchlistCreateRequest): Promise<Watchlist> {
    const response = await watchlistsApi.post('/watchlists', data)
    return response.data
  },

  // Update a watchlist
  async updateWatchlist(id: number, data: Partial<WatchlistCreateRequest>): Promise<Watchlist> {
    const response = await watchlistsApi.put(`/watchlists/${id}`, data)
    return response.data
  },

  // Delete a watchlist
  async deleteWatchlist(id: number): Promise<void> {
    await watchlistsApi.delete(`/watchlists/${id}`)
  },

  // Add item to watchlist
  async addItemToWatchlist(watchlistId: number, item: WatchlistItemRequest): Promise<WatchlistItem> {
    const response = await watchlistsApi.post(`/watchlists/${watchlistId}/items`, item)
    return response.data
  },

  // Remove item from watchlist
  async removeItemFromWatchlist(watchlistId: number, itemId: number): Promise<void> {
    await watchlistsApi.delete(`/watchlists/${watchlistId}/items/${itemId}`)
  },

  // Get prices for watchlist
  async getWatchlistPrices(watchlistId: number): Promise<StockPrice[]> {
    const response = await watchlistsApi.get(`/watchlists/${watchlistId}/prices`)
    const pricesData = response.data.prices || []

    // Transform the price data to match our expected format
    return pricesData.map((price: any) => ({
      symbol: price.symbol,
      current_price: price.close || 0,
      change: (price.close || 0) - (price.open || 0),
      change_percent: price.open > 0 ? (((price.close || 0) - (price.open || 0)) / (price.open || 0)) * 100 : 0,
      volume: price.volume || 0,
      market_cap: null
    })).filter((price: StockPrice) => price.current_price > 0) // Filter out invalid prices like TEST symbols
  },

  // Get stock prices for multiple symbols
  async getStockPrices(symbols: string[]): Promise<StockPrice[]> {
    const response = await watchlistsApi.get('/stocks/prices', {
      params: { symbols }
    })
    return response.data
  },

  // Search symbols
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    try {
      const response = await watchlistsApi.get('/symbols/search', {
        params: { q: query, limit: 20 }
      })
      return response.data
    } catch (error) {
      console.error('Error searching symbols:', error)
      return []
    }
  }
}

export default watchlistsApiService