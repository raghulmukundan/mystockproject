import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { HistoryLoader } from '../components/HistoryLoader';
import { PricesBrowser as PricesBrowserComponent } from '../components/PricesBrowser';
import JobStatus from './JobStatus';
import { JobSettings } from './JobSettings';

type TabKey = 'history' | 'prices' | 'settings' | 'status' | 'api-tester';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'history', label: 'History Import' },
  { key: 'prices', label: 'Price Browser' },
  { key: 'settings', label: 'Job Settings' },
  { key: 'status', label: 'Job Status' },
  { key: 'api-tester', label: 'API Tester' },
];

const Operations: React.FC = () => {
  const [active, setActive] = useState<TabKey>('history');

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(t => (
          <Button
            key={t.key}
            variant={active === t.key ? 'default' : 'outline'}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find(t => t.key === active)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active === 'history' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Import historical OHLCV price data from Stooq CSV files.</p>
              <HistoryLoader />
            </div>
          )}
          {active === 'prices' && (
            <div>
              <PricesBrowserComponent />
            </div>
          )}
          {active === 'settings' && (
            <div>
              <JobSettings />
            </div>
          )}
          {active === 'status' && (
            <div>
              <JobStatus />
            </div>
          )}
          {active === 'api-tester' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Test Schwab and Finnhub API endpoints with real market data.</p>
              <iframe
                src="http://localhost:8003/tester"
                className="w-full h-[800px] border rounded-lg"
                title="API Tester"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Operations;
