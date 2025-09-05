import React from 'react';
import { SymbolItem, SymbolsResponse } from '../../lib/universeApi';

interface UniverseTableProps {
  data: SymbolsResponse | null;
  loading: boolean;
  error: string | null;
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  currentPage: number;
  totalPages: number;
}

export const UniverseTable: React.FC<UniverseTableProps> = ({
  data,
  loading,
  error,
  onPrevPage,
  onNextPage,
  canGoPrev,
  canGoNext,
  currentPage,
  totalPages
}) => {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatEtfChip = (etf?: string) => {
    if (etf === 'Y') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ETF
        </span>
      );
    } else if (etf === 'N') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Stock
        </span>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 text-center">
          <p className="text-lg font-semibold">Error loading data</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    if (data && data.total === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 text-center">
            <p className="text-lg font-semibold">No symbols yet</p>
            <p className="text-sm">Click "Refresh Real Data" to download symbols from NASDAQ.</p>
            <p className="text-xs text-gray-400 mt-2">Only real NASDAQ data is used - no mock data.</p>
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 text-center">
            <p className="text-lg font-semibold">No matches found</p>
            <p className="text-sm">No symbols match your current filters.</p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Security Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Exchange
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stooq Symbol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.items.map((item: SymbolItem) => (
              <tr key={item.symbol} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.symbol}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.security_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.listing_exchange}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatEtfChip(item.etf)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {item.stooq_symbol}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(item.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
        <div className="flex-1 flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{data.offset + 1}</span> to{' '}
              <span className="font-medium">
                {Math.min(data.offset + data.limit, data.total)}
              </span>{' '}
              of <span className="font-medium">{data.total.toLocaleString()}</span> results
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrevPage}
              disabled={!canGoPrev}
              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md ${
                canGoPrev
                  ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  : 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
              }`}
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={onNextPage}
              disabled={!canGoNext}
              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md ${
                canGoNext
                  ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                  : 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};