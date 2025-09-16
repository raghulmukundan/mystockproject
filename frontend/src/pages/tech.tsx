import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { techRun, techStatusLatest, TechJobSummary, TechRunResponse } from '../lib/techApi';

const TechPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [summary, setSummary] = useState<TechJobSummary | null>(null);

  const loadLatest = async () => {
    try {
      const s = await techStatusLatest();
      setSummary(s);
    } catch (e) {
      // ignore until first run
    }
  };

  useEffect(() => {
    loadLatest();
  }, []);

  const runNow = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res: TechRunResponse = await techRun();
      setMessage(`Ran tech job #${res.job_id}: updated ${res.updated_symbols}/${res.total_symbols} symbols in ${res.duration_s}s`);
      await loadLatest();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to run');
    }
    setLoading(false);
  };

  const fmt = (n: number) => n?.toLocaleString();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Technical Indicators</CardTitle>
          <Button onClick={runNow} disabled={loading}>{loading ? 'Running…' : 'Run Now'}</Button>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <div className="text-gray-500">No jobs yet. Click Run Now to compute indicators.</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Status:</span> {summary.status}</div>
              <div><span className="font-medium">Latest Trade Date:</span> {summary.latest_trade_date}</div>
              <div><span className="font-medium">Symbols Updated:</span> {fmt(summary.updated_symbols)} / {fmt(summary.total_symbols)}</div>
              <div><span className="font-medium">Rows Upserted:</span> latest {fmt(summary.latest_rows_upserted)}, daily {fmt(summary.daily_rows_upserted)}</div>
              <div><span className="font-medium">Errors:</span> {fmt(summary.errors)}</div>
              {summary.finished_at && (<div><span className="font-medium">Finished:</span> {new Date(summary.finished_at).toLocaleString()}</div>)}
            </div>
          )}
          {message && (<div className="mt-3 text-sm text-blue-600">{message}</div>)}
        </CardContent>
      </Card>
    </div>
  );
};

export default TechPage;

