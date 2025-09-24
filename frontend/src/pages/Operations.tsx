import React, { useEffect, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  GlobeAmericasIcon,
} from '@heroicons/react/24/outline';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { HistoryLoader } from '../components/HistoryLoader';
import { PricesBrowser as PricesBrowserComponent } from '../components/PricesBrowser';
import JobStatus from './JobStatus';
import { JobSettings } from './JobSettings';
import jobsApi, { jobsApiService, JobSummaryResponse } from '../services/jobsApi';
import { formatChicago } from '../utils/dateUtils';

const jobNameOverrides: Record<string, string> = {
  update_market_data: 'Market Data Refresh',
  market_data_refresh: 'Market Data Refresh',
  refresh_universe: 'Universe Refresh',
  nasdaq_universe_refresh: 'Universe Refresh',
  eod_price_scan: 'EOD Price Scan',
  technical_compute: 'Technical Compute',
  job_ttl_cleanup: 'TTL Cleanup',
  job_ttl_cleanup_daily: 'TTL Cleanup',
  job_ttl_cleanup_weekly: 'TTL Cleanup (Weekly)',
  tech_analysis: 'Technical Analysis',
};

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type SectionId =
  | 'run-jobs'
  | 'job-settings'
  | 'job-status'
  | 'history-import'
  | 'prices-browser'
  | 'universe';

interface SectionMeta {
  id: SectionId;
  label: string;
  icon: IconComponent;
}

const sectionMeta: SectionMeta[] = [
  { id: 'run-jobs', label: 'Run Jobs', icon: BoltIcon },
  { id: 'job-status', label: 'Job Status', icon: CheckCircleIcon },
  { id: 'job-settings', label: 'Job Settings', icon: Cog6ToothIcon },
  { id: 'history-import', label: 'History Import', icon: ArrowDownTrayIcon },
  { id: 'prices-browser', label: 'Prices Browser', icon: ChartBarIcon },
  { id: 'universe', label: 'Universe Explorer', icon: GlobeAmericasIcon },
];

const sectionAccent: Record<SectionId, string> = {
  'run-jobs': 'from-indigo-500 via-purple-500 to-indigo-500',
  'history-import': 'from-teal-500 via-emerald-500 to-teal-500',
  'prices-browser': 'from-sky-500 via-blue-500 to-sky-500',
  'job-settings': 'from-amber-500 via-orange-500 to-amber-500',
  'job-status': 'from-rose-500 via-red-500 to-rose-500',
  universe: 'from-slate-500 via-blue-600 to-slate-500',
};

const sectionBadge: Record<SectionId, string> = {
  'run-jobs': 'Manual Controls',
  'history-import': 'History',
  'prices-browser': 'Pricing Tools',
  'job-settings': 'Configuration',
  'job-status': 'Monitoring',
  universe: 'Universe Data',
};

