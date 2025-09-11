import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  ArrowTrendingDownIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  StarIcon,
  FireIcon,
  TableCellsIcon,
  Square2StackIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'
import { Watchlist, WatchlistItem } from '../types'
import EditWatchlistModal from '../components/EditWatchlistModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import FinancialWidget from '../components/FinancialWidget'
import TradingViewWidget from '../components/TradingViewWidget'
import StockDetailView from '../components/StockDetailView'

// Function to calculate watchlist performance for color coding
const calculateWatchlistPerformance = (watchlist: Watchlist, priceData: Record<string, StockPrice>) => {
  if (!watchlist.items.length) return 0
  
  let totalPerformance = 0
  let validItems = 0
  
  for (const item of watchlist.items) {
    const price = priceData[item.symbol]
    if (price) {
      totalPerformance += price.change_percent
      validItems++
    }
  }
  
  return validItems > 0 ? totalPerformance / validItems : 0
}

// Get color classes based on performance
const getPerformanceColorClasses = (performance: number) => {
  if (performance > 2) {
    return 'bg-gradient-to-r from-green-50 to-green-100 border-green-200' // Strong positive
  } else if (performance > 0) {
    return 'bg-gradient-to-r from-green-50 to-green-100 border-green-100' // Mild positive
  } else if (performance > -2) {
    return 'bg-gradient-to-r from-red-50 to-red-100 border-red-100' // Mild negative
  } else {
    return 'bg-gradient-to-r from-red-50 to-red-100 border-red-200' // Strong negative
  }
}

// Market hours utilities
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

const computeLocalNext = (): Date => {
  const now = new Date()
  if (isMarketOpen()) {
    const next = new Date(now)
    next.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0)
    return next
  }
  const cstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const nextOpen = new Date(cstTime)
  nextOpen.setHours(8, 30, 0, 0)
  if ((cstTime.getHours() > 8) || (cstTime.getHours() === 8 && cstTime.getMinutes() >= 30) || cstTime.getDay() === 0 || cstTime.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }
  while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }
  return nextOpen
}

const getServerNextRefresh = async (): Promise<Date | null> => {
  try {
    const res = await fetch('/api/jobs/next-market-refresh')
    if (!res.ok) return null
    const data = await res.json()
    return data.next_run_at ? new Date(data.next_run_at) : computeLocalNext()
  } catch {
    return computeLocalNext()
  }
}

type ViewMode = 'grid' | 'compact'
type SortField = 'name' | 'performance' | 'symbols' | 'created'
type SortDirection = 'asc' | 'desc'

export default function Watchlists() {
  const navigate = useNavigate()
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
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null)
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<string>('')
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false)
  const [selectedAnalysisSymbol, setSelectedAnalysisSymbol] = useState<string | null>(null)
  const [performanceBannerOpen, setPerformanceBannerOpen] = useState(false)
  
  // New state for improved UI
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedWatchlist, setSelectedWatchlist] = useState<number | null>(null)
  const [favoriteWatchlists, setFavoriteWatchlists] = useState<number[]>([])

  useEffect(() => {
    loadWatchlists()
    // Fetch initial next refresh from backend
    ;(async () => {
      const next = await getServerNextRefresh()
      if (next) setNextRefresh(next)
    })()
    // Refresh data every 30 minutes, but only during market hours
    const refreshInterval = setInterval(() => {
      if (isMarketOpen()) {
        refreshAllData()
      } else {
        console.log('Market closed, skipping price refresh on watchlists page')
      }
    }, 30 * 60 * 1000) // 30 minutes
    return () => {
      clearInterval(refreshInterval)
    }
  }, [])

  // Keep countdown aligned with current nextRefresh (avoid stale closure)
  useEffect(() => {
    const timer = setInterval(() => { updateCountdown() }, 1000)
    return () => clearInterval(timer)
  }, [nextRefresh])

  useEffect(() => {
    if (watchlists.length > 0) {
      loadStockPrices()
      
      // Load favorites from localStorage
      const savedFavorites = localStorage.getItem('favoriteWatchlists')
      if (savedFavorites) {
        try {
          setFavoriteWatchlists(JSON.parse(savedFavorites))
        } catch (e) {
          console.error('Failed to parse favorite watchlists', e)
        }
      }
    }
  }, [watchlists])

  const updateCountdown = async () => {
    if (!nextRefresh) return
    const now = new Date()
    const diff = nextRefresh.getTime() - now.getTime()
    if (diff <= 0) {
      const next = await getServerNextRefresh()
      if (next) setNextRefresh(next)
      return
    }
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    setTimeUntilRefresh(`${minutes}:${seconds.toString().padStart(2, '0')}`)
  }

  const refreshAllData = async () => {
    console.log('Refreshing watchlist data...')
    setLastRefresh(new Date())
    const next = await getServerNextRefresh()
    if (next) setNextRefresh(next)
    
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

  const toggleFavorite = (watchlistId: number) => {
    setFavoriteWatchlists(current => {
      const isFavorite = current.includes(watchlistId)
      const newFavorites = isFavorite
        ? current.filter(id => id !== watchlistId)
        : [...current, watchlistId]
      
      // Save to localStorage
      localStorage.setItem('favoriteWatchlists', JSON.stringify(newFavorites))
      return newFavorites
    })
  }

  const handleViewWatchlist = (watchlistId: number) => {
    navigate(`/watchlists/${watchlistId}`)
  }

  const handleSymbolClick = (symbol: string) => {
    setSelectedAnalysisSymbol(symbol)
    setAnalysisModalOpen(true)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
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

  // Filter and sort watchlists
  const filteredAndSortedWatchlists = useMemo(() => {
    let result = [...watchlistPerformances]
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(watchlist => 
        watchlist.name.toLowerCase().includes(term) || 
        watchlist.description?.toLowerCase().includes(term) ||
        watchlist.items.some(item => item.symbol.toLowerCase().includes(term))
      )
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'performance':
          comparison = (a.performance || 0) - (b.performance || 0)
          break
        case 'symbols':
          comparison = a.items.length - b.items.length
          break
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    // Move favorites to top
    if (favoriteWatchlists.length > 0) {
      result.sort((a, b) => {
        const aIsFavorite = favoriteWatchlists.includes(a.id)
        const bIsFavorite = favoriteWatchlists.includes(b.id)
        
        if (aIsFavorite && !bIsFavorite) return -1
        if (!aIsFavorite && bIsFavorite) return 1
        return 0
      })
    }
    
    return result
  }, [watchlistPerformances, searchTerm, sortField, sortDirection, favoriteWatchlists])

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
      {/* Header with Market Status and Actions */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 md:mb-0">
            <h1 className="text-3xl font-bold text-gray-900">Watchlists</h1>
            <p className="mt-1 text-gray-600">
              {watchlists.length === 0 
                ? "Create your first watchlist to start tracking stocks" 
                : `${totalWatchlists} watchlists with ${uniqueSymbols} unique symbols`
              }
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white shadow-sm rounded-md px-3 py-2 border border-gray-200">
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
                
                <div className="h-4 w-px bg-gray-200"></div>
                
                {/* Next Refresh */}
                <div className="flex items-center space-x-1 text-gray-500">
                  <ArrowPathIcon className="h-4 w-4" />
                  <span>Next: {timeUntilRefresh || '...'}</span>
                </div>
                
                <div className="h-4 w-px bg-gray-200"></div>
                
                {/* Last Updated */}
                <div className="flex items-center space-x-1 text-xs text-gray-400">
                  <ClockIcon className="h-3 w-3" />
                  <span>
                    {lastRefresh.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>
            
            <Link
              to="/upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Watchlist
            </Link>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Performance Banner */}
      {watchlists.length > 0 && (
        <div className="mb-6">
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
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Portfolio Overview</h3>
                    <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Total Watchlists */}
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-5 sm:p-6 rounded-lg border border-blue-200 shadow-sm">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <ChartBarIcon className="h-8 w-8 text-blue-600" />
                          </div>
                          <div className="ml-5 w-0 flex-1">
                            <dt className="text-sm font-medium text-blue-700 truncate">
                              Watchlists
                            </dt>
                            <dd className="text-2xl font-bold text-blue-900">
                              {totalWatchlists}
                            </dd>
                          </div>
                        </div>
                      </div>

                      {/* Unique Symbols */}
                      <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-5 sm:p-6 rounded-lg border border-green-200 shadow-sm">
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
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Average Performance */}
                      <div className={`bg-gradient-to-r px-4 py-5 sm:p-6 rounded-lg border shadow-sm ${
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
                      <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-5 sm:p-6 rounded-lg border border-purple-200 shadow-sm">
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
                    <div className="bg-gray-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Top Performers</h3>
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
                              <div key={watchlist.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
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
                    <div className="bg-gray-50 rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Market Insights</h3>
                      {bestPerforming && worstPerforming ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200 shadow-sm">
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

                          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200 shadow-sm">
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

                          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-sm">
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
      )}

      {/* Controls Bar */}
      {watchlists.length > 0 && (
        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between">
          {/* Search */}
          <div className="flex-1 md:max-w-md">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Search watchlists or symbols..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Sort Controls */}
            <div className="flex items-center bg-white border border-gray-300 rounded-md">
              <span className="px-3 text-gray-500 text-sm">Sort:</span>
              <button
                onClick={() => handleSort('name')}
                className={`px-3 py-2 text-sm ${
                  sortField === 'name' ? 'font-medium text-blue-600' : 'text-gray-700'
                }`}
              >
                Name {sortField === 'name' && (
                  sortDirection === 'asc' ? '↑' : '↓'
                )}
              </button>
              <button
                onClick={() => handleSort('performance')}
                className={`px-3 py-2 text-sm ${
                  sortField === 'performance' ? 'font-medium text-blue-600' : 'text-gray-700'
                }`}
              >
                Performance {sortField === 'performance' && (
                  sortDirection === 'asc' ? '↑' : '↓'
                )}
              </button>
              <button
                onClick={() => handleSort('symbols')}
                className={`px-3 py-2 text-sm ${
                  sortField === 'symbols' ? 'font-medium text-blue-600' : 'text-gray-700'
                }`}
              >
                Symbols {sortField === 'symbols' && (
                  sortDirection === 'asc' ? '↑' : '↓'
                )}
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${
                  viewMode === 'grid' 
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-white text-gray-500'
                }`}
                title="Grid View"
              >
                <Square2StackIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-2 ${
                  viewMode === 'compact' 
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-white text-gray-500'
                }`}
                title="Compact View"
              >
                <TableCellsIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={refreshAllData}
              disabled={loadingPrices}
              className="flex items-center space-x-1 bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loadingPrices ? 'animate-spin' : ''}`} />
              <span>{loadingPrices ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {watchlists.length === 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No watchlists yet</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">Get started by creating your first watchlist to track your favorite stocks and market movements.</p>
            <Link
              to="/upload"
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors inline-flex items-center"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Create Your First Watchlist
            </Link>
          </div>
        </div>
      ) : filteredAndSortedWatchlists.length === 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
          <div className="text-center py-12">
            <ExclamationTriangleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No matching watchlists</h3>
            <p className="text-gray-600 mb-4">Try adjusting your search or filter criteria.</p>
            <button
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:text-blue-700"
            >
              Clear search
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredAndSortedWatchlists.map((watchlist) => {
                const performance = watchlist.performance
                const colorClasses = getPerformanceColorClasses(performance)
                const isFavorite = favoriteWatchlists.includes(watchlist.id)
                
                return (
                  <div 
                    key={watchlist.id} 
                    className={`shadow rounded-lg overflow-hidden ${colorClasses} hover:shadow-md transition-shadow border border-gray-200`}
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3 max-w-[75%]">
                          <h3 className="text-lg font-medium text-gray-900 truncate">{watchlist.name}</h3>
                          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded whitespace-nowrap">
                            {watchlist.items.length} symbols
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleFavorite(watchlist.id)}
                            className={`text-gray-400 hover:text-yellow-500 transition-colors ${isFavorite ? 'text-yellow-500' : ''}`}
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            {isFavorite ? <StarIconSolid className="h-5 w-5" /> : <StarIcon className="h-5 w-5" />}
                          </button>
                          <Link
                            to={`/watchlists/${watchlist.id}`}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="View details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                          <button
                            onClick={() => setEditingWatchlist(watchlist)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit watchlist"
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => setDeletingWatchlist(watchlist)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete watchlist"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      
                      {watchlist.description && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{watchlist.description}</p>
                      )}

                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-medium text-gray-900">Recent Symbols</h4>
                          <Link
                            to={`/watchlists/${watchlist.id}`}
                            className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          >
                            View all
                          </Link>
                        </div>
                        
                        <div className="space-y-2">
                          {watchlist.items.slice(0, 3).map((item) => (
                            <div key={item.symbol} className="flex items-center justify-between p-2 bg-white rounded border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleSymbolClick(item.symbol)}
                                  className="font-medium text-blue-600 hover:text-blue-700"
                                  title={item.symbol}
                                >
                                  {item.symbol}
                                </button>
                              </div>
                              
                              <div className="text-right">
                                {priceData[item.symbol] ? (
                                  <div>
                                    <span className={`font-medium ${priceData[item.symbol].change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      ${priceData[item.symbol].current_price.toFixed(2)}
                                    </span>
                                    <div className={`text-xs ${
                                      priceData[item.symbol].change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {priceData[item.symbol].change_percent >= 0 ? '+' : ''}
                                      {priceData[item.symbol].change_percent.toFixed(2)}%
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">Loading...</span>
                                )}
                              </div>
                            </div>
                          ))}

                          {watchlist.items.length > 3 && (
                            <div 
                              className="text-center p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => handleViewWatchlist(watchlist.id)}
                            >
                              <span className="text-sm text-gray-600">
                                +{watchlist.items.length - 3} more symbols
                              </span>
                            </div>
                          )}

                          {watchlist.items.length === 0 && (
                            <div className="text-center p-4 bg-gray-50 rounded">
                              <p className="text-sm text-gray-500">No symbols in this watchlist</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="text-gray-500">
                          {new Date(watchlist.created_at).toLocaleDateString()}
                        </div>
                        {performance !== 0 && (
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            performance > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {performance > 0 ? '+' : ''}{performance.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Compact View */}
          {viewMode === 'compact' && (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button 
                        onClick={() => handleSort('name')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Name</span>
                        {sortField === 'name' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button 
                        onClick={() => handleSort('symbols')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Symbols</span>
                        {sortField === 'symbols' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Top Symbols
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button 
                        onClick={() => handleSort('performance')}
                        className="flex items-center space-x-1 hover:text-gray-700 ml-auto"
                      >
                        <span>Performance</span>
                        {sortField === 'performance' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedWatchlists.map((watchlist) => {
                    const performance = watchlist.performance
                    const isFavorite = favoriteWatchlists.includes(watchlist.id)
                    
                    return (
                      <tr 
                        key={watchlist.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => handleViewWatchlist(watchlist.id)}
                      >
                        <td className="px-3 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(watchlist.id)
                              }}
                              className={`text-gray-400 hover:text-yellow-500 transition-colors ${isFavorite ? 'text-yellow-500' : ''}`}
                            >
                              {isFavorite ? <StarIconSolid className="h-4 w-4" /> : <StarIcon className="h-4 w-4" />}
                            </button>
                            <div>
                              <div className="font-medium text-gray-900">{watchlist.name}</div>
                              {watchlist.description && (
                                <div className="text-xs text-gray-500 line-clamp-1 max-w-xs">{watchlist.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{watchlist.items.length}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(watchlist.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {watchlist.items.slice(0, 5).map((item) => (
                              <button
                                key={item.symbol}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSymbolClick(item.symbol)
                                }}
                              >
                                {item.symbol}
                                {priceData[item.symbol] && (
                                  <span className={`ml-1 ${
                                    priceData[item.symbol].change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {priceData[item.symbol].change_percent >= 0 ? '↑' : '↓'}
                                  </span>
                                )}
                              </button>
                            ))}
                            {watchlist.items.length > 5 && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                +{watchlist.items.length - 5}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-right">
                          {performance !== 0 ? (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              performance > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {performance > 0 ? '+' : ''}{performance.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Link
                              to={`/watchlists/${watchlist.id}`}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="View details"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingWatchlist(watchlist)
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit watchlist"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeletingWatchlist(watchlist)
                              }}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete watchlist"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Stock Analysis View */}
      {analysisModalOpen && selectedAnalysisSymbol && (
        <StockDetailView 
          symbol={selectedAnalysisSymbol}
          isOpen={analysisModalOpen}
          onClose={() => {
            setAnalysisModalOpen(false)
            setSelectedAnalysisSymbol(null)
          }}
          priceData={priceData[selectedAnalysisSymbol]}
          entryPrice={undefined}
          targetPrice={undefined}
          stopLoss={undefined}
        />
      )}

      {/* Modals */}
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
