import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
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

  useEffect(() => {
    loadJobs();
    loadJobsSummary();
  }, []);

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      if (response.ok) {
        const data: JobConfiguration[] = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  };

  const runUniverseRefreshNow = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/universe/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ download: true }) });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Universe refreshed: inserted ${data.inserted}, updated ${data.updated}`);
        await loadJobsSummary();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err.detail || 'Failed to refresh'}`);
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const truncateSymbolsTable = async () => {
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

  const toggleJobHistory = async (jobName: string) => {
    const open = !historyOpen[jobName];
    setHistoryOpen({ ...historyOpen, [jobName]: open });
    if (open) {
      try {
        const res = await fetch(`/api/jobs/${jobName}/status?limit=5`);
        if (res.ok) {
          const data = await res.json();
          setHistories({ ...histories, [jobName]: data });
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const loadJobsSummary = async () => {
    try {
      const response = await fetch('/api/jobs/summary');
      if (response.ok) {
        const data: JobSummary[] = await response.json();
        setJobsSummary(data);
      }
    } catch (error) {
      console.error('Error loading jobs summary:', error);
    }
  };

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
                    <Button size="sm" variant="outline" onClick={() => toggleJobHistory(job.job_name)}>
                      {historyOpen[job.job_name] ? 'Hide History' : 'Show History'}
                    </Button>
                    {job.job_name === 'nasdaq_universe_refresh' && (
                      <>
                        <Button size="sm" onClick={runUniverseRefreshNow} disabled={loading}>Run Now</Button>
                        <Button size="sm" variant="destructive" onClick={truncateSymbolsTable} disabled={loading}>Truncate Symbols</Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {job.last_run && (
                <CardContent className="border-t">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Last Run:</span>
                      <Badge variant={getStatusBadgeVariant(job.last_run.status)}>
                        {job.last_run.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Started:</span> {formatDateTime(job.last_run.started_at)}
                      </div>
                      {job.last_run.completed_at && (
                        <div>
                          <span className="font-medium">Completed:</span> {formatDateTime(job.last_run.completed_at)}
                        </div>
                      )}
                      {job.last_run.duration_seconds && job.last_run.completed_at && (
                        <div>
                          <span className="font-medium">Duration:</span> {job.last_run.duration_seconds}s
                        </div>
                      )}
                      {!job.last_run.completed_at && (
                        <div>
                          <span className="font-medium">Elapsed:</span> {formatDuration((Date.now() - new Date(job.last_run.started_at).getTime()) / 1000)}
                        </div>
                      )}
                      {job.last_run.records_processed && (
                        <div>
                          <span className="font-medium">Records:</span> {job.last_run.records_processed}
                        </div>
                      )}
                    </div>
                    {job.last_run.error_message && (
                      <div className="text-sm text-red-600 mt-2">
                        <span className="font-medium">Error:</span> {job.last_run.error_message}
                      </div>
                    )}
                    {job.last_run.next_run_at && (
                      <div className="text-sm text-blue-600 mt-2">
                        <span className="font-medium">Next Run:</span> {formatDateTime(job.last_run.next_run_at)}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}

              {isEditing && jobConfig && renderEditForm(jobConfig)}

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
                          <span className="ml-2">{formatDateTime(h.started_at)}</span>
                        </div>
                        <div className="text-gray-600">
                          {h.records_processed ? (<span>{h.records_processed} records</span>) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
