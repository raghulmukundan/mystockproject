import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { 
  ArrowLeftIcon, 
  PencilIcon, 
  TrashIcon, 
  ChartBarIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrophyIcon,
  StarIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  Square2StackIcon,
  FunnelIcon,
  AdjustmentsHorizontalIcon,
  BellIcon,
  ClockIcon,
  XMarkIcon,
  ListBulletIcon,
  ChartPieIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice, CompanyProfile } from '../services/stockApi'
import { Watchlist, WatchlistItem } from '../types'
import EditWatchlistModal from '../components/EditWatchlistModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import AddItemModal from '../components/AddItemModal'
import GroupingControls, { GroupingOption } from '../components/GroupingControls'
import FinancialWidget from '../components/FinancialWidget'
import TradingViewWidget from '../components/TradingViewWidget'
import { groupWatchlistItems } from '../utils/grouping'

// Function to load real stock prices
const loadStockPrices = async (symbols: string[]): Promise<Record<string, StockPrice>> => {
  try {
    if (symbols.length === 0) return {}
    console.log('Loading stock prices for symbols:', symbols)
    const prices = await stockApi.getMultipleStockPrices(symbols)
    console.log('Received stock prices:', prices)
    return prices
  } catch (error) {
    console.error('Error loading stock prices:', error)
    return {}
  }
}

type ViewMode = 'grid' | 'table' | 'compact' | 'chart'
type SortField = 'symbol' | 'price' | 'change' | 'entry' | 'performance' | 'target' | '52week'
type SortDirection = 'asc' | 'desc'
type FilterType = 'all' | 'gainers' | 'losers' | 'targets' | 'watchlists' | 'sectors' | 'industry'

interface StockMetrics {
  avgPerformance: number
  totalSymbols: number
  gainers: number
  losers: number
  highestPerformer: { symbol: string, performance: number } | null
  lowestPerformer: { symbol: string, performance: number } | null
  nearTarget: { symbol: string, percent: number }[]
  nearStop: { symbol: string, percent: number }[]
}

