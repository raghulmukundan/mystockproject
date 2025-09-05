import React from 'react';
import { FacetsResponse, QueryParams } from '../../lib/universeApi';

interface UniverseFiltersProps {
  facets: FacetsResponse | null;
  filters: QueryParams;
  onFiltersChange: (filters: QueryParams) => void;
  onReset: () => void;
}

export const UniverseFilters: React.FC<UniverseFiltersProps> = ({
  facets,
  filters,
  onFiltersChange,
  onReset
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, q: e.target.value });
  };

  const handleExchangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, exchange: e.target.value || undefined });
  };

  const handleEtfChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ ...filters, etf: e.target.value || undefined });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [sort, order] = e.target.value.split('-');
    onFiltersChange({ ...filters, sort, order });
  };

  const getSortValue = () => {
    return `${filters.sort || 'symbol'}-${filters.order || 'asc'}`;
  };

  return (
    <div className="bg-white p-4 border-b border-gray-200 sticky top-0 z-10">
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search Input */}
        <div className="flex-1 min-w-64">
          <input
            type="text"
            placeholder="Search symbols or company names..."
            value={filters.q || ''}
            onChange={handleSearchChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Exchange Filter */}
        <div>
          <select
            value={filters.exchange || ''}
            onChange={handleExchangeChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Exchanges</option>
            {facets?.exchanges.map(exchange => (
              <option key={exchange} value={exchange}>
                {exchange}
              </option>
            ))}
          </select>
        </div>

        {/* ETF Filter */}
        <div>
          <select
            value={filters.etf || ''}
            onChange={handleEtfChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="Y">Only ETFs</option>
            <option value="N">Only Stocks</option>
          </select>
        </div>

        {/* Sort Options */}
        <div>
          <select
            value={getSortValue()}
            onChange={handleSortChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="symbol-asc">Symbol A-Z</option>
            <option value="symbol-desc">Symbol Z-A</option>
            <option value="security_name-asc">Name A-Z</option>
            <option value="security_name-desc">Name Z-A</option>
            <option value="listing_exchange-asc">Exchange A-Z</option>
            <option value="listing_exchange-desc">Exchange Z-A</option>
            <option value="etf-asc">ETF First</option>
            <option value="etf-desc">Stocks First</option>
          </select>
        </div>

        {/* Reset Button */}
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Reset
        </button>
      </div>

      {/* Filter Summary */}
      {facets && (
        <div className="mt-2 text-sm text-gray-500">
          Total: {facets.counts.all.toLocaleString()} symbols 
          ({facets.counts.etfs.toLocaleString()} ETFs, {facets.counts.non_etfs.toLocaleString()} stocks)
        </div>
      )}
    </div>
  );
};