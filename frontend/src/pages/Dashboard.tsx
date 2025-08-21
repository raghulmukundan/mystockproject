import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ChartBarIcon, 
  TrophyIcon, 
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline'
import { Watchlist } from '../types'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'

// Major market indexes to track
const MAJOR_INDEXES = ['SPY', 'QQQ', 'DIA']

// Function to calculate real performance data
const calculateWatchlistPerformance = (watchlist: Watchlist, priceData: Record<string, StockPrice>) => {
  let totalGainLoss = 0
  let totalValue = 0
  let validItems = 0

  for (const item of watchlist.items) {
    const price = priceData[item.symbol]
    if (price && item.entry_price) {
      const gainLoss = price.current_price - parseFloat(item.entry_price.toString())
      const gainLossPercent = (gainLoss / parseFloat(item.entry_price.toString())) * 100
      
      totalGainLoss += gainLossPercent
      totalValue += price.current_price
      validItems++
    }
  }

  if (validItems === 0) {
    return { performance: 0, trend: 'neutral' as const, hasData: false }
  }

  const avgPerformance = totalGainLoss / validItems
  return {
    performance: avgPerformance,
    trend: avgPerformance >= 0 ? ('up' as const) : ('down' as const),
    hasData: true
  }
}

// Utility functions for market hours (CST)
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

