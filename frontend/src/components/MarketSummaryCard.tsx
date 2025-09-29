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
    <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-xl shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Daily Market Movers</h2>
          <div className="flex items-center mt-2 text-blue-100">
            <CalendarIcon className="w-4 h-4 mr-2" />
            <span className="text-sm">{formatDate(date)}</span>
          </div>
        </div>
        <div className="bg-white bg-opacity-20 rounded-full p-3">
          <ChartBarIcon className="w-8 h-8" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Total Movers */}
        <div className="text-center">
          <div className="text-3xl font-bold mb-1">{totalMovers}</div>
          <div className="text-blue-100 text-sm">Total Movers</div>
        </div>

        {/* Gainers */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <ArrowTrendingUpIcon className="w-6 h-6 text-green-300 mr-1" />
            <span className="text-3xl font-bold text-green-300">{totalGainers}</span>
          </div>
          <div className="text-green-200 text-sm">
            Gainers ({gainersPercentage.toFixed(1)}%)
          </div>
        </div>

        {/* Losers */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <ArrowTrendingDownIcon className="w-6 h-6 text-red-300 mr-1" />
            <span className="text-3xl font-bold text-red-300">{totalLosers}</span>
          </div>
          <div className="text-red-200 text-sm">
            Losers ({losersPercentage.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex justify-between text-sm text-blue-100 mb-2">
          <span>Market Sentiment</span>
          <span>{gainersPercentage > losersPercentage ? 'Bullish' : 'Bearish'}</span>
        </div>
        <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
          <div
            className="bg-green-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${gainersPercentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}

export default MarketSummaryCard