import React, { useMemo } from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  FireIcon,
  ArrowDownIcon
} from '@heroicons/react/24/outline'
import { MoversGroup } from '../services/dailyMoversApi'

interface SectorPerformanceSummaryProps {
  sectors: MoversGroup[]
}

type SectorSummary = {
  name: string
  totalMovers: number
  gainers: number
  losers: number
  avgChange: number
  sentiment: 'bullish' | 'bearish' | 'neutral'
}

const SectorPerformanceSummary: React.FC<SectorPerformanceSummaryProps> = ({ sectors }) => {
  const sectorSummaries = useMemo<SectorSummary[]>(() => {
    return sectors.map(sector => {
      const totalMovers = sector.gainers.length + sector.losers.length
      const gainersCount = sector.gainers.length
      const losersCount = sector.losers.length

      // Calculate average change
      const allStocks = [...sector.gainers, ...sector.losers]
      const avgChange = allStocks.length > 0
        ? allStocks.reduce((sum, stock) => sum + stock.price_change_percent, 0) / allStocks.length
        : 0

      // Determine sentiment
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral'
      const gainersPercentage = totalMovers > 0 ? (gainersCount / totalMovers) * 100 : 0
      if (gainersPercentage > 60) sentiment = 'bullish'
      else if (gainersPercentage < 40) sentiment = 'bearish'

      return {
        name: sector.category,
        totalMovers,
        gainers: gainersCount,
        losers: losersCount,
        avgChange,
        sentiment
      }
    })
  }, [sectors])

  // Sort by average change to get best and worst performers
  const sortedByPerformance = [...sectorSummaries].sort((a, b) => b.avgChange - a.avgChange)
  const bestPerformers = sortedByPerformance.slice(0, 3)
  const worstPerformers = sortedByPerformance.slice(-3).reverse()

  const formatPercent = (value: number): string => {
    if (!Number.isFinite(value) || value === 0) return '0.0%'
    const rounded = value.toFixed(1)
    return `${value > 0 ? '+' : ''}${rounded}%`
  }

  const getSentimentColor = (sentiment: 'bullish' | 'bearish' | 'neutral') => {
    switch (sentiment) {
      case 'bullish': return 'text-green-600 bg-green-50 border-green-200'
      case 'bearish': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getSentimentIcon = (sentiment: 'bullish' | 'bearish' | 'neutral') => {
    switch (sentiment) {
      case 'bullish': return <ArrowTrendingUpIcon className="h-3 w-3" />
      case 'bearish': return <ArrowTrendingDownIcon className="h-3 w-3" />
      default: return <div className="h-3 w-3" />
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Sector Performance Overview</h2>
        <p className="text-xs text-gray-500 mt-0.5">Best and worst performing sectors by average price change</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Best Performers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FireIcon className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold text-gray-900">Top Performers</h3>
          </div>
          <div className="space-y-2">
            {bestPerformers.map((sector, idx) => (
              <div
                key={sector.name}
                className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-green-700">#{idx + 1}</span>
                      <h4 className="text-sm font-bold text-gray-900">{sector.name}</h4>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <ArrowTrendingUpIcon className="h-3 w-3 text-green-600" />
                        {sector.gainers}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowTrendingDownIcon className="h-3 w-3 text-red-500" />
                        {sector.losers}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getSentimentColor(sector.sentiment)}`}>
                        {sector.sentiment === 'bullish' && '🐂'}
                        {sector.sentiment === 'bearish' && '🐻'}
                        {sector.sentiment === 'neutral' && '—'}
                        {' '}{sector.sentiment}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-700">
                      {formatPercent(sector.avgChange)}
                    </div>
                    <div className="text-[10px] text-gray-500">{sector.totalMovers} movers</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Worst Performers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownIcon className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold text-gray-900">Worst Performers</h3>
          </div>
          <div className="space-y-2">
            {worstPerformers.map((sector, idx) => (
              <div
                key={sector.name}
                className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-lg p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-700">#{sortedByPerformance.length - idx}</span>
                      <h4 className="text-sm font-bold text-gray-900">{sector.name}</h4>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <ArrowTrendingUpIcon className="h-3 w-3 text-green-600" />
                        {sector.gainers}
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowTrendingDownIcon className="h-3 w-3 text-red-500" />
                        {sector.losers}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getSentimentColor(sector.sentiment)}`}>
                        {sector.sentiment === 'bullish' && '🐂'}
                        {sector.sentiment === 'bearish' && '🐻'}
                        {sector.sentiment === 'neutral' && '—'}
                        {' '}{sector.sentiment}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-700">
                      {formatPercent(sector.avgChange)}
                    </div>
                    <div className="text-[10px] text-gray-500">{sector.totalMovers} movers</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All Sectors Summary Table */}
      <div className="border-t border-gray-200 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">All Sectors</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {sortedByPerformance.map(sector => (
            <div
              key={sector.name}
              className="border border-gray-200 rounded-md p-2 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-gray-900 truncate">{sector.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-green-600 font-medium">↑{sector.gainers}</span>
                    <span className="text-[10px] text-red-600 font-medium">↓{sector.losers}</span>
                  </div>
                </div>
                <div className={`text-xs font-bold ${sector.avgChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatPercent(sector.avgChange)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SectorPerformanceSummary
