import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { jobsApiService, CleanupResponse } from '../services/jobsApi'
import { ChevronDownIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { formatChicagoDateTime, formatChicago } from '../utils/dateUtils'
import { Input } from '../components/ui/input'

type EodScan = {
  id: number
  status: 'running' | 'completed' | 'failed' | 'skipped'
  scan_date: string
  started_at?: string
  completed_at?: string
  symbols_requested: number
  symbols_fetched: number
  error_count: number
}

type ImportJob = {
  id: number
  status: string
  started_at?: string
  completed_at?: string
  folder_path: string
  total_files: number
  processed_files: number
  total_rows: number
  inserted_rows: number
  error_count: number
  current_file?: string
  current_folder?: string
}

type EodScanError = {
  id: number
  occurred_at: string
  symbol: string
  error_type: string
  error_message: string
  http_status?: number
}

type TokenStatus = {
  valid: boolean
  stale: boolean
  obtained_at?: number
  age_seconds?: number
  expires_in?: number
  credentials_available: boolean
  message?: string
}

const JobStatus: React.FC = () => {
  const [eodScans, setEodScans] = useState<EodScan[]>([])
  const [importJobs, setImportJobs] = useState<ImportJob[]>([])
  const [techJobs, setTechJobs] = useState<any[]>([])
  const [universeJobs, setUniverseJobs] = useState<any[]>([])
  const [ttlCleanupJobs, setTtlCleanupJobs] = useState<any[]>([])
  const [marketRefreshJobs, setMarketRefreshJobs] = useState<any[]>([])
  const [dailyMoversJobs, setDailyMoversJobs] = useState<any[]>([])
  const [dailySignalsJobs, setDailySignalsJobs] = useState<any[]>([])
  const [weeklyBarsJobs, setWeeklyBarsJobs] = useState<any[]>([])
  const [weeklyTechnicalsJobs, setWeeklyTechnicalsJobs] = useState<any[]>([])
  const [weeklySignalsJobs, setWeeklySignalsJobs] = useState<any[]>([])
  const [selectedTechJobId, setSelectedTechJobId] = useState<number | null>(null)
  const [techSkips, setTechSkips] = useState<any[]>([])
  const [techSuccesses, setTechSuccesses] = useState<any[]>([])
  const [techErrors, setTechErrors] = useState<any[]>([])
  const [techLoading, setTechLoading] = useState(false)
  const [skipOffset, setSkipOffset] = useState(0)
  const [successOffset, setSuccessOffset] = useState(0)
  const [errorOffset, setErrorOffset] = useState(0)
  const [expandedScanId, setExpandedScanId] = useState<number | null>(null)
  const [scanErrors, setScanErrors] = useState<Record<number, EodScanError[]>>({})
  const [loadingErrors, setLoadingErrors] = useState<Record<number, boolean>>({})
  const [expandedTechJobId, setExpandedTechJobId] = useState<number | null>(null)
  const [techJobErrors, setTechJobErrors] = useState<Record<number, any[]>>({})
  const [loadingTechErrors, setLoadingTechErrors] = useState<Record<number, boolean>>({})
  const [expandedTechSkipsId, setExpandedTechSkipsId] = useState<number | null>(null)
  const [techJobSkips, setTechJobSkips] = useState<Record<number, any[]>>({})
  const [loadingTechSkips, setLoadingTechSkips] = useState<Record<number, boolean>>({})
  const [refreshingTechErrors, setRefreshingTechErrors] = useState<Record<number, boolean>>({})
  const [refreshingTechSkips, setRefreshingTechSkips] = useState<Record<number, boolean>>({})
  const [jobHistories, setJobHistories] = useState<Record<string, any[]>>({})
  const [jobHistoryOpen, setJobHistoryOpen] = useState<Record<string, boolean>>({})
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<CleanupResponse | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    schwab: true,
    eod: true,
    tech: true,
    universe: true,
    ttl: true,
    marketRefresh: true,
    dailyMovers: true,
    dailySignals: true,
    weeklyBars: true,
    weeklyTechnicals: true,
    weeklySignals: true,
    import: true
  })
  const [refreshingErrors, setRefreshingErrors] = useState<Record<number, boolean>>({})
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)

  const loadTokenStatus = async () => {
    setTokenLoading(true)

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setTokenLoading(false)
      setTokenStatus({
        valid: false,
        stale: true,
        credentials_available: false,
        message: 'Request timed out - external-apis service may be unavailable'
      })
    }, 10000) // 10 second timeout

    try {
      const response = await fetch('http://localhost:8003/schwab/auth/status', {
        signal: AbortSignal.timeout(8000) // 8 second fetch timeout
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        setTokenStatus({
          credentials_available: data.authenticated,
          valid: data.authenticated,
          stale: false,
          message: data.authenticated ? 'Refresh token configured' : 'Refresh token not configured'
        })
      } else {
        setTokenStatus({
          valid: false,
          stale: true,
          credentials_available: false,
          message: `Failed to check configuration (HTTP ${response.status})`
        })
      }
    } catch (error) {
      clearTimeout(timeoutId)
      setTokenStatus({
        valid: false,
        stale: true,
        credentials_available: false,
        message: `Cannot connect to external-apis service: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      setTokenLoading(false)
    }
  }

  const handleSchwabLogin = async () => {
    try {
      const response = await fetch('http://localhost:8003/schwab/oauth/url')
      if (response.ok) {
        const data = await response.json()
        window.open(data.authorization_url, '_blank')
      }
    } catch (error) {
      console.error('Failed to get OAuth URL:', error)
    }
  }



  const loadData = async () => {
    try {
      const [eodRes, jobsRes] = await Promise.all([
        fetch('http://localhost:8004/api/eod/scan/list'),
        fetch('/api/import/status'),
      ])
      if (eodRes.ok) setEodScans(await eodRes.json())
      if (jobsRes.ok) setImportJobs(await jobsRes.json())

      // Load universe jobs from jobs-service
      try {
        const universeJobsData = await jobsApiService.getJobStatus('nasdaq_universe_refresh', 10)
        setUniverseJobs(universeJobsData)
      } catch (e) {
        console.log('No universe jobs found or error loading universe jobs:', e)
        setUniverseJobs([])
      }

      // Load TTL cleanup jobs from jobs-service
      try {
        const ttlCleanupJobsData = await jobsApiService.getJobStatus('job_ttl_cleanup', 10)
        setTtlCleanupJobs(ttlCleanupJobsData)
      } catch (e) {
        console.log('No TTL cleanup jobs found or error loading TTL cleanup jobs:', e)
        setTtlCleanupJobs([])
      }

      // Load technical compute jobs from jobs-service
      try {
        const techJobsData = await jobsApiService.getTechJobList(10)
        setTechJobs(techJobsData)
      } catch (e) {
        console.log('No technical compute jobs found or error loading technical compute jobs:', e)
        setTechJobs([])
      }

      // Load market refresh jobs from jobs-service
      try {
        const marketRefreshJobsData = await jobsApiService.getJobStatus('update_market_data', 10)
        setMarketRefreshJobs(marketRefreshJobsData)
      } catch (e) {
        console.log('No market refresh jobs found or error loading market refresh jobs:', e)
        setMarketRefreshJobs([])
      }

      // Load daily movers jobs from jobs-service
      try {
        const dailyMoversJobsData = await jobsApiService.getJobStatus('daily_movers_calculation', 10)
        setDailyMoversJobs(dailyMoversJobsData)
      } catch (e) {
        console.log('No daily movers jobs found or error loading daily movers jobs:', e)
        setDailyMoversJobs([])
      }

      // Load daily signals jobs from jobs-service
      try {
        const dailySignalsJobsData = await jobsApiService.getJobStatus('daily_signals_computation', 10)
        setDailySignalsJobs(dailySignalsJobsData)
      } catch (e) {
        console.log('No daily signals jobs found or error loading daily signals jobs:', e)
        setDailySignalsJobs([])
      }

      // Load weekly bars jobs from jobs-service
      try {
        const weeklyBarsJobsData = await jobsApiService.getJobStatus('weekly_bars_etl', 10)
        setWeeklyBarsJobs(weeklyBarsJobsData)
      } catch (e) {
        console.log('No weekly bars jobs found or error loading weekly bars jobs:', e)
        setWeeklyBarsJobs([])
      }

      // Load weekly technicals jobs from jobs-service
      try {
        const weeklyTechnicalsJobsData = await jobsApiService.getJobStatus('weekly_technicals_etl', 10)
        setWeeklyTechnicalsJobs(weeklyTechnicalsJobsData)
      } catch (e) {
        console.log('No weekly technicals jobs found or error loading weekly technicals jobs:', e)
        setWeeklyTechnicalsJobs([])
      }

      // Load weekly signals jobs from jobs-service
      try {
        const weeklySignalsJobsData = await jobsApiService.getJobStatus('weekly_signals_computation', 10)
        setWeeklySignalsJobs(weeklySignalsJobsData)
      } catch (e) {
        console.log('No weekly signals jobs found or error loading weekly signals jobs:', e)
        setWeeklySignalsJobs([])
      }
    } catch (e) {
      console.error('Failed to load job status', e)
    }
  }

  useEffect(() => {
    loadData()
    loadTokenStatus()
    const t = setInterval(() => {
      loadData()
      loadTokenStatus()
    }, 30000) // Refresh every 30 seconds instead of 5 seconds
    return () => clearInterval(t)
  }, [])

  const toggleJobHistory = async (jobName: string) => {
    const open = !jobHistoryOpen[jobName]
    setJobHistoryOpen(prev => ({ ...prev, [jobName]: open }))
    if (open) {
      try {
        const data = await jobsApiService.getJobStatus(jobName, 5)
        setJobHistories(prev => ({ ...prev, [jobName]: data }))
      } catch (e) {
        // ignore
      }
    }
  }

  const toggleErrors = async (scanId: number) => {
    if (expandedScanId === scanId) {
      setExpandedScanId(null)
      return
    }
    setExpandedScanId(scanId)
    if (!scanErrors[scanId]) {
      setLoadingErrors(prev => ({ ...prev, [scanId]: true }))
      try {
        const res = await fetch(`http://localhost:8004/api/eod/scan/errors/${scanId}`)
        if (res.ok) {
          const errs: EodScanError[] = await res.json()
          setScanErrors(prev => ({ ...prev, [scanId]: errs }))
        }
      } catch (e) {
        console.error('Failed to load scan errors', e)
      } finally {
        setLoadingErrors(prev => ({ ...prev, [scanId]: false }))
      }
    }
  }

  const toggleTechErrors = async (jobId: number) => {
    if (expandedTechJobId === jobId) {
      setExpandedTechJobId(null)
      return
    }
    setExpandedTechJobId(jobId)
    if (!techJobErrors[jobId]) {
      setLoadingTechErrors(prev => ({ ...prev, [jobId]: true }))
      try {
        const errors = await jobsApiService.getTechJobErrors(jobId)
        setTechJobErrors(prev => ({ ...prev, [jobId]: errors }))
      } catch (e) {
        console.error('Failed to load tech job errors', e)
      } finally {
        setLoadingTechErrors(prev => ({ ...prev, [jobId]: false }))
      }
    }
  }

  const toggleTechSkips = async (jobId: number) => {
    if (expandedTechSkipsId === jobId) {
      setExpandedTechSkipsId(null)
      return
    }
    setExpandedTechSkipsId(jobId)
    if (!techJobSkips[jobId]) {
      setLoadingTechSkips(prev => ({ ...prev, [jobId]: true }))
      try {
        const skips = await jobsApiService.getTechJobSkips(jobId)
        setTechJobSkips(prev => ({ ...prev, [jobId]: skips }))
      } catch (e) {
        console.error('Failed to load tech job skips', e)
      } finally {
        setLoadingTechSkips(prev => ({ ...prev, [jobId]: false }))
      }
    }
  }

  const refreshTechErrors = async (jobId: number) => {
    setRefreshingTechErrors(prev => ({ ...prev, [jobId]: true }))
    try {
      const errors = await jobsApiService.getTechJobErrors(jobId)
      setTechJobErrors(prev => ({ ...prev, [jobId]: errors }))
    } catch (e) {
      console.error('Failed to refresh tech job errors', e)
    } finally {
      setRefreshingTechErrors(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const refreshTechSkips = async (jobId: number) => {
    setRefreshingTechSkips(prev => ({ ...prev, [jobId]: true }))
    try {
      const skips = await jobsApiService.getTechJobSkips(jobId)
      setTechJobSkips(prev => ({ ...prev, [jobId]: skips }))
    } catch (e) {
      console.error('Failed to refresh tech job skips', e)
    } finally {
      setRefreshingTechSkips(prev => ({ ...prev, [jobId]: false }))
    }
  }

  const handleCleanupStuckJobs = async () => {
    setCleanupLoading(true)
    try {
      const result = await jobsApiService.cleanupStuckJobs()
      setCleanupResult(result)
      // Refresh data after cleanup
      await loadData()
      // Clear result after 5 seconds
      setTimeout(() => setCleanupResult(null), 5000)
    } catch (e) {
      console.error('Failed to cleanup stuck jobs:', e)
      setCleanupResult({
        eod_scans: 0,
        job_executions: 0,
        message: 'Failed to cleanup stuck jobs'
      })
      setTimeout(() => setCleanupResult(null), 5000)
    } finally {
      setCleanupLoading(false)
    }
  }

  const toggleSection = (sectionName: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

  const refreshErrors = async (scanId: number) => {
    setRefreshingErrors(prev => ({ ...prev, [scanId]: true }))
    try {
      const res = await fetch(`http://localhost:8004/api/eod/scan/errors/${scanId}`)
      if (res.ok) {
        const errors = await res.json()
        setScanErrors(prev => ({ ...prev, [scanId]: errors }))
      }
    } catch (e) {
      console.error('Failed to refresh errors:', e)
    } finally {
      setRefreshingErrors(prev => ({ ...prev, [scanId]: false }))
    }
  }

  const hasRunningJobs = (sectionName: string) => {
    switch (sectionName) {
      case 'schwab':
        return false // Token status is not a running job
      case 'eod':
        return eodScans.some(scan => scan.status === 'running')
      case 'tech':
        return techJobs.some(job => job.status === 'running')
      case 'universe':
        return universeJobs.some(job => job.status === 'running')
      case 'ttl':
        return ttlCleanupJobs.some(job => job.status === 'running')
      case 'marketRefresh':
        return marketRefreshJobs.some(job => job.status === 'running')
      case 'dailyMovers':
        return dailyMoversJobs.some(job => job.status === 'running')
      case 'dailySignals':
        return dailySignalsJobs.some(job => job.status === 'running')
      case 'weeklyBars':
        return weeklyBarsJobs.some(job => job.status === 'running')
      case 'weeklyTechnicals':
        return weeklyTechnicalsJobs.some(job => job.status === 'running')
      case 'weeklySignals':
        return weeklySignalsJobs.some(job => job.status === 'running')
      case 'import':
        return importJobs.some(job => job.status === 'running')
      default:
        return false
    }
  }

  const getSectionHeaderClass = (sectionName: string) => {
    const baseClass = "flex items-center gap-2 cursor-pointer"
    if (hasRunningJobs(sectionName)) {
      return `${baseClass} text-blue-600 font-semibold`
    }
    return baseClass
  }

  const getSectionCardClass = (sectionName: string) => {
    const baseClass = "relative overflow-hidden border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md"
    if (hasRunningJobs(sectionName)) {
      return `${baseClass} border-blue-300 shadow-blue-100 ring-1 ring-blue-200`
    }
    return baseClass
  }

  const pct = (fetched: number, total: number) => {
    if (!total) return 0
    return Math.min(100, Math.round((fetched / total) * 100))
  }

  const progressPct = (fetched: number, errors: number, total: number) => {
    if (!total) return 0
    const attempted = fetched + errors
    return Math.min(100, Math.round((attempted / total) * 100))
  }

  const fmt = (n: number) => n.toLocaleString()
  const secs = (ms: number) => Math.max(1, Math.round(ms / 1000))
  const fmtDuration = (totalSeconds: number) => {
    const s = Math.max(0, Math.round(totalSeconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}h ${m}m ${sec}s`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
  }
  const rateAndEta = (s: EodScan) => {
    if (!s.started_at) return { rate: 0, etaSeconds: 0, elapsedSeconds: 0 }
    const start = new Date(s.started_at).getTime()
    const end = s.completed_at ? new Date(s.completed_at).getTime() : Date.now()
    const elapsedSec = secs(end - start)
    const processed = Math.max(0, s.symbols_fetched || 0)
    const rate = processed > 0 && elapsedSec > 0 ? processed / elapsedSec : 0
    const remaining = Math.max(0, (s.symbols_requested || 0) - processed)
    const etaSec = rate > 0 ? Math.round(remaining / rate) : 0
    return { rate, etaSeconds: etaSec, elapsedSeconds: elapsedSec }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Cleanup Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Status</h1>
          <p className="text-sm text-gray-600">Monitor and manage running jobs</p>
        </div>
        <div className="flex items-center gap-4">
          {cleanupResult && (
            <div className={`text-sm px-3 py-1 rounded ${
              cleanupResult.message.includes('Failed')
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
            }`}>
              Cleaned: {cleanupResult.eod_scans} EOD scans, {cleanupResult.job_executions} job executions
            </div>
          )}
          <Button
            onClick={handleCleanupStuckJobs}
            disabled={cleanupLoading}
            variant="outline"
            size="sm"
          >
            {cleanupLoading ? 'Cleaning...' : 'Cleanup Stuck Jobs'}
          </Button>
        </div>
      </div>


      <Card className={getSectionCardClass('eod')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('eod')} onClick={() => toggleSection('eod')}>
              {collapsedSections['eod'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>EOD Scan</CardTitle>
              {hasRunningJobs('eod') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['eod'] && (
            <p className="text-sm text-slate-600">Latest EOD price scans with progression and error visibility.</p>
          )}
        </CardHeader>
        {!collapsedSections['eod'] && (
        <CardContent>
          {eodScans.length === 0 ? (
            <div className="text-gray-500">No scans yet.</div>
          ) : (
            <div className="space-y-3">
              {eodScans.map((s) => (
                <div key={s.id} className={`border rounded p-3 ${s.status === 'running' ? 'border-blue-300 bg-blue-50' : ''}`}>
                  <div className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium">Scan #{s.id}</span> · {s.scan_date}
                    </div>
                    <div className={s.status === 'completed' ? 'text-green-600' : s.status === 'running' ? 'text-blue-600' : 'text-red-600'}>
                      {s.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-700 flex flex-wrap gap-4">
                    <div>Requested: {fmt(s.symbols_requested)}</div>
                    <div>Fetched: {fmt(s.symbols_fetched)}</div>
                    <div>Errors: {fmt(s.error_count)}</div>
                    <div>Progress: {progressPct(s.symbols_fetched, s.error_count, s.symbols_requested)}%</div>
                    <div>
                      {(() => {
                        const re = rateAndEta(s)
                        const etaText = re.etaSeconds > 0 && s.status === 'running' ? fmtDuration(re.etaSeconds) : '-'
                        const elapsedText = fmtDuration(re.elapsedSeconds)
                        return (
                          <span>
                            Rate: {re.rate.toFixed(2)}/s · ETA: {etaText} · Elapsed: {elapsedText}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded mt-2">
                    <div className="bg-blue-500 h-2 rounded" style={{ width: `${pct(s.symbols_fetched, s.symbols_requested)}%` }} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleErrors(s.id)}>
                      {expandedScanId === s.id ? 'Hide Errors' : 'View Errors'}
                    </Button>
                    {expandedScanId === s.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refreshErrors(s.id)}
                        disabled={refreshingErrors[s.id]}
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${refreshingErrors[s.id] ? 'animate-spin' : ''}`} />
                        {refreshingErrors[s.id] ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    )}
                  </div>
                  {expandedScanId === s.id && (
                    <div className="mt-3 border-t pt-3">
                      {loadingErrors[s.id] && <div className="text-sm text-gray-500">Loading errors…</div>}
                      {!loadingErrors[s.id] && scanErrors[s.id] && scanErrors[s.id].length === 0 && (
                        <div className="text-sm text-gray-500">No errors recorded.</div>
                      )}
                      {!loadingErrors[s.id] && scanErrors[s.id] && scanErrors[s.id].length > 0 && (
                        <div className="max-h-64 overflow-y-auto text-sm">
                          {scanErrors[s.id].map(err => (
                            <div key={err.id} className="border-l-4 border-red-400 pl-3 py-2 mb-2 bg-red-50">
                              <div className="text-red-700 font-medium">{err.error_type} {err.http_status ? `(HTTP ${err.http_status})` : ''}</div>
                              <div className="text-gray-800">{err.symbol}</div>
                              <div className="text-gray-700 break-all">{err.error_message}</div>
                              <div className="text-xs text-gray-500 mt-1">{formatChicagoDateTime(err.occurred_at)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      <Card className={getSectionCardClass('tech')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('tech')} onClick={() => toggleSection('tech')}>
              {collapsedSections['tech'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Technical Compute</CardTitle>
              {hasRunningJobs('tech') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['tech'] && (
            <p className="text-sm text-slate-600">Technical analysis computation jobs with symbol progress and error tracking.</p>
          )}
        </CardHeader>
        {!collapsedSections['tech'] && (
        <CardContent>
          {techJobs.length === 0 ? (
            <div className="text-gray-500">No technical jobs yet.</div>
          ) : (
            <div className="space-y-3">
              {techJobs.map((j: any) => {
                const processedSymbols = (j.updated_symbols || 0) + (j.error_count || 0) + (j.skip_count || 0)
                const progressPct = j.total_symbols > 0 ? Math.round((processedSymbols / j.total_symbols) * 100) : 0
                const rate = j.total_symbols > 0 && j.started_at ? processedSymbols / ((new Date().getTime() - new Date(j.started_at).getTime()) / 1000) : 0

                return (
                  <div key={j.id} className={`border rounded p-3 ${j.status === 'running' ? 'border-blue-300 bg-blue-50' : ''}`}>
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="font-medium">Job #{j.id}</span> · {j.latest_trade_date || 'N/A'}
                      </div>
                      <div className={j.status === 'completed' ? 'text-green-600' : j.status === 'running' ? 'text-blue-600' : 'text-red-600'}>
                        {j.status.toUpperCase()}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-700 flex flex-wrap gap-4">
                      <div>Total: {fmt(j.total_symbols || 0)}</div>
                      <div>Updated: {fmt(j.updated_symbols || 0)}</div>
                      <div>Errors: {fmt(j.error_count || 0)}</div>
                      <div>Skips: {fmt(j.skip_count || 0)}</div>
                      <div>Successes: {fmt(j.success_count || 0)}</div>
                      <div>Progress: {progressPct}%</div>
                      {j.status === 'running' && (
                        <div>Rate: {rate.toFixed(2)}/s</div>
                      )}
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded mt-2">
                      <div className="bg-blue-500 h-2 rounded" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Daily rows: {fmt(j.daily_rows_upserted || 0)} · Latest rows: {fmt(j.latest_rows_upserted || 0)}
                    </div>
                    <div className="mt-3 flex gap-2">
                      {(j.error_count > 0) && (
                        <Button variant="outline" size="sm" onClick={() => toggleTechErrors(j.id)}>
                          {expandedTechJobId === j.id ? 'Hide Errors' : 'View Errors'}
                        </Button>
                      )}
                      {(j.skip_count > 0) && (
                        <Button variant="outline" size="sm" onClick={() => toggleTechSkips(j.id)}>
                          {expandedTechSkipsId === j.id ? 'Hide Skips' : 'View Skips'}
                        </Button>
                      )}
                    </div>
                    {expandedTechJobId === j.id && (
                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-medium">Errors</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshTechErrors(j.id)}
                            disabled={refreshingTechErrors[j.id]}
                          >
                            <ArrowPathIcon className={`h-4 w-4 ${refreshingTechErrors[j.id] ? 'animate-spin' : ''}`} />
                            {refreshingTechErrors[j.id] ? 'Refreshing...' : 'Refresh'}
                          </Button>
                        </div>
                        {loadingTechErrors[j.id] && <div className="text-sm text-gray-500">Loading errors…</div>}
                        {!loadingTechErrors[j.id] && techJobErrors[j.id] && techJobErrors[j.id].length === 0 && (
                          <div className="text-sm text-gray-500">No errors recorded.</div>
                        )}
                        {!loadingTechErrors[j.id] && techJobErrors[j.id] && techJobErrors[j.id].length > 0 && (
                          <div className="max-h-64 overflow-y-auto text-sm">
                            {techJobErrors[j.id].map((err: any) => (
                              <div key={err.id} className="border-l-4 border-red-400 pl-3 py-2 mb-2 bg-red-50">
                                <div className="text-red-700 font-medium">Error</div>
                                <div className="text-gray-800">{err.symbol}</div>
                                <div className="text-gray-700 break-all">{err.error_message}</div>
                                <div className="text-xs text-gray-500 mt-1">{formatChicagoDateTime(err.occurred_at)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {expandedTechSkipsId === j.id && (
                      <div className="mt-3 border-t pt-3">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-medium">Skips</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshTechSkips(j.id)}
                            disabled={refreshingTechSkips[j.id]}
                          >
                            <ArrowPathIcon className={`h-4 w-4 ${refreshingTechSkips[j.id] ? 'animate-spin' : ''}`} />
                            {refreshingTechSkips[j.id] ? 'Refreshing...' : 'Refresh'}
                          </Button>
                        </div>
                        {loadingTechSkips[j.id] && <div className="text-sm text-gray-500">Loading skips…</div>}
                        {!loadingTechSkips[j.id] && techJobSkips[j.id] && techJobSkips[j.id].length === 0 && (
                          <div className="text-sm text-gray-500">No skips recorded.</div>
                        )}
                        {!loadingTechSkips[j.id] && techJobSkips[j.id] && techJobSkips[j.id].length > 0 && (
                          <div className="max-h-64 overflow-y-auto text-sm">
                            {techJobSkips[j.id].map((skip: any) => (
                              <div key={skip.id} className="border-l-4 border-yellow-400 pl-3 py-2 mb-2 bg-yellow-50">
                                <div className="text-yellow-700 font-medium">{skip.reason}</div>
                                <div className="text-gray-800">{skip.symbol}</div>
                                <div className="text-gray-700 break-all">{skip.detail || 'No additional details'}</div>
                                <div className="text-xs text-gray-500 mt-1">{formatChicagoDateTime(skip.created_at)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {j.message && (
                      <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                        {j.message}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Background Jobs moved to Job Settings page */}

      <Card className={getSectionCardClass('universe')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('universe')} onClick={() => toggleSection('universe')}>
              {collapsedSections['universe'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Universe Refresh Jobs</CardTitle>
              {hasRunningJobs('universe') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['universe'] && (
            <p className="text-sm text-slate-600">NASDAQ universe refresh job history and status.</p>
          )}
        </CardHeader>
        {!collapsedSections['universe'] && (
        <CardContent>
          {universeJobs.length === 0 ? (
            <div className="text-gray-500">No universe refresh jobs found.</div>
          ) : (
            <div className="space-y-3">
              {universeJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Universe Refresh #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600 mt-1">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Records processed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'running' ? 'secondary' :
                          job.status === 'failed' ? 'destructive' : 'outline'
                        }
                      >
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                      {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      <Card className={getSectionCardClass('ttl')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('ttl')} onClick={() => toggleSection('ttl')}>
              {collapsedSections['ttl'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>TTL Cleanup Jobs</CardTitle>
              {hasRunningJobs('ttl') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['ttl'] && (
            <p className="text-sm text-slate-600">TTL cleanup job history - keeps latest 5 records for all job types.</p>
          )}
        </CardHeader>
        {!collapsedSections['ttl'] && (
        <CardContent>
          {ttlCleanupJobs.length === 0 ? (
            <div className="text-gray-500">No TTL cleanup jobs found.</div>
          ) : (
            <div className="space-y-3">
              {ttlCleanupJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        TTL Cleanup #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600 mt-1">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Records cleaned up: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                      {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Market Refresh Jobs */}
      <Card className={getSectionCardClass('marketRefresh')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('marketRefresh')} onClick={() => toggleSection('marketRefresh')}>
              {collapsedSections['marketRefresh'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Market Data Refresh Jobs</CardTitle>
              {hasRunningJobs('marketRefresh') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['marketRefresh'] && (
            <p className="text-sm text-slate-600">Market data refresh job history - updates price cache every 30 minutes during market hours.</p>
          )}
        </CardHeader>
        {!collapsedSections['marketRefresh'] && (
        <CardContent>
          {marketRefreshJobs.length === 0 ? (
            <div className="text-gray-500">No market refresh jobs found.</div>
          ) : (
            <div className="space-y-3">
              {marketRefreshJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Market Data Refresh #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Symbols refreshed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Daily Movers Jobs */}
      <Card className={getSectionCardClass('dailyMovers')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('dailyMovers')} onClick={() => toggleSection('dailyMovers')}>
              {collapsedSections['dailyMovers'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Daily Movers Calculation Jobs</CardTitle>
              {hasRunningJobs('dailyMovers') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['dailyMovers'] && (
            <p className="text-sm text-slate-600">Daily top movers calculation job history - computes top 5 gainers/losers per sector and market cap.</p>
          )}
        </CardHeader>
        {!collapsedSections['dailyMovers'] && (
        <CardContent>
          {dailyMoversJobs.length === 0 ? (
            <div className="text-gray-500">No daily movers jobs found.</div>
          ) : (
            <div className="space-y-3">
              {dailyMoversJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Daily Movers Calculation #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Total movers calculated: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Daily Signals Jobs */}
      <Card className={getSectionCardClass('dailySignals')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('dailySignals')} onClick={() => toggleSection('dailySignals')}>
              {collapsedSections['dailySignals'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Daily Signals Computation Jobs</CardTitle>
              {hasRunningJobs('dailySignals') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['dailySignals'] && (
            <p className="text-sm text-slate-600">Daily signals computation job history - computes signal flags, trend scores, and trade setups.</p>
          )}
        </CardHeader>
        {!collapsedSections['dailySignals'] && (
        <CardContent>
          {dailySignalsJobs.length === 0 ? (
            <div className="text-gray-500">No daily signals jobs found.</div>
          ) : (
            <div className="space-y-3">
              {dailySignalsJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Daily Signals #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Symbols processed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Weekly Bars ETL Jobs */}
      <Card className={getSectionCardClass('weeklyBars')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('weeklyBars')} onClick={() => toggleSection('weeklyBars')}>
              {collapsedSections['weeklyBars'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Weekly Bars ETL Jobs</CardTitle>
              {hasRunningJobs('weeklyBars') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['weeklyBars'] && (
            <p className="text-sm text-slate-600">Weekly bars ETL job history - aggregates daily bars to weekly bars.</p>
          )}
        </CardHeader>
        {!collapsedSections['weeklyBars'] && (
        <CardContent>
          {weeklyBarsJobs.length === 0 ? (
            <div className="text-gray-500">No weekly bars jobs found.</div>
          ) : (
            <div className="space-y-3">
              {weeklyBarsJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Weekly Bars ETL #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Records processed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Weekly Technicals ETL Jobs */}
      <Card className={getSectionCardClass('weeklyTechnicals')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('weeklyTechnicals')} onClick={() => toggleSection('weeklyTechnicals')}>
              {collapsedSections['weeklyTechnicals'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Weekly Technicals ETL Jobs</CardTitle>
              {hasRunningJobs('weeklyTechnicals') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['weeklyTechnicals'] && (
            <p className="text-sm text-slate-600">Weekly technicals ETL job history - computes weekly technical indicators.</p>
          )}
        </CardHeader>
        {!collapsedSections['weeklyTechnicals'] && (
        <CardContent>
          {weeklyTechnicalsJobs.length === 0 ? (
            <div className="text-gray-500">No weekly technicals jobs found.</div>
          ) : (
            <div className="space-y-3">
              {weeklyTechnicalsJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Weekly Technicals ETL #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Records processed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Weekly Signals Computation Jobs */}
      <Card className={getSectionCardClass('weeklySignals')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('weeklySignals')} onClick={() => toggleSection('weeklySignals')}>
              {collapsedSections['weeklySignals'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Weekly Signals Computation Jobs</CardTitle>
              {hasRunningJobs('weeklySignals') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['weeklySignals'] && (
            <p className="text-sm text-slate-600">Weekly signals computation job history - computes weekly signal flags and trend scores.</p>
          )}
        </CardHeader>
        {!collapsedSections['weeklySignals'] && (
        <CardContent>
          {weeklySignalsJobs.length === 0 ? (
            <div className="text-gray-500">No weekly signals jobs found.</div>
          ) : (
            <div className="space-y-3">
              {weeklySignalsJobs.map((job) => (
                <div key={job.id} className={`border rounded p-3 ${job.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between items-start text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Weekly Signals #{job.id}
                        {job.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-600">
                        Started: {job.started_at ? formatChicagoDateTime(job.started_at) : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {formatChicagoDateTime(job.completed_at)}
                        </div>
                      )}
                      {job.records_processed && (
                        <div className="text-gray-600">
                          Symbols processed: {job.records_processed.toLocaleString()}
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="text-gray-600">
                          Duration: {job.duration_seconds}s
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  {job.error_message && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      <strong>Error:</strong> {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      <Card className={getSectionCardClass('import')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('import')} onClick={() => toggleSection('import')}>
              {collapsedSections['import'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Historical Import Jobs</CardTitle>
              {hasRunningJobs('import') && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        {!collapsedSections['import'] && (
        <CardContent>
          {importJobs.length === 0 ? (
            <div className="text-gray-500">No import jobs found.</div>
          ) : (
            <div className="space-y-2">
              {importJobs.map((j) => (
                <div key={j.id} className={`border rounded p-3 text-sm ${j.status === 'running' ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : ''}`}>
                  <div className="flex justify-between">
                    <div className="font-medium flex items-center gap-2">
                      Job #{j.id}
                      {j.status === 'running' && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-blue-600 font-medium">RUNNING</span>
                        </div>
                      )}
                    </div>
                    <div className={j.status === 'completed' ? 'text-green-600' : j.status === 'running' ? 'text-blue-600' : 'text-red-600'}>
                      {j.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-gray-700 mt-1 flex flex-wrap gap-4">
                    <div>Files: {j.processed_files}/{j.total_files}</div>
                    <div>Rows: {j.inserted_rows}/{j.total_rows}</div>
                    <div>Errors: {j.error_count}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Schwab Token Status */}
      <Card className={getSectionCardClass('schwab')}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className={getSectionHeaderClass('schwab')} onClick={() => toggleSection('schwab')}>
              {collapsedSections['schwab'] ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
              <CardTitle>Schwab API Token Status</CardTitle>
              {tokenStatus && tokenStatus.valid && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-green-600 font-medium">VALID</span>
                </div>
              )}
              {tokenStatus && !tokenStatus.valid && tokenStatus.credentials_available && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-yellow-600 font-medium">EXPIRED/INVALID</span>
                </div>
              )}
              {tokenStatus && !tokenStatus.valid && !tokenStatus.credentials_available && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-xs text-red-600 font-medium">NOT CONFIGURED</span>
                </div>
              )}
            </div>
          </div>
          {!collapsedSections['schwab'] && (
            <p className="text-sm text-slate-600">
              Monitor Schwab API refresh token configuration. A valid refresh token enables automatic access token generation for EOD scans and API calls.
            </p>
          )}
        </CardHeader>
        {!collapsedSections['schwab'] && (
        <CardContent>
          {tokenLoading ? (
            <div className="text-gray-500 flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Loading token status...
            </div>
          ) : !tokenStatus ? (
            <div className="text-red-500">Failed to load token status</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Refresh Token Status</div>
                <div className="flex items-center gap-2">
                  <Badge variant={tokenStatus.valid ? 'default' : tokenStatus.credentials_available ? 'secondary' : 'destructive'}>
                    {tokenStatus.valid ? '✅ VALID' : tokenStatus.credentials_available ? '⚠️ EXPIRED/INVALID' : '❌ NOT CONFIGURED'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  {tokenStatus.valid ? (
                    <div className="text-green-700 bg-green-50 p-2 rounded border border-green-200">
                      ✅ Refresh token is valid and working. The system can automatically obtain temporary access tokens (valid ~30 min) using this refresh token.
                      <div className="text-xs mt-1 text-green-600">
                        ⚠️ Schwab refresh tokens expire after 7 days of inactivity and require manual OAuth re-authentication.
                      </div>
                    </div>
                  ) : tokenStatus.credentials_available ? (
                    <div className="text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                      ⚠️ Refresh token found but appears to be expired or invalid.
                      Complete the OAuth flow below to obtain a new refresh token.
                    </div>
                  ) : (
                    <div className="text-red-700 bg-red-50 p-2 rounded border border-red-200">
                      ❌ No SCHWAB_REFRESH_TOKEN configured in environment.
                      Complete the OAuth flow below to obtain a refresh token.
                    </div>
                  )}
                </div>
              </div>

              {/* OAuth Re-authentication Section */}
              <div className="border-t pt-4 space-y-4">
                <div className="text-sm font-medium text-gray-700">Refresh Token Renewal</div>
                <div className="text-sm text-gray-600">
                  Schwab refresh tokens expire after 7 days and require manual OAuth re-authentication.
                  Follow the steps below to get a new refresh token.
                </div>

                <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                  <div className="text-sm font-medium text-blue-800">Step 1: Get Authorization Code</div>
                  <div className="text-xs text-blue-700 space-y-1">
                    <div><strong className="text-blue-600">0. Start Tailscale:</strong> <code className="bg-blue-100 px-1 rounded">tailscale serve --https=443 localhost:8000</code></div>
                    <div>1. Click the link below to open Schwab authorization</div>
                    <div>2. Log in to Schwab and authorize the application</div>
                    <div>3. Copy the "code" parameter from the redirect URL</div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch('http://localhost:8003/schwab/oauth/url')
                        const data = await response.json()
                        if (data.authorization_url) {
                          window.open(data.authorization_url, '_blank')
                        }
                      } catch (error) {
                        console.error('Failed to get OAuth URL:', error)
                      }
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    🔗 Open Schwab OAuth Login
                  </button>
                </div>

                <div className="bg-green-50 p-3 rounded border border-green-200 space-y-3">
                  <div className="text-sm font-medium text-green-800">Step 2: Complete OAuth Flow</div>
                  <div className="text-xs text-green-700">
                    After clicking the OAuth login button above, complete the authorization in the new tab.
                    The system will automatically exchange the authorization code for a refresh token.
                  </div>
                  <div className="text-xs text-blue-700">
                    💡 <strong>Tip:</strong> The callback URL will display the new refresh token that you can copy to your .env file.
                  </div>
                </div>

                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                  <div className="text-sm font-medium text-yellow-800">Step 3: Update Configuration</div>
                  <div className="text-xs text-yellow-700 space-y-1 mt-2">
                    <div>1. Copy the refresh token from the result above</div>
                    <div>2. Update your .env file: <code className="bg-yellow-100 px-1 rounded">SCHWAB_REFRESH_TOKEN=your_new_token</code></div>
                    <div>3. Restart external-apis: <code className="bg-yellow-100 px-1 rounded">docker-compose restart external-apis</code></div>
                    <div className="text-yellow-600 font-medium mt-1">⚠️ Schwab refresh tokens expire after 7 days</div>
                  </div>
                </div>
              </div>

              {tokenStatus.message && (
                <div className={`p-3 rounded text-sm ${
                  tokenStatus.credentials_available && tokenStatus.valid
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : tokenStatus.credentials_available
                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {tokenStatus.message}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTokenStatus}
                  disabled={tokenLoading}
                >
                  <ArrowPathIcon className={`h-4 w-4 ${tokenLoading ? 'animate-spin' : ''}`} />
                  {tokenLoading ? 'Refreshing...' : 'Refresh Status'}
                </Button>
                {!tokenStatus.credentials_available && (
                  <Button variant="outline" size="sm" disabled>
                    Configure Credentials
                    <span className="ml-1 text-xs">(Requires server access)</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
        )}
      </Card>
    </div>
  )
}

export default JobStatus
