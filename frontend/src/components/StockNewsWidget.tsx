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
  const [activeSources, setActiveSources] = useState<string[]>([])

  const fetchNews = async () => {
    setLoading(true)
    setError('')
    
    let allItems: NewsItem[] = []
    let yahooSuccess = false
    let seekingAlphaSuccess = false
    const activeSourcesList: string[] = []
    
    try {
      // Fetch Yahoo Finance RSS feed
      try {
        const yahooFinanceUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`
        const yahooProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooFinanceUrl)}`
        
        const yahooResponse = await axios.get(yahooProxyUrl)
        
        if (yahooResponse.status === 200 && yahooResponse.data && yahooResponse.data.contents) {
          const yahooItems = parseRSSFeed(yahooResponse.data.contents, 'Yahoo Finance')
          console.log(`Fetched ${yahooItems.length} items from Yahoo Finance`)
          
          if (yahooItems.length > 0) {
            allItems = [...yahooItems]
            yahooSuccess = true
            activeSourcesList.push('Yahoo Finance')
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Yahoo Finance feed:', error)
      }
      
      // Fetch Seeking Alpha RSS feed
      try {
        const seekingAlphaUrl = `https://seekingalpha.com/api/sa/combined/${symbol.toUpperCase()}.xml`
        const saProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(seekingAlphaUrl)}`
        
        const saResponse = await axios.get(saProxyUrl)
        
        if (saResponse.status === 200 && saResponse.data && saResponse.data.contents) {
          const saItems = parseRSSFeed(saResponse.data.contents, 'Seeking Alpha')
          console.log(`Fetched ${saItems.length} items from Seeking Alpha`)
          
          if (saItems.length > 0) {
            allItems = [...allItems, ...saItems]
            seekingAlphaSuccess = true
            activeSourcesList.push('Seeking Alpha')
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Seeking Alpha feed:', error)
      }
      
      // Check if any feeds were successful
      if (!yahooSuccess && !seekingAlphaSuccess) {
        setError('Unable to fetch news from any sources. Please try again later.')
        setLoading(false)
        return
      }
      
      // Check if any news items were found
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
      setActiveSources(activeSourcesList)
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
  
  // Get source icon for different news sources
  const getSourceIcon = (source: string) => {
    switch(source) {
      case 'Yahoo Finance':
        return '🔶'
      case 'Seeking Alpha':
        return '🔍'
      default:
        return '📰'
    }
  }
  
  return (
    <div className={`stock-news-widget bg-slate-900 rounded-lg border border-slate-700 overflow-hidden ${className}`} style={{ height }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center">
          <NewspaperIcon className="h-5 w-5 text-blue-400 mr-2" />
          <div>
            <h3 className="text-base font-medium text-white">Latest News for {symbol}</h3>
            <p className="text-xs text-slate-400">
              Last 48 hours
              {activeSources.length > 0 && (
                <span className="ml-2">
                  Sources: {activeSources.map((source, i) => (
                    <span key={source} className="mx-1">
                      <span className="mr-1">{getSourceIcon(source)}</span>
                      {i < activeSources.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              )}
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
            {newsItems.map((item, index) => (
              <li key={index} className="hover:bg-slate-800 transition-colors">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <h4 className="text-sm font-medium text-slate-100 mb-1 line-clamp-2">{item.title}</h4>
                      <div className="flex items-center text-xs text-slate-400">
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
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
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