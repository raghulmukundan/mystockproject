import React, { useState, useMemo } from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'
import { DailyMoverStock } from '../services/dailyMoversApi'

interface DailyMoversTableProps {
  data: {
    sectors: Array<{
      category: string
      gainers: DailyMoverStock[]
      losers: DailyMoverStock[]
    }>
    market_caps: Array<{
      category: string
      gainers: DailyMoverStock[]
      losers: DailyMoverStock[]
    }>
  }
}

type SortField = 'symbol' | 'sector' | 'marketCap' | 'change' | 'volume' | 'price'
type SortDirection = 'asc' | 'desc'
type FilterType = 'all' | 'gainers' | 'losers'
type MarketCapFilter = 'all' | 'mega' | 'large' | 'mid' | 'small' | 'micro'

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

const formatMarketCap = (marketCap: number): string => {
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(1)}M`
  return `$${marketCap.toFixed(0)}`
}

const formatVolume = (volume: number): string => {
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`
  return volume.toString()
}

const getMarketCapLabel = (category: string): string => {
  const labels: Record<string, string> = {
    'mega': 'Mega Cap ($200B+)',
    'large': 'Large Cap ($10B-$200B)',
    'mid': 'Mid Cap ($2B-$10B)',
    'small': 'Small Cap ($300M-$2B)',
    'micro': 'Micro Cap (<$300M)',
    'unknown': 'Unknown'
  }
  return labels[category] || category
}

const getMarketCapBadgeColor = (category: string): string => {
  const colors: Record<string, string> = {
    'mega': 'bg-purple-100 text-purple-800',
    'large': 'bg-blue-100 text-blue-800',
    'mid': 'bg-green-100 text-green-800',
    'small': 'bg-yellow-100 text-yellow-800',
    'micro': 'bg-orange-100 text-orange-800',
    'unknown': 'bg-gray-100 text-gray-800'
  }
  return colors[category] || 'bg-gray-100 text-gray-800'
}

