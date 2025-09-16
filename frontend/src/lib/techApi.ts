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
  const res = await fetch('/api/tech/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req || {})
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to run tech job');
  return res.json();
}

export async function techStatusLatest(): Promise<TechJobSummary> {
  const res = await fetch('/api/tech/status/latest');
  if (!res.ok) throw new Error((await res.json()).detail || 'No job found');
  return res.json();
}

