import React, { useState, useEffect, useCallback } from 'react';
import { universeApi, StatsResponse, FacetsResponse, SymbolsResponse, QueryParams, NextRefreshResponse } from '../lib/universeApi';
import { UniverseFilters } from '../components/universe/UniverseFilters';
import { UniverseTable } from '../components/universe/UniverseTable';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const Universe: React.FC = () => {
  // State
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [symbolsData, setSymbolsData] = useState<SymbolsResponse | null>(null);
  const [nextRefresh, setNextRefresh] = useState<NextRefreshResponse | null>(null);
  
  const [filters, setFilters] = useState<QueryParams>({
    q: '',
    exchange: undefined,
    etf: undefined,
    limit: 50,
    offset: 0,
    sort: 'symbol',
    order: 'asc'
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Debounced search query
  const debouncedQuery = useDebounce(filters.q, 350);

  // Load initial data
  useEffect(() => {
    Promise.all([
      loadStats(),
      loadFacets(),
      loadNextRefresh(),
    ]);
  }, []);

  // Load symbols when filters change (with debounced query)
  useEffect(() => {
    loadSymbols();
  }, [filters.exchange, filters.etf, filters.limit, filters.offset, filters.sort, filters.order, debouncedQuery]);

  const loadStats = async () => {
    try {
      const statsData = await universeApi.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadFacets = async () => {
    try {
      const facetsData = await universeApi.getFacets();
      setFacets(facetsData);
    } catch (err) {
      console.error('Failed to load facets:', err);
    }
  };

  const loadNextRefresh = async () => {
    try {
      const nextRefreshData = await universeApi.getNextRefresh();
      setNextRefresh(nextRefreshData);
    } catch (err) {
      console.error('Failed to load next refresh time:', err);
    }
  };

  const loadSymbols = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = { ...filters };
      // Use debounced query instead of current query
      if (debouncedQuery !== filters.q) {
        queryParams.q = debouncedQuery;
      }
      
      const data = await universeApi.querySymbols(queryParams);
      setSymbolsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load symbols');
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = useCallback((newFilters: QueryParams) => {
    setFilters({ ...newFilters, offset: 0 }); // Reset to first page
  }, []);

  const handleReset = useCallback(() => {
    setFilters({
      q: '',
      exchange: undefined,
      etf: undefined,
      limit: 50,
      offset: 0,
      sort: 'symbol',
      order: 'asc'
    });
  }, []);

  const handlePrevPage = useCallback(() => {
    if (filters.offset && filters.offset > 0) {
      setFilters(prev => ({
        ...prev,
        offset: Math.max(0, (prev.offset || 0) - (prev.limit || 50))
      }));
    }
  }, [filters.offset, filters.limit]);

  const handleNextPage = useCallback(() => {
    if (symbolsData && symbolsData.offset + symbolsData.limit < symbolsData.total) {
      setFilters(prev => ({
        ...prev,
        offset: (prev.offset || 0) + (prev.limit || 50)
      }));
    }
  }, [symbolsData]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const queryParams = { ...filters, limit: 10000 }; // Export more records
      const blob = await universeApi.exportCsv(queryParams);
      universeApi.downloadCsv(blob, 'universe-symbols.csv');
    } catch (err) {
      alert('Failed to export CSV: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    
    try {
      const result = await universeApi.refreshUniverse({ download: true });
      console.log('Refresh result:', result);
      
      // Reload data after successful refresh
      await Promise.all([loadStats(), loadFacets()]);
      loadSymbols();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh universe data';
      setRefreshError(errorMessage);
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Pagination calculations
  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
  const totalPages = symbolsData ? Math.ceil(symbolsData.total / (filters.limit || 50)) : 1;
  const canGoPrev = (filters.offset || 0) > 0;
  const canGoNext = symbolsData ? (filters.offset || 0) + (filters.limit || 50) < symbolsData.total : false;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Universe</h1>
              <p className="text-gray-600">Stock universe from NASDAQ</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Schedule Info */}
              <div className="text-sm text-gray-600">
                {stats?.last_updated_at && (
                  <div className="mb-1">
                    Last updated: {new Date(stats.last_updated_at).toLocaleDateString()}
                  </div>
                )}
                {nextRefresh && (
                  <div className="text-xs text-green-600">
                    Next refresh: {nextRefresh.formatted_time}
                  </div>
                )}
              </div>
              
              {/* Manual Refresh Button */}
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className={`px-4 py-2 rounded-md text-sm font-medium mr-2 ${
                  refreshing
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {refreshing ? 'Downloading...' : 'Refresh Real Data'}
              </button>
              
              {/* Export CSV Button */}
              <button
                onClick={handleExportCsv}
                disabled={exporting || !symbolsData}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  exporting || !symbolsData
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Refresh Error Display */}
        {refreshError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Failed to Download Real NASDAQ Data
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{refreshError}</p>
                  <p className="mt-1">
                    This could be due to network connectivity issues or NASDAQ server being unavailable. 
                    Please try again later or check your network connection.
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => setRefreshError(null)}
                    className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-md hover:bg-red-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Filters */}
          <UniverseFilters
            facets={facets}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleReset}
          />

          {/* Table */}
          <UniverseTable
            data={symbolsData}
            loading={loading}
            error={error}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        </div>
      </div>
    </div>
  );
};

export default Universe;