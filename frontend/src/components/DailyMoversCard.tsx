import React from 'react'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'
import { DailyMoverStock } from '../services/dailyMoversApi'

interface DailyMoversCardProps {
  title: string
  category: string
  categoryType: 'sector' | 'market_cap'
  gainers: DailyMoverStock[]
  losers: DailyMoverStock[]
  className?: string
}

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

const StockRow: React.FC<{ stock: DailyMoverStock; isGainer: boolean }> = ({ stock, isGainer }) => (
  <div className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 transition-colors">
    <div className="flex items-center space-x-3">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isGainer
          ? 'bg-green-100 text-green-600'
          : 'bg-red-100 text-red-600'
      }`}>
        {isGainer ? (
          <ArrowTrendingUpIcon className="w-4 h-4" />
        ) : (
          <ArrowTrendingDownIcon className="w-4 h-4" />
        )}
      </div>

      <div>
        <div className="font-semibold text-gray-900 text-sm">{stock.symbol}</div>
        <div className="text-xs text-gray-500">
          Vol: {formatVolume(stock.volume)}
          {stock.market_cap && ` • MC: ${formatMarketCap(stock.market_cap)}`}
        </div>
      </div>
    </div>

    <div className="text-right">
      <div className="font-semibold text-sm text-gray-900">
        {formatPrice(stock.close_price)}
      </div>
      <div className={`text-sm font-medium ${
        isGainer ? 'text-green-600' : 'text-red-600'
      }`}>
        {isGainer ? '+' : ''}{stock.price_change_percent.toFixed(2)}%
      </div>
      <div className="text-xs text-gray-500">
        {isGainer ? '+' : ''}{formatPrice(stock.price_change)}
      </div>
    </div>
  </div>
)

const DailyMoversCard: React.FC<DailyMoversCardProps> = ({
  title,
  category,
  categoryType,
  gainers,
  losers,
  className = ''
}) => {
  const hasData = gainers.length > 0 || losers.length > 0

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 capitalize">
              {categoryType === 'market_cap' ? 'Market Cap' : 'Sector'}: {category}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {categoryType === 'market_cap' ? (
              <CurrencyDollarIcon className="w-5 h-5 text-blue-600" />
            ) : (
              <ChartBarIcon className="w-5 h-5 text-blue-600" />
            )}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="p-8 text-center">
          <div className="text-gray-400 mb-2">
            <ChartBarIcon className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-gray-500">No movers data available</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {/* Gainers Section */}
          {gainers.length > 0 && (
            <div>
              <div className="px-6 py-3 bg-green-50">
                <h4 className="font-medium text-green-800 flex items-center">
                  <ArrowTrendingUpIcon className="w-4 h-4 mr-2" />
                  Top Gainers ({gainers.length})
                </h4>
              </div>
              <div className="divide-y divide-gray-100">
                {gainers.slice(0, 5).map((stock) => (
                  <StockRow key={stock.id} stock={stock} isGainer={true} />
                ))}
              </div>
            </div>
          )}

          {/* Losers Section */}
          {losers.length > 0 && (
            <div>
              <div className="px-6 py-3 bg-red-50">
                <h4 className="font-medium text-red-800 flex items-center">
                  <ArrowTrendingDownIcon className="w-4 h-4 mr-2" />
                  Top Losers ({losers.length})
                </h4>
              </div>
              <div className="divide-y divide-gray-100">
                {losers.slice(0, 5).map((stock) => (
                  <StockRow key={stock.id} stock={stock} isGainer={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DailyMoversCard