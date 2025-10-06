import React from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'

interface SectorSummaryGridProps {
  sectors: Array<{
    category: string
    gainers: Array<{ price_change_percent: number }>
    losers: Array<{ price_change_percent: number }>
  }>
}

const SectorSummaryGrid: React.FC<SectorSummaryGridProps> = ({ sectors }) => {
  // Calculate sector performance metrics
  const sectorMetrics = sectors.map(sector => {
    const totalGainers = sector.gainers.length
    const totalLosers = sector.losers.length
    const totalMovers = totalGainers + totalLosers

    const avgGainerChange = totalGainers > 0
      ? sector.gainers.reduce((sum, g) => sum + g.price_change_percent, 0) / totalGainers
      : 0

    const avgLoserChange = totalLosers > 0
      ? sector.losers.reduce((sum, l) => sum + l.price_change_percent, 0) / totalLosers
      : 0

    const netSentiment = totalMovers > 0 ? (totalGainers - totalLosers) / totalMovers : 0
    const gainersPercentage = totalMovers > 0 ? (totalGainers / totalMovers) * 100 : 0

    return {
      sector: sector.category,
      totalGainers,
      totalLosers,
      totalMovers,
      avgGainerChange,
      avgLoserChange,
      netSentiment,
      gainersPercentage,
      strength: avgGainerChange + Math.abs(avgLoserChange) // Activity strength
    }
  }).sort((a, b) => b.netSentiment - a.netSentiment) // Sort by sentiment

  const getSentimentColor = (sentiment: number): string => {
    if (sentiment > 0.3) return 'bg-green-500'
    if (sentiment > 0.1) return 'bg-green-400'
    if (sentiment > -0.1) return 'bg-yellow-400'
    if (sentiment > -0.3) return 'bg-red-400'
    return 'bg-red-500'
  }

  const getSentimentLabel = (sentiment: number): string => {
    if (sentiment > 0.3) return 'Very Bullish'
    if (sentiment > 0.1) return 'Bullish'
    if (sentiment > -0.1) return 'Neutral'
    if (sentiment > -0.3) return 'Bearish'
    return 'Very Bearish'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <BuildingOfficeIcon className="w-6 h-6 text-blue-600 mr-3" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Sector Performance Overview</h2>
            <p className="text-sm text-gray-600">Market sentiment by sector</p>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sectorMetrics.map((sector) => (
            <div
              key={sector.sector}
              className="relative p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
            >
              {/* Sentiment indicator */}
              <div className="absolute top-2 right-2">
                <div
                  className={`w-3 h-3 rounded-full ${getSentimentColor(sector.netSentiment)}`}
                  title={getSentimentLabel(sector.netSentiment)}
                />
              </div>

              {/* Sector name */}
              <h3 className="font-semibold text-gray-900 text-sm mb-3 pr-4">
                {sector.sector}
              </h3>

              {/* Metrics */}
              <div className="space-y-2">
                {/* Gainer/Loser counts */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-1">
                    <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">
                      {sector.totalGainers}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <ArrowTrendingDownIcon className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-600">
                      {sector.totalLosers}
                    </span>
                  </div>
                </div>

                {/* Average changes */}
                {sector.totalGainers > 0 && (
                  <div className="text-xs text-green-600">
                    Avg gain: +{sector.avgGainerChange.toFixed(1)}%
                  </div>
                )}
                {sector.totalLosers > 0 && (
                  <div className="text-xs text-red-600">
                    Avg loss: {sector.avgLoserChange.toFixed(1)}%
                  </div>
                )}

                {/* Sentiment bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Sentiment</span>
                    <span>{sector.gainersPercentage.toFixed(0)}% bulls</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all duration-300"
                      style={{ width: `${sector.gainersPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SectorSummaryGrid