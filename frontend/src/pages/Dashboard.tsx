import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  ChartBarIcon, 
  TrophyIcon, 
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline'
import { Watchlist } from '../types'
import TradingViewWidget from '../components/TradingViewWidget'
import FinancialWidget from '../components/FinancialWidget'
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
  // Major market indexes with TradingView symbols
  const majorIndexes = [
    {
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      description: 'SPDR S&P 500 ETF Trust',
      tradingViewSymbol: 'AMEX:SPY'
    },
    {
      symbol: 'QQQ',
      name: 'NASDAQ 100 ETF',
      description: 'Invesco QQQ Trust',
      tradingViewSymbol: 'NASDAQ:QQQ'
    },
    {
      symbol: 'DIA',
      name: 'Dow Jones ETF',
      description: 'SPDR Dow Jones Industrial Average ETF',
      tradingViewSymbol: 'AMEX:DIA'
    }
  ]
  
  // Index prices removed - now shown in TradingView widgets
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
    
    // Index prices now handled by TradingView widgets
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

  // Index price loading removed - TradingView widgets handle this

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
      
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {majorIndexes.map((index) => (
            <div key={index.symbol} className="bg-white shadow rounded-lg p-4">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900 mb-1">{index.symbol}</h3>
                <p className="text-sm text-gray-600">{index.name}</p>
              </div>
              
                {/* TradingView Widget */}
                <div className="h-60">
                  <TradingViewWidget
                    symbol={index.tradingViewSymbol}
                    height="100%"
                    width="100%"
                    chartOnly={false}
                    dateRange="6M"
                    colorTheme="light"
                    isTransparent={false}
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

      </div>

      {/* Financial Widgets Section */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mt-8">
        {/* Economic Calendar */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <ClockIcon className="h-5 w-5 text-blue-600 mr-2" />
              Economic Calendar
            </h3>
            <div className="h-96">
              <FinancialWidget
                type="economic-calendar"
                height="100%"
                width="100%"
                colorTheme="light"
              />
            </div>
          </div>
        </div>

        {/* Market Overview */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <ChartBarIcon className="h-5 w-5 text-green-600 mr-2" />
              Market Overview
            </h3>
            <div className="h-96">
              <FinancialWidget
                type="market-overview"
                height="100%"
                width="100%"
                colorTheme="light"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Market Screener - Full Width */}
      <div className="bg-white shadow rounded-lg mt-8">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <TrophyIcon className="h-5 w-5 text-purple-600 mr-2" />
            Market Screener - Top Stocks
          </h3>
          <div className="h-96">
            <FinancialWidget
              type="top-gainers-losers"
              height="100%"
              width="100%"
              colorTheme="light"
            />
          </div>
        </div>
      </div>
    </div>
  )
}