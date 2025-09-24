import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  PlusIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  TrashIcon,
  StarIcon,
  ChartBarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline'
import { watchlistsApiService, Watchlist, StockPrice } from '../services/watchlistsApi'
import CreateWatchlistModal from '../components/CreateWatchlistModal'

interface WatchlistWithPrices extends Watchlist {
  prices: StockPrice[]
  totalValue: number
  totalChange: number
  totalChangePercent: number
  topGainer?: { symbol: string; change_percent: number }
  topLoser?: { symbol: string; change_percent: number }
}

const Watchlists: React.FC = () => {
  const [watchlists, setWatchlists] = useState<WatchlistWithPrices[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [topPerformers, setTopPerformers] = useState<StockPrice[]>([])
  const [topDecliners, setTopDecliners] = useState<StockPrice[]>([])
  const navigate = useNavigate()

  const loadWatchlists = async () => {
    try {
      setLoading(true)
      const watchlistsData = await watchlistsApiService.getWatchlists()

      // Load prices for each watchlist
      const watchlistsWithPrices: WatchlistWithPrices[] = []
      const allPrices: StockPrice[] = []

      for (const watchlist of watchlistsData) {
        let prices: StockPrice[] = []
        let totalValue = 0
        let totalChange = 0

        if (watchlist.items.length > 0) {
          try {
            prices = await watchlistsApiService.getWatchlistPrices(watchlist.id)

            // Filter out invalid prices and add to all prices
            const validPrices = prices.filter(price =>
              price &&
              typeof price.current_price === 'number' &&
              !isNaN(price.current_price) &&
              typeof price.change === 'number' &&
              !isNaN(price.change) &&
              typeof price.change_percent === 'number' &&
              !isNaN(price.change_percent)
            )

            allPrices.push(...validPrices)
            prices = validPrices

            // Calculate totals
            totalValue = prices.reduce((sum, price) => sum + (price.current_price || 0), 0)
            totalChange = prices.reduce((sum, price) => sum + (price.change || 0), 0)
          } catch (error) {
            console.warn(`Failed to load prices for watchlist ${watchlist.id}:`, error)
            prices = []
          }
        }

        const totalChangePercent = totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0

        // Find top gainer and loser in this watchlist
        let topGainer: { symbol: string; change_percent: number } | undefined
        let topLoser: { symbol: string; change_percent: number } | undefined

        if (prices.length > 0) {
          const sortedByChange = [...prices].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0))
          if (sortedByChange[0]?.change_percent !== undefined) {
            topGainer = { symbol: sortedByChange[0].symbol, change_percent: sortedByChange[0].change_percent }
          }
          if (sortedByChange[sortedByChange.length - 1]?.change_percent !== undefined) {
            topLoser = { symbol: sortedByChange[sortedByChange.length - 1].symbol, change_percent: sortedByChange[sortedByChange.length - 1].change_percent }
          }
        }

        watchlistsWithPrices.push({
          ...watchlist,
          prices,
          totalValue,
          totalChange,
          totalChangePercent,
          topGainer,
          topLoser
        })
      }

      // Calculate overall top performers and decliners
      if (allPrices.length > 0) {
        const sortedPrices = [...allPrices].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0))
        setTopPerformers(sortedPrices.slice(0, 3))
        setTopDecliners(sortedPrices.slice(-3).reverse())
      } else {
        setTopPerformers([])
        setTopDecliners([])
      }

      setWatchlists(watchlistsWithPrices)
    } catch (error) {
      console.error('Failed to load watchlists:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWatchlists()
  }, [])

  const handleCreateWatchlist = async (data: { name: string; description?: string }) => {
    try {
      await watchlistsApiService.createWatchlist(data)
      setShowCreateModal(false)
      await loadWatchlists()
    } catch (error) {
      console.error('Failed to create watchlist:', error)
    }
  }

  const handleDeleteWatchlist = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete watchlist "${name}"?`)) {
      try {
        await watchlistsApiService.deleteWatchlist(id)
        await loadWatchlists()
      } catch (error) {
        console.error('Failed to delete watchlist:', error)
      }
    }
  }

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '$0.00'
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00%'
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Top Movers */}
      <div className="w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Market Movers</h2>
          <p className="text-gray-600 mt-1">From your watchlists</p>
        </div>

        {/* Sidebar Content - Fixed sections */}
        <div className="flex-1 flex flex-col">
          {/* Top Performers - Fixed height */}
          <div className="flex-1 min-h-0 max-h-[45%]">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-green-700">
                <ArrowTrendingUpIcon className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Top Performers</h3>
              </div>
            </div>
            <div className="overflow-y-auto p-2 space-y-1 max-h-[calc(100%-48px)]">
              {topPerformers.length > 0 ? topPerformers.map((stock, index) => {
                const belongsToWatchlist = watchlists.find(w =>
                  w.items.some(item => item.symbol === stock.symbol)
                )
                return (
                  <div key={stock.symbol} className="bg-green-50 rounded-md p-2 border border-green-200 hover:bg-green-100 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-4 h-4 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-green-900 text-sm">{stock.symbol}</div>
                          {belongsToWatchlist && (
                            <div className="text-xs text-green-600 truncate">{belongsToWatchlist.name}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-gray-900">{formatCurrency(stock.current_price)}</div>
                        <div className="flex items-center gap-1 text-green-600 text-sm font-semibold">
                          <ArrowUpIcon className="h-3 w-3" />
                          {formatPercent(stock.change_percent)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">No gainers today</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Decliners - Fixed height */}
          <div className="flex-1 min-h-0 max-h-[45%]">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-red-700">
                <ArrowTrendingDownIcon className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Top Decliners</h3>
              </div>
            </div>
            <div className="overflow-y-auto p-2 space-y-1 max-h-[calc(100%-48px)]">
              {topDecliners.length > 0 ? topDecliners.map((stock, index) => {
                const belongsToWatchlist = watchlists.find(w =>
                  w.items.some(item => item.symbol === stock.symbol)
                )
                return (
                  <div key={stock.symbol} className="bg-red-50 rounded-md p-2 border border-red-200 hover:bg-red-100 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-red-900 text-sm">{stock.symbol}</div>
                          {belongsToWatchlist && (
                            <div className="text-xs text-red-600 truncate">{belongsToWatchlist.name}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-gray-900">{formatCurrency(stock.current_price)}</div>
                        <div className="flex items-center gap-1 text-red-600 text-sm font-semibold">
                          <ArrowDownIcon className="h-3 w-3" />
                          {formatPercent(stock.change_percent)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">No decliners today</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Watchlists</h1>
              <p className="text-gray-600 mt-1">Monitor your favorite stocks and track performance</p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Watchlist
            </Button>
          </div>
        </div>

        {/* Watchlists Content */}
        <div className="flex-1 overflow-y-auto p-6">{/* Watchlists Grid */}
      {watchlists.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <StarIcon className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No watchlists yet</h3>
            <p className="text-gray-600 mb-6 max-w-sm">
              Create your first watchlist to start tracking your favorite stocks and monitor their performance.
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Your First Watchlist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {watchlists.map((watchlist) => (
            <Card
              key={watchlist.id}
              className="hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer group border-0 shadow-md bg-gradient-to-br from-white to-gray-50"
              onClick={() => navigate(`/watchlists/${watchlist.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"></div>
                      <CardTitle className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {watchlist.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-full">
                          <ChartBarIcon className="h-3 w-3 text-blue-600" />
                          <span className="text-xs font-medium text-blue-800">
                            {watchlist.items.length}
                          </span>
                        </div>
                        {watchlist.totalValue > 0 && (
                          <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            watchlist.totalChangePercent >= 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {formatPercent(watchlist.totalChangePercent)}
                          </div>
                        )}
                      </div>
                    </div>
                    {watchlist.description && (
                      <p className="text-xs text-gray-600 leading-relaxed ml-6">{watchlist.description}</p>
                    )}
                  </div>
                  <div className="opacity-100 transition-opacity duration-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/watchlists/${watchlist.id}`)
                      }}
                      className="h-9 w-9 p-0 hover:bg-blue-100 rounded-full border-2 border-blue-200 bg-blue-50 shadow-md hover:shadow-lg transition-all"
                      title="View Details"
                    >
                      <EyeIcon className="h-4 w-4 text-blue-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">

                {/* Stock Samples */}
                {watchlist.items.length > 0 ? (
                  <div className="space-y-2">
                    {watchlist.items.slice(0, 4).map((item) => {
                      const stockPrice = watchlist.prices.find(p => p.symbol === item.symbol)
                      return (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              stockPrice && stockPrice.change >= 0 ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            <div>
                              <div className="font-semibold text-gray-900 text-sm">{item.symbol}</div>
                              {item.sector && (
                                <div className="text-xs text-gray-600">{item.sector.substring(0, 3)}</div>
                              )}
                            </div>
                          </div>
                          {stockPrice && (
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">{formatCurrency(stockPrice.current_price)}</div>
                              <div className={`text-xs font-medium ${
                                stockPrice.change >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatPercent(stockPrice.change_percent)}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {watchlist.items.length > 4 && (
                      <div className="text-center py-1">
                        <div className="text-xs text-gray-500 font-medium">
                          +{watchlist.items.length - 4} more
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 text-center border-2 border-dashed border-gray-300">
                    <StarIcon className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-600">No stocks added yet</div>
                    <div className="text-xs text-gray-500 mt-1">Click to add stocks</div>
                  </div>
                )}

              </CardContent>
            </Card>
          ))}
          </div>
        )}
        </div>
      </div>

      {/* Create Watchlist Modal */}
      {showCreateModal && (
        <CreateWatchlistModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateWatchlist}
        />
      )}
    </div>
  )
}

export default Watchlists