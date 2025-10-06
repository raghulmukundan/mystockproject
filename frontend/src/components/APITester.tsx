import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlayIcon,
  ClipboardDocumentIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

interface APIEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  description: string;
  defaultBody?: string;
  headers?: Record<string, string>;
  category: 'Backend' | 'External APIs' | 'Jobs Service';
}

const API_ENDPOINTS: APIEndpoint[] = [
  // Backend Service Endpoints
  {
    id: 'watchlists-get',
    name: 'Get Watchlists',
    method: 'GET',
    url: 'http://localhost:8000/api/watchlists',
    description: 'Get all user watchlists',
    category: 'Backend'
  },
  {
    id: 'watchlist-symbols',
    name: 'Get Watchlist Symbols',
    method: 'GET',
    url: 'http://localhost:8000/api/watchlists/symbols',
    description: 'Get all unique symbols from watchlists',
    category: 'Backend'
  },
  {
    id: 'prices-fetch-store',
    name: 'Fetch and Store Prices',
    method: 'POST',
    url: 'http://localhost:8000/api/prices/fetch-and-store',
    description: 'Fetch current prices and store in cache',
    defaultBody: JSON.stringify({ "symbols": ["AAPL", "MSFT", "GOOGL"] }, null, 2),
    category: 'Backend'
  },
  {
    id: 'eod-scan-start',
    name: 'Start EOD Scan',
    method: 'POST',
    url: 'http://localhost:8000/api/eod/scan/start',
    description: 'Start end-of-day price scan',
    defaultBody: JSON.stringify({ "scan_date": "2025-09-24" }, null, 2),
    category: 'Backend'
  },
  {
    id: 'tech-analysis-run',
    name: 'Run Technical Analysis',
    method: 'POST',
    url: 'http://localhost:8000/api/tech/run',
    description: 'Run technical analysis computation',
    defaultBody: JSON.stringify({}, null, 2),
    category: 'Backend'
  },
  {
    id: 'technical-data-batch',
    name: 'Get Technical Data (Batch)',
    method: 'POST',
    url: 'http://localhost:8000/api/technical/latest',
    description: 'Get latest technical indicators for multiple symbols',
    defaultBody: JSON.stringify({ "symbols": ["AAPL", "MSFT", "GOOGL", "TSLA"] }, null, 2),
    category: 'Backend'
  },
  {
    id: 'technical-data-single',
    name: 'Get Technical Data (Single)',
    method: 'GET',
    url: 'http://localhost:8000/api/technical/latest/AAPL',
    description: 'Get latest technical indicators for a single symbol',
    category: 'Backend'
  },
  {
    id: 'technical-health',
    name: 'Technical Data Health Check',
    method: 'GET',
    url: 'http://localhost:8000/api/technical/health',
    description: 'Check technical data availability and statistics',
    category: 'Backend'
  },
  {
    id: 'universe-refresh',
    name: 'Refresh Universe',
    method: 'POST',
    url: 'http://localhost:8000/api/universe/refresh',
    description: 'Refresh symbol universe data',
    category: 'Backend'
  },
  {
    id: 'universe-query',
    name: 'Query Universe',
    method: 'GET',
    url: 'http://localhost:8000/api/universe?limit=10&offset=0',
    description: 'Query symbol universe with pagination',
    category: 'Backend'
  },
  {
    id: 'price-history',
    name: 'Get Price History',
    method: 'GET',
    url: 'http://localhost:8000/api/prices/history/AAPL?days=30',
    description: 'Get historical price data for a symbol',
    category: 'Backend'
  },

  // External APIs Service Endpoints
  {
    id: 'schwab-oauth-url',
    name: 'Get Schwab OAuth URL',
    method: 'GET',
    url: 'http://localhost:8003/schwab/oauth/url',
    description: 'Get Schwab OAuth authorization URL',
    category: 'External APIs'
  },
  {
    id: 'schwab-token-status',
    name: 'Check Schwab Token Status',
    method: 'GET',
    url: 'http://localhost:8003/schwab/token/status',
    description: 'Check Schwab token validity and expiration',
    category: 'External APIs'
  },
  {
    id: 'schwab-refresh-token',
    name: 'Refresh Schwab Token',
    method: 'POST',
    url: 'http://localhost:8003/schwab/token/refresh',
    description: 'Refresh Schwab access token',
    category: 'External APIs'
  },
  {
    id: 'finnhub-quotes',
    name: 'Get Finnhub Quotes',
    method: 'GET',
    url: 'http://localhost:8003/finnhub/quotes?symbols=AAPL,MSFT,GOOGL',
    description: 'Get current stock quotes from Finnhub',
    category: 'External APIs'
  },
  {
    id: 'schwab-quotes',
    name: 'Get Schwab Quotes',
    method: 'GET',
    url: 'http://localhost:8003/schwab/quotes?symbols=AAPL,MSFT,GOOGL',
    description: 'Get current stock quotes from Schwab',
    category: 'External APIs'
  },
  {
    id: 'schwab-history-single',
    name: 'Get Schwab Price History (Single)',
    method: 'GET',
    url: 'http://localhost:8003/schwab/history/AAPL?period_type=month&period=1&frequency_type=daily&frequency=1',
    description: 'Get price history for a single symbol with flexible periods',
    category: 'External APIs'
  },
  {
    id: 'schwab-history-daily',
    name: 'Get Schwab Daily History',
    method: 'GET',
    url: 'http://localhost:8003/schwab/history/AAPL/daily?start=2024-01-01&end=2024-01-31',
    description: 'Get daily OHLCV bars for a single symbol',
    category: 'External APIs'
  },
  {
    id: 'schwab-history-fetch',
    name: 'Fetch Schwab History (Multiple)',
    method: 'POST',
    url: 'http://localhost:8003/schwab/history/fetch?start=2024-01-01&end=2024-01-31',
    description: 'Fetch daily price history for multiple symbols',
    defaultBody: JSON.stringify(["AAPL", "MSFT", "GOOGL"], null, 2),
    headers: { 'Content-Type': 'application/json' },
    category: 'External APIs'
  },
  {
    id: 'schwab-instruments-search',
    name: 'Search Schwab Instruments',
    method: 'GET',
    url: 'http://localhost:8003/schwab/instruments/search?symbol=AAPL&projection=symbol-search',
    description: 'Search for instruments by symbol',
    category: 'External APIs'
  },

  // Jobs Service Endpoints
  {
    id: 'jobs-summary',
    name: 'Get Jobs Summary',
    method: 'GET',
    url: 'http://localhost:8004/jobs/summary',
    description: 'Get summary of all configured jobs',
    category: 'Jobs Service'
  },
  {
    id: 'jobs-status',
    name: 'Get Jobs Status',
    method: 'GET',
    url: 'http://localhost:8004/jobs/status',
    description: 'Get detailed status of all jobs',
    category: 'Jobs Service'
  },
  {
    id: 'job-market-data',
    name: 'Run Market Data Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/update_market_data/run',
    description: 'Manually trigger market data refresh job',
    category: 'Jobs Service'
  },
  {
    id: 'job-eod-scan',
    name: 'Run EOD Scan Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/eod_scan/run',
    description: 'Manually trigger EOD scan job',
    defaultBody: JSON.stringify({ "start_date": "2025-09-24", "end_date": "2025-09-24" }, null, 2),
    category: 'Jobs Service'
  },
  {
    id: 'job-tech-analysis',
    name: 'Run Tech Analysis Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/technical_compute/run',
    description: 'Manually trigger technical analysis job',
    category: 'Jobs Service'
  },
  {
    id: 'job-universe-refresh',
    name: 'Run Universe Refresh Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/universe_refresh/run',
    description: 'Manually trigger universe refresh job',
    category: 'Jobs Service'
  },
  {
    id: 'job-ttl-cleanup',
    name: 'Run TTL Cleanup Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/job_ttl_cleanup/run',
    description: 'Manually trigger TTL cleanup job',
    category: 'Jobs Service'
  },
  {
    id: 'job-token-validation',
    name: 'Run Token Validation Job',
    method: 'POST',
    url: 'http://localhost:8004/jobs/schwab_token_validation/run',
    description: 'Manually trigger Schwab token validation job',
    category: 'Jobs Service'
  }
];

