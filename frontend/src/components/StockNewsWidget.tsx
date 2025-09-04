import { useState, useEffect } from 'react'
import {
  NewspaperIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import axios from 'axios'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const formatNewsDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
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
    return dateString
  }
}

// Simple function to parse XML string from the RSS feeds
const parseRSSFeed = (xml: string, source: string): NewsItem[] => {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xml, 'text/xml')
    
    const items: NewsItem[] = []

    // Check for standard RSS format (Yahoo Finance uses this)
    const itemElements = xmlDoc.querySelectorAll('item')
    
    if (itemElements.length > 0) {
      itemElements.forEach(item => {
        const title = item.querySelector('title')?.textContent || ''
        const link = item.querySelector('link')?.textContent || ''
        const pubDate = item.querySelector('pubDate')?.textContent || ''
        
        if (title && link) {
          items.push({
            title,
            link,
            pubDate,
            source
          })
        }
      })
    }
    // Check for Atom format (some feeds use this)
    else {
      const entries = xmlDoc.querySelectorAll('entry')
      
      entries.forEach(entry => {
        const title = entry.querySelector('title')?.textContent || ''
        
        // In Atom, link is an attribute
        const linkElement = entry.querySelector('link')
        const link = linkElement?.getAttribute('href') || ''
        
        // Atom uses updated or published instead of pubDate
        const pubDate = entry.querySelector('updated')?.textContent || 
                        entry.querySelector('published')?.textContent || ''
        
        if (title && link) {
          items.push({
            title,
            link,
            pubDate,
            source
          })
        }
      })
    }
    
    return items
  } catch (e) {
    console.error(`Error parsing ${source} feed:`, e)
    return []
  }
}


interface StockNewsWidgetProps {
  symbol: string
  height?: string
  className?: string
}

const StockNewsWidget: React.FC<StockNewsWidgetProps> = ({ 
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
    
    let allItems: NewsItem[] = []
    
    try {
      // Using a CORS proxy to fetch Yahoo Finance RSS feed
      const yahooFinanceUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`
      const corsProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooFinanceUrl)}`
      
      try {
        const response = await axios.get(corsProxyUrl)
        
        if (response.status === 200 && response.data && response.data.contents) {
          const yahooItems = parseRSSFeed(response.data.contents, 'Yahoo Finance')
          console.log(`Fetched ${yahooItems.length} items from Yahoo Finance`)
          
          if (yahooItems.length > 0) {
            allItems = [...yahooItems]
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Yahoo Finance feed:', error)
        setError('Unable to fetch news from Yahoo Finance. Please try again later.')
      }
      
      if (allItems.length === 0) {
        setError('No news found for this stock. Please try another symbol or try again later.')
        setLoading(false)
        return
      }
      
      // Filter to last 48 hours
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      
      // Try to parse dates and filter
      const filtered = allItems.filter(item => {
        try {
          if (!item.pubDate) return true // Keep items without dates
          
          const date = new Date(item.pubDate)
          return !isNaN(date.getTime()) && date >= twoDaysAgo
        } catch (e) {
          return true // Keep items with invalid dates
        }
      })
      
      if (filtered.length === 0) {
        setError('No recent news found for this stock in the last 48 hours.')
        setLoading(false)
        return
      }
      
      // Sort by date (newest first)
      filtered.sort((a, b) => {
        try {
          const dateA = new Date(a.pubDate).getTime()
          const dateB = new Date(b.pubDate).getTime()
          return dateB - dateA
        } catch (e) {
          return 0
        }
      })
      
      setNewsItems(filtered)
    } catch (err: any) {
      console.error('Error fetching news:', err)
      setError(`Unable to fetch news: ${err.message || 'Network error. Please check your connection.'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (symbol) {
      fetchNews()
    }
  }, [symbol])
  
  // Yahoo Finance is our only source now
  const getSourceIcon = () => '🔶'
  
  return (
    <div className={`stock-news-widget bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`} style={{ height }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center">
          <NewspaperIcon className="h-5 w-5 text-blue-600 mr-2" />
          <div>
            <h3 className="text-base font-medium text-gray-900">Latest News for {symbol}</h3>
            <p className="text-xs text-gray-500">Last 48 hours</p>
          </div>
        </div>
        <button 
          onClick={fetchNews}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Refresh news"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="overflow-y-auto" style={{ height: `calc(${height} - 65px)` }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading news...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <ExclamationTriangleIcon className="h-10 w-10 text-orange-500 mb-2" />
            <p className="text-gray-600 mb-2">{error}</p>
            <button
              onClick={fetchNews}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <NewspaperIcon className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-gray-600">No news found for {symbol}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {newsItems.map((item, index) => (
              <li key={index} className="hover:bg-gray-50 transition-colors">
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">{item.title}</h4>
                      <div className="flex items-center text-xs text-gray-500">
                        <span className="flex items-center mr-3">
                          <span className="mr-1">{getSourceIcon(item.source)}</span>
                          {item.source}
                        </span>
                        <span className="flex items-center">
                          <ClockIcon className="h-3 w-3 mr-1" />
                          {formatNewsDate(item.pubDate)}
                        </span>
                      </div>
                    </div>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
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

export default StockNewsWidget