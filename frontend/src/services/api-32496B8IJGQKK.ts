import axios, { AxiosInstance } from 'axios'
import { Watchlist, UploadResponse, WatchlistItem } from '../types'

// Simple direct connection to backend
const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
  responseType: 'json', // Ensure JSON parsing
})

// Clear any potential global defaults that might interfere
delete (api.defaults as any).transformRequest
delete (api.defaults as any).transformResponse

console.log('🔍 API instance created with baseURL:', api.defaults.baseURL);

// Debug interceptor
api.interceptors.request.use(config => {
  console.log('🚀 Request config:', {
    url: config.url,
    baseURL: config.baseURL,
    method: config.method,
    fullURL: `${config.baseURL}${config.url}`
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
      status: error.response?.status
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
    // Ensure JSON parsing if response is a string
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
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

    // Ensure JSON parsing if response is a string
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    console.log('Upload API response data:', data)
    return data
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

  async addItem(watchlistId: number, item: Omit<WatchlistItem, 'id' | 'created_at'>): Promise<{ message: string }> {
    const response = await api.post(`/watchlists/${watchlistId}/items/${item.symbol}`)
    return response.data
  },

  async updateItem(watchlistId: number, itemId: number, item: Partial<Omit<WatchlistItem, 'id' | 'created_at'>>): Promise<WatchlistItem> {
    // For updating items, we need to use the full watchlist update endpoint
    // since the backend doesn't have individual item updates
    const watchlist = await this.getById(watchlistId)
    const updatedItems = watchlist.items.map(existingItem =>
      existingItem.id === itemId ? { ...existingItem, ...item } : existingItem
    )
    const updated = await this.update(watchlistId, {
      name: watchlist.name,
      description: watchlist.description,
      items: updatedItems.map(({ id, created_at, ...rest }) => rest)
    })
    return updated.items.find(i => i.symbol === item.symbol) || updated.items[0]
  },

  async deleteItem(watchlistId: number, itemId: number): Promise<{ message: string }> {
    // First get the watchlist to find the symbol for the item ID
    const watchlist = await this.getById(watchlistId)
    const itemToDelete = watchlist.items.find(item => item.id === itemId)
    if (!itemToDelete) {
      throw new Error('Item not found')
    }
    const response = await api.delete(`/watchlists/${watchlistId}/items/${itemToDelete.symbol}`)
    return response.data
  },

  async refreshProfiles(watchlistId: number): Promise<{ message: string; updated_count: number; total_items: number }> {
    const response = await api.post(`/watchlists/${watchlistId}/refresh-profiles`)
    return response.data
  },
}

export default api