const DailyMoversTable: React.FC<DailyMoversTableProps> = ({ data }) => {
  const [sortField, setSortField] = useState<SortField>('change')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [marketCapFilter, setMarketCapFilter] = useState<MarketCapFilter>('all')
  const [sectorFilter, setSectorFilter] = useState<string>('all')

  // Flatten all stocks into a single array with proper deduplication
  const allStocks = useMemo(() => {
    const stockMap = new Map<string, DailyMoverStock & {
      marketCapCategory: string
      marketCapLabel: string
      isGainer: boolean
    }>()

    // Add sector-based stocks first (they take priority)
    data.sectors.forEach(sector => {
      sector.gainers.forEach(stock => {
        if (!stockMap.has(stock.symbol)) {
          stockMap.set(stock.symbol, {
            ...stock,
            marketCapCategory: stock.market_cap_category || 'unknown',
            marketCapLabel: getMarketCapLabel(stock.market_cap_category || 'unknown'),
            isGainer: true
          })
        }
      })
      sector.losers.forEach(stock => {
        if (!stockMap.has(stock.symbol)) {
          stockMap.set(stock.symbol, {
            ...stock,
            marketCapCategory: stock.market_cap_category || 'unknown',
            marketCapLabel: getMarketCapLabel(stock.market_cap_category || 'unknown'),
            isGainer: false
          })
        }
      })
    })

    // Add market cap stocks only if they weren't already added via sectors
    data.market_caps.forEach(marketCap => {
      marketCap.gainers.forEach(stock => {
        if (!stockMap.has(stock.symbol)) {
          stockMap.set(stock.symbol, {
            ...stock,
            marketCapCategory: marketCap.category,
            marketCapLabel: getMarketCapLabel(marketCap.category),
            isGainer: true
          })
        }
      })
      marketCap.losers.forEach(stock => {
        if (!stockMap.has(stock.symbol)) {
          stockMap.set(stock.symbol, {
            ...stock,
            marketCapCategory: marketCap.category,
            marketCapLabel: getMarketCapLabel(marketCap.category),
            isGainer: false
          })
        }
      })
    })

    return Array.from(stockMap.values())
  }, [data])

  // Get unique sectors for filter dropdown
  const uniqueSectors = useMemo(() => {
    const sectors = new Set(allStocks.map(stock => stock.sector).filter(Boolean))
    return Array.from(sectors).sort()
  }, [allStocks])

  // Filter and sort stocks
  const filteredAndSortedStocks = useMemo(() => {
    let filtered = allStocks

    // Apply filters
    if (filterType === 'gainers') {
      filtered = filtered.filter(stock => stock.isGainer)
    } else if (filterType === 'losers') {
      filtered = filtered.filter(stock => !stock.isGainer)
    }

    if (marketCapFilter !== 'all') {
      filtered = filtered.filter(stock => stock.marketCapCategory === marketCapFilter)
    }

    if (sectorFilter !== 'all') {
      filtered = filtered.filter(stock => stock.sector === sectorFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortField) {
        case 'symbol':
          aValue = a.symbol
          bValue = b.symbol
          break
        case 'sector':
          aValue = a.sector || ''
          bValue = b.sector || ''
          break
        case 'marketCap':
          aValue = a.market_cap || 0
          bValue = b.market_cap || 0
          break
        case 'change':
          aValue = a.price_change_percent
          bValue = b.price_change_percent
          break
        case 'volume':
          aValue = a.volume
          bValue = b.volume
          break
        case 'price':
          aValue = a.close_price
          bValue = b.close_price
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [allStocks, sortField, sortDirection, filterType, marketCapFilter, sectorFilter])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const SortHeader: React.FC<{ field: SortField; children: React.ReactNode }> = ({ field, children }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ?
            <ChevronUpIcon className="w-4 h-4" /> :
            <ChevronDownIcon className="w-4 h-4" />
        )}
      </div>
    </th>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Daily Market Movers</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredAndSortedStocks.length} stocks • Professional monitoring view
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {/* Gainer/Loser Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Movers</option>
              <option value="gainers">Gainers Only</option>
              <option value="losers">Losers Only</option>
            </select>

            {/* Market Cap Filter */}
            <select
              value={marketCapFilter}
              onChange={(e) => setMarketCapFilter(e.target.value as MarketCapFilter)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Market Caps</option>
              <option value="mega">Mega Cap ($200B+)</option>
              <option value="large">Large Cap ($10B-$200B)</option>
              <option value="mid">Mid Cap ($2B-$10B)</option>
              <option value="small">Small Cap ($300M-$2B)</option>
              <option value="micro">Micro Cap (&lt;$300M)</option>
            </select>

            {/* Sector Filter */}
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sectors</option>
              {uniqueSectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader field="symbol">Symbol</SortHeader>
              <SortHeader field="sector">Sector</SortHeader>
              <SortHeader field="marketCap">Market Cap</SortHeader>
              <SortHeader field="price">Price</SortHeader>
              <SortHeader field="change">Change</SortHeader>
              <SortHeader field="volume">Volume</SortHeader>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trend
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedStocks.map((stock) => (
              <tr key={stock.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{stock.symbol}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{stock.sector || 'Unknown'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getMarketCapBadgeColor(stock.marketCapCategory)}`}>
                    {stock.marketCapCategory.toUpperCase()}
                  </span>
                  {stock.market_cap && (
                    <div className="text-xs text-gray-500 mt-1">
                      {formatMarketCap(stock.market_cap)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {formatPrice(stock.close_price)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`text-sm font-medium ${stock.isGainer ? 'text-green-600' : 'text-red-600'}`}>
                    {stock.isGainer ? '+' : ''}{stock.price_change_percent.toFixed(2)}%
                  </div>
                  <div className={`text-xs ${stock.isGainer ? 'text-green-500' : 'text-red-500'}`}>
                    {stock.isGainer ? '+' : ''}{formatPrice(stock.price_change)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{formatVolume(stock.volume)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    stock.isGainer ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {stock.isGainer ? (
                      <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowTrendingDownIcon className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedStocks.length === 0 && (
        <div className="text-center py-12">
          <FunnelIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No stocks match your filters</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your filter criteria to see more results.
          </p>
        </div>
      )}
    </div>
  )
}

export default DailyMoversTable