interface SectionCardProps {
  id: SectionId;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const SectionCard: React.FC<SectionCardProps> = ({ id, title, description, children, className = '' }) => (
  <Card
    className={`relative overflow-hidden border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md ${className}`}
  >
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${sectionAccent[id]}`}
    />
    <CardHeader className="pb-4">
      <Badge
        variant="secondary"
        className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
      >
        {sectionBadge[id]}
      </Badge>
      <CardTitle className="text-xl font-semibold text-slate-900">{title}</CardTitle>
      {description && <p className="text-sm text-slate-600">{description}</p>}
    </CardHeader>
    <CardContent className="pt-0">
      {children}
    </CardContent>
  </Card>
);

type FeedbackState = { type: 'success' | 'error'; message: string; jobName?: string } | null;

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary';

const formatJobName = (jobName: string): string => {
  if (jobNameOverrides[jobName]) return jobNameOverrides[jobName];
  return jobName
    .split(/[_-]/)
    .map(part => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'Not yet run';
  return formatChicago(value) || value;
};

const statusVariant = (status?: string): ButtonVariant => {
  if (!status) return 'secondary';
  const normalized = status.toLowerCase();
  if (normalized === 'completed' || normalized === 'success') return 'default';
  if (normalized === 'failed') return 'destructive';
  if (normalized === 'running' || normalized === 'in_progress') return 'outline';
  return 'secondary';
};

const RunJobsPanel: React.FC<{ onNavigateToStatus: () => void }> = ({ onNavigateToStatus }) => {
  const [jobs, setJobs] = useState<JobSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [jobLoading, setJobLoading] = useState<string | null>(null);
  const [eodDates, setEodDates] = useState<{ start: string; end: string }>({ start: '', end: '' });

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await jobsApiService.getJobsSummary();
      setJobs(data);
    } catch (error) {
      console.error('Failed to load jobs summary', error);
      setFeedback({ type: 'error', message: 'Unable to load job summaries right now.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();

    // Auto-refresh job status every 30 seconds
    const refreshInterval = setInterval(() => {
      loadJobs();
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, []);

  const runHandlers: Record<string, () => Promise<string | null>> = {
    update_market_data: async () => {
      const res = await jobsApiService.runMarketDataRefresh();
      return res.message;
    },
    market_data_refresh: async () => {
      const res = await jobsApiService.runMarketDataRefresh();
      return res.message;
    },
    universe_refresh: async () => {
      const res = await jobsApiService.runUniverseRefresh();
      return res.message;
    },
    refresh_universe: async () => {
      const res = await jobsApiService.runUniverseRefresh();
      return res.message;
    },
    nasdaq_universe_refresh: async () => {
      const res = await jobsApiService.runUniverseRefresh();
      return res.message;
    },
    eod_scan: async () => {
      // Use date parameters if provided, otherwise run without dates
      const res = await jobsApiService.runEodScan(
        eodDates.start || undefined,
        eodDates.end || undefined
      );
      return res.message;
    },
    eod_price_scan: async () => {
      // Use date parameters if provided, otherwise run without dates
      const res = await jobsApiService.runEodScan(
        eodDates.start || undefined,
        eodDates.end || undefined
      );
      return res.message;
    },
    technical_compute: async () => {
      const res = await jobsApiService.runTechAnalysis();
      return res.message;
    },
    tech_analysis: async () => {
      const res = await jobsApiService.runTechAnalysis();
      return res.message;
    },
    job_ttl_cleanup: async () => {
      const response = await jobsApi.post('/jobs/job_ttl_cleanup/run');
      return response.data.message;
    },
    schwab_token_validation: async () => {
      const res = await jobsApiService.runTokenValidation();
      return res.message;
    },
  };

  const runJob = async (job: JobSummaryResponse) => {
    setFeedback(null);
    setJobLoading(job.job_name);

    try {
      const runner = runHandlers[job.job_name];
      if (!runner) {
        throw new Error(`No handler found for job: ${job.job_name}`);
      }

      const message = await runner();
      setFeedback({
        type: 'success',
        jobName: job.job_name,
        message: message || `${formatJobName(job.job_name)} triggered successfully.`,
      });
      if (job.job_name.toLowerCase().includes('eod')) {
        setEodDates({ start: '', end: '' });
      }
      await loadJobs();

      // Auto-navigate to job status after successfully starting a job
      setTimeout(() => {
        onNavigateToStatus();
      }, 1500); // Wait 1.5 seconds to let user see the success message
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start the selected job.';
      setFeedback({ type: 'error', message });
    } finally {
      setJobLoading(null);
    }
  };

  const eodJob = jobs.find(job => job.job_name.toLowerCase().includes('eod')) || null;
  const otherJobs = jobs.filter(job => !job.job_name.toLowerCase().includes('eod'));

  const renderJobCard = (job: JobSummaryResponse, options: { showEodControls?: boolean } = {}) => {
    const showEodControls = options.showEodControls === true;
    const prettyName = formatJobName(job.job_name);
    const lastStatusRaw = job.last_run?.status ? job.last_run.status.toLowerCase() : null;
    const statusBadgeVariant = lastStatusRaw ? statusVariant(lastStatusRaw) : 'outline';
    const lastRunDisplay = job.last_run?.started_at
      ? `Last run: ${formatDateTime(job.last_run.started_at)}`
      : 'Last run: Not yet run';
    const lastRunClass = !lastStatusRaw
      ? 'text-amber-600'
      : lastStatusRaw === 'completed'
        ? 'text-green-600'
        : lastStatusRaw === 'failed'
          ? 'text-red-600'
          : lastStatusRaw === 'running'
            ? 'text-indigo-600'
            : 'text-slate-600';
    const isDisabled = !job.enabled;
    const isRunning = lastStatusRaw === 'running';
    const isLoadingJob = jobLoading === job.job_name;
    const runLabel = isLoadingJob ? 'Starting…' : isRunning ? 'Running…' : `Run ${prettyName}`;

    const headerBlock = (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{prettyName}</p>
          <p className="text-xs text-slate-500">{job.description}</p>
          <p className={`mt-1 text-xs font-medium ${lastRunClass}`}>{lastRunDisplay}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDisabled ? 'secondary' : 'default'}>
            {isDisabled ? 'DISABLED' : 'ENABLED'}
          </Badge>
          <Badge variant={statusBadgeVariant}>
            {lastStatusRaw ? lastStatusRaw.toUpperCase() : 'NOT YET RUN'}
          </Badge>
        </div>
      </div>
    );

    const scheduleBlock = (
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-medium text-slate-600">Schedule</div>
        <div>{job.schedule_display}</div>
        {job.last_run?.error_message && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
            {job.last_run.error_message}
          </div>
        )}
      </div>
    );

    if (showEodControls) {
      const dateInputClass = 'w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

      return (
        <div key={job.job_name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 lg:max-w-2xl">
              {headerBlock}
              {scheduleBlock}
            </div>
            <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Manual run options</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500" htmlFor={`eod-start-${job.job_name}`}>
                    Start date
                  </label>
                  <input
                    id={`eod-start-${job.job_name}`}
                    type="date"
                    value={eodDates.start}
                    max={eodDates.end || ''}
                    className={dateInputClass}
                    onChange={event => setEodDates(prev => ({ ...prev, start: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500" htmlFor={`eod-end-${job.job_name}`}>
                    End date
                  </label>
                  <input
                    id={`eod-end-${job.job_name}`}
                    type="date"
                    value={eodDates.end}
                    min={eodDates.start || ''}
                    className={dateInputClass}
                    onChange={event => setEodDates(prev => ({ ...prev, end: event.target.value }))}
                  />
                </div>
              </div>
              <Button
                variant={isDisabled ? 'secondary' : 'default'}
                className="w-full justify-center"
                onClick={() => runJob(job)}
                disabled={isDisabled || isRunning || isLoadingJob}
              >
                {runLabel}
              </Button>
              <p className="text-[11px] text-slate-500">Leave dates blank to run using today&apos;s trading session.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="justify-center sm:w-40" onClick={onNavigateToStatus}>
              View Status
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div key={job.job_name} className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {headerBlock}
          {scheduleBlock}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant={isDisabled ? 'secondary' : 'default'}
            className="justify-center"
            onClick={() => runJob(job)}
            disabled={isDisabled || isRunning || isLoadingJob}
          >
            {runLabel}
          </Button>
          <Button
            variant="outline"
            className="justify-center"
            onClick={onNavigateToStatus}
          >
            View Status
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AlertDescription>{feedback.message}</AlertDescription>
            {feedback.type === 'success' && (
              <Button size="sm" variant="outline" onClick={onNavigateToStatus}>
                View Job Status
              </Button>
            )}
          </div>
        </Alert>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Loading job catalogue…
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          No jobs found. Configure jobs under the Job Settings tab first.
        </div>
      ) : (
        <>
          {eodJob && (
            <div className="space-y-4">
              {renderJobCard(eodJob, { showEodControls: true })}
            </div>
          )}
          {otherJobs.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {otherJobs.map(job => renderJobCard(job))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Operations: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionId>('run-jobs');

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'run-jobs':
        return (
          <SectionCard
            id="run-jobs"
            title="Run Jobs"
            description="Trigger individual jobs on demand with a consistent, easy-to-scan control surface."
            className="bg-gradient-to-br from-white via-white to-indigo-50/60"
          >
            <RunJobsPanel onNavigateToStatus={() => setActiveSection('job-status')} />
          </SectionCard>
        );
      case 'job-settings':
        return (
          <SectionCard
            id="job-settings"
            title="Job Settings"
            description="Enable or pause jobs, adjust scheduling rules, and manage OAuth and market-hour preferences."
            className="bg-gradient-to-br from-white via-white to-amber-50/60"
          >
            <JobSettings />
          </SectionCard>
        );
      case 'job-status':
        return (
          <SectionCard
            id="job-status"
            title="Job Status & Telemetry"
            description="Review recent runs, errors, and throughput for import, scan, and technical jobs."
            className="bg-gradient-to-br from-white via-white to-rose-50/60"
          >
            <JobStatus />
          </SectionCard>
        );
      case 'history-import':
        return (
          <SectionCard
            id="history-import"
            title="Historical Price Import"
            description="Bulk import OHLCV files, monitor progress, and clean up completed runs."
            className="bg-gradient-to-br from-white via-white to-emerald-50/60"
          >
            <HistoryLoader />
          </SectionCard>
        );
      case 'prices-browser':
        return (
          <SectionCard
            id="prices-browser"
            title="Prices Browser"
            description="Explore time series data by ticker, timeframe, and technical overlays."
            className="bg-gradient-to-br from-white via-white to-sky-50/60"
          >
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <PricesBrowserComponent />
            </div>
          </SectionCard>
        );
      case 'universe':
        return (
          <SectionCard
            id="universe"
            title="Universe Explorer"
            description="Inspect the full symbol universe, validate recent imports, and spot data gaps quickly."
            className="bg-gradient-to-br from-white via-white to-slate-50/60"
          >
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">Launch the standalone explorer</p>
                    <p className="text-xs text-slate-600">
                      The universe explorer opens in a new tab so you can keep operations visible while auditing symbols.
                    </p>
                  </div>
                  <Button
                    variant="default"
                    className="whitespace-nowrap"
                    onClick={() => window.open('/universe', '_blank', 'noopener,noreferrer')}
                  >
                    Open Explorer
                    <ArrowTopRightOnSquareIcon className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Best practices</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    <li>• Confirm ticker coverage after large history imports.</li>
                    <li>• Spot stale listings quickly with the last-updated column.</li>
                    <li>• Use filters to isolate exchanges or asset classes before exporting.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Shortcut links</p>
                  <ul className="mt-3 space-y-2 text-xs text-blue-600">
                    <li>
                      <a className="hover:underline" href="/universe" target="_blank" rel="noreferrer">
                        Open universe explorer
                      </a>
                    </li>
                    <li>
                      <a
                        className="hover:underline"
                        href="/operations#history-import"
                        onClick={event => {
                          event.preventDefault();
                          setActiveSection('history-import');
                        }}
                      >
                        Import history & review logs
                      </a>
                    </li>
                    <li>
                      <a
                        className="hover:underline"
                        href="/operations#run-jobs"
                        onClick={event => {
                          event.preventDefault();
                          setActiveSection('run-jobs');
                        }}
                      >
                        Run manual maintenance tasks
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </SectionCard>
        );
      default:
        return (
          <SectionCard
            id="run-jobs"
            title="Run Jobs"
            description="Trigger individual jobs on demand with a consistent, easy-to-scan control surface."
            className="bg-gradient-to-br from-white via-white to-indigo-50/60"
          >
            <RunJobsPanel onNavigateToStatus={() => setActiveSection('job-status')} />
          </SectionCard>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 xl:flex-row">
        <aside className="order-1 w-full xl:w-72">
          <div className="space-y-6 xl:sticky xl:top-10">
            <Card className="border border-slate-200 bg-white shadow-sm xl:shadow-md">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-slate-900">Operations Menu</CardTitle>
                <p className="text-sm text-slate-600">Jump to any workspace module.</p>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {sectionMeta.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 ${
                      activeSection === section.id
                        ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm font-semibold'
                        : 'text-slate-600'
                    }`}
                  >
                    <section.icon className="h-4 w-4" />
                    <span>{section.label}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="hidden border border-slate-200 bg-white shadow-sm xl:block">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold text-slate-900">Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-sm text-slate-600">
                <p>
                  Use the Run Jobs console to launch maintenance tasks, then review their telemetry under Job Status.
                </p>
                <p>
                  Keep the universe explorer open in a separate tab while importing history to validate that new tickers land correctly.
                </p>
              </CardContent>
            </Card>
          </div>
        </aside>

        <main className="order-2 flex-1 space-y-10">
          {renderActiveSection()}
        </main>
      </div>
    </div>
  );
};

export default Operations;
