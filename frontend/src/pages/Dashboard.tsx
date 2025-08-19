import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ChartBarIcon, 
  TrophyIcon, 
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon 
} from '@heroicons/react/24/outline'
import StockChart from '../components/StockChart'
import { ChartData, MarkerData, Watchlist } from '../types'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'

const demoData: ChartData[] = [
  { time: '2024-01-01', open: 150, high: 155, low: 148, close: 152 },
  { time: '2024-01-02', open: 152, high: 158, low: 151, close: 156 },
  { time: '2024-01-03', open: 156, high: 162, low: 154, close: 160 },
  { time: '2024-01-04', open: 160, high: 165, low: 158, close: 163 },
  { time: '2024-01-05', open: 163, high: 168, low: 161, close: 165 },
  { time: '2024-01-08', open: 165, high: 170, low: 163, close: 168 },
  { time: '2024-01-09', open: 168, high: 172, low: 166, close: 170 },
  { time: '2024-01-10', open: 170, high: 175, low: 168, close: 173 },
  { time: '2024-01-11', open: 173, high: 178, low: 171, close: 176 },
  { time: '2024-01-12', open: 176, high: 180, low: 174, close: 178 },
]

const demoMarkers: MarkerData[] = [
  {
    time: '2024-01-05',
    position: 'belowBar',
    color: '#00C851',
    shape: 'arrowUp',
    text: 'Buy Signal'
  },
  {
    time: '2024-01-10',
    position: 'aboveBar',
    color: '#ff4444',
    shape: 'arrowDown',
    text: 'Sell Signal'
  }
]

const overlayLines = [
  { price: 160, color: '#2196F3', title: 'Entry Price' },
  { price: 180, color: '#4CAF50', title: 'Target Price' },
  { price: 145, color: '#F44336', title: 'Stop Loss' },
]

// Function to calculate real performance data
const calculateWatchlistPerformance = (watchlist: Watchlist, priceData: Record<string, StockPrice>) => {
  let totalGainLoss = 0
  let totalValue = 0
  let validItems = 0

  for (const item of watchlist.items) {
    const price = priceData[item.symbol]
    if (price && item.entry_price) {
      const gainLoss = price.current_price - item.entry_price
      const gainLossPercent = (gainLoss / item.entry_price) * 100
      
      totalGainLoss += gainLossPercent
      totalValue += price.current_price
      validItems++
    }
  }

  if (validItems === 0) {
    return { performance: 0, trend: 'neutral' as const }
  }

  const avgPerformance = totalGainLoss / validItems
  return {
    performance: avgPerformance,
    trend: avgPerformance >= 0 ? ('up' as const) : ('down' as const)
  }
}

export default function Dashboard() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [priceData, setPriceData] = useState<Record<string, StockPrice>>({})

  useEffect(() => {
    loadWatchlists()
  }, [])

  const loadWatchlists = async () => {
    try {
      const data = await watchlistsApi.getAll()
      setWatchlists(data)
      
      // Load price data for all unique symbols
      const allSymbols = Array.from(new Set(data.flatMap(w => w.items.map(item => item.symbol))))
      if (allSymbols.length > 0) {
        try {
          const prices = await stockApi.getMultipleStockPrices(allSymbols)
          setPriceData(prices)
        } catch (priceError) {
          console.error('Failed to load stock prices:', priceError)
        }
      }
    } catch (err: any) {
      setError('Failed to load watchlists')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate statistics
  const totalWatchlists = watchlists.length
  const allSymbols = watchlists.flatMap(w => w.items.map(item => item.symbol))
  const uniqueSymbols = new Set(allSymbols).size
  
  // Calculate performance metrics
  const watchlistPerformances = watchlists.map(watchlist => ({
    ...watchlist,
    performance: calculateWatchlistPerformance(watchlist, priceData)
  }))
  
  const bestPerforming = watchlistPerformances.reduce((best, current) => 
    current.performance.performance > (best?.performance.performance || -Infinity) ? current : best, 
    null as typeof watchlistPerformances[0] | null
  )
  
  const worstPerforming = watchlistPerformances.reduce((worst, current) => 
    current.performance.performance < (worst?.performance.performance || Infinity) ? current : worst,
    null as typeof watchlistPerformances[0] | null
  )

  const avgPerformance = watchlistPerformances.length > 0 
    ? watchlistPerformances.reduce((sum, w) => sum + w.performance.performance, 0) / watchlistPerformances.length 
    : 0

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
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to your stock watchlist dashboard
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <StockChart
            data={demoData}
            overlayLines={overlayLines}
            markers={demoMarkers}
            symbol="DEMO"
          />
        </div>

        {/* Quick Stats Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
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
          </div>
        </div>

        {/* Performance Leaderboard */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-6">
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
                  .sort((a, b) => b.performance.performance - a.performance.performance)
                  .slice(0, 5)
                  .map((watchlist, index) => (
                    <div key={watchlist.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
                        watchlist.performance.performance >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <div className="font-semibold">
                          {watchlist.performance.performance >= 0 ? '+' : ''}
                          {watchlist.performance.performance.toFixed(1)}%
                        </div>
                        <div className="text-xs">
                          {watchlist.performance.trend === 'up' ? '↗' : '↘'} trend
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Market Insights */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-6">
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
                    <div className="font-bold">+{bestPerforming.performance.performance.toFixed(1)}%</div>
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
                    <div className="font-bold">{worstPerforming.performance.performance.toFixed(1)}%</div>
                    <div className="text-xs">{worstPerforming.items.length} symbols</div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Portfolio Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-blue-700">Diversification</div>
                      <div className="font-semibold text-blue-900">
                        {uniqueSymbols} unique symbols across {totalWatchlists} lists
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-700">Performance Spread</div>
                      <div className="font-semibold text-blue-900">
                        {bestPerforming.performance.performance.toFixed(1)}% to {worstPerforming.performance.performance.toFixed(1)}%
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
  )
}