export default function WatchlistDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null)
  const [deletingWatchlist, setDeletingWatchlist] = useState<Watchlist | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [priceData, setPriceData] = useState<Record<string, StockPrice>>({})
  const [showAddItem, setShowAddItem] = useState(false)
  const [addItemLoading, setAddItemLoading] = useState(false)
  const [deletingItem, setDeletingItem] = useState<WatchlistItem | null>(null)
  const [deleteItemLoading, setDeleteItemLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupingOption>('none')
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [allWatchlists, setAllWatchlists] = useState<Watchlist[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [selectedAnalysisSymbol, setSelectedAnalysisSymbol] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  
  // New state for improved UI
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('symbol')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [isFavorite, setIsFavorite] = useState(false)

  useEffect(() => {
    if (id) {
      loadWatchlist(parseInt(id))
      loadAllWatchlists()
      
      // Check if this watchlist is a favorite
      const savedFavorites = localStorage.getItem('favoriteWatchlists')
      if (savedFavorites) {
        try {
          const favorites = JSON.parse(savedFavorites)
          setIsFavorite(favorites.includes(parseInt(id)))
        } catch (e) {
          console.error('Failed to parse favorite watchlists', e)
        }
      }
    }
  }, [id])

  useEffect(() => {
    if (watchlist && watchlist.items.length > 0) {
      const symbols = watchlist.items.map(item => item.symbol)
      console.log('Watchlist loaded, fetching prices for symbols:', symbols)
      loadStockPrices(symbols).then(prices => {
        console.log('Setting price data:', prices)
        setPriceData(prices)
      }).catch(error => {
        console.error('Failed to load stock prices:', error)
      })
    }
  }, [watchlist])

  const loadWatchlist = async (watchlistId: number) => {
    try {
      const data = await watchlistsApi.getById(watchlistId)
      setWatchlist(data)
    } catch (err: any) {
      setError('Failed to load watchlist details')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadAllWatchlists = async () => {
    try {
      const data = await watchlistsApi.getAll()
      setAllWatchlists(data)
      
      // Find current watchlist index
      if (id) {
        const index = data.findIndex(w => w.id === parseInt(id))
        setCurrentIndex(index)
      }
    } catch (err: any) {
      console.error('Failed to load all watchlists:', err)
    }
  }

  const navigateToWatchlist = (direction: 'prev' | 'next') => {
    if (allWatchlists.length === 0 || currentIndex === -1) return
    
    let newIndex: number
    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? allWatchlists.length - 1 : currentIndex - 1
    } else {
      newIndex = currentIndex === allWatchlists.length - 1 ? 0 : currentIndex + 1
    }
    
    const targetWatchlist = allWatchlists[newIndex]
    navigate(`/watchlists/${targetWatchlist.id}`)
  }

  const canNavigatePrev = allWatchlists.length > 1
  const canNavigateNext = allWatchlists.length > 1
  const prevWatchlist = canNavigatePrev && currentIndex !== -1 
    ? allWatchlists[currentIndex === 0 ? allWatchlists.length - 1 : currentIndex - 1]
    : null
  const nextWatchlist = canNavigateNext && currentIndex !== -1
    ? allWatchlists[currentIndex === allWatchlists.length - 1 ? 0 : currentIndex + 1] 
    : null

  const handleEditWatchlist = async (data: {
    name: string
    description: string
    items: Omit<WatchlistItem, 'id' | 'created_at'>[]
  }) => {
    if (!editingWatchlist) return

    setEditLoading(true)
    try {
      await watchlistsApi.update(editingWatchlist.id, data)
      await loadWatchlist(editingWatchlist.id)
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
      navigate('/watchlists')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete watchlist')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleAddItem = async (item: Omit<WatchlistItem, 'id' | 'created_at'>) => {
    if (!watchlist) return

    setAddItemLoading(true)
    try {
      await watchlistsApi.addItem(watchlist.id, item)
      await loadWatchlist(watchlist.id)
      setShowAddItem(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add item')
    } finally {
      setAddItemLoading(false)
    }
  }

  const handleDeleteItem = async () => {
    if (!deletingItem || !watchlist) return

    setDeleteItemLoading(true)
    try {
      await watchlistsApi.deleteItem(watchlist.id, deletingItem.id)
      await loadWatchlist(watchlist.id)
      setDeletingItem(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete item')
    } finally {
      setDeleteItemLoading(false)
    }
  }

  const handleDeleteSelectedItems = async () => {
    if (!watchlist || selectedItems.length === 0) return
    
    setDeleteItemLoading(true)
    try {
      // Delete items sequentially
      for (const itemId of selectedItems) {
        await watchlistsApi.deleteItem(watchlist.id, itemId)
      }
      
      await loadWatchlist(watchlist.id)
      setSelectedItems([])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete selected items')
    } finally {
      setDeleteItemLoading(false)
    }
  }

  const calculatePerformance = (item: WatchlistItem) => {
    const price = priceData[item.symbol]
    if (!price || !item.entry_price) return null

    const gainLoss = price.current_price - item.entry_price
    const gainLossPercent = (gainLoss / item.entry_price) * 100

    return {
      gainLoss: Number(gainLoss.toFixed(2)),
      gainLossPercent: Number(gainLossPercent.toFixed(2)),
      toTarget: item.target_price ? Number(((item.target_price - price.current_price) / price.current_price * 100).toFixed(2)) : null,
      toStopLoss: item.stop_loss ? Number(((price.current_price - item.stop_loss) / price.current_price * 100).toFixed(2)) : null
    }
  }

  const handleSymbolClick = (symbol: string) => {
    setSelectedAnalysisSymbol(symbol)
    setAnalysisModalOpen(true)
  }

  const handleRefreshProfiles = async () => {
    if (!watchlist) return

    setRefreshing(true)
    try {
      await watchlistsApi.refreshProfiles(watchlist.id)
      await loadWatchlist(watchlist.id)
      setError('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to refresh profile data')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleFavorite = () => {
    if (!id) return
    
    const watchlistId = parseInt(id)
    const savedFavorites = localStorage.getItem('favoriteWatchlists')
    let favorites: number[] = []
    
    if (savedFavorites) {
      try {
        favorites = JSON.parse(savedFavorites)
      } catch (e) {
        console.error('Failed to parse favorite watchlists', e)
      }
    }
    
    if (isFavorite) {
      favorites = favorites.filter(id => id !== watchlistId)
    } else {
      favorites.push(watchlistId)
    }
    
    localStorage.setItem('favoriteWatchlists', JSON.stringify(favorites))
    setIsFavorite(!isFavorite)
  }

  const handleSelectItem = (itemId: number) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId)
      } else {
        return [...prev, itemId]
      }
    })
  }

  const handleSelectAllItems = () => {
    if (!watchlist) return
    
    if (selectedItems.length === watchlist.items.length) {
      // Deselect all
      setSelectedItems([])
    } else {
      // Select all
      setSelectedItems(watchlist.items.map(item => item.id))
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Calculate watchlist metrics
  const watchlistMetrics: StockMetrics | null = useMemo(() => {
    if (!watchlist || watchlist.items.length === 0) return null
    
    let totalPerformance = 0
    let validPerformanceCount = 0
    let gainers = 0
    let losers = 0
    let highestPerformer = { symbol: '', performance: -Infinity }
    let lowestPerformer = { symbol: '', performance: Infinity }
    const nearTarget: { symbol: string, percent: number }[] = []
    const nearStop: { symbol: string, percent: number }[] = []
    
    watchlist.items.forEach(item => {
      const performance = calculatePerformance(item)
      if (performance) {
        totalPerformance += performance.gainLossPercent
        validPerformanceCount++
        
        if (performance.gainLossPercent > 0) gainers++
        if (performance.gainLossPercent < 0) losers++
        
        if (performance.gainLossPercent > highestPerformer.performance) {
          highestPerformer = { symbol: item.symbol, performance: performance.gainLossPercent }
        }
        
        if (performance.gainLossPercent < lowestPerformer.performance) {
          lowestPerformer = { symbol: item.symbol, performance: performance.gainLossPercent }
        }
        
        // Check for symbols near target (within 5%)
        if (performance.toTarget !== null && performance.toTarget > 0 && performance.toTarget < 5) {
          nearTarget.push({ symbol: item.symbol, percent: performance.toTarget })
        }
        
        // Check for symbols near stop loss (within 5%)
        if (performance.toStopLoss !== null && performance.toStopLoss > 0 && performance.toStopLoss < 5) {
          nearStop.push({ symbol: item.symbol, percent: performance.toStopLoss })
        }
      }
    })
    
    return {
      avgPerformance: validPerformanceCount > 0 ? totalPerformance / validPerformanceCount : 0,
      totalSymbols: watchlist.items.length,
      gainers,
      losers,
      highestPerformer: highestPerformer.symbol ? highestPerformer : null,
      lowestPerformer: lowestPerformer.symbol ? lowestPerformer : null,
      nearTarget: nearTarget.sort((a, b) => a.percent - b.percent).slice(0, 3),
      nearStop: nearStop.sort((a, b) => a.percent - b.percent).slice(0, 3)
    }
  }, [watchlist, priceData])

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!watchlist) return []
    
    let result = [...watchlist.items]
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item => 
        item.symbol.toLowerCase().includes(term) || 
        (item.company_name && item.company_name.toLowerCase().includes(term)) ||
        (item.sector && item.sector.toLowerCase().includes(term)) ||
        (item.industry && item.industry.toLowerCase().includes(term))
      )
    }
    
    // Apply additional filters
    switch (filterType) {
      case 'gainers':
        result = result.filter(item => {
          const performance = calculatePerformance(item)
          return performance && performance.gainLossPercent > 0
        })
        break
      case 'losers':
        result = result.filter(item => {
          const performance = calculatePerformance(item)
          return performance && performance.gainLossPercent < 0
        })
        break
      case 'targets':
        result = result.filter(item => !!item.target_price)
        break
      case 'sectors':
        // Grouped by sector in the UI
        break
      case 'industry':
        // Grouped by industry in the UI
        break
      case 'all':
      default:
        // No additional filtering
        break
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0
      
      switch (sortField) {
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol)
          break
        case 'price':
          const priceA = priceData[a.symbol]?.current_price || 0
          const priceB = priceData[b.symbol]?.current_price || 0
          comparison = priceA - priceB
          break
        case 'change':
          const changeA = priceData[a.symbol]?.change_percent || 0
          const changeB = priceData[b.symbol]?.change_percent || 0
          comparison = changeA - changeB
          break
        case 'entry':
          const entryA = a.entry_price || 0
          const entryB = b.entry_price || 0
          comparison = entryA - entryB
          break
        case 'performance': {
          const perfA = calculatePerformance(a)?.gainLossPercent || 0
          const perfB = calculatePerformance(b)?.gainLossPercent || 0
          comparison = perfA - perfB
          break
        }
        case 'target': {
          const targetA = a.target_price || 0
          const targetB = b.target_price || 0
          comparison = targetA - targetB
          break
        }
        case '52week': {
          const highA = priceData[a.symbol]?.high_52w || 0
          const highB = priceData[b.symbol]?.high_52w || 0
          comparison = highA - highB
          break
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    return result
  }, [watchlist, searchTerm, filterType, sortField, sortDirection, priceData])
  
  // Group items if necessary
  const groupedItems = useMemo(() => {
    if (groupBy === 'none') return { 'All Items': filteredAndSortedItems }
    return groupWatchlistItems(filteredAndSortedItems, groupBy)
  }, [filteredAndSortedItems, groupBy])

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading watchlist details...</p>
        </div>
      </div>
    )
  }

  if (error || !watchlist) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Watchlist not found'}</p>
          <Link
            to="/watchlists"
            className="text-blue-600 hover:text-blue-700"
          >
            ← Back to Watchlists
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/watchlists"
              className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100"
              title="Back to Watchlists"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            
            {/* Previous/Next Navigation */}
            {canNavigatePrev && (
              <button
                onClick={() => navigateToWatchlist('prev')}
                className="text-gray-400 hover:text-blue-600 transition-colors rounded-full p-1 hover:bg-gray-100"
                title={`Previous: ${prevWatchlist?.name || ''}`}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            )}
            
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900 mr-2">{watchlist.name}</h1>
              <button
                onClick={toggleFavorite}
                className={`text-gray-400 hover:text-yellow-500 transition-colors ${isFavorite ? 'text-yellow-500' : ''}`}
              >
                {isFavorite ? <StarIconSolid className="h-5 w-5" /> : <StarIcon className="h-5 w-5" />}
              </button>
              {allWatchlists.length > 1 && currentIndex !== -1 && (
                <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {currentIndex + 1} of {allWatchlists.length}
                </span>
              )}
            </div>
            
            {canNavigateNext && (
              <button
                onClick={() => navigateToWatchlist('next')}
                className="text-gray-400 hover:text-blue-600 transition-colors rounded-full p-1 hover:bg-gray-100"
                title={`Next: ${nextWatchlist?.name || ''}`}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefreshProfiles}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              title="Refresh data"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => setShowAddItem(true)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-1.5" />
              Add Symbol
            </button>
            <button
              onClick={() => setEditingWatchlist(watchlist)}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <PencilIcon className="h-4 w-4 mr-1.5" />
              Edit
            </button>
            <button
              onClick={() => setDeletingWatchlist(watchlist)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              <TrashIcon className="h-4 w-4 mr-1.5" />
              Delete
            </button>
          </div>
        </div>
        
        {/* Description */}
        {watchlist.description && (
          <div className="px-4 pb-3 sm:px-6">
            <p className="text-sm text-gray-600">{watchlist.description}</p>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex min-h-[calc(100vh-120px)]">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-0 -ml-5'} transition-all duration-300 overflow-hidden border-r border-gray-200 bg-white`}>
          <div className="h-full p-4 flex flex-col">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Watchlist Metrics</h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            </div>
            
            {/* Metrics */}
            {watchlistMetrics && (
              <div className="space-y-4">
                {/* Overall Performance */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Performance</h4>
                  <div className="flex items-center space-x-2">
                    <div className={`text-lg font-bold ${
                      watchlistMetrics.avgPerformance >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {watchlistMetrics.avgPerformance >= 0 ? '+' : ''}
                      {watchlistMetrics.avgPerformance.toFixed(2)}%
                    </div>
                    <span className="text-xs text-gray-500">average</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                    <div>
                      <span className="text-green-600">{watchlistMetrics.gainers}</span> gainers
                    </div>
                    <div>
                      <span className="text-red-600">{watchlistMetrics.losers}</span> losers
                    </div>
                  </div>
                </div>
                
                {/* Best & Worst */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Top Performers</h4>
                  <div className="space-y-2">
                    {watchlistMetrics.highestPerformer && (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleSymbolClick(watchlistMetrics.highestPerformer!.symbol)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          {watchlistMetrics.highestPerformer.symbol}
                        </button>
                        <span className="text-green-600 font-medium">
                          +{watchlistMetrics.highestPerformer.performance.toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {watchlistMetrics.lowestPerformer && (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleSymbolClick(watchlistMetrics.lowestPerformer!.symbol)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          {watchlistMetrics.lowestPerformer.symbol}
                        </button>
                        <span className="text-red-600 font-medium">
                          {watchlistMetrics.lowestPerformer.performance.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Near Target */}
                {watchlistMetrics.nearTarget.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Approaching Target</h4>
                    <div className="space-y-2">
                      {watchlistMetrics.nearTarget.map(item => (
                        <div key={item.symbol} className="flex items-center justify-between">
                          <button
                            onClick={() => handleSymbolClick(item.symbol)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            {item.symbol}
                          </button>
                          <span className="text-green-600 font-medium">
                            {item.percent.toFixed(2)}% to target
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Near Stop Loss */}
                {watchlistMetrics.nearStop.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Near Stop Loss</h4>
                    <div className="space-y-2">
                      {watchlistMetrics.nearStop.map(item => (
                        <div key={item.symbol} className="flex items-center justify-between">
                          <button
                            onClick={() => handleSymbolClick(item.symbol)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            {item.symbol}
                          </button>
                          <span className="text-red-600 font-medium">
                            {item.percent.toFixed(2)}% to stop
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Filter Menu */}
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Filter Stocks</h4>
                  <nav className="space-y-1">
                    <button
                      onClick={() => setFilterType('all')}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'all' 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <ListBulletIcon className="h-5 w-5 mr-2" />
                      All Stocks
                    </button>
                    <button
                      onClick={() => setFilterType('gainers')}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'gainers' 
                          ? 'bg-green-50 text-green-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <ArrowTrendingUpIcon className="h-5 w-5 mr-2" />
                      Gainers
                    </button>
                    <button
                      onClick={() => setFilterType('losers')}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'losers' 
                          ? 'bg-red-50 text-red-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <ArrowTrendingDownIcon className="h-5 w-5 mr-2" />
                      Losers
                    </button>
                    <button
                      onClick={() => setFilterType('targets')}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'targets' 
                          ? 'bg-purple-50 text-purple-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <TrophyIcon className="h-5 w-5 mr-2" />
                      With Targets
                    </button>
                    <button
                      onClick={() => { setFilterType('sectors'); setGroupBy('sector'); }}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'sectors' 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <ChartPieIcon className="h-5 w-5 mr-2" />
                      By Sector
                    </button>
                    <button
                      onClick={() => { setFilterType('industry'); setGroupBy('industry'); }}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md w-full ${
                        filterType === 'industry' 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <FunnelIcon className="h-5 w-5 mr-2" />
                      By Industry
                    </button>
                  </nav>
                </div>
              </div>
            )}
            
            <div className="mt-auto pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {watchlist.items.length} symbols in this watchlist
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Toggle sidebar button when sidebar is closed */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white p-1.5 rounded-r-md border border-gray-200 border-l-0 text-gray-400 hover:text-gray-600"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          )}
          
          {/* Controls Bar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              {/* Search & View Controls */}
              <div className="flex items-center space-x-2">
                {/* Search */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Search symbols or companies..."
                  />
                </div>
                
                {/* View Mode */}
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-gray-50">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-2 ${
                      viewMode === 'table' 
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-white text-gray-500'
                    }`}
                    title="Table View"
                  >
                    <TableCellsIcon className="h-5 w-5" />
                  </button>
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
                    onClick={() => setViewMode('chart')}
                    className={`p-2 ${
                      viewMode === 'chart' 
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-white text-gray-500'
                    }`}
                    title="Chart View"
                  >
                    <ChartBarIcon className="h-5 w-5" />
                  </button>
                </div>
                
                {viewMode === 'table' && (
                  <GroupingControls value={groupBy} onChange={setGroupBy} />
                )}
              </div>
              
              {/* Selected Items Actions */}
              <div className="flex items-center space-x-2">
                {selectedItems.length > 0 && (
                  <>
                    <span className="text-sm text-gray-600">
                      {selectedItems.length} selected
                    </span>
                    <button
                      onClick={() => setSelectedItems([])}
                      className="text-gray-600 hover:text-gray-800 text-sm"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleDeleteSelectedItems}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                    >
                      <TrashIcon className="h-4 w-4 mr-1.5" />
                      Delete Selected
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* No Items State */}
          {watchlist.items.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="text-center">
                <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">No symbols yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by adding symbols to this watchlist.</p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Add Your First Symbol
                  </button>
                </div>
              </div>
            </div>
          ) : filteredAndSortedItems.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="text-center">
                <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">No matching symbols</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
                <div className="mt-6 flex justify-center space-x-3">
                  <button
                    onClick={() => setSearchTerm('')}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Clear Search
                  </button>
                  <button
                    onClick={() => { setFilterType('all'); setGroupBy('none'); }}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Table View */}
              {viewMode === 'table' && (
                <div className="space-y-6">
                  {Object.entries(groupedItems).map(([groupName, items]) => (
                    <div key={groupName} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      {groupBy !== 'none' && (
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                          <h4 className="text-sm font-medium text-gray-900">
                            {groupName} ({items.length} {items.length === 1 ? 'item' : 'items'})
                          </h4>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-6">
                                <input
                                  type="checkbox"
                                  checked={selectedItems.length > 0 && items.every(item => selectedItems.includes(item.id))}
                                  onChange={handleSelectAllItems}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('symbol')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>Symbol</span>
                                  {sortField === 'symbol' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('price')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>Current Price</span>
                                  {sortField === 'price' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('change')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>Daily Change</span>
                                  {sortField === 'change' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('52week')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>52W Range</span>
                                  {sortField === '52week' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('entry')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>Entry</span>
                                  {sortField === 'entry' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('performance')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>P&L</span>
                                  {sortField === 'performance' && (
                                    <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <button 
                                  onClick={() => handleSort('target')}
                                  className="flex items-center space-x-1 hover:text-gray-700"
                                >
                                  <span>Target/Stop</span>
                                  {sortField === 'target' && (
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
                            {items.map((item) => {
                              const price = priceData[item.symbol]
                              const performance = calculatePerformance(item)
                              const isSelected = selectedItems.includes(item.id)
                              
                              return (
                                <tr 
                                  key={item.id} 
                                  className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                                >
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSelectItem(item.id)}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    <div>
                                      <button
                                        onClick={() => handleSymbolClick(item.symbol)}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                                      >
                                        {item.symbol}
                                      </button>
                                      {item.company_name && (
                                        <div className="text-xs text-gray-500 max-w-xs truncate">
                                          {item.company_name}
                                        </div>
                                      )}
                                      <div className="flex items-center mt-1 space-x-1">
                                        {item.sector && groupBy !== 'sector' && (
                                          <div className="text-xxs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                            {item.sector}
                                          </div>
                                        )}
                                        {item.industry && groupBy !== 'industry' && (
                                          <div className="text-xxs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                            {item.industry}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">
                                          ${price.current_price.toFixed(2)}
                                        </div>
                                        <div className={`text-xs ${price.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {price.change >= 0 ? '+' : ''}${price.change.toFixed(2)}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">Loading...</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div className="text-xs">
                                        <div className={`flex items-center ${
                                          price.change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                          {price.change_percent >= 0 ? (
                                            <ArrowUpIcon className="h-3 w-3 mr-1" />
                                          ) : (
                                            <ArrowDownIcon className="h-3 w-3 mr-1" />
                                          )}
                                          <span className="font-medium">
                                            {price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                          </span>
                                        </div>
                                        {price.change_week !== undefined && (
                                          <div className={`flex items-center mt-1 ${
                                            price.change_week >= 0 ? 'text-green-600' : 'text-red-600'
                                          }`}>
                                            <span className="text-gray-500 mr-1">1W:</span>
                                            <span>
                                              {price.change_week >= 0 ? '+' : ''}{price.change_week.toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                        {price.change_month !== undefined && (
                                          <div className={`flex items-center mt-1 ${
                                            price.change_month >= 0 ? 'text-green-600' : 'text-red-600'
                                          }`}>
                                            <span className="text-gray-500 mr-1">1M:</span>
                                            <span>
                                              {price.change_month >= 0 ? '+' : ''}{price.change_month.toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">-</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div className="text-xs space-y-1">
                                        <div className="flex items-center">
                                          <span className="text-green-600 font-medium">H:</span> 
                                          <span className="ml-1 text-gray-900">
                                            {price.high_52w ? `$${Number(price.high_52w).toFixed(2)}` : '—'}
                                          </span>
                                        </div>
                                        <div className="flex items-center">
                                          <span className="text-red-600 font-medium">L:</span> 
                                          <span className="ml-1 text-gray-900">
                                            {price.low_52w ? `$${Number(price.low_52w).toFixed(2)}` : '—'}
                                          </span>
                                        </div>
                                        {price.current_price && price.high_52w && price.low_52w && (
                                          <div className="flex items-center">
                                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                              <div 
                                                className="h-full bg-blue-600" 
                                                style={{ 
                                                  width: `${Math.max(0, Math.min(100, ((price.current_price - price.low_52w) / (price.high_52w - price.low_52w) * 100)))}%`
                                                }}
                                              ></div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">Loading...</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {item.entry_price ? `$${parseFloat(item.entry_price.toString()).toFixed(2)}` : '-'}
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    {performance ? (
                                      <div className={`text-sm ${performance.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        <div className="font-medium">
                                          {performance.gainLoss >= 0 ? '+' : ''}${performance.gainLoss}
                                        </div>
                                        <div className="text-xs">
                                          ({performance.gainLossPercent >= 0 ? '+' : ''}{performance.gainLossPercent.toFixed(2)}%)
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">-</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap">
                                    <div className="flex gap-4">
                                      <div>
                                        {item.target_price ? (
                                          <div>
                                            <div className="text-xs font-medium text-green-600">Target:</div>
                                            <div className="text-sm text-gray-900">${parseFloat(item.target_price.toString()).toFixed(2)}</div>
                                            {performance?.toTarget && (
                                              <div className="text-xs text-gray-500">
                                                {performance.toTarget > 0 ? `+${performance.toTarget.toFixed(2)}%` : `${performance.toTarget.toFixed(2)}%`} to go
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-gray-500">No target</div>
                                        )}
                                      </div>
                                      <div>
                                        {item.stop_loss ? (
                                          <div>
                                            <div className="text-xs font-medium text-red-600">Stop:</div>
                                            <div className="text-sm text-gray-900">${parseFloat(item.stop_loss.toString()).toFixed(2)}</div>
                                            {performance?.toStopLoss && (
                                              <div className="text-xs text-gray-500">
                                                {performance.toStopLoss.toFixed(2)}% buffer
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-gray-500">No stop</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                                    <div className="flex items-center justify-end space-x-2">
                                      <button
                                        onClick={() => handleSymbolClick(item.symbol)}
                                        className="text-blue-600 hover:text-blue-700"
                                        title="View detailed analysis"
                                      >
                                        <ChartBarIcon className="h-5 w-5" />
                                      </button>
                                      <button
                                        onClick={() => setDeletingItem(item)}
                                        className="text-red-600 hover:text-red-700"
                                        title="Remove from watchlist"
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
                    </div>
                  ))}
                </div>
              )}
              
              {/* Grid View */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filteredAndSortedItems.map((item) => {
                    const price = priceData[item.symbol]
                    const performance = calculatePerformance(item)
                    const isSelected = selectedItems.includes(item.id)
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow ${
                          isSelected ? 'ring-2 ring-blue-500' : ''
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectItem(item.id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                              />
                              <button
                                onClick={() => handleSymbolClick(item.symbol)}
                                className="text-lg font-medium text-blue-600 hover:text-blue-700"
                              >
                                {item.symbol}
                              </button>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleSymbolClick(item.symbol)}
                                className="text-blue-600 hover:text-blue-700"
                                title="View detailed analysis"
                              >
                                <ChartBarIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="text-red-600 hover:text-red-700"
                                title="Remove from watchlist"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                          
                          {item.company_name && (
                            <div className="text-sm text-gray-500 mb-2 truncate">
                              {item.company_name}
                            </div>
                          )}
                          
                          <div className="flex items-center mb-2 space-x-1">
                            {item.sector && (
                              <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {item.sector}
                              </div>
                            )}
                            {item.industry && (
                              <div className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                {item.industry}
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {/* Current Price */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">Current Price</div>
                              {price ? (
                                <div className="flex items-center justify-between">
                                  <div className="text-lg font-medium text-gray-900">
                                    ${price.current_price.toFixed(2)}
                                  </div>
                                  <div className={`text-sm ${price.change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Loading...</div>
                              )}
                            </div>
                            
                            {/* Entry & P&L */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">Entry & P&L</div>
                              {item.entry_price ? (
                                <div className="flex items-center justify-between">
                                  <div className="text-sm text-gray-900">
                                    ${parseFloat(item.entry_price.toString()).toFixed(2)}
                                  </div>
                                  {performance && (
                                    <div className={`text-sm ${performance.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {performance.gainLossPercent >= 0 ? '+' : ''}{performance.gainLossPercent.toFixed(2)}%
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Not set</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {/* 52-Week Range */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">52-Week Range</div>
                              {price ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-green-600">H: {price.high_52w ? `$${Number(price.high_52w).toFixed(2)}` : '—'}</span>
                                    <span className="text-red-600">L: {price.low_52w ? `$${Number(price.low_52w).toFixed(2)}` : '—'}</span>
                                  </div>
                                  {price.current_price && price.high_52w && price.low_52w && (
                                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-blue-600" 
                                        style={{ 
                                          width: `${Math.max(0, Math.min(100, ((price.current_price - price.low_52w) / (price.high_52w - price.low_52w) * 100)))}%`
                                        }}
                                      ></div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Loading...</div>
                              )}
                            </div>
                            
                            {/* Period Change */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">Period Change</div>
                              {price ? (
                                <div className="space-y-1 text-xs">
                                  <div className={`${price.change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    1D: {price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                  </div>
                                  {price.change_week !== undefined && (
                                    <div className={`${price.change_week >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      1W: {price.change_week >= 0 ? '+' : ''}{price.change_week.toFixed(2)}%
                                    </div>
                                  )}
                                  {price.change_month !== undefined && (
                                    <div className={`${price.change_month >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      1M: {price.change_month >= 0 ? '+' : ''}{price.change_month.toFixed(2)}%
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Loading...</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            {/* Target */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">Target Price</div>
                              {item.target_price ? (
                                <div>
                                  <div className="text-sm font-medium text-green-600">
                                    ${parseFloat(item.target_price.toString()).toFixed(2)}
                                  </div>
                                  {performance?.toTarget && (
                                    <div className="text-xs text-gray-500">
                                      {performance.toTarget > 0 ? `+${performance.toTarget.toFixed(2)}%` : `${performance.toTarget.toFixed(2)}%`} to go
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Not set</div>
                              )}
                            </div>
                            
                            {/* Stop Loss */}
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-xs text-gray-500 mb-1">Stop Loss</div>
                              {item.stop_loss ? (
                                <div>
                                  <div className="text-sm font-medium text-red-600">
                                    ${parseFloat(item.stop_loss.toString()).toFixed(2)}
                                  </div>
                                  {performance?.toStopLoss && (
                                    <div className="text-xs text-gray-500">
                                      {performance.toStopLoss.toFixed(2)}% buffer
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500">Not set</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              
              {/* Chart View */}
              {viewMode === 'chart' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredAndSortedItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => handleSymbolClick(item.symbol)}
                            className="text-lg font-medium text-blue-600 hover:text-blue-700"
                          >
                            {item.symbol}
                          </button>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={selectedItems.includes(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <button
                              onClick={() => setDeletingItem(item)}
                              className="text-red-600 hover:text-red-700"
                              title="Remove from watchlist"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="h-40 mb-2">
                          <TradingViewWidget
                            symbol={item.symbol}
                            height="100%"
                            width="100%"
                            colorTheme="light"
                            chartOnly={true}
                            isTransparent={true}
                            noTimeScale={true}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div>
                            {priceData[item.symbol] && (
                              <div className="text-sm font-medium">
                                ${priceData[item.symbol].current_price.toFixed(2)}
                                <span className={`ml-2 ${
                                  priceData[item.symbol].change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {priceData[item.symbol].change_percent >= 0 ? '+' : ''}
                                  {priceData[item.symbol].change_percent.toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            {calculatePerformance(item) && (
                              <div className={`text-sm font-medium ${
                                calculatePerformance(item)?.gainLossPercent! >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                P&L: {calculatePerformance(item)?.gainLossPercent! >= 0 ? '+' : ''}
                                {calculatePerformance(item)?.gainLossPercent!.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stock Analysis Modal */}
      {analysisModalOpen && selectedAnalysisSymbol && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-4 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => {
                setAnalysisModalOpen(false)
                setSelectedAnalysisSymbol(null)
              }}
            ></div>

            {/* Modal content */}
            <div className="inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all my-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
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
                    <XMarkIcon className="h-5 w-5" />
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

      <AddItemModal
        isOpen={showAddItem}
        onClose={() => setShowAddItem(false)}
        onSave={handleAddItem}
        isLoading={addItemLoading}
      />

      <DeleteConfirmModal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteItem}
        title="Remove Symbol"
        message={`Are you sure you want to remove "${deletingItem?.symbol}" from this watchlist?`}
        confirmText="Remove Symbol"
        isLoading={deleteItemLoading}
      />
    </div>
  )
}