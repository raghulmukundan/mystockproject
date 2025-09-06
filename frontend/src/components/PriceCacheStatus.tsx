import React, { useState, useEffect } from 'react'
import { Clock, RefreshCw, Database, AlertCircle } from 'lucide-react'

interface CacheStats {
  price_cache: {
    total_cached_prices: number
    fresh_prices: number
    stale_prices: number
    cache_ttl_minutes: number
    background_refresh_running: boolean
    oldest_entry?: string
    newest_entry?: string
  }
  global_cache: any
  legacy_cache: any
}

interface PriceCacheStatusProps {
  className?: string
  showDetails?: boolean
}

const PriceCacheStatus: React.FC<PriceCacheStatusProps> = ({ 
  className = "", 
  showDetails = false 
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchCacheStats = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/stocks/cache-stats')
      if (response.ok) {
        const stats = await response.json()
        setCacheStats(stats)
        setLastUpdated(new Date())
      } else {
        setError('Failed to fetch cache stats')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const refreshPrices = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/stocks/refresh-prices', { method: 'POST' })
      if (response.ok) {
        await fetchCacheStats() // Refresh stats after manual refresh
      } else {
        setError('Failed to refresh prices')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCacheStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchCacheStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (isoString?: string) => {
    if (!isoString) return 'N/A'
    return new Date(isoString).toLocaleTimeString()
  }

  const getCacheHealthColor = () => {
    if (!cacheStats?.price_cache) return 'text-gray-500'
    const { fresh_prices, total_cached_prices } = cacheStats.price_cache
    if (total_cached_prices === 0) return 'text-red-500'
    if (fresh_prices < total_cached_prices * 0.8) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getCacheHealthIcon = () => {
    if (!cacheStats?.price_cache) return <AlertCircle className="w-4 h-4" />
    const { fresh_prices, total_cached_prices } = cacheStats.price_cache
    if (total_cached_prices === 0) return <AlertCircle className="w-4 h-4" />
    if (fresh_prices < total_cached_prices * 0.8) return <Clock className="w-4 h-4" />
    return <Database className="w-4 h-4" />
  }

  if (!showDetails && !cacheStats) return null

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-1 ${getCacheHealthColor()}`}>
            {getCacheHealthIcon()}
            <span className="text-sm font-medium">
              Price Cache
            </span>
          </div>
          {cacheStats?.price_cache && (
            <span className="text-xs text-gray-500">
              {cacheStats.price_cache.total_cached_prices} cached
              {cacheStats.price_cache.stale_prices > 0 && 
                ` (${cacheStats.price_cache.stale_prices} stale)`
              }
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={refreshPrices}
            disabled={isLoading}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center space-x-1"
            title="Manually refresh all prices"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {showDetails && cacheStats?.price_cache && (
        <div className="mt-2 text-xs text-gray-600 space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div>Fresh: {cacheStats.price_cache.fresh_prices}</div>
            <div>Stale: {cacheStats.price_cache.stale_prices}</div>
            <div>TTL: {cacheStats.price_cache.cache_ttl_minutes}min</div>
            <div className="flex items-center space-x-1">
              <span>Background:</span>
              <div className={`w-2 h-2 rounded-full ${
                cacheStats.price_cache.background_refresh_running ? 'bg-green-500' : 'bg-red-500'
              }`} />
            </div>
          </div>
          {cacheStats.price_cache.newest_entry && (
            <div className="text-xs text-gray-500 pt-1 border-t">
              Last updated: {formatTime(cacheStats.price_cache.newest_entry)}
              {lastUpdated && (
                <span className="ml-2">
                  (checked {lastUpdated.toLocaleTimeString()})
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PriceCacheStatus