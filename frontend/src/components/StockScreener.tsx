import { useState, useEffect, useCallback } from 'react'
import {
  FunnelIcon,
  XMarkIcon,
  ChevronUpDownIcon,
  ArrowPathIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline'
import { screenerApi, ScreenerFilters, ScreenerResult, ScreenerResponse } from '../services/screenerApi'

type SortField = 'symbol' | 'close' | 'trend_score_d' | 'trend_score_w' | 'combined_score' | 'market_cap_numeric' | 'sector'

export default function StockScreener() {
  const [filters, setFilters] = useState<ScreenerFilters>({
    page: 1,
    pageSize: 50,
    sort: 'combined_score DESC'
  })

  const [results, setResults] = useState<ScreenerResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [sortField, setSortField] = useState<SortField>('combined_score')
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC')
  const [selectedSector, setSelectedSector] = useState<string>('')

  // Load screener results
  const loadResults = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await screenerApi.query(filters)
      setResults(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load screener results')
      console.error('Screener error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  // Update filter and reset to page 1
  const updateFilter = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  // Toggle boolean filter
  const toggleFilter = (key: keyof ScreenerFilters) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key] === true ? undefined : true,
      page: 1
    }))
  }

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      page: 1,
      pageSize: 50,
      sort: 'combined_score DESC'
    })
  }

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(key => {
    if (key === 'page' || key === 'pageSize' || key === 'sort') return false
    return filters[key as keyof ScreenerFilters] !== undefined
  }).length

  // Change page
  const goToPage = (page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }

  // Handle column sorting
  const handleSort = (field: SortField) => {
    const newDirection = field === sortField && sortDirection === 'DESC' ? 'ASC' : 'DESC'
    setSortField(field)
    setSortDirection(newDirection)
    updateFilter('sort', `${field} ${newDirection}`)
  }

  // Get unique sectors from results
  const sectors = results?.results
    ? Array.from(new Set(results.results.map(r => r.sector).filter(Boolean))).sort()
    : []

  // Filter results by sector (client-side for now)
  const filteredResults = results?.results.filter(stock => {
    if (selectedSector && stock.sector !== selectedSector) return false
    return true
  }) || []

  // Helper to get market cap badge
  const getMarketCapBadge = (marketCapCategory: string | null): { label: string; color: string } | null => {
    if (!marketCapCategory) return null
    const cap = marketCapCategory.toLowerCase()
    if (cap.includes('large')) return { label: 'L', color: 'bg-blue-100 text-blue-700' }
    if (cap.includes('mid')) return { label: 'M', color: 'bg-purple-100 text-purple-700' }
    if (cap.includes('small')) return { label: 'S', color: 'bg-orange-100 text-orange-700' }
    if (cap.includes('micro')) return { label: 'XS', color: 'bg-gray-100 text-gray-700' }
    return null
  }

  // Count daily signals
  const countDailySignals = (stock: ScreenerResult): number => {
    let count = 0
    if (stock.price_above_200) count++
    if (stock.sma_bull_stack) count++
    if (stock.macd_cross_up) count++
    if (stock.donch20_breakout) count++
    if (stock.high_tight_zone) count++
    return count
  }

  // Count weekly signals
  const countWeeklySignals = (stock: ScreenerResult): number => {
    let count = 0
    if (stock.close_above_30w) count++
    if (stock.stack_10_30_40) count++
    if (stock.macd_w_cross_up) count++
    if (stock.donch20w_breakout) count++
    return count
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ChartBarIcon className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Stock Screener</h2>
              <p className="text-sm text-gray-600">
                {results?.total_count !== undefined ? `${results.total_count} stocks found` : 'Filter stocks by technicals and signals'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <XMarkIcon className="h-4 w-4 mr-1.5" />
                Clear ({activeFilterCount})
              </button>
            )}

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <FunnelIcon className="h-4 w-4 mr-1.5" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>

            <button
              onClick={loadResults}
              disabled={loading}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Price Range */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Price Range</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minPrice ?? ''}
                  onChange={(e) => updateFilter('minPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxPrice ?? ''}
                  onChange={(e) => updateFilter('maxPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Min Avg Volume */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Min Avg Volume (20d)</label>
              <input
                type="number"
                placeholder="e.g., 500000"
                value={filters.minAvgVol20 ?? ''}
                onChange={(e) => updateFilter('minAvgVol20', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Min Relative Volume */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Min Relative Volume</label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g., 1.5"
                value={filters.minRelVolume ?? ''}
                onChange={(e) => updateFilter('minRelVolume', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Max Distance to 52w High */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Max % from 52w High</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., -0.05 (within 5%)"
                value={filters.maxDistanceTo52wHigh ?? ''}
                onChange={(e) => updateFilter('maxDistanceTo52wHigh', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Asset Type Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Asset Type</label>
              <select
                value={filters.assetType || ''}
                onChange={(e) => updateFilter('assetType', e.target.value || undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="stock">Stocks Only</option>
                <option value="etf">ETFs Only</option>
              </select>
            </div>

            {/* Market Cap Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Market Cap</label>
              <select
                value={(() => {
                  const min = filters.minMarketCap
                  const max = filters.maxMarketCap
                  if (min === 10000000000) return 'large'
                  if (min === 2000000000 && max === 10000000000) return 'mid'
                  if (min === 300000000 && max === 2000000000) return 'small'
                  if (max === 300000000) return 'micro'
                  return ''
                })()}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === 'large') {
                    updateFilter('minMarketCap', 10000000000)
                    updateFilter('maxMarketCap', undefined)
                  } else if (value === 'mid') {
                    updateFilter('minMarketCap', 2000000000)
                    updateFilter('maxMarketCap', 10000000000)
                  } else if (value === 'small') {
                    updateFilter('minMarketCap', 300000000)
                    updateFilter('maxMarketCap', 2000000000)
                  } else if (value === 'micro') {
                    updateFilter('minMarketCap', undefined)
                    updateFilter('maxMarketCap', 300000000)
                  } else {
                    updateFilter('minMarketCap', undefined)
                    updateFilter('maxMarketCap', undefined)
                  }
                }}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Market Caps</option>
                <option value="large">Large Cap (&gt;$10B)</option>
                <option value="mid">Mid Cap ($2B-$10B)</option>
                <option value="small">Small Cap ($300M-$2B)</option>
                <option value="micro">Micro Cap (&lt;$300M)</option>
              </select>
            </div>

            {/* Min Daily Trend Score */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Min Daily Score (0-55)</label>
              <input
                type="number"
                placeholder="e.g., 30"
                value={filters.minTrendScoreD ?? ''}
                onChange={(e) => updateFilter('minTrendScoreD', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Min Weekly Trend Score */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Min Weekly Score (0-70)</label>
              <input
                type="number"
                placeholder="e.g., 40"
                value={filters.minTrendScoreW ?? ''}
                onChange={(e) => updateFilter('minTrendScoreW', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Sort By */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Sort By</label>
              <select
                value={filters.sort}
                onChange={(e) => updateFilter('sort', e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="combined_score DESC">Combined Score (High to Low)</option>
                <option value="trend_score_d DESC">Daily Score (High to Low)</option>
                <option value="trend_score_w DESC">Weekly Score (High to Low)</option>
                <option value="risk_reward_ratio DESC">Risk/Reward Ratio (High to Low)</option>
                <option value="rel_volume DESC">Relative Volume (High to Low)</option>
                <option value="pct_from_52w_high DESC">% from 52w High (Closest)</option>
                <option value="avg_vol20 DESC">Avg Volume (High to Low)</option>
                <option value="close DESC">Price (High to Low)</option>
                <option value="close ASC">Price (Low to High)</option>
                <option value="symbol ASC">Symbol (A-Z)</option>
              </select>
            </div>

            {/* Page Size */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Results Per Page</label>
              <select
                value={filters.pageSize}
                onChange={(e) => updateFilter('pageSize', parseInt(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            {/* Sector Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Sector</label>
              <select
                value={selectedSector || ''}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Sectors</option>
                {sectors.map(sector => (
                  <option key={sector} value={sector || ''}>{sector}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Boolean Filters - Chips */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">Signal Filters</label>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={filters.aboveSMA200 === true}
                onClick={() => toggleFilter('aboveSMA200')}
                label="Above 200 SMA"
              />
              <FilterChip
                active={filters.smaBullStack === true}
                onClick={() => toggleFilter('smaBullStack')}
                label="SMA Bull Stack"
              />
              <FilterChip
                active={filters.macdCrossUp === true}
                onClick={() => toggleFilter('macdCrossUp')}
                label="MACD Cross ↑"
              />
              <FilterChip
                active={filters.donchBreakout === true}
                onClick={() => toggleFilter('donchBreakout')}
                label="Donchian Breakout"
              />
              <FilterChip
                active={filters.weeklyStrong === true}
                onClick={() => toggleFilter('weeklyStrong')}
                label="Weekly Strong"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationCircleIcon className="h-5 w-5 text-red-600 mr-2" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Results Table */}
      {loading && !results ? (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading results...</p>
          </div>
        </div>
      ) : results && results.results.length > 0 ? (
        <>
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader field="symbol" label="Symbol" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="left" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <SortableHeader field="market_cap_numeric" label="Cap" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="left" />
                    <SortableHeader field="close" label="Price" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="right" />
                    <SortableHeader field="trend_score_d" label="Daily Score" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="right" />
                    <SortableHeader field="trend_score_w" label="Weekly Score" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="right" />
                    <SortableHeader field="combined_score" label="Combined" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="right" />
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Signals</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Weekly Signals</th>
                    <SortableHeader field="sector" label="Sector" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} align="left" />
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rel Vol</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">% from 52w</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">R/R Ratio</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredResults.map((stock) => {
                    const capBadge = getMarketCapBadge(stock.market_cap_category)
                    const dailyCount = countDailySignals(stock)
                    const weeklyCount = countWeeklySignals(stock)
                    return (
                      <tr key={stock.symbol} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">{stock.symbol}</div>
                          {stock.daily_notes && (
                            <div className="text-xs text-amber-600 mt-0.5">{stock.daily_notes}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${stock.asset_type?.toLowerCase() === 'etf' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
                            {stock.asset_type?.toUpperCase() || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {capBadge && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${capBadge.color}`} title={stock.market_cap_category || ''}>
                              {capBadge.label}
                            </span>
                          )}
                        </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                        ${stock.close ? parseFloat(stock.close.toString()).toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <ScoreBadge score={stock.trend_score_d ?? 0} maxScore={55} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <ScoreBadge score={stock.trend_score_w ?? 0} maxScore={70} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <ScoreBadge score={stock.combined_score ?? 0} maxScore={125} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm font-medium text-gray-700">{dailyCount}</span>
                          <div className="group relative inline-block">
                            <div className="flex flex-wrap gap-0.5 max-w-[120px]">
                              {stock.price_above_200 && <SignalDot color="green" title="Above 200 SMA" />}
                              {stock.sma_bull_stack && <SignalDot color="blue" title="SMA Bull Stack" />}
                              {stock.macd_cross_up && <SignalDot color="purple" title="MACD Cross Up" />}
                              {stock.donch20_breakout && <SignalDot color="orange" title="Donchian Breakout" />}
                              {stock.high_tight_zone && <SignalDot color="red" title="High-Tight Zone" />}
                            </div>
                            <div className="hidden group-hover:block absolute z-10 left-0 mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap">
                              {stock.price_above_200 && <div>• Above 200 SMA</div>}
                              {stock.sma_bull_stack && <div>• SMA Bull Stack</div>}
                              {stock.macd_cross_up && <div>• MACD Cross Up</div>}
                              {stock.donch20_breakout && <div>• Donchian Breakout</div>}
                              {stock.high_tight_zone && <div>• High-Tight Zone</div>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm font-medium text-gray-700">{weeklyCount}</span>
                          <div className="group relative inline-block">
                            <div className="flex flex-wrap gap-0.5 max-w-[100px]">
                              {stock.close_above_30w && <SignalDot color="green" title="Above 30w SMA" />}
                              {stock.stack_10_30_40 && <SignalDot color="blue" title="Weekly Stack" />}
                              {stock.macd_w_cross_up && <SignalDot color="purple" title="MACD Cross Up" />}
                              {stock.donch20w_breakout && <SignalDot color="orange" title="Donchian Breakout" />}
                            </div>
                            <div className="hidden group-hover:block absolute z-10 left-0 mt-1 p-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap">
                              {stock.close_above_30w && <div>• Above 30w SMA</div>}
                              {stock.stack_10_30_40 && <div>• Weekly Stack</div>}
                              {stock.macd_w_cross_up && <div>• MACD Cross Up</div>}
                              {stock.donch20w_breakout && <div>• Donchian Breakout</div>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-left text-xs text-gray-600">
                        {stock.sector ? (
                          <div className="max-w-[120px] truncate" title={stock.sector}>
                            {stock.sector}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        {stock.rel_volume ? (
                          <span className={parseFloat(stock.rel_volume.toString()) >= 1.5 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                            {parseFloat(stock.rel_volume.toString()).toFixed(2)}x
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        {stock.pct_from_52w_high !== null && stock.pct_from_52w_high !== undefined ? (
                          <span className={parseFloat(stock.pct_from_52w_high.toString()) >= -5 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                            {parseFloat(stock.pct_from_52w_high.toString()).toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        {stock.risk_reward_ratio !== null && stock.risk_reward_ratio !== undefined ? (
                          <span className={parseFloat(stock.risk_reward_ratio.toString()) >= 2 ? 'text-green-600 font-medium' : 'text-gray-600'}>
                            {parseFloat(stock.risk_reward_ratio.toString()).toFixed(1)}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {results.total_pages > 1 && (
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((results.page - 1) * results.page_size) + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(results.page * results.page_size, results.total_count)}</span> of{' '}
                  <span className="font-medium">{results.total_count}</span> results
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => goToPage(results.page - 1)}
                    disabled={results.page === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>

                  <div className="flex items-center space-x-1">
                    {generatePageNumbers(results.page, results.total_pages).map((pageNum, idx) => (
                      pageNum === '...' ? (
                        <span key={idx} className="px-2 text-gray-500">...</span>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => goToPage(pageNum as number)}
                          className={`px-3 py-1.5 border rounded-md text-sm font-medium ${
                            pageNum === results.page
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    ))}
                  </div>

                  <button
                    onClick={() => goToPage(results.page + 1)}
                    disabled={results.page === results.total_pages}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-12">
          <div className="text-center">
            <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No results found. Try adjusting your filters.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper Components

function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  align = 'left'
}: {
  field: SortField
  label: string
  sortField: SortField
  sortDirection: 'ASC' | 'DESC'
  onSort: (field: SortField) => void
  align?: 'left' | 'right' | 'center'
}) {
  const isActive = sortField === field
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return (
    <th
      className={`px-4 py-3 ${alignClass} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'DESC' ? (
            <ArrowDownIcon className="h-4 w-4" />
          ) : (
            <ArrowUpIcon className="h-4 w-4" />
          )
        ) : (
          <ChevronUpDownIcon className="h-4 w-4 opacity-40" />
        )}
      </div>
    </th>
  )
}

function SignalDot({ color, title }: { color: string; title: string }) {
  const colorClasses = {
    green: 'bg-emerald-500',      // Above SMA - bullish
    blue: 'bg-sky-500',            // Stack - trend alignment
    purple: 'bg-violet-500',       // MACD - momentum
    orange: 'bg-amber-500',        // Donchian - breakout
    red: 'bg-rose-500',            // HTZ - strong breakout
  }

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}
      title={title}
    />
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
      {active && <XMarkIcon className="inline-block h-4 w-4 ml-1" />}
    </button>
  )
}

function ScoreBadge({ score, maxScore }: { score: number; maxScore: number }) {
  const percentage = (score / maxScore) * 100
  let bgColor = 'bg-gray-100 text-gray-700'

  if (percentage >= 70) bgColor = 'bg-green-100 text-green-700'
  else if (percentage >= 50) bgColor = 'bg-blue-100 text-blue-700'
  else if (percentage >= 30) bgColor = 'bg-yellow-100 text-yellow-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bgColor}`}>
      {score}
    </span>
  )
}

function generatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = []

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  } else {
    pages.push(1)

    if (currentPage > 3) {
      pages.push('...')
    }

    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (currentPage < totalPages - 2) {
      pages.push('...')
    }

    pages.push(totalPages)
  }

  return pages
}
