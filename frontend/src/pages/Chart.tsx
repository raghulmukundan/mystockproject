import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ChartBarIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { stockApi, StockPrice } from '../services/stockApi'

export default function Chart() {
  const { symbol } = useParams<{ symbol: string }>()
  const [stockPrice, setStockPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  
  useEffect(() => {
    if (symbol) {
      loadStockData()
    }
  }, [symbol])

  const loadStockData = async () => {
    if (!symbol) return
    
    try {
      setLoading(true)
      setError('')
      const data = await stockApi.getStockPrice(symbol)
      setStockPrice(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load stock data')
      console.error('Error loading stock data:', err)
    } finally {
      setLoading(false)
    }
  }
  
  if (!symbol) {
    return <div>Symbol not found</div>
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading stock data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading stock data: {error}</p>
          <button 
            onClick={loadStockData}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Generate chart links for professional charting platforms
  const chartLinks = [
    {
      name: 'TradingView',
      description: 'Professional charting with technical indicators',
      url: `https://www.tradingview.com/chart/?symbol=${symbol}`,
      color: 'blue',
      features: ['Technical Analysis', 'Advanced Indicators', 'Drawing Tools', 'Real-time Data']
    },
    {
      name: 'Yahoo Finance',
      description: 'Comprehensive financial data and charts',
      url: `https://finance.yahoo.com/quote/${symbol}/chart`,
      color: 'purple',
      features: ['Interactive Charts', 'Financial News', 'Analyst Ratings', 'Historical Data']
    },
    {
      name: 'Google Finance',
      description: 'Simple and clean charting interface',
      url: `https://www.google.com/finance/quote/${symbol}:NASDAQ`,
      color: 'green',
      features: ['Clean Interface', 'Key Statistics', 'Related News', 'Market Trends']
    },
    {
      name: 'MarketWatch',
      description: 'Market data and analysis tools',
      url: `https://www.marketwatch.com/investing/stock/${symbol}`,
      color: 'orange',
      features: ['Market Analysis', 'Earnings Data', 'Options Chain', 'Peer Comparison']
    }
  ]

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue': return 'from-blue-50 to-blue-100 border-blue-200 text-blue-700'
      case 'purple': return 'from-purple-50 to-purple-100 border-purple-200 text-purple-700'
      case 'green': return 'from-green-50 to-green-100 border-green-200 text-green-700'
      case 'orange': return 'from-orange-50 to-orange-100 border-orange-200 text-orange-700'
      default: return 'from-gray-50 to-gray-100 border-gray-200 text-gray-700'
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{symbol}</h1>
        <p className="mt-2 text-gray-600">
          Professional charting tools and analysis platforms
        </p>
      </div>

      {/* Stock Price Info */}
      {stockPrice && (
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Current Stock Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">Current Price</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                ${stockPrice.current_price.toFixed(2)}
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Day Change</dt>
              <dd className={`mt-1 text-lg font-semibold ${
                stockPrice.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {stockPrice.change >= 0 ? '+' : ''}${stockPrice.change.toFixed(2)} ({stockPrice.change_percent.toFixed(1)}%)
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Volume</dt>
              <dd className="mt-1 text-lg text-gray-900">
                {stockPrice.volume.toLocaleString()}
              </dd>
            </div>
          </div>
        </div>
      )}

      {/* Professional Charting Links */}
      <div className="mb-8">
        <div className="text-center mb-8">
          <ChartBarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Professional Charting Tools</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Access real-time charts, technical analysis, and professional trading tools from leading financial platforms.
            These platforms provide accurate, up-to-date market data with advanced charting capabilities.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {chartLinks.map((link) => (
            <div key={link.name} className={`bg-gradient-to-r ${getColorClasses(link.color)} border rounded-lg p-6 hover:shadow-lg transition-shadow`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold">{link.name}</h3>
                  <p className="text-sm opacity-80 mt-1">{link.description}</p>
                </div>
                <ArrowTopRightOnSquareIcon className="h-5 w-5 opacity-60" />
              </div>
              
              <div className="mb-4">
                <h4 className="font-medium mb-2">Key Features:</h4>
                <ul className="text-sm space-y-1">
                  {link.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <span className="w-1.5 h-1.5 bg-current rounded-full mr-2"></span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full px-4 py-2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-md font-medium transition-colors"
              >
                Open {link.name} Chart
                <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Why Professional Tools Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">Why Professional Charting Tools?</h3>
        <div className="text-blue-800 space-y-2">
          <p>
            Professional charting platforms provide real-time market data, advanced technical indicators, 
            and sophisticated analysis tools that are essential for informed trading decisions.
          </p>
          <p>
            These platforms offer features like candlestick patterns, moving averages, RSI, MACD, 
            volume analysis, and many other technical indicators that help traders analyze market trends and make better investment choices.
          </p>
        </div>
      </div>
    </div>
  )
}