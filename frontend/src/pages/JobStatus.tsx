import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { jobsApiService, CleanupResponse } from '../services/jobsApi'
import { ChevronDownIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

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

const JobStatus: React.FC = () => {
  const [eodScans, setEodScans] = useState<EodScan[]>([])
  const [importJobs, setImportJobs] = useState<ImportJob[]>([])
  const [techJobs, setTechJobs] = useState<any[]>([])
  const [universeJobs, setUniverseJobs] = useState<any[]>([])
  const [ttlCleanupJobs, setTtlCleanupJobs] = useState<any[]>([])
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
  const [jobHistories, setJobHistories] = useState<Record<string, any[]>>({})
  const [jobHistoryOpen, setJobHistoryOpen] = useState<Record<string, boolean>>({})
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<CleanupResponse | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    eod: true,
    tech: true,
    universe: true,
    ttl: true,
    import: true
  })
  const [refreshingErrors, setRefreshingErrors] = useState<Record<number, boolean>>({})

  const loadData = async () => {
    try {
      const [eodRes, jobsRes, techJobsRes] = await Promise.all([
        fetch('http://localhost:8004/api/eod/scan/list'),
        fetch('/api/import/status'),
        fetch('/api/tech/jobs?limit=5'),
      ])
      if (eodRes.ok) setEodScans(await eodRes.json())
      if (jobsRes.ok) setImportJobs(await jobsRes.json())
      if (techJobsRes.ok) setTechJobs(await techJobsRes.json())

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
    } catch (e) {
      console.error('Failed to load job status', e)
    }
  }

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 5000)
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
      case 'eod':
        return eodScans.some(scan => scan.status === 'running')
      case 'tech':
        return techJobs.some(job => job.status === 'running')
      case 'universe':
        return universeJobs.some(job => job.status === 'running')
      case 'ttl':
        return ttlCleanupJobs.some(job => job.status === 'running')
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
                              <div className="text-xs text-gray-500 mt-1">{new Date(err.occurred_at).toLocaleString()}</div>
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
        </CardHeader>
        {!collapsedSections['tech'] && (
        <CardContent>
          {techJobs.length === 0 ? (
            <div className="text-gray-500 text-sm">No runs yet.</div>
          ) : (
            <div className="space-y-2 text-sm">
              {techJobs.map((j: any) => {
                const updated = j.updated_symbols || 0
                const total = j.total_symbols || 0
                const skips = j.skip_count || 0
                const errors = j.errors || 0
                const pct = total > 0 ? Math.round((updated / total) * 100) : 0
                return (
                  <div key={j.id} className={`border rounded p-3 ${selectedTechJobId === j.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}>
                          {j.status.toUpperCase()}
                        </Badge>
                        <span className="ml-2">Job #{j.id}</span>
                        <span className="ml-2">{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Chicago' }).format(new Date(j.started_at))} (America/Chicago)</span>
                      </div>
                      <div className="text-gray-700">
                        <span className="mr-3">Updated {updated}/{total}</span>
                        <span className="mr-3">Skips {skips}</span>
                        {errors > 0 && (<span className="text-red-600">Errors {errors}</span>)}
                      </div>
                    </div>
                    <div className="mt-2 bg-gray-200 h-2 rounded"><div className="bg-green-500 h-2 rounded" style={{ width: `${pct}%` }} /></div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechSkips([]); setSkipOffset(0); await fetch(`/api/tech/skips/${j.id}?limit=1000&offset=0`).then(r=>r.ok?r.json():[]).then(setTechSkips).finally(()=>setTechLoading(false)); }}>View Skips</Button>
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechSuccesses([]); setSuccessOffset(0); await fetch(`/api/tech/success/${j.id}?limit=1000&offset=0`).then(r=>r.ok?r.json():[]).then(setTechSuccesses).finally(()=>setTechLoading(false)); }}>View Successes</Button>
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechErrors([]); setErrorOffset(0); await fetch(`/api/tech/errors/${j.id}?limit=1000&offset=0`).then(r=>r.ok?r.json():[]).then(setTechErrors).finally(()=>setTechLoading(false)); }}>View Errors</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedTechJobId && (
            <div className="mt-4 space-y-4">
              {techLoading && <div className="text-gray-500 text-sm">Loading…</div>}
              {techSkips.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Skips</div>
                  <div className="max-h-64 overflow-y-auto text-sm">
                    <div className="grid grid-cols-4 gap-2 font-medium border-b pb-1">
                      <div>Symbol</div><div>Reason</div><div>Detail</div><div>When</div>
                    </div>
                    {techSkips.map((s: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-4 gap-2 border-b py-1">
                        <div>{s.symbol}</div>
                        <div>{s.reason}</div>
                        <div className="break-all">{s.detail || ''}</div>
                        <div>{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Chicago' }).format(new Date(s.created_at))} (America/Chicago)</div>
                      </div>
                    ))}
                  </div>
                  {selectedTechJobId && (techSkips.length < (techJobs.find(j => j.id === selectedTechJobId)?.skip_count || 0)) && (
                    <div className="mt-2"><Button size="sm" variant="outline" onClick={async () => { const next = skipOffset + 1000; setTechLoading(true); await fetch(`/api/tech/skips/${selectedTechJobId}?limit=1000&offset=${next}`).then(r=>r.ok?r.json():[]).then((more)=> setTechSkips(prev=>[...prev, ...more])).finally(()=>{ setSkipOffset(next); setTechLoading(false); }); }}>Load More Skips</Button></div>
                  )}
                </div>
              )}
              {techSuccesses.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Successes</div>
                  <div className="max-h-64 overflow-y-auto text-sm">
                    <div className="grid grid-cols-3 gap-2 font-medium border-b pb-1">
                      <div>Symbol</div><div>Date</div><div>When</div>
                    </div>
                    {techSuccesses.map((s: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 border-b py-1">
                        <div>{s.symbol}</div>
                        <div>{s.date}</div>
                        <div>{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Chicago' }).format(new Date(s.created_at))} (America/Chicago)</div>
                      </div>
                    ))}
                  </div>
                  {selectedTechJobId && (techSuccesses.length < (techJobs.find(j => j.id === selectedTechJobId)?.success_count || 0)) && (
                    <div className="mt-2"><Button size="sm" variant="outline" onClick={async () => { const next = successOffset + 1000; setTechLoading(true); await fetch(`/api/tech/success/${selectedTechJobId}?limit=1000&offset=${next}`).then(r=>r.ok?r.json():[]).then((more)=> setTechSuccesses(prev=>[...prev, ...more])).finally(()=>{ setSuccessOffset(next); setTechLoading(false); }); }}>Load More Successes</Button></div>
                  )}
                </div>
              )}
              {techErrors.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Errors</div>
                  <div className="max-h-64 overflow-y-auto text-sm">
                    <div className="grid grid-cols-3 gap-2 font-medium border-b pb-1">
                      <div>Symbol</div><div>Error</div><div>When</div>
                    </div>
                    {techErrors.map((e: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 border-b py-1">
                        <div>{e.symbol || ''}</div>
                        <div className="break-all">{e.error_message}</div>
                        <div>{new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Chicago' }).format(new Date(e.occurred_at))} (America/Chicago)</div>
                      </div>
                    ))}
                  </div>
                  {selectedTechJobId && (techErrors.length < (techJobs.find(j => j.id === selectedTechJobId)?.errors || 0)) && (
                    <div className="mt-2"><Button size="sm" variant="outline" onClick={async () => { const next = errorOffset + 1000; setTechLoading(true); await fetch(`/api/tech/errors/${selectedTechJobId}?limit=1000&offset=${next}`).then(r=>r.ok?r.json():[]).then((more)=> setTechErrors(prev=>[...prev, ...more])).finally(()=>{ setErrorOffset(next); setTechLoading(false); }); }}>Load More Errors</Button></div>
                  )}
                </div>
              )}
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
                        Started: {job.started_at ? new Date(job.started_at).toLocaleString() : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {new Date(job.completed_at).toLocaleString()}
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
                        Started: {job.started_at ? new Date(job.started_at).toLocaleString() : 'N/A'}
                      </div>
                      {job.completed_at && (
                        <div className="text-gray-600">
                          Completed: {new Date(job.completed_at).toLocaleString()}
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
    </div>
  )
}

export default JobStatus
