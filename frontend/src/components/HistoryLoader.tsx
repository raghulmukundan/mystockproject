import React, { useState, useEffect } from 'react';
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
  const [folderPath, setFolderPath] = useState('');
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Poll job status while running
  useEffect(() => {
    if (!currentJob || currentJob.status !== 'running') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/import/status/${currentJob.id}`);
        if (response.ok) {
          const updatedJob: ImportJob = await response.json();
          setCurrentJob(updatedJob);
          
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
  }, [currentJob]);

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

  const startImport = async () => {
    if (!folderPath.trim()) {
      setMessage('Please enter a folder path');
      return;
    }

    setLoading(true);
    setMessage('');
    setErrors([]);

    try {
      const response = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folderPath.trim() })
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message);
        
        // Start polling the job
        const statusResponse = await fetch(`/api/import/status/${result.import_job_id}`);
        if (statusResponse.ok) {
          const job: ImportJob = await statusResponse.json();
          setCurrentJob(job);
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

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>History Data Loader</CardTitle>
          <p className="text-sm text-gray-600">
            Import OHLCV price data from Stooq CSV files
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter folder path (e.g., C:\\data\\stooq\\daily\\us\\nasdaq)"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              disabled={loading || (currentJob?.status === 'running')}
              className="flex-1"
            />
            <Button 
              onClick={startImport}
              disabled={loading || (currentJob?.status === 'running')}
            >
              {loading ? 'Starting...' : 'Import'}
            </Button>
          </div>

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
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
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing files...</span>
                  <span>{currentJob.processed_files} / {currentJob.total_files}</span>
                </div>
                <Progress value={getProgressPercentage()} />
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
                <div className="text-2xl font-bold text-purple-600">{currentJob.inserted_rows}</div>
                <div className="text-gray-500">Rows Inserted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{currentJob.error_count}</div>
                <div className="text-gray-500">Errors</div>
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