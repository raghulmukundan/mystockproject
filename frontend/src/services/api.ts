import axios from 'axios'
import { Watchlist, UploadResponse } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
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
}

export default api