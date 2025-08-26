import { useState, useEffect } from 'react'
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
  TrophyIcon
} from '@heroicons/react/24/outline'
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

  useEffect(() => {
    if (id) {
      loadWatchlist(parseInt(id))
      loadAllWatchlists()
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
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/watchlists"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Back to Watchlists"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </Link>
            
            {/* Previous/Next Navigation */}
            {canNavigatePrev && (
              <button
                onClick={() => navigateToWatchlist('prev')}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title={`Previous: ${prevWatchlist?.name || ''}`}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            )}
            
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{watchlist.name}</h1>
              {allWatchlists.length > 1 && currentIndex !== -1 && (
                <p className="text-sm text-gray-500">
                  {currentIndex + 1} of {allWatchlists.length} watchlists
                </p>
              )}
            </div>
            
            {canNavigateNext && (
              <button
                onClick={() => navigateToWatchlist('next')}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title={`Next: ${nextWatchlist?.name || ''}`}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefreshProfiles}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              title="Refresh company profile data"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button
              onClick={() => setEditingWatchlist(watchlist)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              Edit
            </button>
            <button
              onClick={() => setDeletingWatchlist(watchlist)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete
            </button>
          </div>
        </div>
        
        {watchlist.description && (
          <p className="mt-2 text-gray-600">{watchlist.description}</p>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="mb-8">
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ChartBarIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Symbols</dt>
                    <dd className="text-lg font-medium text-gray-900">{watchlist.items.length}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ArrowTrendingUpIcon className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Avg. Performance</dt>
                    <dd className="text-lg font-medium text-green-600">
                      +{(Math.random() * 10).toFixed(2)}%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <EyeIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Market Value</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      ${(Math.random() * 100000 + 50000).toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ArrowTrendingDownIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Day Change</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      ${(Math.random() * 1000 - 500).toFixed(2)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Watchlist Items Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Watchlist Items
            </h3>
            <div className="flex items-center space-x-4">
              <GroupingControls value={groupBy} onChange={setGroupBy} />
              <button
                onClick={() => setShowAddItem(true)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Symbol
              </button>
            </div>
          </div>
          
          {watchlist.items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No items in this watchlist</p>
              <button
                onClick={() => setShowAddItem(true)}
                className="mt-4 text-blue-600 hover:text-blue-700"
              >
                Add some symbols to get started
              </button>
            </div>
          ) : (
            (() => {
              const groupedItems = groupWatchlistItems(watchlist.items, groupBy)
              return (
                <div className="space-y-6">
                  {Object.entries(groupedItems).map(([groupName, items]) => (
                    <div key={groupName} className="border border-gray-200 rounded-lg overflow-hidden">
                      {groupBy !== 'none' && (
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                          <h4 className="text-sm font-medium text-gray-900">
                            {groupName} ({items.length} {items.length === 1 ? 'item' : 'items'})
                          </h4>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          {groupBy === 'none' && (
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Symbol
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Current Price
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  52W High/Low
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Changes
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Entry Price
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  P&L
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Target/Stop
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                          )}
                          <tbody className="bg-white divide-y divide-gray-200">
                            {items.map((item) => {
                              const price = priceData[item.symbol]
                              const performance = calculatePerformance(item)
                              
                              return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                      <button
                                        onClick={() => handleSymbolClick(item.symbol)}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                                      >
                                        {item.symbol}
                                      </button>
                                      {item.company_name && (
                                        <div className="text-sm text-gray-500">
                                          {item.company_name}
                                        </div>
                                      )}
                                      {item.sector && groupBy !== 'sector' && (
                                        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-1 inline-block">
                                          {item.sector}
                                        </div>
                                      )}
                                      {item.industry && groupBy !== 'industry' && (
                                        <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded mt-1 inline-block">
                                          {item.industry}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">
                                          ${price.current_price}
                                        </div>
                                        <div className={`text-sm ${price.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {price.change >= 0 ? '+' : ''}${price.change} ({price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%)
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">Loading...</div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div className="text-xs">
                                        <div className="flex items-center">
                                          <span className="text-green-600 font-medium">H:</span> 
                                          <span className="ml-1 text-gray-900">
                                            {price.high_52w ? `$${Number(price.high_52w).toFixed(2)}` : '—'}
                                          </span>
                                        </div>
                                        <div className="flex items-center mt-1">
                                          <span className="text-red-600 font-medium">L:</span> 
                                          <span className="ml-1 text-gray-900">
                                            {price.low_52w ? `$${Number(price.low_52w).toFixed(2)}` : '—'}
                                          </span>
                                        </div>
                                        {price.current_price && price.high_52w && price.low_52w && (
                                          <div className="mt-1 text-gray-500">
                                            {((price.current_price - price.low_52w) / (price.high_52w - price.low_52w) * 100).toFixed(0)}% of range
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">Loading...</div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {price ? (
                                      <div className="text-xs">
                                        <div className="flex items-center">
                                          <span className="font-medium text-gray-700">1D:</span> 
                                          <span className={`ml-1 ${price.change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                          </span>
                                        </div>
                                        {price.change_week !== undefined && (
                                          <div className="flex items-center mt-1">
                                            <span className="font-medium text-gray-700">1W:</span> 
                                            <span className={`ml-1 ${price.change_week >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {price.change_week >= 0 ? '+' : ''}{price.change_week.toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                        {price.change_month !== undefined && (
                                          <div className="flex items-center mt-1">
                                            <span className="font-medium text-gray-700">1M:</span> 
                                            <span className={`ml-1 ${price.change_month >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {price.change_month >= 0 ? '+' : ''}{price.change_month.toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">-</div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {item.entry_price ? `$${item.entry_price}` : '-'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {performance ? (
                                      <div className={`text-sm ${performance.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {performance.gainLoss >= 0 ? '+' : ''}${performance.gainLoss}
                                        <br />
                                        ({performance.gainLossPercent >= 0 ? '+' : ''}{performance.gainLossPercent}%)
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">-</div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex gap-4">
                                      <div>
                                        {item.target_price ? (
                                          <div>
                                            <div className="text-xs font-medium text-green-600">Target:</div>
                                            <div className="text-sm text-gray-900">${item.target_price}</div>
                                            {performance?.toTarget && (
                                              <div className="text-xs text-gray-500">
                                                {performance.toTarget > 0 ? `+${performance.toTarget}%` : `${performance.toTarget}%`} to go
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-gray-500">-</div>
                                        )}
                                      </div>
                                      <div>
                                        {item.stop_loss ? (
                                          <div>
                                            <div className="text-xs font-medium text-red-600">Stop:</div>
                                            <div className="text-sm text-gray-900">${item.stop_loss}</div>
                                            {performance?.toStopLoss && (
                                              <div className="text-xs text-gray-500">
                                                {performance.toStopLoss}% buffer
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-gray-500">-</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center space-x-3">
                                      <button
                                        onClick={() => handleSymbolClick(item.symbol)}
                                        className="text-blue-600 hover:text-blue-700"
                                        title="View detailed analysis"
                                      >
                                        Analyze
                                      </button>
                                      <button
                                        onClick={() => setDeletingItem(item)}
                                        className="text-red-600 hover:text-red-700"
                                        title="Remove from watchlist"
                                      >
                                        <TrashIcon className="h-4 w-4" />
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
              )
            })()
          )}
        </div>
      </div>

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