export default function Dashboard() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [error, setError] = useState('')
  const [priceData, setPriceData] = useState<Record<string, StockPrice>>({})
  // Major market indexes with their professional chart links
  const majorIndexes = [
    {
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      description: 'SPDR S&P 500 ETF Trust',
      tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=AMEX:SPY',
      yahooUrl: 'https://finance.yahoo.com/quote/SPY/chart'
    },
    {
      symbol: 'QQQ',
      name: 'NASDAQ 100 ETF',
      description: 'Invesco QQQ Trust',
      tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=NASDAQ:QQQ',
      yahooUrl: 'https://finance.yahoo.com/quote/QQQ/chart'
    },
    {
      symbol: 'DIA',
      name: 'Dow Jones ETF',
      description: 'SPDR Dow Jones Industrial Average ETF',
      tradingViewUrl: 'https://www.tradingview.com/chart/?symbol=AMEX:DIA',
      yahooUrl: 'https://finance.yahoo.com/quote/DIA/chart'
    }
  ]
  
  const [indexPrices, setIndexPrices] = useState<Record<string, StockPrice>>({})
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [nextRefresh, setNextRefresh] = useState<Date>(getNextRefreshTime())
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<string>('')

  useEffect(() => {
    loadWatchlists()
    loadIndexPrices()
    
    // Update countdown timer every second
    const timer = setInterval(updateCountdown, 1000)
    
    // Refresh data every 30 minutes, but only during market hours
    const refreshInterval = setInterval(() => {
      if (isMarketOpen()) {
        refreshAllData()
      } else {
        console.log('Market closed, skipping data refresh')
      }
    }, 30 * 60 * 1000) // 30 minutes
    
    return () => {
      clearInterval(timer)
      clearInterval(refreshInterval)
    }
  }, [])

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
    console.log('Refreshing all data...')
    setLastRefresh(new Date())
    setNextRefresh(getNextRefreshTime())
    
    // Reload watchlist prices
    if (watchlists.length > 0) {
      loadPricesInBackground(watchlists)
    }
    
    // Reload index prices
    loadIndexPrices()
  }

  const loadWatchlists = async () => {
    try {
      const data = await watchlistsApi.getAll()
      setWatchlists(data)
      setLoading(false) // Show dashboard immediately
      
      // Load prices in the background
      loadPricesInBackground(data)
    } catch (err: any) {
      setError('Failed to load watchlists')
      console.error(err)
      setLoading(false)
    }
  }


  const loadPricesInBackground = async (watchlistData: Watchlist[]) => {
    const allSymbols = Array.from(new Set(watchlistData.flatMap(w => w.items.map(item => item.symbol))))
    if (allSymbols.length === 0) return
    
    // Note: Market hours check is now handled by the backend
    // The backend will serve cached data during market close or allow first-time fetching
    
    setPricesLoading(true)
    try {
      // Optimized: Backend now handles cache efficiently
      const batchSize = 15 // Larger batches since backend is cache-optimized
      const delay = 1000 // Reduced delay since backend handles caching
      let allPrices: Record<string, StockPrice> = {}
      
      console.log(`Loading prices for ${allSymbols.length} symbols progressively...`)
      
      for (let i = 0; i < allSymbols.length; i += batchSize) {
        const batch = allSymbols.slice(i, i + batchSize)
        console.log(`Loading batch ${Math.floor(i/batchSize) + 1}: ${batch.join(', ')}`)
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout per batch
          
          const params = new URLSearchParams()
          batch.forEach(symbol => params.append('symbols', symbol))
          
          const response = await fetch(`http://localhost:8000/api/stocks/prices?${params}`, {
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          
          if (response.ok) {
            const batchPrices = await response.json()
            allPrices = { ...allPrices, ...batchPrices }
            
            // Update UI progressively
            setPriceData(prev => ({ ...prev, ...batchPrices }))
          } else {
            console.warn(`Failed to load prices for batch: ${batch.join(', ')}`)
          }
          
          // Wait between batches (except for the last batch)
          if (i + batchSize < allSymbols.length) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        } catch (batchError) {
          console.error(`Error loading batch ${batch.join(', ')}:`, batchError)
        }
      }
      
      console.log(`Loaded ${Object.keys(allPrices).length} prices total`)
    } catch (priceError) {
      console.error('Failed to load stock prices:', priceError)
    } finally {
      setPricesLoading(false)
    }
  }

  const loadIndexPrices = async () => {
    try {
      console.log('Loading index prices...')
      const indexSymbols = majorIndexes.map(index => index.symbol)
      
      // Progressive loading for index prices  
      const indexPriceData: Record<string, StockPrice> = {}
      
      for (const symbol of indexSymbols) {
        try {
          const price = await stockApi.getStockPrice(symbol)
          if (price) {
            indexPriceData[symbol] = price
          }
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          console.warn(`Failed to load price for ${symbol}:`, error)
        }
      }
      
      setIndexPrices(indexPriceData)
      console.log('Index prices loaded:', Object.keys(indexPriceData))
    } catch (error) {
      console.error('Failed to load index prices:', error)
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

  const watchlistsWithData = watchlistPerformances.filter(w => w.performance.hasData)
  const avgPerformance = watchlistsWithData.length > 0 
    ? watchlistsWithData.reduce((sum, w) => sum + w.performance.performance, 0) / watchlistsWithData.length 
    : 0
  
  const priceDataCount = Object.keys(priceData).length
  const totalUniqueSymbols = uniqueSymbols

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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Welcome to your stock watchlist dashboard
            </p>
          </div>
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
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Major Market Indexes - Professional Charts */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Major Market Indexes</h2>
        <p className="text-gray-600 mb-6">
          Access professional charts and real-time data for major market indexes
        </p>
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {majorIndexes.map((index) => {
            const indexPrice = indexPrices[index.symbol]
            return (
              <div key={index.symbol} className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{index.symbol}</h3>
                    <p className="text-sm text-gray-600">{index.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{index.description}</p>
                  </div>
                  <ChartBarIcon className="h-8 w-8 text-blue-600" />
                </div>
                
                {/* Current Price Display */}
                {indexPrice ? (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          ${indexPrice.current_price.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Last updated: {indexPrice.last_updated ? new Date(indexPrice.last_updated).toLocaleTimeString() : 'N/A'}
                        </div>
                      </div>
                      <div className={`text-right ${
                        indexPrice.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <div className="font-semibold">
                          {indexPrice.change >= 0 ? '+' : ''}${indexPrice.change.toFixed(2)}
                        </div>
                        <div className="text-sm">
                          ({indexPrice.change_percent >= 0 ? '+' : ''}{indexPrice.change_percent.toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-center text-gray-500">
                      Loading price data...
                    </div>
                  </div>
                )}
              
              <div className="space-y-3">
                <a
                  href={index.tradingViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                >
                  <div className="flex items-center">
                    <span className="font-medium text-blue-900">TradingView Chart</span>
                    <span className="text-xs text-blue-700 ml-2">Professional</span>
                  </div>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 text-blue-600" />
                </a>
                
                <a
                  href={index.yahooUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-4 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
                >
                  <div className="flex items-center">
                    <span className="font-medium text-purple-900">Yahoo Finance</span>
                    <span className="text-xs text-purple-700 ml-2">Comprehensive</span>
                  </div>
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 text-purple-600" />
                </a>
              </div>
              </div>
            )
          })}
        </div>
        
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <ChartBarIcon className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
            <div>
              <h4 className="text-sm font-medium text-green-900">Professional Market Analysis</h4>
              <p className="text-sm text-green-800 mt-1">
                Access real-time charts, technical indicators, and comprehensive market data from leading financial platforms. 
                These tools provide the advanced analysis capabilities needed for informed investment decisions.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

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
                        <br />
                        <span className="text-gray-500">
                          {pricesLoading ? 'Loading prices...' : 
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