interface APIResponse {
  status: number;
  statusText: string;
  data: any;
  headers: Record<string, string>;
  duration: number;
}

const APITester: React.FC = () => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Backend']));
  const [selectedEndpoint, setSelectedEndpoint] = useState<APIEndpoint | null>(null);
  const [requestBody, setRequestBody] = useState<string>('');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState<boolean>(false);

  useEffect(() => {
    if (selectedEndpoint) {
      setCustomUrl(selectedEndpoint.url);
      setRequestBody(selectedEndpoint.defaultBody || '');
    }
  }, [selectedEndpoint]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const executeRequest = async () => {
    if (!selectedEndpoint) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    const startTime = performance.now();

    try {
      const requestOptions: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          'Content-Type': 'application/json',
          ...selectedEndpoint.headers
        }
      };

      if (selectedEndpoint.method !== 'GET' && requestBody.trim()) {
        requestOptions.body = requestBody;
      }

      const response = await fetch(customUrl, requestOptions);
      const endTime = performance.now();

      let responseData: any;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      setResponse({
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        headers: responseHeaders,
        duration: Math.round(endTime - startTime)
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-50';
    if (status >= 300 && status < 400) return 'text-blue-600 bg-blue-50';
    if (status >= 400 && status < 500) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const categories = [...new Set(API_ENDPOINTS.map(endpoint => endpoint.category))];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Panel - Endpoint Selection */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">API Endpoints</CardTitle>
            <p className="text-sm text-slate-600">
              Select an endpoint to test. All services running on localhost.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.map(category => (
              <div key={category} className="border border-slate-200 rounded-lg">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <span className="font-medium text-slate-900">{category}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {API_ENDPOINTS.filter(e => e.category === category).length}
                    </Badge>
                    {expandedCategories.has(category) ? (
                      <ChevronDownIcon className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {expandedCategories.has(category) && (
                  <div className="border-t border-slate-200">
                    {API_ENDPOINTS
                      .filter(endpoint => endpoint.category === category)
                      .map(endpoint => (
                        <button
                          key={endpoint.id}
                          onClick={() => setSelectedEndpoint(endpoint)}
                          className={`w-full text-left p-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${
                            selectedEndpoint?.id === endpoint.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={endpoint.method === 'GET' ? 'default' : 'secondary'}
                                  className="text-xs font-mono"
                                >
                                  {endpoint.method}
                                </Badge>
                                <span className="text-sm font-medium text-slate-900 truncate">
                                  {endpoint.name}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600">{endpoint.description}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right Panel - Request Configuration & Results */}
        <div className="space-y-6">
          {selectedEndpoint ? (
            <>
              {/* Request Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant={selectedEndpoint.method === 'GET' ? 'default' : 'secondary'}>
                      {selectedEndpoint.method}
                    </Badge>
                    {selectedEndpoint.name}
                  </CardTitle>
                  <p className="text-sm text-slate-600">{selectedEndpoint.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* URL Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">URL</label>
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Request Body (for non-GET requests) */}
                  {selectedEndpoint.method !== 'GET' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Request Body (JSON)</label>
                      <textarea
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter JSON request body..."
                      />
                    </div>
                  )}

                  {/* Execute Button */}
                  <Button
                    onClick={executeRequest}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Executing...
                      </>
                    ) : (
                      <>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Execute Request
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Response */}
              {(response || error) && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Response</CardTitle>
                      {response && (
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(response.status)}>
                            {response.status} {response.statusText}
                          </Badge>
                          <Badge variant="secondary">{response.duration}ms</Badge>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {response && (
                      <>
                        {/* Response Headers */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">Response Headers</label>
                            <button
                              onClick={() => copyToClipboard(JSON.stringify(response.headers, null, 2))}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                            >
                              {copiedToClipboard ? (
                                <CheckIcon className="h-3 w-3" />
                              ) : (
                                <ClipboardDocumentIcon className="h-3 w-3" />
                              )}
                              Copy
                            </button>
                          </div>
                          <pre className="bg-slate-50 p-3 rounded-md text-xs overflow-x-auto border">
                            {JSON.stringify(response.headers, null, 2)}
                          </pre>
                        </div>

                        {/* Response Body */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">Response Body</label>
                            <button
                              onClick={() => copyToClipboard(
                                typeof response.data === 'string'
                                  ? response.data
                                  : JSON.stringify(response.data, null, 2)
                              )}
                              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                            >
                              {copiedToClipboard ? (
                                <CheckIcon className="h-3 w-3" />
                              ) : (
                                <ClipboardDocumentIcon className="h-3 w-3" />
                              )}
                              Copy
                            </button>
                          </div>
                          <pre className="bg-slate-50 p-3 rounded-md text-xs overflow-x-auto border max-h-96 overflow-y-auto">
                            {typeof response.data === 'string'
                              ? response.data
                              : JSON.stringify(response.data, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-slate-500">Select an API endpoint from the left panel to get started</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default APITester;