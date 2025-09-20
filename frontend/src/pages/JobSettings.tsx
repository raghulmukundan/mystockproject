import React, { useState, useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { jobsApiService } from '../services/jobsApi';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

interface JobConfiguration {
  id: number;
  job_name: string;
  description: string;
  enabled: boolean;
  schedule_type: string;
  interval_value?: number;
  interval_unit?: string;
  cron_day_of_week?: string;
  cron_hour?: number;
  cron_minute?: number;
  only_market_hours: boolean;
  market_start_hour?: number;
  market_end_hour?: number;
  created_at: string;
  updated_at: string;
}

interface JobSummary {
  job_name: string;
  description: string;
  enabled: boolean;
  schedule_display: string;
  last_run?: {
    status: string;
    started_at: string;
    completed_at?: string;
    duration_seconds?: number;
    records_processed?: number;
    error_message?: string;
    next_run_at?: string;
  };
}

export const JobSettings: React.FC = () => {
  const [jobs, setJobs] = useState<JobConfiguration[]>([]);
  const [jobsSummary, setJobsSummary] = useState<JobSummary[]>([]);
  const [editingJob, setEditingJob] = useState<JobConfiguration | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [histories, setHistories] = useState<Record<string, any[]>>({});
  const [techLatest, setTechLatest] = useState<any | null>(null);
  const techPollRef = useRef<number | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{authenticated: boolean; client_id: string} | null>(null);

  // EOD Scan controls
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    loadJobs();
    loadJobsSummary();
  }, []);

  const loadJobs = async () => {
    try {
      // Note: JobConfiguration interface matches the response from jobs service
      const data = await jobsApiService.getJobsSummary();
      // Convert JobSummaryResponse to JobConfiguration format for compatibility
      const jobConfigs: JobConfiguration[] = data.map(job => ({
        id: 0, // Not provided in summary
        job_name: job.job_name,
        description: job.description,
        enabled: job.enabled,
        schedule_type: 'interval', // Default values for missing fields
        only_market_hours: false,
        created_at: '',
        updated_at: ''
      }));
      setJobs(jobConfigs);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  };

  // Note: JobSettings now only manages configuration; history and run actions moved to Job Status page.

  const loadJobsSummary = async () => {
    try {
      const data = await jobsApiService.getJobsSummary();
      setJobsSummary(data);
    } catch (error) {
      console.error('Error loading jobs summary:', error);
    }
  };

  const loadTechLatest = async () => {
    try {
      const res = await fetch('/api/tech/status/latest');
      if (res.ok) {
        const data = await res.json();
        setTechLatest(data);
        if (data.status === 'running' && !techPollRef.current) {
          techPollRef.current = window.setInterval(loadTechLatest, 5000);
        } else if (data.status !== 'running' && techPollRef.current) {
          clearInterval(techPollRef.current);
          techPollRef.current = null;
        }
      } else if (res.status === 204 || res.status === 404) {
        // No content yet; don't log errors or update state
        return;
      }
    } catch {}
  };

  useEffect(() => {
    loadTechLatest();
    return () => { if (techPollRef.current) clearInterval(techPollRef.current); };
  }, []);

  const loadOauthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        setOauthStatus({ authenticated: !!data.authenticated, client_id: data.client_id });
      }
    } catch {}
  };

  useEffect(() => {
    loadOauthStatus();
  }, []);

  const updateJob = async (jobName: string, updates: Partial<JobConfiguration>) => {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/api/jobs/${jobName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setMessage('Job configuration updated successfully');
        await loadJobs();
        await loadJobsSummary();
        setEditingJob(null);
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.detail}`);
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setLoading(false);
  };

  // Actions and history (moved here from Job Status to avoid overlap)
  const toggleJobHistory = async (jobName: string) => {
    const open = !historyOpen[jobName];
    setHistoryOpen({ ...historyOpen, [jobName]: open });
    if (open) {
      try {
        const data = await jobsApiService.getJobStatus(jobName, 5);
        setHistories({ ...histories, [jobName]: data });
      } catch {}
    }
  };

  const runUniverseRefreshNow = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/universe/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ download: true }) });
      if (!res.ok) {
        const err = await res.json();
        setMessage(`Error: ${err.detail || 'Failed to refresh'}`);
      } else {
        setMessage('Universe refresh started');
      }
      await loadJobsSummary();
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const truncateSymbolsTable = async () => {
    if (!confirm('This will TRUNCATE symbols. Are you sure?')) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/universe/clear', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setMessage(data.message || 'Symbols table truncated');
      } else {
        const err = await res.json();
        setMessage(`Error: ${err.detail || 'Failed to truncate symbols'}`);
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };


  const runMarketDataNow = async () => {
    setLoading(true);
    try {
      await jobsApiService.runMarketDataRefresh();
      await loadJobsSummary();
      setMessage('Market data refresh started');
    } catch {}
    setLoading(false);
  };

  // EOD Scan functions
  const startEod = async () => {
    setStarting(true)
    setMessage('')
    try {
      const body: any = {}
      if (startDate) body.start = startDate
      if (endDate) body.end = endDate || startDate
      const res = await fetch('/api/eod/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        const data = await res.json()
        setMessage(`EOD scan started (scan #${data.id})`)
        await loadJobsSummary()
      } else {
        const err = await res.json()
        setMessage(`Error: ${err.detail || 'Failed to start EOD scan'}`)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setStarting(false)
    }
  }

  const truncatePricesDaily = async () => {
    if (!confirm('This will truncate prices_daily. Are you sure?')) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/prices/daily/truncate', { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        setMessage(data.message || 'prices_daily truncated')
      } else {
        const err = await res.json()
        setMessage(`Error: ${err.detail || 'Failed to truncate'}`)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const runTechNow = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/tech/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (res.ok) {
        setMessage('Tech scan started')
        await loadJobsSummary()
        await loadTechLatest()
      } else {
        const err = await res.json()
        setMessage(`Error: ${err.detail || 'Failed to start tech scan'}`)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'failed': return 'destructive';
      case 'running': return 'secondary';
      default: return 'outline';
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };
  // Display times in America/Chicago for consistency with EOD/Tech schedules
  const formatChicago = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Chicago'
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  };
  const formatDuration = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const renderEditForm = (job: JobConfiguration) => {
    const [formData, setFormData] = useState({ ...job });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      updateJob(job.job_name, formData);
    };

    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Edit Job: {job.job_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              />
              <label className="text-sm font-medium">Enabled</label>
            </div>

            <div>
              <label className="text-sm font-medium">Schedule Type</label>
              <Select 
                value={formData.schedule_type} 
                onValueChange={(schedule_type) => setFormData({ ...formData, schedule_type })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Interval</SelectItem>
                  <SelectItem value="cron">Cron</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.schedule_type === 'interval' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Interval Value</label>
                  <Input
                    type="number"
                    value={formData.interval_value || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      interval_value: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Interval Unit</label>
                  <Select 
                    value={formData.interval_unit || ''} 
                    onValueChange={(interval_unit) => setFormData({ ...formData, interval_unit })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.schedule_type === 'cron' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Day of Week</label>
                  <Select 
                    value={formData.cron_day_of_week || ''} 
                    onValueChange={(cron_day_of_week) => setFormData({ ...formData, cron_day_of_week })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sun">Sunday</SelectItem>
                      <SelectItem value="mon">Monday</SelectItem>
                      <SelectItem value="tue">Tuesday</SelectItem>
                      <SelectItem value="wed">Wednesday</SelectItem>
                      <SelectItem value="thu">Thursday</SelectItem>
                      <SelectItem value="fri">Friday</SelectItem>
                      <SelectItem value="sat">Saturday</SelectItem>
                      <SelectItem value="mon,tue,wed,thu,fri">Weekdays</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Hour (0-23)</label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={formData.cron_hour || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cron_hour: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Minute (0-59)</label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={formData.cron_minute || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      cron_minute: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.only_market_hours}
                onCheckedChange={(only_market_hours) => setFormData({ ...formData, only_market_hours })}
              />
              <label className="text-sm font-medium">Run only during market hours</label>
            </div>

            {formData.only_market_hours && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Market Start Hour</label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={formData.market_start_hour || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      market_start_hour: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Market End Hour</label>
                  <Input
                    type="number"
                    min="0"
                    max="23"
                    value={formData.market_end_hour || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      market_end_hour: e.target.value ? parseInt(e.target.value) : undefined 
                    })}
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setEditingJob(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Schwab Authentication</CardTitle>
            <p className="text-sm text-gray-600">Refresh tokens expire every 7 days. Use this to re‑authenticate and obtain a new refresh token.</p>
            <p className="text-xs text-gray-500 mt-1">If accessing via Tailscale, run <span className="font-mono">tailscale serve --https=443 localhost:8000</span> before starting the login so the OAuth callback can reach your app.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" onClick={() => window.open('/api/auth/login', '_blank')}>Open Schwab Login</Button>
            <Button variant="outline" onClick={loadOauthStatus}>Check Status</Button>
          </div>
        </CardHeader>
        <CardContent>
          {oauthStatus ? (
            <div className="text-sm">
              <div><span className="font-medium">Configured Client:</span> {oauthStatus.client_id}</div>
              <div className={oauthStatus.authenticated ? 'text-green-700' : 'text-red-700'}>
                {oauthStatus.authenticated ? 'Refresh token detected in backend environment.' : 'No refresh token configured in backend.'}
              </div>
              <div className="mt-2 text-gray-600">
                After completing login, the callback page will display a new refresh token. Copy it into your .env as SCHWAB_REFRESH_TOKEN and restart the backend.
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Loading authentication status…</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Background Job Settings</CardTitle>
          <p className="text-sm text-gray-600">
            Configure scheduled background jobs for automated data processing and maintenance tasks.
          </p>
        </CardHeader>
      </Card>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {jobsSummary.map((job) => {
          const jobConfig = jobs.find(j => j.job_name === job.job_name);
          const isEditing = editingJob?.job_name === job.job_name;

          return (
            <Card key={job.job_name}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-lg">{job.job_name}</CardTitle>
                      <Badge variant={job.enabled ? 'default' : 'secondary'}>
                        {job.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{job.description}</p>
                    <p className="text-sm font-medium text-blue-600">{job.schedule_display}</p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingJob(isEditing ? null : jobConfig || null)}
                    >
                      {isEditing ? 'Cancel' : 'Configure'}
                    </Button>
                    {jobConfig && (
                      <Button
                        variant={jobConfig.enabled ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => updateJob(job.job_name, { enabled: !jobConfig.enabled })}
                        disabled={loading}
                      >
                        {jobConfig.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => toggleJobHistory(job.job_name)}>
                      {historyOpen[job.job_name] ? 'Hide History' : 'Show History'}
                    </Button>
                    {job.job_name === 'nasdaq_universe_refresh' && (
                      <>
                        <Button size="sm" onClick={runUniverseRefreshNow} disabled={loading}>Run Now</Button>
                        <Button size="sm" variant="destructive" onClick={truncateSymbolsTable} disabled={loading}>Truncate Symbols</Button>
                      </>
                    )}
                    {job.job_name === 'technical_compute' && (
                      <Button size="sm" onClick={runTechNow} disabled={loading}>Run Now</Button>
                    )}
                    {job.job_name === 'market_data_refresh' && (
                      <Button size="sm" onClick={runMarketDataNow} disabled={loading}>Run Now</Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Live status for technical compute */}
              {job.job_name === 'technical_compute' && techLatest && (
                <CardContent className="pt-0">
                  <div className="text-xs text-blue-700">
                    <span className="font-medium">Live:</span>
                    <span className="ml-2">{techLatest.status}</span>
                    <span className="ml-2">updated {techLatest.updated_symbols} / {techLatest.total_symbols}</span>
                    <span className="ml-2">errors {techLatest.errors}</span>
                    {techLatest.finished_at && (
                      <span className="ml-2">finished {formatChicago(techLatest.finished_at)} (America/Chicago)</span>
                    )}
                  </div>
                </CardContent>
              )}
              {historyOpen[job.job_name] && histories[job.job_name] && (
                <CardContent className="border-t">
                  <div className="space-y-2 text-sm">
                    <div className="font-medium">Recent Runs</div>
                    {histories[job.job_name].length === 0 && (
                      <div className="text-gray-500">No history</div>
                    )}
                    {histories[job.job_name].map((h: any) => (
                      <div key={h.id} className="flex justify-between border-b py-1">
                        <div>
                          <Badge variant={getStatusBadgeVariant(h.status)}>{h.status.toUpperCase()}</Badge>
                          <span className="ml-2">{formatChicago(h.started_at)} (America/Chicago)</span>
                        </div>
                        <div className="text-gray-600">
                          {h.records_processed ? (<span>{h.records_processed} records</span>) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}

              {isEditing && jobConfig && renderEditForm(jobConfig)}
            </Card>
          );
        })}
      </div>

      {/* Manual Job Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Job Triggers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* EOD Scan */}
            <div className="border rounded p-4">
              <h3 className="font-medium mb-3">EOD Scan</h3>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                </div>
                <Button onClick={startEod} disabled={starting || loading}>
                  {starting ? 'Starting…' : 'Start EOD Scan'}
                </Button>
                <Button variant="destructive" onClick={truncatePricesDaily} disabled={loading}>
                  Truncate prices_daily
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Leave dates empty for today's scan. End date defaults to start date if not specified.
              </p>
            </div>

            {/* Tech Scan */}
            <div className="border rounded p-4">
              <h3 className="font-medium mb-3">Tech Scan</h3>
              <div className="flex gap-2 items-center">
                <Button onClick={runTechNow} disabled={loading}>
                  {loading ? 'Starting…' : 'Run Tech Scan Now'}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Runs technical analysis calculations for all symbols.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
