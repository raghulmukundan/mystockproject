import React from 'react';
import { HistoryLoader } from '../components/HistoryLoader';

const HistoryImport: React.FC = () => {
  return (
    <div className="px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">History Data Import</h1>
        <p className="mt-2 text-gray-600">
          Import historical OHLCV price data from Stooq CSV files
        </p>
      </div>
      <HistoryLoader />
    </div>
  );
};

export default HistoryImport;