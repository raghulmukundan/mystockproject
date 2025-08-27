import { useState, useEffect } from 'react'
import {
  NewspaperIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import axios from 'axios'

// RSS feed sources for stock news
// Note: These are the most reliable public RSS feeds available for stock-specific news
// Many financial sites have deprecated their public RSS feeds or implemented strict CORS policies
const NEWS_SOURCES = [
  {
    name: 'Yahoo Finance',
    getFeedUrl: (symbol: string) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`,
    logo: 'yahoo'
  },
  {
    name: 'Seeking Alpha',
    getFeedUrl: (symbol: string) => `https://seekingalpha.com/api/sa/combined/${symbol}.xml`,
    logo: 'seekingalpha'
  },
  // Alternate financial news sources that aren't stock-specific but provide market news
  {
    name: 'Benzinga',
    getFeedUrl: (symbol: string) => `https://www.benzinga.com/feed/stock?symbols=${symbol}`,
    logo: 'benzinga'
  },
  {
    name: 'Finviz',
    getFeedUrl: (symbol: string) => `https://finviz.com/quote.ashx?t=${symbol}&output=rss`,
    logo: 'finviz'
  },
  {
    name: 'Investing.com',
    getFeedUrl: (symbol: string) => `https://www.investing.com/rss/news_${symbol}.rss`,
    logo: 'investing'
  },
  {
    name: 'Nasdaq',
    getFeedUrl: (symbol: string) => `https://www.nasdaq.com/feed/rssoutbound?symbol=${symbol}`,
    logo: 'nasdaq'
  }
]

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  sourceLogo: string
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

// Function to parse RSS XML content
const parseRSSFeed = (xml: string, source: string, sourceLogo: string): NewsItem[] => {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xml, 'text/xml')
    const items = xmlDoc.querySelectorAll('item')
    
    const newsItems: NewsItem[] = []
    
    items.forEach(item => {
      const title = item.querySelector('title')?.textContent || ''
      const link = item.querySelector('link')?.textContent || ''
      const pubDate = item.querySelector('pubDate')?.textContent || ''
      
      if (title && link) {
        newsItems.push({
          title: title.replace(/<!\[CDATA\[|\]\]>/g, ''), // Remove CDATA wrappers if present
          link,
          pubDate,
          source,
          sourceLogo
        })
      }
    })
    
    return newsItems
  } catch (error) {
    console.error(`Error parsing RSS feed from ${source}:`, error)
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
  const [workingSources, setWorkingSources] = useState<string[]>([])

  const fetchRSSFeeds = async () => {
    setLoading(true)
    setError('')
    
    try {
      // We're using a proxy service because of CORS restrictions with RSS feeds
      // In a production app, you'd use a backend service to fetch these feeds
      const proxyUrl = 'https://api.allorigins.win/raw?url='
      
      console.log(`Attempting to fetch news for ${symbol} from ${NEWS_SOURCES.length} sources`)
      
      const newsPromises = NEWS_SOURCES.map(async source => {
        try {
          const feedUrl = source.getFeedUrl(symbol)
          const encodedFeedUrl = encodeURIComponent(feedUrl)
          const proxyUrlWithFeed = `${proxyUrl}${encodedFeedUrl}`
          
          console.log(`Fetching from ${source.name}: ${feedUrl}`)
          console.log(`Via proxy: ${proxyUrlWithFeed}`)
          
          const startTime = Date.now()
          const response = await axios.get(proxyUrlWithFeed, {
            timeout: 10000 // 10 second timeout
          })
          const duration = Date.now() - startTime
          
          const parsedItems = parseRSSFeed(response.data, source.name, source.logo)
          
          console.log(`✅ ${source.name} returned ${parsedItems.length} news items (${duration}ms)`)
          return parsedItems
        } catch (err) {
          console.warn(`❌ Could not fetch news from ${source.name}:`, err)
          console.warn(`Failed URL: ${source.getFeedUrl(symbol)}`)
          return []
        }
      })
      
      const results = await Promise.allSettled(newsPromises)
      
      // Log a summary of which sources succeeded and failed
      const successSources: string[] = []
      const failedSources: string[] = []
      
      results.forEach((result, index) => {
        const sourceName = NEWS_SOURCES[index].name
        if (result.status === 'fulfilled' && result.value.length > 0) {
          successSources.push(sourceName)
        } else {
          failedSources.push(sourceName)
        }
      })
      
      console.log('📊 RSS Feed Summary:')
      console.log(`✅ Successful sources (${successSources.length}): ${successSources.join(', ') || 'None'}`)
      console.log(`❌ Failed sources (${failedSources.length}): ${failedSources.join(', ') || 'None'}`)
      
      const allNews = results
        .filter((result): result is PromiseFulfilledResult<NewsItem[]> => result.status === 'fulfilled')
        .flatMap(result => result.value)
      
      // Filter for news only from the last 2 days
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      console.log(`⏰ Only showing news from ${twoDaysAgo.toISOString()} onwards`);
      
      // Sort items by date (newest first)
      const sortedByDate = allNews.sort((a, b) => 
        new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
      );
      
      // Filter items by date
      const filteredByDate = sortedByDate.filter(item => {
        try {
          const pubDate = new Date(item.pubDate);
          return pubDate >= twoDaysAgo;
        } catch (e) {
          // If we can't parse the date, exclude the item
          return false;
        }
      });
      console.log(`📅 Date filtering: ${allNews.length} total → ${filteredByDate.length} within last 2 days`);
      
      // Remove duplicates
      const filteredDuplicates = filteredByDate.filter((item, index, self) => 
        index === self.findIndex(t => t.title === item.title)
      );
      console.log(`🔄 Duplicate removal: ${filteredByDate.length} → ${filteredDuplicates.length} unique items`);
      
      // Apply item limit
      const sortedNews = filteredDuplicates.slice(0, 50); // Limit to 50 news items
      
      console.log(`📰 Total news items after filtering: ${sortedNews.length}`)
      setNewsItems(sortedNews)
      setWorkingSources(successSources)
    } catch (err) {
      console.error('Error fetching news:', err)
      setError('Unable to load news feed data for this stock. Financial news feeds may be temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (symbol) {
      fetchRSSFeeds()
    }
  }, [symbol])

  // No mock data - only use actual fetched news
  const displayedNewsItems = newsItems

  const getSourceLogo = (sourceLogo: string) => {
    switch (sourceLogo) {
      case 'yahoo':
        return '🔶'
      case 'seekingalpha':
        return '🔍'
      case 'benzinga':
        return '📰'
      case 'finviz':
        return '📊'
      case 'investing':
        return '💹'
      case 'nasdaq':
        return '📈'
      default:
        return '📰'
    }
  }
  
  return (
    <div className={`stock-news-widget bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`} style={{ height }}>
      <div className="flex flex-col px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <NewspaperIcon className="h-5 w-5 text-blue-600 mr-2" />
            <div>
              <h3 className="text-base font-medium text-gray-900">Latest News for {symbol}</h3>
              <p className="text-xs text-gray-500">Last 48 hours only</p>
            </div>
          </div>
          <button 
            onClick={fetchRSSFeeds}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh news"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Source Status Indicators */}
        {!loading && newsItems.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 text-xs">
            <span className="text-gray-500 mr-1">Sources:</span>
            {NEWS_SOURCES.map(source => (
              <span 
                key={source.name}
                className={`px-1.5 py-0.5 rounded ${
                  workingSources.includes(source.name) 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-500'
                }`}
                title={
                  workingSources.includes(source.name) 
                    ? `${source.name} returned news items` 
                    : `${source.name} returned no data`
                }
              >
                {getSourceLogo(source.logo)} {source.name}
              </span>
            ))}
          </div>
        )}
      </div>
      
      <div className="overflow-y-auto" style={{ height: `calc(${height} - ${!loading && newsItems.length > 0 ? '95px' : '65px'})` }}>
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
              onClick={fetchRSSFeeds}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : displayedNewsItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <NewspaperIcon className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-gray-600">No news found for {symbol}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {displayedNewsItems.map((item, index) => (
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
                          <span className="mr-1">{getSourceLogo(item.sourceLogo)}</span>
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