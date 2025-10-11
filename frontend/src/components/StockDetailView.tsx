import { useState, useEffect } from 'react'
import {
  XMarkIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  NewspaperIcon,
  BuildingOfficeIcon,
  ChartPieIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { screenerApi, ScreenerResult } from '../services/screenerApi'
import TradingViewWidget from './TradingViewWidget'
import StockNewsWidget from './StockNewsWidget'
import FinancialWidget from './FinancialWidget'

interface StockDetailViewProps {
  symbol: string
  isOpen: boolean
  onClose: () => void
  priceData?: any
  entryPrice?: number
  targetPrice?: number
  stopLoss?: number
  onSaveNotes?: (notes: string) => void
  onAddAlert?: () => void
  onAddToWatchlist?: () => void
}

export default function StockDetailView({
  symbol,
  isOpen,
  onClose,
}: StockDetailViewProps) {
  const [screenerData, setScreenerData] = useState<ScreenerResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'chart' | 'news' | 'fundamentals' | 'technical' | 'company'>('chart')

  useEffect(() => {
    if (isOpen) {
      loadScreenerData()
    }
  }, [isOpen, symbol])

  const loadScreenerData = async () => {
    try {
      setLoading(true)
      const data = await screenerApi.querySymbol(symbol)
      if (data.results.length > 0) {
        setScreenerData(data.results[0])
      }
    } catch (error) {
      console.error('Error fetching screener data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Helper to get market cap badge
  const getMarketCapBadge = (category: string | null) => {
    if (!category) return null
    const cap = category.toLowerCase()
    if (cap.includes('mega')) return { label: 'Mega Cap', color: 'bg-emerald-100 text-emerald-700' }
    if (cap.includes('large')) return { label: 'Large Cap', color: 'bg-blue-100 text-blue-700' }
    if (cap.includes('mid')) return { label: 'Mid Cap', color: 'bg-purple-100 text-purple-700' }
    if (cap.includes('small')) return { label: 'Small Cap', color: 'bg-orange-100 text-orange-700' }
    if (cap.includes('micro')) return { label: 'Micro Cap', color: 'bg-gray-100 text-gray-700' }
    return null
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-gray-900">
      {/* Modern Full-Screen Layout */}
      <div className="h-screen flex flex-col">
        {/* Top Header Bar - Slim & Modern */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-white">{symbol}</h2>
            {screenerData && (
              <>
                <div className="text-3xl font-bold text-white">
                  ${screenerData.close ? parseFloat(screenerData.close.toString()).toFixed(2) : 'N/A'}
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  {screenerData.sector && (
                    <span className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs">
                      {screenerData.sector}
                    </span>
                  )}
                  {getMarketCapBadge(screenerData.market_cap_category) && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getMarketCapBadge(screenerData.market_cap_category)?.color}`}>
                      {getMarketCapBadge(screenerData.market_cap_category)?.label}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    screenerData.asset_type?.toLowerCase() === 'etf' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {screenerData.asset_type?.toLowerCase() === 'etf' ? 'ETF' : 'Stock'}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Main Content Area - 2 Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Scores & Signals (Fixed Width) */}
          <div className="w-80 bg-slate-800 border-r border-slate-700 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4 text-slate-400">Loading data...</p>
              </div>
            ) : screenerData ? (
              <div className="p-3 space-y-2">
                {/* Score Cards - Compact Single Row */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Scores</h3>
                  <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-700">
                    {/* Grid layout - 3 scores side by side */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 mb-0.5">Daily</div>
                        <div className="text-sm font-bold text-blue-400">{screenerData.trend_score_d ?? 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-slate-400 mb-0.5">Weekly</div>
                        <div className="text-sm font-bold text-indigo-400">{screenerData.trend_score_w ?? 0}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-purple-300 font-semibold mb-0.5">Total</div>
                        <div className="text-base font-bold text-purple-300">{screenerData.combined_score ?? 0}</div>
                      </div>
                    </div>
                    {/* Single combined progress bar */}
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-400 rounded-full"
                        style={{ width: `${((screenerData.combined_score ?? 0) / 125) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Signals - Compact 2 Column Layout */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Signals</h3>
                  <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-700">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {/* Daily Signals */}
                      {screenerData.price_above_200 && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">200 SMA</span>
                        </div>
                      )}
                      {screenerData.sma_bull_stack && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">Bull Stack</span>
                        </div>
                      )}
                      {screenerData.macd_cross_up && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-violet-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">MACD↑</span>
                        </div>
                      )}
                      {screenerData.donch20_breakout && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">Donch</span>
                        </div>
                      )}
                      {screenerData.high_tight_zone && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-rose-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">HTZ</span>
                        </div>
                      )}
                      {/* Weekly Signals */}
                      {screenerData.close_above_30w && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">30w SMA</span>
                        </div>
                      )}
                      {screenerData.stack_10_30_40 && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-sky-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">Wk Stack</span>
                        </div>
                      )}
                      {screenerData.macd_w_cross_up && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-violet-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">MACD↑W</span>
                        </div>
                      )}
                      {screenerData.donch20w_breakout && (
                        <div className="flex items-center space-x-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0"></div>
                          <span className="text-[11px] text-slate-300">DonchW</span>
                        </div>
                      )}
                    </div>
                    {!screenerData.price_above_200 && !screenerData.sma_bull_stack && !screenerData.macd_cross_up &&
                     !screenerData.donch20_breakout && !screenerData.high_tight_zone && !screenerData.close_above_30w &&
                     !screenerData.stack_10_30_40 && !screenerData.macd_w_cross_up && !screenerData.donch20w_breakout && (
                      <span className="text-xs text-slate-500 italic">No signals</span>
                    )}
                  </div>
                </div>

                {/* Key Metrics & Alerts Combined */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Metrics</h3>
                  <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-700 space-y-1">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-400">RSI</span>
                        <span className="text-[11px] font-medium text-slate-200">
                          {screenerData.rsi14 ? parseFloat(screenerData.rsi14.toString()).toFixed(1) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-400">ADX</span>
                        <span className="text-[11px] font-medium text-slate-200">
                          {screenerData.adx14 ? parseFloat(screenerData.adx14.toString()).toFixed(1) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-400">Vol</span>
                        <span className="text-[11px] font-medium text-slate-200">
                          {screenerData.rel_volume ? parseFloat(screenerData.rel_volume.toString()).toFixed(1) + 'x' : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-400">52w</span>
                        <span className={`text-[11px] font-medium ${
                          screenerData.pct_from_52w_high && parseFloat(screenerData.pct_from_52w_high.toString()) >= -5
                            ? 'text-emerald-400'
                            : 'text-slate-200'
                        }`}>
                          {screenerData.pct_from_52w_high !== null && screenerData.pct_from_52w_high !== undefined
                            ? parseFloat(screenerData.pct_from_52w_high.toString()).toFixed(1) + '%'
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                    {screenerData.daily_notes && (
                      <div className="pt-1.5 mt-1.5 border-t border-amber-700/30">
                        <p className="text-[11px] text-amber-300 leading-tight">⚠️ {screenerData.daily_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-slate-400">No data available</p>
              </div>
            )}
          </div>

          {/* Right Content Area - Chart/News/Fundamentals */}
          <div className="flex-1 flex flex-col bg-slate-900">
            {/* Tab Navigation */}
            <div className="bg-slate-800 border-b border-slate-700 px-6 flex space-x-1">
              <button
                onClick={() => setActiveView('chart')}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeView === 'chart'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <ChartBarIcon className="h-4 w-4" />
                  <span>Chart</span>
                </div>
                {activeView === 'chart' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveView('news')}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeView === 'news'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <NewspaperIcon className="h-4 w-4" />
                  <span>News</span>
                </div>
                {activeView === 'news' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveView('technical')}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeView === 'technical'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <ChartPieIcon className="h-4 w-4" />
                  <span>Technical</span>
                </div>
                {activeView === 'technical' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveView('fundamentals')}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeView === 'fundamentals'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BuildingOfficeIcon className="h-4 w-4" />
                  <span>Financials</span>
                </div>
                {activeView === 'fundamentals' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
              <button
                onClick={() => setActiveView('company')}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeView === 'company'
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <DocumentTextIcon className="h-4 w-4" />
                  <span>Company</span>
                </div>
                {activeView === 'company' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
                )}
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto bg-slate-900">
              {activeView === 'chart' && (
                <div className="h-full p-4">
                  <div className="rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
                    <iframe
                      src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${symbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget&utm_campaign=chart&utm_term=${symbol}`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title={`${symbol} Chart`}
                    />
                  </div>
                </div>
              )}

              {activeView === 'news' && (
                <div className="h-full p-4">
                  <div className="h-full">
                    <StockNewsWidget symbol={symbol} height="100%" />
                  </div>
                </div>
              )}

              {activeView === 'technical' && (
                <div className="h-full p-4">
                  {/* TradingView Technical Analysis Widget */}
                  <div className="rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
                    <iframe
                      src={`https://s.tradingview.com/embed-widget/technical-analysis/?locale=en&symbol=${symbol}&colorTheme=dark&isTransparent=false&largeChartUrl=&width=100%25&height=100%25&interval=1D&utm_source=localhost&utm_medium=widget&utm_campaign=technical-analysis`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title={`${symbol} Technical Analysis`}
                    />
                  </div>
                </div>
              )}

              {activeView === 'fundamentals' && (
                <div className="h-full p-4">
                  {/* TradingView Financials Widget - Income Statement, Balance Sheet, Cash Flow */}
                  <div className="rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
                    <iframe
                      src={`https://s.tradingview.com/embed-widget/financials/?locale=en&symbol=${symbol}&colorTheme=dark&isTransparent=false&largeChartUrl=&displayMode=regular&width=100%25&height=100%25#%7B%22symbol%22%3A%22${symbol}%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Afalse%2C%22largeChartUrl%22%3A%22%22%2C%22displayMode%22%3A%22regular%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22locale%22%3A%22en%22%7D`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title={`${symbol} Financials`}
                    />
                  </div>
                </div>
              )}

              {activeView === 'company' && (
                <div className="h-full p-4">
                  {/* TradingView Company Profile Widget */}
                  <div className="rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
                    <iframe
                      src={`https://s.tradingview.com/embed-widget/symbol-profile/?locale=en&symbol=${symbol}&colorTheme=dark&isTransparent=false&largeChartUrl=&width=100%25&height=100%25&utm_source=localhost&utm_medium=widget&utm_campaign=symbol-profile`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title={`${symbol} Company Profile`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
