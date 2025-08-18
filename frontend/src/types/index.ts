export interface WatchlistItem {
  id: number
  symbol: string
  company_name?: string
  entry_price?: number
  target_price?: number
  stop_loss?: number
  created_at: string
}

export interface Watchlist {
  id: number
  name: string
  description?: string
  created_at: string
  updated_at?: string
  items: WatchlistItem[]
}

export interface UploadResponse {
  watchlist: Watchlist
  valid_symbols: string[]
  invalid_symbols: string[]
  total_processed: number
}

export interface ChartData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface MarkerData {
  time: string
  position: 'belowBar' | 'aboveBar'
  color: string
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
  text?: string
}