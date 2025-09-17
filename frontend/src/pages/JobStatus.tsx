import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

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
  const [selectedTechJobId, setSelectedTechJobId] = useState<number | null>(null)
  const [techSkips, setTechSkips] = useState<any[]>([])
  const [techSuccesses, setTechSuccesses] = useState<any[]>([])
  const [techErrors, setTechErrors] = useState<any[]>([])
  const [techLoading, setTechLoading] = useState(false)
  const [techRuns, setTechRuns] = useState<any[]>([])
  const [starting, setStarting] = useState(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [expandedScanId, setExpandedScanId] = useState<number | null>(null)
  const [scanErrors, setScanErrors] = useState<Record<number, EodScanError[]>>({})
  const [loadingErrors, setLoadingErrors] = useState<Record<number, boolean>>({})
  const [jobsSummary, setJobsSummary] = useState<any[]>([])
  const [jobHistories, setJobHistories] = useState<Record<string, any[]>>({})
  const [jobHistoryOpen, setJobHistoryOpen] = useState<Record<string, boolean>>({})

  const loadData = async () => {
    try {
      const [eodRes, jobsRes, jobsSummaryRes, techJobsRes] = await Promise.all([
        fetch('/api/eod/scan/list'),
        fetch('/api/import/status'),
        fetch('/api/jobs/summary'),
        fetch('/api/tech/jobs?limit=5'),
      ])
      if (eodRes.ok) setEodScans(await eodRes.json())
      if (jobsRes.ok) setImportJobs(await jobsRes.json())
      if (jobsSummaryRes.ok) setJobsSummary(await jobsSummaryRes.json())
      if (techJobsRes.ok) setTechJobs(await techJobsRes.json())
    } catch (e) {
      console.error('Failed to load job status', e)
    }
  }

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 5000)
    return () => clearInterval(t)
  }, [])

  const startEod = async () => {
    setStarting(true)
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
        await loadData()
      }
    } catch (e) {
      console.error('Failed to start EOD scan', e)
    } finally {
      setStarting(false)
    }
  }

  const toggleJobHistory = async (jobName: string) => {
    const open = !jobHistoryOpen[jobName]
    setJobHistoryOpen(prev => ({ ...prev, [jobName]: open }))
    if (open) {
      try {
        const res = await fetch(`/api/jobs/${jobName}/status?limit=5`)
        if (res.ok) {
          const data = await res.json()
          setJobHistories(prev => ({ ...prev, [jobName]: data }))
        }
      } catch (e) {
        // ignore
      }
    }
  }

  const runUniverseRefreshNow = async () => {
    try {
      const res = await fetch('/api/universe/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ download: true }) })
      if (res.ok) await loadData()
    } catch {}
  }

  const truncateSymbolsTable = async () => {
    if (!confirm('This will TRUNCATE symbols. Are you sure?')) return
    try {
      await fetch('/api/universe/clear', { method: 'DELETE' })
      await loadData()
    } catch {}
  }

  const runTechNow = async () => {
    try {
      await fetch('/api/tech/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      await loadData()
    } catch {}
  }

  const truncatePricesDaily = async () => {
    if (!confirm('This will truncate prices_daily. Are you sure?')) return
    try {
      await fetch('/api/prices/daily/truncate', { method: 'DELETE' })
      alert('prices_daily truncated')
    } catch (e) {
      console.error('Failed to truncate prices_daily', e)
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
        const res = await fetch(`/api/eod/scan/errors/${scanId}`)
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

  const pct = (fetched: number, total: number) => {
    if (!total) return 0
    return Math.min(100, Math.round((fetched / total) * 100))
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
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>EOD Scan</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-700">Start</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-700">End</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            </div>
            <Button onClick={startEod} disabled={starting}>
              {starting ? 'Starting…' : 'Start EOD Scan'}
            </Button>
            <Button variant="destructive" onClick={truncatePricesDaily}>
              Truncate prices_daily
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {eodScans.length === 0 ? (
            <div className="text-gray-500">No scans yet.</div>
          ) : (
            <div className="space-y-3">
              {eodScans.map((s) => (
                <div key={s.id} className="border rounded p-3">
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
                    <div>Progress: {pct(s.symbols_fetched, s.symbols_requested)}%</div>
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
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={async () => { await fetch(`/api/eod/scan/retry/${s.id}`, { method: 'POST' }); loadData(); }}
                      disabled={s.error_count === 0 || s.status === 'running'}
                      title={s.error_count === 0 ? 'No errors to retry' : s.status === 'running' ? 'Scan in progress' : 'Retry failed symbols'}
                    >
                      Retry Failed
                    </Button>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Technical Compute</CardTitle>
        </CardHeader>
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
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechSkips([]); await fetch(`/api/tech/skips/${j.id}`).then(r=>r.ok?r.json():[]).then(setTechSkips).finally(()=>setTechLoading(false)); }}>View Skips</Button>
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechSuccesses([]); await fetch(`/api/tech/success/${j.id}`).then(r=>r.ok?r.json():[]).then(setTechSuccesses).finally(()=>setTechLoading(false)); }}>View Successes</Button>
                      <Button size="sm" variant="outline" onClick={async () => { setSelectedTechJobId(j.id); setTechLoading(true); setTechErrors([]); await fetch(`/api/tech/errors/${j.id}`).then(r=>r.ok?r.json():[]).then(setTechErrors).finally(()=>setTechLoading(false)); }}>View Errors</Button>
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
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Background Jobs moved to Job Settings page */}

      <Card>
        <CardHeader>
          <CardTitle>Historical Import Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {importJobs.length === 0 ? (
            <div className="text-gray-500">No import jobs found.</div>
          ) : (
            <div className="space-y-2">
              {importJobs.map((j) => (
                <div key={j.id} className="border rounded p-3 text-sm">
                  <div className="flex justify-between">
                    <div className="font-medium">Job #{j.id}</div>
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
      </Card>
    </div>
  )
}

export default JobStatus
