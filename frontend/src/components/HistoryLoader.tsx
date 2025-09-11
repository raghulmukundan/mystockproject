import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';

interface ImportJob {
  id: number;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  folder_path: string;
  total_files: number;
  processed_files: number;
  total_rows: number;
  inserted_rows: number;
  error_count: number;
  current_file?: string;
  current_folder?: string;
}

interface ImportError {
  id: number;
  occurred_at: string;
  file_path: string;
  line_number?: number;
  error_type: string;
  error_message: string;
}

export const HistoryLoader: React.FC = () => {
  const { pathname } = useLocation();
  const [folderPath, setFolderPath] = useState('');
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [allJobs, setAllJobs] = useState<ImportJob[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Automatically fetch all jobs when on the history-import route and poll for updates
  useEffect(() => {
    if (pathname !== '/history-import') return;
    fetchAllJobs();
    const interval = setInterval(fetchAllJobs, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [pathname]);

  // Poll current job status while running (only on history-import route)
  useEffect(() => {
    if (pathname !== '/history-import') return;
    if (!currentJob || currentJob.status !== 'running') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/import/status/${currentJob.id}`);
        if (response.ok) {
          const updatedJob: ImportJob = await response.json();
          setCurrentJob(updatedJob);
          
          // Update the job in allJobs array too
          setAllJobs(prev => prev.map(job => job.id === updatedJob.id ? updatedJob : job));
          
          // If job completed, fetch errors if any
          if (updatedJob.status !== 'running' && updatedJob.error_count > 0) {
            fetchErrors(updatedJob.id);
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJob, pathname]);

  const fetchAllJobs = async () => {
    try {
      // Fetch all jobs from the backend
      const response = await fetch('/api/import/status');
      if (response.ok) {
        const jobs: ImportJob[] = await response.json();
        setAllJobs(jobs);
        
        // If we have a current job that's no longer running, update it
        if (currentJob) {
          const updatedCurrentJob = jobs.find(job => job.id === currentJob.id);
          if (updatedCurrentJob) {
            setCurrentJob(updatedCurrentJob);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching all jobs:', error);
    }
  };

  const fetchErrors = async (jobId: number) => {
    try {
      const response = await fetch(`/api/import/errors/${jobId}`);
      if (response.ok) {
        const jobErrors: ImportError[] = await response.json();
        setErrors(jobErrors);
      }
    } catch (error) {
      console.error('Error fetching import errors:', error);
    }
  };

  const convertWindowsToDockerPath = (windowsPath: string): string => {
    // Convert Windows path to Docker mount path
    // C:\Users\raghu\Downloads\d_us_txt\data\daily\us -> /downloads/d_us_txt/data/daily/us
    if (windowsPath.includes('\\Downloads\\')) {
      return windowsPath
        .replace(/^.*\\Downloads\\/, '/downloads/')
        .replace(/\\/g, '/');
    }
    // If already in Unix format, return as-is
    if (windowsPath.startsWith('/downloads/')) {
      return windowsPath;
    }
    // Default: assume it's already a Docker path
    return windowsPath;
  };

  // Legacy normal import removed. Use startBulkImport only.

  const startBulkImport = async () => {
    if (!folderPath.trim()) {
      setMessage('Please enter a folder path');
      return;
    }

    setLoading(true);
    setMessage('');
    setErrors([]);

    try {
      // Convert Windows path to Docker mount path
      const dockerPath = convertWindowsToDockerPath(folderPath.trim());
      
      const response = await fetch('/api/import/bulk-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: dockerPath })
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(`🚀 ${result.message} - This will import all files in minutes!`);
        
        // Start polling the job
        const statusResponse = await fetch(`/api/import/status/${result.import_job_id}`);
        if (statusResponse.ok) {
          const job: ImportJob = await statusResponse.json();
          setCurrentJob(job);
          
          // Add job to allJobs list
          setAllJobs(prev => {
            const exists = prev.some(j => j.id === job.id);
            return exists ? prev.map(j => j.id === job.id ? job : j) : [...prev, job];
          });
        }
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.detail}`);
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setLoading(false);
  };

  const cleanupAll = async () => {
    if (!confirm('This will delete all historical prices, import jobs, errors, and processed files. Are you sure?')) {
      return;
    }

    setLoading(true);
    setMessage('');
    setErrors([]);

    try {
      const response = await fetch('/api/import/cleanup', {
        method: 'DELETE'
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(`✅ Cleanup completed successfully! 
        - ${result.deleted_jobs} import jobs deleted
        - ${result.deleted_files} processed files deleted  
        - ${result.deleted_errors} errors deleted
        - ${result.deleted_failed_files} failed files deleted
        - ${result.deleted_prices} historical prices deleted`);
        
        // Clear local state
        setAllJobs([]);
        setCurrentJob(null);
        setErrors([]);
      } else {
        const error = await response.json();
        setMessage(`Error during cleanup: ${error.detail}`);
      }
    } catch (error) {
      setMessage(`Error during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setLoading(false);
  };


  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'destructive';
      case 'running': return 'secondary';
      default: return 'outline';
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getProgressPercentage = () => {
    if (!currentJob || currentJob.total_files === 0) return 0;
    return Math.round((currentJob.processed_files / currentJob.total_files) * 100);
  };

  const getPhase = (job: ImportJob | null): string => {
    if (!job) return '';
    if (job.status === 'completed') return 'Completed';
    if (job.status === 'failed') return 'Failed';
    // Running phases
    if (job.current_folder && job.current_folder.startsWith('COPY')) {
      return 'Copying to database (final step)';
    }
    if (job.total_files > 0 && job.processed_files < job.total_files) {
      return 'Preprocessing files';
    }
    if (job.total_files > 0 && job.processed_files === job.total_files) {
      return 'Staging complete. Starting DB load';
    }
    return 'Running';
  };

  return (
    <div className="space-y-6 p-6">
      {/* Banner removed */}
      <Card>
        <CardHeader>
          <CardTitle>History Data Loader</CardTitle>
          <p className="text-sm text-gray-600">
            Import OHLCV price data from Stooq folder structure supporting stocks, ETFs, and multiple countries.
            Expected format: TICKER,PER,DATE,TIME,OPEN,HIGH,LOW,CLOSE,VOL,OPENINT
          </p>
          <div className="text-xs text-gray-500 mt-2">
            <strong>Supported structure:</strong> /country/exchange/asset_type/subfolders/symbol.country
            <br />
            <strong>Example:</strong> /us/nasdaq/stocks/1/aapl.us or /uk/lse/etfs/2/vusa.uk
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter folder path using 'Enter Folder Path' button..."
                value={folderPath}
                disabled={true}
                className="flex-1 bg-gray-50"
              />
              <Button 
                onClick={() => {
                  const userPath = prompt(
                    "Enter the full absolute path to your Stooq data folder:\n\n" +
                    "Windows Example: C:\\Users\\raghu\\Downloads\\d_us_txt\\data\\daily\\us\n" +
                    "Docker/Linux Example: /downloads/d_us_txt/data/daily/us\n\n" +
                    "(Windows paths will be automatically converted to Docker paths)"
                  );
                  if (userPath && userPath.trim()) {
                    setFolderPath(userPath.trim());
                  }
                }}
                disabled={loading || (currentJob?.status === 'running')}
                variant="outline"
              >
                Enter Folder Path
              </Button>
              {/* Legacy normal import button removed */}
              <Button 
                onClick={startBulkImport}
                disabled={loading || (currentJob?.status === 'running') || !folderPath.trim()}
                variant="secondary"
                className="bg-green-600 text-white hover:bg-green-700"
              >
                🚀 Bulk Import (Ultra Fast)
              </Button>
              <Button 
                onClick={cleanupAll}
                disabled={loading || (currentJob?.status === 'running')}
                variant="destructive"
                className="bg-red-600 text-white hover:bg-red-700"
              >
                🗑️ Cleanup All
              </Button>
            </div>
            
            {folderPath && (
              <div className="text-sm text-gray-600 space-y-1">
                <div>
                  <span className="font-medium">Windows Path:</span> {folderPath}
                </div>
                <div>
                  <span className="font-medium">Docker Path:</span> 
                  <span className="font-mono bg-gray-100 px-1 rounded ml-1">
                    {convertWindowsToDockerPath(folderPath)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Jobs</CardTitle>
          <p className="text-sm text-gray-600">
            All import jobs are automatically fetched and updated. Click on a job to view detailed progress.
          </p>
        </CardHeader>
        <CardContent>
          {allJobs.length > 0 ? (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700">All Jobs (Most Recent First):</h4>
              {allJobs.map((job) => (
                <div 
                  key={job.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    currentJob?.id === job.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setCurrentJob(job);
                    if (job.error_count > 0) {
                      fetchErrors(job.id);
                    }
                  }}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">Job #{job.id}</div>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      {job.status === 'running' && job.total_files > 0 && (
                        <span>{job.processed_files} / {job.total_files} files</span>
                      )}
                      {job.status === 'completed' && (
                        <span>{job.inserted_rows} rows imported</span>
                      )}
                      {job.status === 'failed' && (
                        <span className="text-red-600">{job.error_count} errors</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {job.folder_path}
                  </div>
                  {job.status === 'running' && job.total_files > 0 && (
                    <div className="mt-2">
                      <Progress value={Math.round((job.processed_files / job.total_files) * 100)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-4">
              No import jobs found. Start an import to see jobs here.
            </div>
          )}
        </CardContent>
      </Card>

      {currentJob && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Import Job #{currentJob.id}</CardTitle>
              <Badge variant={getStatusBadgeVariant(currentJob.status)}>
                {currentJob.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <span className="font-medium">Phase:</span>{' '}
              <span className="text-gray-700">{getPhase(currentJob)}</span>
              {currentJob.status === 'running' && getPhase(currentJob).startsWith('Copying') && (
                <span className="ml-2 text-xs text-gray-500">(Bulk import writes to DB at the end)</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Folder:</span>
                <p className="text-gray-600 break-all">{currentJob.folder_path}</p>
              </div>
              <div>
                <span className="font-medium">Started:</span>
                <p className="text-gray-600">{formatDateTime(currentJob.started_at)}</p>
              </div>
              {currentJob.completed_at && (
                <div>
                  <span className="font-medium">Completed:</span>
                  <p className="text-gray-600">{formatDateTime(currentJob.completed_at)}</p>
                </div>
              )}
            </div>

            {currentJob.status === 'running' && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{getPhase(currentJob)}</span>
                  <span>{currentJob.processed_files} / {currentJob.total_files}</span>
                </div>
                <Progress value={getProgressPercentage()} />
                
                {currentJob.current_folder && (
                  <div className="text-xs text-gray-600">
                    <div className="font-medium">Current Folder:</div>
                    <div className="font-mono bg-gray-50 p-1 rounded">{currentJob.current_folder}</div>
                  </div>
                )}
                
                {currentJob.current_file && (
                  <div className="text-xs text-gray-600">
                    <div className="font-medium">Current File:</div>
                    <div className="font-mono bg-gray-50 p-1 rounded">{currentJob.current_file}</div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{currentJob.total_files}</div>
                <div className="text-gray-500">Total Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{currentJob.processed_files}</div>
                <div className="text-gray-500">Processed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{currentJob.total_rows}</div>
                <div className="text-gray-500">Rows Staged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{currentJob.inserted_rows}</div>
                <div className="text-gray-500">Rows Inserted</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Import Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {errors.map((error) => (
                <div key={error.id} className="border-l-4 border-red-500 pl-4 py-2">
                  <div className="text-sm font-medium text-red-800">{error.error_type}</div>
                  <div className="text-sm text-gray-600">
                    {error.file_path}
                    {error.line_number && ` (Line ${error.line_number})`}
                  </div>
                  <div className="text-sm text-gray-800 mt-1">{error.error_message}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDateTime(error.occurred_at)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
