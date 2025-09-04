import { useState, useEffect } from 'react'
import axios from 'axios'

/**
 * This is a test component for debugging RSS feed issues.
 * Not intended for production use.
 */
export default function TestRSSFeed() {
  const [symbol, setSymbol] = useState('AAPL')
  const [sourceUrl, setSourceUrl] = useState('')
  const [feedData, setFeedData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sources = [
    {
      name: 'Yahoo Finance',
      url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`
    },
    {
      name: 'Seeking Alpha',
      url: `https://seekingalpha.com/api/sa/combined/${symbol}.xml`
    },
    {
      name: 'Nasdaq',
      url: `https://www.nasdaq.com/feed/rssoutbound?symbol=${symbol}`
    },
    {
      name: 'Benzinga',
      url: `https://www.benzinga.com/feed/stock?symbols=${symbol}`
    },
    {
      name: 'Finviz',
      url: `https://finviz.com/quote.ashx?t=${symbol}&output=rss`
    }
  ]

  const fetchFeed = async (url: string) => {
    setLoading(true)
    setError('')
    setFeedData(null)
    
    try {
      // Using our backend proxy to avoid CORS issues
      const proxyUrl = `/api/rss/parse?url=${encodeURIComponent(url)}`
      console.log(`Fetching from: ${proxyUrl}`)
      
      const response = await axios.get(proxyUrl)
      setFeedData(response.data)
    } catch (err) {
      console.error('Error fetching feed:', err)
      setError('Failed to fetch feed data')
    } finally {
      setLoading(false)
    }
  }

  const selectSource = (url: string) => {
    setSourceUrl(url)
    fetchFeed(url)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">RSS Feed Tester</h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Symbol
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="border border-gray-300 rounded-md px-3 py-2 w-32"
          />
          <button
            onClick={() => sources.forEach(source => {
              const url = source.url
              fetchFeed(url)
            })}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Test All Sources
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {sources.map((source) => (
          <button
            key={source.name}
            onClick={() => selectSource(source.url)}
            className={`p-4 rounded-md border text-left hover:bg-gray-50 ${
              sourceUrl === source.url ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
          >
            <h3 className="font-medium">{source.name}</h3>
            <p className="text-sm text-gray-600 truncate mt-1">{source.url}</p>
          </button>
        ))}
      </div>
      
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Results</h2>
        
        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading...</span>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md">
            {error}
          </div>
        )}
        
        {feedData && !loading && (
          <div>
            <div className="bg-gray-100 p-4 rounded-md mb-4">
              <h3 className="font-medium mb-2">Feed Status: {feedData.status || 'Unknown'}</h3>
              {feedData.status === 'success' && (
                <>
                  <p>Type: {feedData.feed_type}</p>
                  <p>Item Count: {feedData.item_count}</p>
                </>
              )}
              {feedData.status === 'error' && (
                <p className="text-red-600">{feedData.message}</p>
              )}
              {feedData.error && (
                <p className="text-red-600">{feedData.error}</p>
              )}
            </div>
            
            {feedData.items && feedData.items.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Sample Items</h3>
                <div className="space-y-4">
                  {feedData.items.map((item: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-md p-4">
                      <h4 className="font-medium">{item.title}</h4>
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <span className="mr-2">
                          {new Date(item.pubDate).toLocaleString()}
                        </span>
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      </div>
                      {item.description && (
                        <div className="mt-2 text-sm text-gray-600">
                          {item.description.length > 200 
                            ? item.description.substring(0, 200) + '...' 
                            : item.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {feedData.content_preview && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Content Preview</h3>
                <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs">
                  {feedData.content_preview}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}