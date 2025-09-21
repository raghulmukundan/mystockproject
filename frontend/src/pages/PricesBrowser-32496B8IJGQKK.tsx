import React from 'react';
import { PricesBrowser as PricesBrowserComponent } from '../components/PricesBrowser';

const PricesBrowser: React.FC = () => {
  return (
    <div className="px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Price Data Browser</h1>
        <p className="mt-2 text-gray-600">
          Browse and search price data from all sources: historical prices, current daily prices, and live data
        </p>
      </div>
      <PricesBrowserComponent />
    </div>
  );
};

export default PricesBrowser;