import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  EyeIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  TrophyIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'
import { Watchlist, WatchlistItem } from '../types'
import EditWatchlistModal from '../components/EditWatchlistModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import FinancialWidget from '../components/FinancialWidget'
import TradingViewWidget from '../components/TradingViewWidget'

// Function to calculate watchlist performance for color coding
const calculateWatchlistPerformance = (watchlist: Watchlist, priceData: Record<string, StockPrice>) => {
  if (!watchlist.items.length) return 0
  
  let totalPerformance = 0
  let validItems = 0
  
  for (const item of watchlist.items) {
    const price = priceData[item.symbol]
    if (price && item.entry_price) {
      const gainLossPercent = ((price.current_price - parseFloat(item.entry_price.toString())) / parseFloat(item.entry_price.toString())) * 100
      totalPerformance += gainLossPercent
      validItems++
    }
  }
  
  return validItems > 0 ? totalPerformance / validItems : 0
}

// Get color classes based on performance
const getPerformanceColorClasses = (performance: number) => {
  if (performance > 2) {
    return 'bg-green-50 border-green-200' // Strong positive
  } else if (performance > 0) {
    return 'bg-green-25 border-green-100' // Mild positive
  } else if (performance > -2) {
    return 'bg-red-25 border-red-100' // Mild negative
  } else {
    return 'bg-red-50 border-red-200' // Strong negative
  }
}

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
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false)
  const [selectedAnalysisSymbol, setSelectedAnalysisSymbol] = useState<string | null>(null)
  const [performanceBannerOpen, setPerformanceBannerOpen] = useState(false)

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

  // Calculate performance metrics for banner
  const watchlistPerformances = watchlists.map(watchlist => ({
    ...watchlist,
    performance: calculateWatchlistPerformance(watchlist, priceData)
  }))
  
  const watchlistsWithData = watchlistPerformances.filter(w => w.performance !== 0)
  const avgPerformance = watchlistsWithData.length > 0 
    ? watchlistsWithData.reduce((sum, w) => sum + w.performance, 0) / watchlistsWithData.length 
    : 0

  const bestPerforming = watchlistPerformances.reduce((best, current) => 
    current.performance > (best?.performance || -Infinity) ? current : best, 
    null as typeof watchlistPerformances[0] | null
  )
  
  const worstPerforming = watchlistPerformances.reduce((worst, current) => 
    current.performance < (worst?.performance || Infinity) ? current : worst,
    null as typeof watchlistPerformances[0] | null
  )

  // Calculate statistics
  const totalWatchlists = watchlists.length
  const allSymbols = watchlists.flatMap(w => w.items.map(item => item.symbol))
  const uniqueSymbols = new Set(allSymbols).size
  const priceDataCount = Object.keys(priceData).length

  const totalMarketValue = watchlists.reduce((total, watchlist) => {
    return total + watchlist.items.reduce((sum, item) => {
      const price = priceData[item.symbol]
      const currentPrice = price?.current_price || 0
      const shares = 100 // Assume 100 shares per position for market value calculation
      return sum + (currentPrice * shares)
    }, 0)
  }, 0)

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
            <div className="flex items-center space-x-3 text-sm">
              {/* Market Status */}
              <div className="flex items-center space-x-1">
                {isMarketOpen() ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircleIcon className="h-4 w-4 text-red-600" />
                )}
                <span className={isMarketOpen() ? 'text-green-600' : 'text-red-600'}>
                  Market {isMarketOpen() ? 'Open' : 'Closed'}
                </span>
              </div>
              
              {/* Next Refresh */}
              <div className="flex items-center space-x-1 text-gray-500">
                <ArrowPathIcon className="h-4 w-4" />
                <span>Next: {timeUntilRefresh || '...'}</span>
              </div>
            </div>
            {/* Last Updated */}
            <div className="flex items-center justify-end space-x-1 text-xs text-gray-400 mt-1">
              <ClockIcon className="h-3 w-3" />
              <span>
                {lastRefresh.toLocaleTimeString('en-US', {
                  timeZone: 'America/Chicago',
                  hour: 'numeric',
                  minute: '2-digit'
                })} CST
              </span>
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

      {/* Collapsible Performance Banner */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => setPerformanceBannerOpen(!performanceBannerOpen)}
            className="w-full px-6 py-4 text-left flex items-center justify-between hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
          >
            <div className="flex items-center space-x-3">
              <TrophyIcon className="h-6 w-6 text-white" />
              <h2 className="text-xl font-bold text-white">Portfolio Performance</h2>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                avgPerformance >= 0 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {avgPerformance >= 0 ? '+' : ''}{avgPerformance.toFixed(1)}%
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-white text-sm">
                {performanceBannerOpen ? 'Hide Details' : 'View Details'}
              </span>
              {performanceBannerOpen ? (
                <ChevronUpIcon className="h-5 w-5 text-white" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-white" />
              )}
            </div>
          </button>
          
          {performanceBannerOpen && (
            <div className="bg-white border-t border-blue-200">
              <div className="p-6">
                {/* Quick Stats Grid */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-6">Quick Stats</h3>
                  <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Total Watchlists */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-5 sm:p-6 rounded-lg border border-blue-200">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <ChartBarIcon className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dt className="text-sm font-medium text-blue-700 truncate">
                            Total Watchlists
                          </dt>
                          <dd className="text-2xl font-bold text-blue-900">
                            {totalWatchlists}
                          </dd>
                        </div>
                      </div>
                    </div>

                    {/* Unique Symbols */}
                    <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-5 sm:p-6 rounded-lg border border-green-200">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <ArrowTrendingUpIcon className="h-8 w-8 text-green-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dt className="text-sm font-medium text-green-700 truncate">
                            Unique Symbols
                          </dt>
                          <dd className="text-2xl font-bold text-green-900">
                            {uniqueSymbols}
                          </dd>
                          <div className="text-xs text-green-600 mt-1">
                            {allSymbols.length} total positions
                            <br />
                            <span className="text-gray-500">
                              {loadingPrices ? 'Loading prices...' : 
                               priceDataCount > 0 ? `${priceDataCount} prices loaded` : 
                               'No price data'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Average Performance */}
                    <div className={`bg-gradient-to-r px-4 py-5 sm:p-6 rounded-lg border ${
                      avgPerformance >= 0 
                        ? 'from-emerald-50 to-emerald-100 border-emerald-200' 
                        : 'from-red-50 to-red-100 border-red-200'
                    }`}>
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          {avgPerformance >= 0 ? (
                            <ArrowTrendingUpIcon className="h-8 w-8 text-emerald-600" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-8 w-8 text-red-600" />
                          )}
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dt className={`text-sm font-medium truncate ${
                            avgPerformance >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            Avg Performance
                          </dt>
                          <dd className={`text-2xl font-bold ${
                            avgPerformance >= 0 ? 'text-emerald-900' : 'text-red-900'
                          }`}>
                            {avgPerformance >= 0 ? '+' : ''}{avgPerformance.toFixed(1)}%
                          </dd>
                        </div>
                      </div>
                    </div>

                    {/* Total Market Value */}
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-5 sm:p-6 rounded-lg border border-purple-200">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <TrophyIcon className="h-8 w-8 text-purple-600" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                          <dt className="text-sm font-medium text-purple-700 truncate">
                            Est. Portfolio Value
                          </dt>
                          <dd className="text-2xl font-bold text-purple-900">
                            ${(totalMarketValue / 1000).toFixed(0)}K
                          </dd>
                        </div>
                      </div>
                    </div>
                  </dl>
                </div>

                {/* Performance Details Grid */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Performance Leaderboard */}
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Watchlist Performance</h3>
                    {watchlistPerformances.length === 0 ? (
                      <div className="text-center py-8">
                        <ExclamationTriangleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No watchlists found</p>
                        <Link
                          to="/upload"
                          className="mt-2 text-blue-600 hover:text-blue-700"
                        >
                          Create your first watchlist
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {watchlistPerformances
                          .sort((a, b) => b.performance - a.performance)
                          .slice(0, 5)
                          .map((watchlist, index) => (
                            <div key={watchlist.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                              <div className="flex items-center space-x-3">
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                  index === 1 ? 'bg-gray-100 text-gray-800' :
                                  index === 2 ? 'bg-orange-100 text-orange-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <Link
                                    to={`/watchlists/${watchlist.id}`}
                                    className="font-medium text-gray-900 hover:text-blue-600"
                                  >
                                    {watchlist.name}
                                  </Link>
                                  <div className="text-sm text-gray-500">
                                    {watchlist.items.length} symbols
                                  </div>
                                </div>
                              </div>
                              <div className={`text-right ${
                                watchlist.performance >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                <div className="font-semibold">
                                  {watchlist.performance >= 0 ? '+' : ''}
                                  {watchlist.performance.toFixed(1)}%
                                </div>
                                <div className="text-xs">
                                  {watchlist.performance >= 0 ? '↗' : '↘'} trend
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Market Insights */}
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Market Insights</h3>
                    {bestPerforming && worstPerforming ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex items-center space-x-3">
                            <TrophyIcon className="h-6 w-6 text-green-600" />
                            <div>
                              <div className="font-medium text-green-900">Best Performer</div>
                              <Link 
                                to={`/watchlists/${bestPerforming.id}`}
                                className="text-sm text-green-700 hover:text-green-800"
                              >
                                {bestPerforming.name}
                              </Link>
                            </div>
                          </div>
                          <div className="text-right text-green-700">
                            <div className="font-bold">+{bestPerforming.performance.toFixed(1)}%</div>
                            <div className="text-xs">{bestPerforming.items.length} symbols</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex items-center space-x-3">
                            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                            <div>
                              <div className="font-medium text-red-900">Needs Attention</div>
                              <Link 
                                to={`/watchlists/${worstPerforming.id}`}
                                className="text-sm text-red-700 hover:text-red-800"
                              >
                                {worstPerforming.name}
                              </Link>
                            </div>
                          </div>
                          <div className="text-right text-red-700">
                            <div className="font-bold">{worstPerforming.performance.toFixed(1)}%</div>
                            <div className="text-xs">{worstPerforming.items.length} symbols</div>
                          </div>
                        </div>

                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <h4 className="font-medium text-blue-900 mb-2">Portfolio Summary</h4>
                          <div className="grid grid-cols-1 gap-4 text-sm">
                            <div>
                              <div className="text-blue-700">Diversification</div>
                              <div className="font-semibold text-blue-900">
                                {uniqueSymbols} unique symbols across {totalWatchlists} lists
                              </div>
                            </div>
                            <div>
                              <div className="text-blue-700">Performance Spread</div>
                              <div className="font-semibold text-blue-900">
                                {bestPerforming.performance.toFixed(1)}% to {worstPerforming.performance.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500 mb-2">No performance data available</p>
                        <p className="text-sm text-gray-400">Create watchlists to see insights</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
          {watchlists.map((watchlist) => {
            const performance = calculateWatchlistPerformance(watchlist, priceData)
            const colorClasses = getPerformanceColorClasses(performance)
            return (
              <div key={watchlist.id} className={`shadow rounded-lg overflow-hidden ${colorClasses}`}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">{watchlist.name}</h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      {watchlist.items.length} symbols
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      to={`/watchlists/${watchlist.id}`}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title="View details"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Link>
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
                          <button
                            onClick={() => {
                              setSelectedAnalysisSymbol(item.symbol)
                              setAnalysisModalOpen(true)
                            }}
                            className="font-medium text-blue-600 hover:text-blue-700 underline"
                            title={item.company_name || item.symbol}
                          >
                            {item.symbol}
                          </button>
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
                  {performance !== 0 && (
                    <div className={`text-xs font-medium ${
                      performance > 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {performance > 0 ? '+' : ''}{performance.toFixed(1)}% today
                    </div>
                  )}
                </div>
              </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Stock Analysis Modal */}
      {analysisModalOpen && selectedAnalysisSymbol && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => {
                setAnalysisModalOpen(false)
                setSelectedAnalysisSymbol(null)
              }}
            ></div>

            {/* Modal content - Smaller size */}
            <div className="inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-white px-4 pt-4 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    Stock Analysis: {selectedAnalysisSymbol}
                  </h2>
                  <button
                    onClick={() => {
                      setAnalysisModalOpen(false)
                      setSelectedAnalysisSymbol(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Modal Content Grid - Smaller widgets */}
                <div className="space-y-4">
                  {/* Top Row - Chart and Overview */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <ChartBarIcon className="h-4 w-4 text-blue-600 mr-2" />
                        Price Chart
                      </h3>
                      <div className="h-80">
                        <TradingViewWidget
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                          chartOnly={false}
                          dateRange="6M"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-600 mr-2" />
                        Overview
                      </h3>
                      <div className="h-80">
                        <FinancialWidget
                          type="symbol-overview"
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Middle Row - Technical Analysis & Fundamental Data */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <ChartBarIcon className="h-4 w-4 text-purple-600 mr-2" />
                        Technical Analysis
                      </h3>
                      <div className="h-72">
                        <FinancialWidget
                          type="technical-analysis"
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <EyeIcon className="h-4 w-4 text-orange-600 mr-2" />
                        Fundamental Data
                      </h3>
                      <div className="h-72">
                        <FinancialWidget
                          type="fundamental-data"
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row - Company Profile & Financials */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <TrophyIcon className="h-4 w-4 text-blue-600 mr-2" />
                        Company Profile
                      </h3>
                      <div className="h-72">
                        <FinancialWidget
                          type="company-profile"
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-base font-medium text-gray-900 mb-2 flex items-center">
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-600 mr-2" />
                        Financial Reports
                      </h3>
                      <div className="h-72">
                        <FinancialWidget
                          type="financials"
                          symbol={selectedAnalysisSymbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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