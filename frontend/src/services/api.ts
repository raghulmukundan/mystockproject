import axios from 'axios'
import { Watchlist, UploadResponse, WatchlistItem } from '../types'

// Force same-origin base to avoid any leaked env overriding baseURL at runtime
const SAME_ORIGIN_API = `${window.location.origin}/api`;
const api = axios.create({
  baseURL: SAME_ORIGIN_API,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const watchlistsApi = {
  async getAll(): Promise<Watchlist[]> {
    const response = await api.get('/watchlists/')
    return response.data
  },

  async getById(id: number): Promise<Watchlist> {
    const response = await api.get(`/watchlists/${id}`)
    return response.data
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
