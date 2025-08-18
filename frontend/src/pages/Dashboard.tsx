import StockChart from '../components/StockChart'
import { ChartData, MarkerData } from '../types'

const demoData: ChartData[] = [
  { time: '2024-01-01', open: 150, high: 155, low: 148, close: 152 },
  { time: '2024-01-02', open: 152, high: 158, low: 151, close: 156 },
  { time: '2024-01-03', open: 156, high: 162, low: 154, close: 160 },
  { time: '2024-01-04', open: 160, high: 165, low: 158, close: 163 },
  { time: '2024-01-05', open: 163, high: 168, low: 161, close: 165 },
  { time: '2024-01-08', open: 165, high: 170, low: 163, close: 168 },
  { time: '2024-01-09', open: 168, high: 172, low: 166, close: 170 },
  { time: '2024-01-10', open: 170, high: 175, low: 168, close: 173 },
  { time: '2024-01-11', open: 173, high: 178, low: 171, close: 176 },
  { time: '2024-01-12', open: 176, high: 180, low: 174, close: 178 },
]

const demoMarkers: MarkerData[] = [
  {
    time: '2024-01-05',
    position: 'belowBar',
    color: '#00C851',
    shape: 'arrowUp',
    text: 'Buy Signal'
  },
  {
    time: '2024-01-10',
    position: 'aboveBar',
    color: '#ff4444',
    shape: 'arrowDown',
    text: 'Sell Signal'
  }
]

const overlayLines = [
  { price: 160, color: '#2196F3', title: 'Entry Price' },
  { price: 180, color: '#4CAF50', title: 'Target Price' },
  { price: 145, color: '#F44336', title: 'Stop Loss' },
]

export default function Dashboard() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to your stock watchlist dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <StockChart
            data={demoData}
            overlayLines={overlayLines}
            markers={demoMarkers}
            symbol="DEMO"
          />
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900">Quick Stats</h3>
            <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="px-4 py-5 bg-gray-50 overflow-hidden sm:p-6 rounded-lg">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Watchlists
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">
                  3
                </dd>
              </div>
              <div className="px-4 py-5 bg-gray-50 overflow-hidden sm:p-6 rounded-lg">
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Symbols
                </dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">
                  24
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
            <div className="mt-5">
              <div className="flow-root">
                <ul className="-mb-8">
                  <li>
                    <div className="relative pb-8">
                      <div className="relative flex space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                          <span className="h-4 w-4 text-white">+</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <p className="text-sm text-gray-500">
                              Added <span className="font-medium text-gray-900">AAPL</span> to Tech Stocks
                            </p>
                            <p className="mt-1 text-xs text-gray-400">2 hours ago</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li>
                    <div className="relative pb-8">
                      <div className="relative flex space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500">
                          <span className="h-4 w-4 text-white">📊</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <p className="text-sm text-gray-500">
                              Updated target price for <span className="font-medium text-gray-900">MSFT</span>
                            </p>
                            <p className="mt-1 text-xs text-gray-400">1 day ago</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}