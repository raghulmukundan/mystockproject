import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { EyeIcon, PlusIcon, PencilIcon, TrashIcon, ClockIcon } from '@heroicons/react/24/outline'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'
import { Watchlist, WatchlistItem } from '../types'
import EditWatchlistModal from '../components/EditWatchlistModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

// Market hours utilities (same as Dashboard)
const isMarketOpen = (): boolean => {
  const now = new Date()
  const cstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
  const day = cstTime.getDay() // 0 = Sunday, 6 = Saturday
  const hours = cstTime.getHours()
  const minutes = cstTime.getMinutes()
  const totalMinutes = hours * 60 + minutes
  
  // Market closed on weekends
  if (day === 0 || day === 6) return false
  
  // Market hours: 8:30 AM - 3:00 PM CST
  const marketOpen = 8 * 60 + 30  // 8:30 AM
  const marketClose = 15 * 60     // 3:00 PM
  
  return totalMinutes >= marketOpen && totalMinutes < marketClose
}

const getNextRefreshTime = (intervalMinutes: number = 30): Date => {
  const now = new Date()
  
  // If market is open, next refresh is in 30 minutes
  if (isMarketOpen()) {
    const nextRefresh = new Date(now)
    nextRefresh.setMinutes(Math.ceil(now.getMinutes() / intervalMinutes) * intervalMinutes, 0, 0)
    return nextRefresh
  }
  
  // If market is closed, next refresh is at next market open (8:30 AM CST next trading day)
  const cstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
  const nextOpen = new Date(cstTime)
  
  // Set to 8:30 AM CST
  nextOpen.setHours(8, 30, 0, 0)
  
  // If we're past 8:30 AM today or it's weekend, move to next day
  if (cstTime.getHours() >= 8 && cstTime.getMinutes() >= 30 || cstTime.getDay() === 0 || cstTime.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }
  
  // Skip weekends
  while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }
  
  // Convert back to local time
  return new Date(nextOpen.toLocaleString("en-US", {timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone}))
}

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null)
  const [deletingWatchlist, setDeletingWatchlist] = useState<Watchlist | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [priceData, setPriceData] = useState<Record<string, StockPrice>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [nextRefresh, setNextRefresh] = useState<Date>(getNextRefreshTime())
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<string>('')

  useEffect(() => {
    loadWatchlists()
    
    // Update countdown timer every second
    const timer = setInterval(updateCountdown, 1000)
    
    // Refresh data every 30 minutes, but only during market hours
    const refreshInterval = setInterval(() => {
      if (isMarketOpen()) {
        refreshAllData()
      } else {
        console.log('Market closed, skipping price refresh on watchlists page')
      }
    }, 30 * 60 * 1000) // 30 minutes
    
    return () => {
      clearInterval(timer)
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    if (watchlists.length > 0) {
      loadStockPrices()
    }
  }, [watchlists])

  const updateCountdown = () => {
    const now = new Date()
    const diff = nextRefresh.getTime() - now.getTime()
    
    if (diff <= 0) {
      setNextRefresh(getNextRefreshTime())
      return
    }
    
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    setTimeUntilRefresh(`${minutes}:${seconds.toString().padStart(2, '0')}`)
  }

  const refreshAllData = async () => {
    console.log('Refreshing watchlist data...')
    setLastRefresh(new Date())
    setNextRefresh(getNextRefreshTime())
    
    // Reload watchlists and prices
    await loadWatchlists()
  }

  const loadStockPrices = async () => {
    try {
      // Get all unique symbols from all watchlists
      const allSymbols = Array.from(new Set(
        watchlists.flatMap(watchlist => 
          watchlist.items.map(item => item.symbol)
        )
      ))
      
      if (allSymbols.length === 0) return
      
      // Note: Market hours check is now handled by the backend
      // The backend will serve cached data during market close or allow first-time fetching
      
      console.log('Loading prices for symbols:', allSymbols)
      setLoadingPrices(true)
      
      // Optimized: Backend now handles cache efficiently, so larger batches with shorter delays
      const batchSize = 15 // Larger batches since backend is cache-optimized
      const priceResults: Record<string, any> = {}
      
      for (let i = 0; i < allSymbols.length; i += batchSize) {
        const batch = allSymbols.slice(i, i + batchSize)
        console.log(`Loading batch ${Math.floor(i/batchSize) + 1}:`, batch)
        
        try {
          const batchPrices = await stockApi.getMultipleStockPrices(batch)
          Object.assign(priceResults, batchPrices)
          
          // Update UI progressively as each batch loads
          setPriceData(prev => ({ ...prev, ...batchPrices }))
          
          // Shorter delay since backend is cache-optimized
          if (i + batchSize < allSymbols.length) {
            await new Promise(resolve => setTimeout(resolve, 1000)) // Reduced to 1 second
          }
        } catch (error) {
          console.error(`Error loading batch ${Math.floor(i/batchSize) + 1}:`, error)
        }
      }
      
      console.log('All price data loaded:', priceResults)
    } catch (error) {
      console.error('Error loading stock prices:', error)
    } finally {
      setLoadingPrices(false)
    }
  }

  const loadWatchlists = async () => {
    try {
      const data = await watchlistsApi.getAll()
      setWatchlists(data)
    } catch (err: any) {
      setError('Failed to load watchlists')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditWatchlist = async (data: {
    name: string
    description: string
    items: Omit<WatchlistItem, 'id' | 'created_at'>[]
  }) => {
    if (!editingWatchlist) return

    setEditLoading(true)
    try {
      await watchlistsApi.update(editingWatchlist.id, data)
      await loadWatchlists()
      setEditingWatchlist(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update watchlist')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDeleteWatchlist = async () => {
    if (!deletingWatchlist) return

    setDeleteLoading(true)
    try {
      await watchlistsApi.delete(deletingWatchlist.id)
      await loadWatchlists()
      setDeletingWatchlist(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete watchlist')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading watchlists...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Watchlists</h1>
          <p className="mt-2 text-gray-600">
            Manage your stock watchlists and monitor performance
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <ClockIcon className="h-4 w-4" />
              <span>
                {isMarketOpen() ? 'Market Open' : 'Market Closed'} • 
                {isMarketOpen() 
                  ? `Next refresh: ${timeUntilRefresh || 'Loading...'}` 
                  : `Next refresh: ${timeUntilRefresh || 'Next market open'}`
                }
              </span>
            </div>
            <div className="text-xs text-gray-400">
              Last updated: {lastRefresh.toLocaleTimeString('en-US', {
                timeZone: 'America/Chicago',
                hour: 'numeric',
                minute: '2-digit'
              })} CST
            </div>
          </div>
          <Link
            to="/upload"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Watchlist
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {watchlists.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No watchlists yet</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first watchlist</p>
          <Link
            to="/upload"
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Your First Watchlist
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {watchlists.map((watchlist) => (
            <div key={watchlist.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">{watchlist.name}</h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      {watchlist.items.length} symbols
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setEditingWatchlist(watchlist)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit watchlist"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeletingWatchlist(watchlist)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete watchlist"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {watchlist.description && (
                  <p className="text-gray-600 text-sm mb-4">{watchlist.description}</p>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Items</h4>
                  
                  {/* Column headers */}
                  <div className="grid grid-cols-6 gap-2 px-2 py-1 text-xs font-medium text-gray-500 border-b">
                    <div>Symbol</div>
                    <div className="text-right">Current</div>
                    <div className="text-right">Entry</div>
                    <div className="text-right">Target</div>
                    <div className="text-right">Stop</div>
                    <div className="text-right">P&L</div>
                  </div>
                  
                  <div className="space-y-1 mt-2">
                    {watchlist.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="grid grid-cols-6 gap-2 p-2 bg-gray-50 rounded text-xs items-center">
                        <div className="flex items-center space-x-2">
                          <Link
                            to={`/chart/${item.symbol}`}
                            className="font-medium text-blue-600 hover:text-blue-700"
                            title={item.company_name || item.symbol}
                          >
                            {item.symbol}
                          </Link>
                          {item.sector && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {item.sector.substring(0, 3).toUpperCase()}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-right">
                          {priceData[item.symbol] ? (
                            <span className={`font-medium ${priceData[item.symbol].change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${priceData[item.symbol].current_price.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400">Loading...</span>
                          )}
                        </div>
                        
                        <div className="text-right text-gray-600">
                          {item.entry_price ? `$${parseFloat(item.entry_price).toFixed(2)}` : '-'}
                        </div>
                        
                        <div className="text-right text-green-600">
                          {item.target_price ? `$${parseFloat(item.target_price).toFixed(2)}` : '-'}
                        </div>
                        
                        <div className="text-right text-red-600">
                          {item.stop_loss ? `$${parseFloat(item.stop_loss).toFixed(2)}` : '-'}
                        </div>
                        
                        <div className="text-right">
                          {priceData[item.symbol] && item.entry_price && (
                            <span className={`text-xs ${
                              priceData[item.symbol].current_price > parseFloat(item.entry_price) 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {((priceData[item.symbol].current_price - parseFloat(item.entry_price)) / parseFloat(item.entry_price) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {watchlist.items.length > 4 && (
                      <div className="text-center pt-2">
                        <Link
                          to={`/watchlists/${watchlist.id}`}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          View all {watchlist.items.length} items
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Created {new Date(watchlist.created_at).toLocaleDateString()}</span>
                  <Link 
                    to={`/watchlists/${watchlist.id}`}
                    className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View Details
                  </Link>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      <EditWatchlistModal
        isOpen={!!editingWatchlist}
        onClose={() => setEditingWatchlist(null)}
        onSave={handleEditWatchlist}
        watchlist={editingWatchlist}
        isLoading={editLoading}
      />

      <DeleteConfirmModal
        isOpen={!!deletingWatchlist}
        onClose={() => setDeletingWatchlist(null)}
        onConfirm={handleDeleteWatchlist}
        title="Delete Watchlist"
        message={`Are you sure you want to delete "${deletingWatchlist?.name}"? This action cannot be undone and will remove all ${deletingWatchlist?.items.length || 0} items in this watchlist.`}
        confirmText="Delete Watchlist"
        isLoading={deleteLoading}
      />
    </div>
  )
}