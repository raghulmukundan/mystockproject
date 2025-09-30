import { useState, useEffect } from 'react'
import {
  ChartBarIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import TradingViewWidget from '../components/TradingViewWidget'
import FinancialWidget from '../components/FinancialWidget'
import StockDetailView from '../components/StockDetailView'
import DailyMoversTable from '../components/DailyMoversTable'
import DailyMoversHeatmap from '../components/DailyMoversHeatmap'
import MarketSummaryCard from '../components/MarketSummaryCard'
import { dailyMoversApi, DailyMoversResponse } from '../services/dailyMoversApi'
import { universeApi } from '../lib/universeApi'

export default function Dashboard() {
  const [dailyMoversData, setDailyMoversData] = useState<DailyMoversResponse | null>(null)
  const [summaryData, setSummaryData] = useState<{total_movers: number, total_gainers: number, total_losers: number} | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

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

  useEffect(() => {
    loadDailyMovers()
  }, [])

  const loadDailyMovers = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await dailyMoversApi.getLatest()
      setDailyMoversData(data)

      // Get raw summary data for accurate counts
      if (data.date) {
        const summary = await dailyMoversApi.getRawSummary(data.date)
        setSummaryData(summary)
      }

      setLastRefresh(new Date())
    } catch (err: any) {
      setError('Failed to load daily movers data. Please try again later.')
      console.error('Error loading daily movers:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadDailyMovers()
  }

  // Search functionality
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [analysisModalOpen, setAnalysisModalOpen] = useState<boolean>(false)

  // Calculate summary statistics using raw data when available
  const calculateSummaryStats = () => {
    if (summaryData) {
      return {
        totalGainers: summaryData.total_gainers,
        totalLosers: summaryData.total_losers,
        totalMovers: summaryData.total_movers
      }
    }

    if (!dailyMoversData) {
      return { totalGainers: 0, totalLosers: 0, totalMovers: 0 }
    }

    // Fallback to grouped data calculation
    let totalGainers = 0
    let totalLosers = 0

    // Count from sectors
    dailyMoversData.sectors.forEach(sector => {
      totalGainers += sector.gainers.length
      totalLosers += sector.losers.length
    })

    // Count from market caps (avoid double counting by only counting if no sectors)
    if (dailyMoversData.sectors.length === 0) {
      dailyMoversData.market_caps.forEach(marketCap => {
        totalGainers += marketCap.gainers.length
        totalLosers += marketCap.losers.length
      })
    }

    return {
      totalGainers,
      totalLosers,
      totalMovers: dailyMoversData.total_movers
    }
  }

  const summaryStats = calculateSummaryStats()
  
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
      setSearchResults([])
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Professional Market Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Advanced daily movers monitoring with sector analysis and market cap categorization
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              {/* Search Bar */}
              <div className="relative">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyPress={handleSearchKeyPress}
                    placeholder="Search stocks..."
                    className="w-64 px-4 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Market Summary Card */}
        <div className="mb-8">
          <MarketSummaryCard
            date={dailyMoversData?.date || new Date().toISOString().split('T')[0]}
            totalMovers={summaryStats.totalMovers}
            totalGainers={summaryStats.totalGainers}
            totalLosers={summaryStats.totalLosers}
            loading={loading}
          />
        </div>

        {/* Market Indexes Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {majorIndexes.map((index) => (
            <div key={index.symbol} className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{index.symbol}</h3>
                  <p className="text-sm text-gray-600">{index.name}</p>
                </div>
                <ArrowTopRightOnSquareIcon className="h-5 w-5 text-gray-400" />
              </div>

              <div className="h-40">
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

          {/* Economic Calendar */}
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Economic Calendar</h3>
              <ClockIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="h-40">
              <FinancialWidget
                type="economic-calendar"
                height="100%"
                width="100%"
                colorTheme="light"
              />
            </div>
          </div>
        </div>

        {/* Daily Movers Professional View */}
        {dailyMoversData && (
          <>
            {/* Check if we have data */}
            {(dailyMoversData.sectors.length > 0 || dailyMoversData.market_caps.length > 0) ? (
              <>
                {/* Sector & Market Cap Heatmap */}
                {(dailyMoversData.sectors.length > 0 || dailyMoversData.market_caps.length > 0) && (
                  <div className="mb-8">
                    <DailyMoversHeatmap
                      sectors={dailyMoversData.sectors}
                      marketCaps={dailyMoversData.market_caps}
                      onSelectStock={handleStockSelect}
                    />
                  </div>
                )}

                {/* Professional Sortable Table */}
                <div className="mb-8">
                  <DailyMoversTable data={dailyMoversData} />
                </div>
              </>
            ) : (
              /* No Data State */
              <div className="text-center py-12">
                <ChartBarIcon className="mx-auto h-12 w-12 text-blue-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">Sector & Market Cap Data Processing</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {summaryStats.totalMovers} daily movers have been calculated successfully!
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Sector and market cap categorization is currently being enriched with external API data.
                  The job will process market cap information from Finnhub and sector data from asset metadata.
                </p>
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-sm text-blue-800">
                    <strong>Current Data:</strong><br/>
                    ✅ {summaryStats.totalGainers} Gainers<br/>
                    ✅ {summaryStats.totalLosers} Losers<br/>
                    ⏳ Sector categorization in progress<br/>
                    ⏳ Market cap enrichment in progress
                  </p>
                </div>
              </div>
            )}
          </>
        )}
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
          priceData={undefined}
          entryPrice={undefined}
          targetPrice={undefined}
          stopLoss={undefined}
        />
      )}
    </div>
  )
}
