import React from 'react';
import { PricesBrowser as PricesBrowserComponent } from '../components/PricesBrowser';

const PricesBrowser: React.FC = () => {
  return (
    <div className="px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Historical Prices Browser</h1>
        <p className="mt-2 text-gray-600">
          Browse and search historical OHLCV price data with advanced filtering
        </p>
      </div>
      <PricesBrowserComponent />
    </div>
  );
};

export default PricesBrowser;