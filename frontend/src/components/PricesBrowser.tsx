import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface PriceRecord {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

interface PricesBrowserData {
  prices: PriceRecord[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface PricesStats {
  total_records: number;
  unique_symbols: number;
  date_range: {
    from: string | null;
    to: string | null;
  };
  sources: Record<string, number>;
}

export const PricesBrowser: React.FC = () => {
  const [data, setData] = useState<PricesBrowserData | null>(null);
  const [stats, setStats] = useState<PricesStats | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [symbolFilter, setSymbolFilter] = useState('');
  const [symbolContainsFilter, setSymbolContainsFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('symbol');
  const [sortOrder, setSortOrder] = useState('asc');

  const fetchPrices = async (page = currentPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        include_total: 'false',
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (symbolFilter) params.append('symbol', symbolFilter);
      if (symbolContainsFilter) params.append('symbol_contains', symbolContainsFilter);
      if (dateFromFilter) params.append('date_from', dateFromFilter);
      if (dateToFilter) params.append('date_to', dateToFilter);
      if (sourceFilter) params.append('source', sourceFilter);

      const response = await fetch(`/api/prices/browse?${params}`);
      if (response.ok) {
        const result: PricesBrowserData = await response.json();
        setData(result);
        setCurrentPage(page);
      } else {
        console.error('Failed to fetch prices');
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
    setLoading(false);
  };

  // Stats are disabled by default for efficiency; enable via button if needed

  // No automatic fetching; only fetch when user clicks Search

  const handleSearch = () => {
    setCurrentPage(1);
    fetchPrices(1);
  };

  const handleClearFilters = () => {
    setSymbolFilter('');
    setSymbolContainsFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setSourceFilter('');
    setCurrentPage(1);
    // Do not auto-fetch; user must click Search
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case 'stooq': return 'success';
      case 'schwab': return 'default';
      case 'finnhub': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Stats Card removed by default for efficiency */}

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exact Symbol</label>
              <Input
                type="text"
                placeholder="e.g., AAPL"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol Contains</label>
              <Input
                type="text"
                placeholder="e.g., APP"
                value={symbolContainsFilter}
                onChange={(e) => setSymbolContainsFilter(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select 
                value={sourceFilter} 
                onChange={(e) => setSourceFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Sources</option>
                <option value="stooq">Stooq</option>
                <option value="schwab">Schwab</option>
                <option value="finnhub">Finnhub</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <Input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <Input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Price Data</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Page Size:</label>
              <select 
                value={pageSize} 
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-center py-4">Loading...</div>}
          
          {data && !loading && data.prices && data.prices.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th 
                        className="border border-gray-300 px-4 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('symbol')}
                      >
                        Symbol {getSortIcon('symbol')}
                      </th>
                      <th 
                        className="border border-gray-300 px-4 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('date')}
                      >
                        Date {getSortIcon('date')}
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-700">Open</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-700">High</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-700">Low</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-700">Close</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-medium text-gray-700">Volume</th>
                      <th className="border border-gray-300 px-4 py-2 text-center font-medium text-gray-700">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.prices.map((price, index) => (
                      <tr key={`${price.symbol}-${price.date}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-4 py-2 font-medium">{price.symbol}</td>
                        <td className="border border-gray-300 px-4 py-2">{price.date}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">${formatPrice(price.open)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">${formatPrice(price.high)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">${formatPrice(price.low)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">${formatPrice(price.close)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(price.volume)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <Badge variant={getSourceBadgeVariant(price.source)}>
                            {price.source}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-600">Page {data.page}</div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    disabled={!data.has_prev}
                    onClick={() => fetchPrices(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    disabled={!data.has_next}
                    onClick={() => fetchPrices(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
          {!loading && (!data || !data.prices || data.prices.length === 0) && (
            <div className="text-center py-8 text-gray-500">No results. Set filters and click Search.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
