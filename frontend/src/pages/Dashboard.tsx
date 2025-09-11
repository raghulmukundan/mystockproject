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
import StockDetailView from '../components/StockDetailView'
import { watchlistsApi } from '../services/api'
import { stockApi, StockPrice } from '../services/stockApi'
import { universeApi } from '../lib/universeApi'

// Major market indexes to track
const MAJOR_INDEXES = ['SPY', 'QQQ', 'DIA']

// Function to calculate real performance data
const calculateWatchlistPerformance = (watchlist: Watchlist, priceData: Record<string, StockPrice>) => {
  let totalGainLoss = 0
  let totalValue = 0
  let validItems = 0

  for (const item of watchlist.items) {
    const price = priceData[item.symbol]
    if (price) {
      totalGainLoss += price.change_percent
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

const computeLocalNext = (): Date => {
  // Fallback: compute next top-of-30-min slot in local time, or next market open
  const isOpen = isMarketOpen()
  const now = new Date()
  if (isOpen) {
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
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null)
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<string>('')

  useEffect(() => {
    loadWatchlists()
    // Fetch initial next refresh from backend
    ;(async () => {
      const next = await getServerNextRefresh()
      if (next) setNextRefresh(next)
    })()
    // Removed auto-refresh timer - let backend handle caching
  }, [])

  // Keep countdown aligned with current nextRefresh (avoid stale closure)
  useEffect(() => {
    const timer = setInterval(() => { updateCountdown() }, 1000)
    return () => clearInterval(timer)
  }, [nextRefresh])

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
    console.log('Manual refresh triggered...')
    setLastRefresh(new Date())
    setNextRefresh(getNextRefreshTime())
    
    // Manually reload watchlist prices (bypasses cache)
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
      
      // Prices will be loaded from backend cache when needed
      // No automatic price loading on page load
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
          const params = new URLSearchParams()
          batch.forEach(symbol => params.append('symbols', symbol))
          
          // Use a more compatible approach for timeouts
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout
          
          const response = await fetch(`/api/stocks/prices?${params}`, {
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

  // Define all state variables at the top level - never conditionally
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [analysisModalOpen, setAnalysisModalOpen] = useState<boolean>(false)
  
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

  // Search for stocks by symbol using universe API
  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      // Search through universe symbols
      const response = await universeApi.querySymbols({
        q: query,
        limit: 8,
        offset: 0,
        sort: 'symbol',
        order: 'asc'
      })
      
      // Extract symbols from the response
      const matches = response.items.map(item => item.symbol)
      setSearchResults(matches)
    } catch (error) {
      console.error('Failed to search symbols:', error)
      // Fallback to watchlist symbols if universe API fails
      const matches = allSymbols
        .filter(symbol => symbol.toUpperCase().includes(query.toUpperCase()))
        .slice(0, 8)
      setSearchResults(matches)
    }
  }

  // Handle stock selection
  const handleStockSelect = (symbol: string) => {
    setSelectedStock(symbol)
    setAnalysisModalOpen(true)
    setSearchQuery('')
    setSearchResults([])
  }

  // Handle Enter key press in search
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      // Select the first result
      handleStockSelect(searchResults[0])
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600">
            Welcome to your stock watchlist dashboard
          </p>
        </div>
        
        {/* Search Bar */}
        <div className="w-full max-w-md relative">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              placeholder="Search stocks by symbol..."
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
              <ul className="py-1">
                {searchResults.map((symbol) => (
                  <li 
                    key={symbol}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleStockSelect(symbol)}
                  >
                    {symbol}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Market Status Bar with Refresh Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="bg-white shadow-sm rounded-md px-3 py-2 border border-gray-200 flex-grow sm:flex-grow-0">
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
          </div>
        </div>
        
        <button
          onClick={refreshAllData}
          disabled={pricesLoading}
          className="flex items-center justify-center space-x-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:bg-blue-400"
        >
          <ArrowPathIcon className={`h-4 w-4 ${pricesLoading ? 'animate-spin' : ''}`} />
          <span>{pricesLoading ? 'Refreshing...' : 'Refresh Now'}</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Compact Market Widgets in One Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Market Indexes - Compact */}
        {majorIndexes.map((index) => (
          <div key={index.symbol} className="bg-white shadow-sm rounded-lg border border-gray-200 p-3">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h3 className="text-base font-medium text-gray-900">{index.symbol}</h3>
                <p className="text-xs text-gray-600">{index.name}</p>
              </div>
              <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
            </div>
            
            {/* Compact TradingView Widget */}
            <div className="h-36">
              <TradingViewWidget
                symbol={index.tradingViewSymbol}
                height="100%"
                width="100%"
                chartOnly={true}
                dateRange="1M"
                colorTheme="light"
                isTransparent={true}
              />
            </div>
          </div>
        ))}
        
        {/* Economic Calendar - Compact */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-base font-medium text-gray-900">Economic Calendar</h3>
            <ClockIcon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="h-36">
            <FinancialWidget
              type="economic-calendar"
              height="100%"
              width="100%"
              colorTheme="light"
            />
          </div>
        </div>
      </div>

      {/* Watchlist Quick Access and Performance Section */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Watchlists</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlists.map(watchlist => {
            const performance = calculateWatchlistPerformance(watchlist, priceData)
            const trend = performance.trend
            const performanceValue = performance.performance.toFixed(2)
            
            return (
              <Link 
                key={watchlist.id} 
                to={`/watchlists/${watchlist.id}`}
                className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-medium text-gray-900">{watchlist.name}</h3>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    trend === 'up' ? 'bg-green-100 text-green-800' : 
                    trend === 'down' ? 'bg-red-100 text-red-800' : 
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {trend === 'up' ? '+' : trend === 'down' ? '' : ''}
                    {performanceValue}%
                  </div>
                </div>
                
                <div className="mt-2 text-sm text-gray-600">
                  {watchlist.items.length} symbols
                </div>
                
                <div className="mt-3 flex flex-wrap gap-1">
                  {watchlist.items.slice(0, 5).map(item => (
                    <span 
                      key={item.symbol} 
                      className="inline-block px-2 py-1 bg-gray-200 rounded text-xs"
                    >
                      {item.symbol}
                    </span>
                  ))}
                  {watchlist.items.length > 5 && (
                    <span className="inline-block px-2 py-1 bg-gray-200 rounded text-xs">
                      +{watchlist.items.length - 5} more
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
          
          {/* Add Watchlist Link */}
          <Link 
            to="/watchlists"
            className="flex items-center justify-center h-full bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors border-2 border-dashed border-gray-300"
          >
            <div className="text-center">
              <svg className="h-8 w-8 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="mt-2 block text-sm font-medium text-gray-600">Create New Watchlist</span>
            </div>
          </Link>
        </div>
      </div>
      
      {/* Your Recent Activities */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
        
        <div className="space-y-4">
          {/* Activity item examples */}
          <div className="flex items-start">
            <div className="flex-shrink-0 bg-blue-100 rounded-full p-2">
              <ArrowPathIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">Data refreshed</p>
              <p className="text-xs text-gray-500">
                {lastRefresh.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
          
          {priceDataCount > 0 && (
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-green-100 rounded-full p-2">
                <ChartBarIcon className="h-5 w-5 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">Price data updated</p>
                <p className="text-xs text-gray-500">
                  Loaded {priceDataCount} symbols
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Stock Analysis Modal */}
      {analysisModalOpen && selectedStock && (
        <StockDetailView 
          symbol={selectedStock}
          isOpen={analysisModalOpen}
          onClose={() => {
            setAnalysisModalOpen(false)
            setSelectedStock(null)
          }}
          priceData={priceData[selectedStock]}
          entryPrice={undefined}
          targetPrice={undefined}
          stopLoss={undefined}
        />
      )}
    </div>
  )
}
