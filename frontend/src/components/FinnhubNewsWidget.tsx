import { useState, useEffect } from 'react'
import {
  NewspaperIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface NewsItem {
  category: string
  datetime: number
  headline: string
  id: number
  image: string
  related: string
  source: string
  summary: string
  url: string
}

const formatNewsDate = (timestamp: number): string => {
  try {
    const date = new Date(timestamp * 1000) // Finnhub uses Unix timestamp in seconds
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`
    } else if (diffHours > 0) {
      return `${diffHours}h ago`
    } else if (diffMins > 0) {
      return `${diffMins}m ago`
    } else {
      return 'Just now'
    }
  } catch (e) {
    return 'Unknown'
  }
}

interface FinnhubNewsWidgetProps {
  symbol: string
  height?: string
  className?: string
}

const FinnhubNewsWidget: React.FC<FinnhubNewsWidgetProps> = ({
  symbol,
  height = '400px',
  className = ''
}) => {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchNews = async () => {
    setLoading(true)
    setError('')

    try {
      // Call our backend API which proxies to Finnhub
      const response = await fetch(`/api/news/${symbol}?days=7`)

      if (!response.ok) {
        throw new Error(`Failed to fetch news: ${response.statusText}`)
      }

      const data = await response.json()

      if (!Array.isArray(data) || data.length === 0) {
        setError('No recent news found for this stock')
        setNewsItems([])
      } else {
        setNewsItems(data)
      }
    } catch (err: any) {
      console.error('Error fetching news:', err)
      setError(`Unable to fetch news: ${err.message || 'Network error'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (symbol) {
      fetchNews()
    }
  }, [symbol])

  return (
    <div className={`stock-news-widget bg-slate-900 rounded-lg border border-slate-700 overflow-hidden ${className}`} style={{ height }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center">
          <NewspaperIcon className="h-5 w-5 text-blue-400 mr-2" />
          <div>
            <h3 className="text-base font-medium text-white">Latest News for {symbol}</h3>
            <p className="text-xs text-slate-400">
              Last 7 days • Powered by Finnhub
            </p>
          </div>
        </div>
        <button
          onClick={fetchNews}
          className="text-slate-400 hover:text-slate-200 transition-colors"
          title="Refresh news"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-y-auto" style={{ height: `calc(${height} - 65px)` }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-slate-300">Loading news...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <ExclamationTriangleIcon className="h-10 w-10 text-orange-400 mb-2" />
            <p className="text-slate-300 mb-2">{error}</p>
            <button
              onClick={fetchNews}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <NewspaperIcon className="h-10 w-10 text-slate-600 mb-2" />
            <p className="text-slate-400">No news found for {symbol}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-700">
            {newsItems.map((item) => (
              <li key={item.id} className="hover:bg-slate-800 transition-colors">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4"
                >
                  <div className="flex gap-4">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.headline}
                        className="w-20 h-20 object-cover rounded flex-shrink-0"
                        onError={(e) => {
                          // Hide image if it fails to load
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-slate-100 mb-1 line-clamp-2">{item.headline}</h4>
                      {item.summary && (
                        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{item.summary}</p>
                      )}
                      <div className="flex items-center text-xs text-slate-400">
                        <span className="mr-3">{item.source}</span>
                        <span className="flex items-center">
                          <ClockIcon className="h-3 w-3 mr-1" />
                          {formatNewsDate(item.datetime)}
                        </span>
                      </div>
                    </div>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-slate-500 flex-shrink-0 mt-1" />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default FinnhubNewsWidget
