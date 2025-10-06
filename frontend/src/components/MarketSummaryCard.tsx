import React from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'

interface MarketSummaryCardProps {
  date: string
  totalMovers: number
  totalGainers: number
  totalLosers: number
  loading?: boolean
}

const MarketSummaryCard: React.FC<MarketSummaryCardProps> = ({
  date,
  totalMovers,
  totalGainers,
  totalLosers,
  loading = false
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const gainersPercentage = totalMovers > 0 ? (totalGainers / totalMovers) * 100 : 0
  const losersPercentage = totalMovers > 0 ? (totalLosers / totalMovers) * 100 : 0

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-xl shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-white bg-opacity-20 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-white bg-opacity-20 rounded w-1/2 mb-6"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <div className="h-6 bg-white bg-opacity-20 rounded mb-2"></div>
                <div className="h-4 bg-white bg-opacity-20 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-lg shadow-sm border border-slate-600 p-4">
      <div className="flex items-center justify-between">
        {/* Date */}
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-slate-300" />
          <span className="text-sm font-medium text-slate-200">{formatDate(date)}</span>
        </div>

        {/* Stats - Compact Inline */}
        <div className="flex items-center gap-6">
          {/* Total Movers */}
          <div className="flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4 text-blue-400" />
            <span className="text-lg font-bold">{totalMovers}</span>
            <span className="text-xs text-slate-300">movers</span>
          </div>

          {/* Gainers */}
          <div className="flex items-center gap-1.5">
            <ArrowTrendingUpIcon className="w-4 h-4 text-green-400" />
            <span className="text-lg font-bold text-green-400">{totalGainers}</span>
            <span className="text-xs text-green-300">({gainersPercentage.toFixed(0)}%)</span>
          </div>

          {/* Losers */}
          <div className="flex items-center gap-1.5">
            <ArrowTrendingDownIcon className="w-4 h-4 text-red-400" />
            <span className="text-lg font-bold text-red-400">{totalLosers}</span>
            <span className="text-xs text-red-300">({losersPercentage.toFixed(0)}%)</span>
          </div>

          {/* Sentiment Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
            gainersPercentage > losersPercentage
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            {gainersPercentage > losersPercentage ? '🐂 Bullish' : '🐻 Bearish'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketSummaryCard