import axios, { AxiosInstance } from 'axios'

// Jobs service API instance
const jobsApi: AxiosInstance = axios.create({
  baseURL: 'http://localhost:8004/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000, // Jobs can take longer
  responseType: 'json',
})

// Debug interceptor
jobsApi.interceptors.request.use(config => {
  console.log('🔧 Jobs API Request:', {
    url: config.url,
    baseURL: config.baseURL,
    method: config.method
  });
  return config;
});

jobsApi.interceptors.response.use(
  response => {
    console.log('✅ Jobs API Response:', response.config.url);
    return response;
  },
  error => {
    console.error('❌ Jobs API Error:', {
      message: error.message,
      url: error.config?.url,
      status: error.response?.status
    });
    return Promise.reject(error);
  }
);

export interface JobStatusResponse {
  id: number
  job_name: string
  status: string
  started_at: string
  completed_at?: string
  duration_seconds?: number
  records_processed?: number
  error_message?: string
  next_run_at?: string
}

export interface JobSummaryResponse {
  job_name: string
  description: string
  enabled: boolean
  schedule_display: string
  last_run?: JobStatusResponse
}

export interface NextMarketRefreshResponse {
  next_run_at?: string
}

export interface CleanupResponse {
  eod_scans: number
  job_executions: number
  message: string
}

export const jobsApiService = {
  // Get job summaries
  async getJobsSummary(): Promise<JobSummaryResponse[]> {
    const response = await jobsApi.get('/jobs/summary')
    return response.data
  },

  // Get job status history
  async getJobStatus(jobName: string, limit: number = 10): Promise<JobStatusResponse[]> {
    const response = await jobsApi.get(`/jobs/${jobName}/status?limit=${limit}`)
    return response.data
  },

  // Get next market refresh time
  async getNextMarketRefresh(): Promise<NextMarketRefreshResponse> {
    const response = await jobsApi.get('/jobs/next-market-refresh')
    return response.data
  },

  // Manual job triggers
  async runMarketDataRefresh(): Promise<{ message: string }> {
    const response = await jobsApi.post('/jobs/market-data/run')
    return response.data
  },

  async runEodScan(startDate?: string, endDate?: string): Promise<{ message: string }> {
    const params: any = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate

    const response = await jobsApi.post('/jobs/eod-scan/run', params)
    return response.data
  },

  async runUniverseRefresh(): Promise<{ message: string }> {
    const response = await jobsApi.post('/jobs/universe/run')
    return response.data
  },

  async runTechAnalysis(): Promise<{ message: string }> {
    const response = await jobsApi.post('/jobs/tech/run')
    return response.data
  },

  async runTokenValidation(): Promise<{ message: string }> {
    const response = await jobsApi.post('/jobs/schwab_token_validation/run')
    return response.data
  },

  // Technical job detailed endpoints
  async getTechJobList(limit: number = 20): Promise<any[]> {
    const response = await jobsApi.get(`/technical/job/list?limit=${limit}`)
    return response.data
  },

  async getTechJobStatus(): Promise<JobStatusResponse[]> {
    const response = await jobsApi.get('/jobs/tech/status')
    return response.data
  },

  async getTechJobErrors(jobId: number, limit: number = 100): Promise<any[]> {
    const response = await jobsApi.get(`/technical/job/errors/${jobId}?limit=${limit}`)
    return response.data
  },

  async getTechJobSkips(jobId: number, limit: number = 100): Promise<any[]> {
    const response = await jobsApi.get(`/technical/job/skips/${jobId}?limit=${limit}`)
    return response.data
  },

  async getTechJobSuccesses(jobId: number, limit: number = 100): Promise<any[]> {
    const response = await jobsApi.get(`/technical/job/successes/${jobId}?limit=${limit}`)
    return response.data
  },

  // Cleanup stuck jobs
  async cleanupStuckJobs(): Promise<CleanupResponse> {
    const response = await jobsApi.post('/jobs/cleanup-stuck')
    return response.data
  }
}

export default jobsApi
