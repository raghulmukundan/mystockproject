import { useParams } from 'react-router-dom'
import StockChart from '../components/StockChart'
import { ChartData, MarkerData } from '../types'

const generateDemoData = (symbol: string): ChartData[] => {
  const basePrice = Math.random() * 100 + 50
  const data: ChartData[] = []
  
  for (let i = 0; i < 30; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    
    const volatility = Math.random() * 0.1 - 0.05
    const trend = Math.sin(i / 10) * 0.02
    const price = basePrice * (1 + trend + volatility)
    
    const open = price * (1 + (Math.random() * 0.02 - 0.01))
    const close = price * (1 + (Math.random() * 0.02 - 0.01))
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)
    
    data.push({
      time: date.toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 100000
    })
  }
  
  return data
}

export default function Chart() {
  const { symbol } = useParams<{ symbol: string }>()
  
  if (!symbol) {
    return <div>Symbol not found</div>
  }

  const chartData = generateDemoData(symbol)
  const currentPrice = chartData[chartData.length - 1].close
  
  const overlayLines = [
    { price: currentPrice * 0.95, color: '#F44336', title: 'Stop Loss' },
    { price: currentPrice * 1.1, color: '#4CAF50', title: 'Target Price' },
  ]

  const markers: MarkerData[] = [
    {
      time: chartData[Math.floor(chartData.length * 0.3)].time,
      position: 'belowBar',
      color: '#00C851',
      shape: 'arrowUp',
      text: 'Entry Signal'
    }
  ]

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{symbol}</h1>
        <p className="mt-2 text-gray-600">
          Stock chart with technical analysis overlay
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <StockChart
            data={chartData}
            overlayLines={overlayLines}
            markers={markers}
            symbol={symbol}
          />
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Stock Info</h3>
          
          <div className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Current Price</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                ${currentPrice.toFixed(2)}
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Day Change</dt>
              <dd className="mt-1 text-lg font-semibold text-green-600">
                +${(Math.random() * 5).toFixed(2)} (+{(Math.random() * 3).toFixed(1)}%)
              </dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Volume</dt>
              <dd className="mt-1 text-lg text-gray-900">
                {(Math.random() * 1000000 + 100000).toLocaleString()}
              </dd>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Price Levels</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target:</span>
                  <span className="text-green-600">${(currentPrice * 1.1).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Stop Loss:</span>
                  <span className="text-red-600">${(currentPrice * 0.95).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}