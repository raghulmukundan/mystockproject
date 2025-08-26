import { useState, useEffect, useMemo } from 'react'
import { 
  ChartBarIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  TrophyIcon,
  XMarkIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  InformationCircleIcon,
  ClockIcon,
  PlusIcon,
  MinusIcon,
  BellAlertIcon,
  ArrowUturnLeftIcon,
  ShareIcon,
  BookmarkIcon
} from '@heroicons/react/24/outline'
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid'
import { stockApi, StockPrice } from '../services/stockApi'
import FinancialWidget from './FinancialWidget'
import TradingViewWidget from './TradingViewWidget'

interface StockDetailViewProps {
  symbol: string
  isOpen: boolean
  onClose: () => void
  priceData?: StockPrice
  entryPrice?: number
  targetPrice?: number
  stopLoss?: number
  onSaveNotes?: (notes: string) => void
  onAddAlert?: () => void
  onAddToWatchlist?: () => void
}

type Tab = 'overview' | 'chart' | 'fundamentals' | 'technical' | 'profile' | 'news' | 'alerts' | 'notes'

export default function StockDetailView({
  symbol,
  isOpen,
  onClose,
  priceData,
  entryPrice,
  targetPrice,
  stopLoss,
  onSaveNotes,
  onAddAlert,
  onAddToWatchlist
}: StockDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [price, setPrice] = useState<StockPrice | undefined>(priceData)
  const [loading, setLoading] = useState(!priceData)
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [dateRange, setDateRange] = useState<'1D' | '5D' | '1M' | '3M' | '6M' | '12M' | '60M' | 'ALL'>('6M')
  
  useEffect(() => {
    if (isOpen && !priceData) {
      fetchPriceData()
    } else if (priceData) {
      setPrice(priceData)
    }
    
    // Check if this stock is a favorite
    const savedFavorites = localStorage.getItem('favoriteStocks')
    if (savedFavorites) {
      try {
        const favorites = JSON.parse(savedFavorites)
        setIsFavorite(favorites.includes(symbol))
      } catch (e) {
        console.error('Failed to parse favorite stocks', e)
      }
    }
    
    // Load saved notes for this symbol
    const savedStockNotes = localStorage.getItem(`stockNotes_${symbol}`)
    if (savedStockNotes) {
      setNotes(savedStockNotes)
      setSavedNotes(savedStockNotes)
    }
  }, [isOpen, symbol, priceData])
  
  const fetchPriceData = async () => {
    try {
      setLoading(true)
      const data = await stockApi.getStockPrice(symbol)
      setPrice(data)
    } catch (error) {
      console.error('Error fetching stock price:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const toggleFavorite = () => {
    const savedFavorites = localStorage.getItem('favoriteStocks')
    let favorites: string[] = []
    
    if (savedFavorites) {
      try {
        favorites = JSON.parse(savedFavorites)
      } catch (e) {
        console.error('Failed to parse favorite stocks', e)
      }
    }
    
    if (isFavorite) {
      favorites = favorites.filter(s => s !== symbol)
    } else {
      favorites.push(symbol)
    }
    
    localStorage.setItem('favoriteStocks', JSON.stringify(favorites))
    setIsFavorite(!isFavorite)
  }
  
  const handleSaveNotes = () => {
    localStorage.setItem(`stockNotes_${symbol}`, notes)
    setSavedNotes(notes)
    
    if (onSaveNotes) {
      onSaveNotes(notes)
    }
  }
  
  const performance = useMemo(() => {
    if (!price || !entryPrice) return null
    
    const gainLoss = price.current_price - entryPrice
    const gainLossPercent = (gainLoss / entryPrice) * 100
    
    return {
      gainLoss: Number(gainLoss.toFixed(2)),
      gainLossPercent: Number(gainLossPercent.toFixed(2)),
      toTarget: targetPrice ? Number(((targetPrice - price.current_price) / price.current_price * 100).toFixed(2)) : null,
      toStopLoss: stopLoss ? Number(((price.current_price - stopLoss) / price.current_price * 100).toFixed(2)) : null,
      riskRewardRatio: (targetPrice && stopLoss && price.current_price) 
        ? Number((Math.abs(targetPrice - price.current_price) / Math.abs(price.current_price - stopLoss)).toFixed(2))
        : null
    }
  }, [price, entryPrice, targetPrice, stopLoss])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen text-center md:block md:px-2 lg:px-4">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal container */}
        <div className="flex text-base text-left transform transition w-full md:inline-block md:max-w-7xl md:px-4 md:my-8 md:align-middle">
          <div className="w-full relative bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold">{symbol}</h2>
                <button
                  onClick={toggleFavorite}
                  className={`text-white hover:text-yellow-300 transition-colors`}
                >
                  {isFavorite ? <BookmarkIconSolid className="h-6 w-6 text-yellow-300" /> : <BookmarkIcon className="h-6 w-6" />}
                </button>
                {price && (
                  <div className="flex items-center space-x-3">
                    <div className="text-xl font-bold">${price.current_price.toFixed(2)}</div>
                    <div className={`flex items-center space-x-1 text-sm font-medium ${
                      price.change >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      <span>{price.change >= 0 ? '+' : ''}{price.change.toFixed(2)}</span>
                      <span>({price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%)</span>
                      {price.change >= 0 ? (
                        <ArrowUpIcon className="h-4 w-4" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={onAddToWatchlist}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-3 py-1.5 text-sm font-medium flex items-center"
                  title="Add to watchlist"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add to Watchlist
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-200 hover:text-white"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="bg-gray-100 border-b border-gray-200 px-6">
              <div className="flex overflow-x-auto hide-scrollbar">
                <nav className="flex space-x-4">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'overview' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('chart')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'chart' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => setActiveTab('technical')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'technical' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Technical
                  </button>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'profile' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => setActiveTab('fundamentals')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'fundamentals' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Fundamentals
                  </button>
                  <button
                    onClick={() => setActiveTab('news')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'news' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    News
                  </button>
                  <button
                    onClick={() => setActiveTab('alerts')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'alerts' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Alerts
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'notes' 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Notes
                  </button>
                </nav>
              </div>
            </div>
            
            {/* Content */}
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              {activeTab === 'overview' && (
                <div className="p-6">
                  {/* Overview Layout - Simplified with chart and position summary only */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Price Chart - Spans 2 columns on medium screens, full width on small */}
                    <div className="md:col-span-2">
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                          <h3 className="text-lg font-medium text-gray-900">Price Chart</h3>
                          <div className="flex items-center space-x-1 overflow-x-auto hide-scrollbar">
                            {['1D', '5D', '1M', '3M', '6M', '12M', 'ALL'].map((range) => (
                              <button
                                key={range}
                                onClick={() => setDateRange(range as any)}
                                className={`px-2 py-1 rounded text-xs ${
                                  dateRange === range 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {range}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 h-72">
                          <TradingViewWidget
                            symbol={symbol}
                            height="100%"
                            width="100%"
                            colorTheme="light"
                            chartOnly={false}
                            dateRange={dateRange}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Position Summary - Single column */}
                    <div className="md:col-span-1">
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
                        <div className="px-4 py-3 border-b border-gray-200">
                          <h3 className="text-lg font-medium text-gray-900">Position Summary</h3>
                        </div>
                        <div className="p-4 space-y-3">
                          {price && (
                            <>
                              {/* Current Price */}
                              <div>
                                <div className="text-sm font-medium text-gray-500 mb-1">Current Price</div>
                                <div className="flex items-center justify-between">
                                  <div className="text-lg font-medium text-gray-900">${price.current_price.toFixed(2)}</div>
                                  <div className={`text-sm font-medium ${price.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {price.change >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                  </div>
                                </div>
                              </div>
                              
                              {/* Volume */}
                              <div>
                                <div className="text-sm font-medium text-gray-500 mb-1">Volume</div>
                                <div className="text-base text-gray-900">{price.volume.toLocaleString()}</div>
                              </div>
                              
                              {/* 52-Week Range */}
                              {(price.high_52w || price.low_52w) && (
                                <div>
                                  <div className="text-sm font-medium text-gray-500 mb-1">52-Week Range</div>
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-900">
                                      <span className="text-red-600 font-medium">L:</span> ${price.low_52w ? Number(price.low_52w).toFixed(2) : '—'}
                                    </div>
                                    <div className="text-sm text-gray-900">
                                      <span className="text-green-600 font-medium">H:</span> ${price.high_52w ? Number(price.high_52w).toFixed(2) : '—'}
                                    </div>
                                  </div>
                                  {price.current_price && price.high_52w && price.low_52w && (
                                    <div className="mt-1">
                                      <div className="relative pt-1">
                                        <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
                                          <div 
                                            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600"
                                            style={{ 
                                              width: `${Math.max(0, Math.min(100, ((price.current_price - price.low_52w) / (price.high_52w - price.low_52w) * 100)))}%`
                                            }}
                                          ></div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {/* Period Changes */}
                              <div>
                                <div className="text-sm font-medium text-gray-500 mb-1">Period Changes</div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-gray-50 p-2 rounded">
                                    <div className="text-xs text-gray-500">1D</div>
                                    <div className={`text-sm font-medium ${price.change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {price.change_percent >= 0 ? '+' : ''}{price.change_percent.toFixed(2)}%
                                    </div>
                                  </div>
                                  {price.change_week !== undefined && (
                                    <div className="bg-gray-50 p-2 rounded">
                                      <div className="text-xs text-gray-500">1W</div>
                                      <div className={`text-sm font-medium ${price.change_week >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {price.change_week >= 0 ? '+' : ''}{price.change_week.toFixed(2)}%
                                      </div>
                                    </div>
                                  )}
                                  {price.change_month !== undefined && (
                                    <div className="bg-gray-50 p-2 rounded">
                                      <div className="text-xs text-gray-500">1M</div>
                                      <div className={`text-sm font-medium ${price.change_month >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {price.change_month >= 0 ? '+' : ''}{price.change_month.toFixed(2)}%
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                          
                          {/* Entry Position */}
                          {entryPrice && (
                            <div>
                              <div className="text-sm font-medium text-gray-500 mb-1">Your Position</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-gray-50 p-2 rounded">
                                  <div className="text-xs text-gray-500">Entry</div>
                                  <div className="text-sm font-medium text-gray-900">
                                    ${typeof entryPrice === 'number' ? entryPrice.toFixed(2) : '0.00'}
                                  </div>
                                </div>
                                {performance && (
                                  <div className="bg-gray-50 p-2 rounded">
                                    <div className="text-xs text-gray-500">P&L</div>
                                    <div className={`text-sm font-medium ${performance.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {performance.gainLossPercent >= 0 ? '+' : ''}{performance.gainLossPercent.toFixed(2)}%
                                    </div>
                                  </div>
                                )}
                                {targetPrice && (
                                  <div className="bg-gray-50 p-2 rounded">
                                    <div className="text-xs text-gray-500">Target</div>
                                    <div className="text-sm font-medium text-green-600">
                                      ${typeof targetPrice === 'number' ? targetPrice.toFixed(2) : '0.00'}
                                    </div>
                                  </div>
                                )}
                                {stopLoss && (
                                  <div className="bg-gray-50 p-2 rounded">
                                    <div className="text-xs text-gray-500">Stop</div>
                                    <div className="text-sm font-medium text-red-600">
                                      ${typeof stopLoss === 'number' ? stopLoss.toFixed(2) : '0.00'}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {price && targetPrice && stopLoss && performance?.riskRewardRatio && (
                                <div className="mt-2 p-2 bg-gray-50 rounded">
                                  <div className="text-xs text-gray-500">Risk/Reward Ratio</div>
                                  <div className={`text-sm font-medium ${performance.riskRewardRatio >= 2 ? 'text-green-600' : 'text-gray-900'}`}>
                                    1:{performance.riskRewardRatio}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* CTA Buttons */}
                          <div className="flex flex-col space-y-2 mt-4">
                            <button
                              onClick={onAddToWatchlist}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-sm font-medium flex items-center justify-center"
                            >
                              <PlusIcon className="h-4 w-4 mr-2" />
                              Add to Watchlist
                            </button>
                            <button
                              onClick={onAddAlert}
                              className="w-full border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md px-4 py-2 text-sm font-medium flex items-center justify-center"
                            >
                              <BellAlertIcon className="h-4 w-4 mr-2" />
                              Create Price Alert
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'chart' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Advanced Chart</h3>
                      <div className="flex items-center space-x-2 text-sm">
                        {['1D', '5D', '1M', '3M', '6M', '12M', '60M', 'ALL'].map((range) => (
                          <button
                            key={range}
                            onClick={() => setDateRange(range as any)}
                            className={`px-2 py-1 rounded ${
                              dateRange === range 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {range}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-4" style={{ height: '350px' }}>
                      <TradingViewWidget
                        symbol={symbol}
                        height="100%"
                        width="100%"
                        colorTheme="light"
                        chartOnly={false}
                        dateRange={dateRange}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'technical' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Technical Analysis</h3>
                    </div>
                    <div className="p-4" style={{ height: '400px' }}>
                      <FinancialWidget
                        type="technical-analysis"
                        symbol={symbol}
                        height="100%"
                        width="100%"
                        colorTheme="light"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'profile' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Company Profile</h3>
                    </div>
                    <div className="p-4" style={{ height: '400px' }}>
                      <FinancialWidget
                        type="company-profile"
                        symbol={symbol}
                        height="100%"
                        width="100%"
                        colorTheme="light"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'fundamentals' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Key Financials</h3>
                      </div>
                      <div className="p-4 h-96">
                        <FinancialWidget
                          type="financials"
                          symbol={symbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
                      </div>
                      <div className="p-4 h-96">
                        <FinancialWidget
                          type="fundamental-data"
                          symbol={symbol}
                          height="100%"
                          width="100%"
                          colorTheme="light"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'news' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Recent News</h3>
                    </div>
                    <div className="p-4">
                      <div className="text-center text-gray-500 py-8">
                        <InformationCircleIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <p>News feed not available in this demo version.</p>
                        <p className="text-sm mt-2">Live news feeds require additional API subscriptions.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'alerts' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Price Alerts</h3>
                    </div>
                    <div className="p-4">
                      <div className="text-center py-6">
                        <BellAlertIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-500 mb-4">No price alerts set for {symbol}.</p>
                        <button
                          onClick={onAddAlert}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-sm font-medium inline-flex items-center"
                        >
                          <PlusIcon className="h-4 w-4 mr-2" />
                          Create New Alert
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'notes' && (
                <div className="p-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">Personal Notes</h3>
                      <div className="text-xs text-gray-500 flex items-center">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        Last saved: {savedNotes ? new Date().toLocaleString() : 'Never'}
                      </div>
                    </div>
                    <div className="p-4">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full h-64 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={`Add your personal notes about ${symbol} here...`}
                      ></textarea>
                      <div className="flex justify-end mt-4 space-x-2">
                        <button
                          onClick={() => setNotes(savedNotes)}
                          className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-md px-4 py-2 text-sm font-medium inline-flex items-center"
                          disabled={notes === savedNotes}
                        >
                          <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                          Revert
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-sm font-medium inline-flex items-center"
                          disabled={notes === savedNotes}
                        >
                          Save Notes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="bg-gray-100 px-6 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Data provided by Finnhub and TradingView
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + '/stock/' + symbol)
                    alert(`Link to ${symbol} copied to clipboard!`)
                  }}
                  className="text-gray-500 hover:text-gray-700 flex items-center text-xs"
                >
                  <ShareIcon className="h-4 w-4 mr-1" />
                  Share
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}