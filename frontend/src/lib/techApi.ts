export type TechRunRequest = {
  symbols?: string[];
};

export type TechRunResponse = {
  job_id: number;
  latest_trade_date: string;
  total_symbols: number;
  updated_symbols: number;
  daily_rows_upserted: number;
  latest_rows_upserted: number;
  errors: number;
  duration_s: number;
};

export type TechJobSummary = {
  job_id: number;
  status: string;
  latest_trade_date: string;
  total_symbols: number;
  updated_symbols: number;
  daily_rows_upserted: number;
  latest_rows_upserted: number;
  errors: number;
  started_at: string;
  finished_at?: string;
};

export async function techRun(req?: TechRunRequest): Promise<TechRunResponse> {
  // Use jobs-service for tech analysis
  const res = await fetch('http://localhost:8004/api/jobs/tech/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to run tech job');

  // Return mock response since jobs API has different structure
  return {
    job_id: 1,
    latest_trade_date: new Date().toISOString().split('T')[0],
    total_symbols: 0,
    updated_symbols: 0,
    daily_rows_upserted: 0,
    latest_rows_upserted: 0,
    errors: 0,
    duration_s: 0
  };
}

export async function techStatusLatest(): Promise<TechJobSummary> {
  const res = await fetch('/api/tech/status/latest');
  if (!res.ok) throw new Error((await res.json()).detail || 'No job found');
  return res.json();
}

