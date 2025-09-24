import axios, { AxiosInstance } from 'axios'
import { Watchlist, UploadResponse, WatchlistItem } from '../types'

// Create axios instance that works from host browser
// When accessing from host browser, use localhost:8000 directly since backend is exposed on port 8000
const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
  responseType: 'json', // Ensure JSON parsing
})

// Ensure proper JSON serialization
api.defaults.transformRequest = [(data, headers) => {
  if (headers && data && typeof data === 'object') {
    headers['Content-Type'] = 'application/json'
    return JSON.stringify(data)
  }
  return data
}]

console.log('🔍 API instance created with baseURL:', api.defaults.baseURL);

// Debug interceptor
api.interceptors.request.use(config => {
  console.log('🚀 Request config:', {
    url: config.url,
    baseURL: config.baseURL,
    method: config.method,
    data: config.data,
    headers: config.headers
  });
  return config;
});

api.interceptors.response.use(
  response => {
    console.log('✅ Response received:', response.config.url);
    return response;
  },
  error => {
    console.error('❌ Request failed:', {
      message: error.message,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      status: error.response?.status,
      responseData: error.response?.data
    });
    return Promise.reject(error);
  }
);

export const watchlistsApi = {
  async getAll(): Promise<Watchlist[]> {
    const response = await api.get('/watchlists/')
    // Ensure JSON parsing if response is a string
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    return data
  },

  async getById(id: number): Promise<Watchlist> {
    const response = await api.get(`/watchlists/${id}`)
    console.log('🔍 Raw API response for getById:', response.data)
    // Ensure JSON parsing if response is a string
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    console.log('📋 Parsed watchlist data:', data)
    return data
  },

  async create(data: { name: string; description?: string }): Promise<Watchlist> {
    const response = await api.post('/watchlists/', data)
    return response.data
  },

  async uploadFile(file: File, name: string, description?: string): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    if (description) {
      formData.append('description', description)
    }

    const response = await api.post('/watchlists/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async update(id: number, data: { 
    name?: string; 
    description?: string; 
    items?: Omit<WatchlistItem, 'id' | 'created_at'>[] 
  }): Promise<Watchlist> {
    const response = await api.put(`/watchlists/${id}`, data)
    return response.data
  },

  async delete(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/watchlists/${id}`)
    return response.data
  },

  async addItem(watchlistId: number, item: Omit<WatchlistItem, 'id' | 'created_at'>): Promise<WatchlistItem> {
    console.log('🚀 Adding item to watchlist:', watchlistId, 'Data:', item)
    const response = await api.post(`/watchlists/${watchlistId}/items`, item)
    return response.data
  },

  async updateItem(watchlistId: number, itemId: number, item: Partial<Omit<WatchlistItem, 'id' | 'created_at'>>): Promise<WatchlistItem> {
    const response = await api.put(`/watchlists/${watchlistId}/items/${itemId}`, item)
    return response.data
  },

  async deleteItem(watchlistId: number, itemId: number): Promise<{ message: string }> {
    const response = await api.delete(`/watchlists/${watchlistId}/items/${itemId}`)
    return response.data
  },

  async refreshProfiles(watchlistId: number): Promise<{ message: string; updated_count: number; total_items: number }> {
    const response = await api.post(`/watchlists/${watchlistId}/refresh-profiles`)
    return response.data
  },
}

export default api
