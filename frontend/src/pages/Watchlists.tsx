import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { EyeIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { watchlistsApi } from '../services/api'
import { Watchlist, WatchlistItem } from '../types'
import EditWatchlistModal from '../components/EditWatchlistModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null)
  const [deletingWatchlist, setDeletingWatchlist] = useState<Watchlist | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    loadWatchlists()
  }, [])

  const loadWatchlists = async () => {
    try {
      const data = await watchlistsApi.getAll()
      setWatchlists(data)
    } catch (err: any) {
      setError('Failed to load watchlists')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditWatchlist = async (data: {
    name: string
    description: string
    items: Omit<WatchlistItem, 'id' | 'created_at'>[]
  }) => {
    if (!editingWatchlist) return

    setEditLoading(true)
    try {
      await watchlistsApi.update(editingWatchlist.id, data)
      await loadWatchlists()
      setEditingWatchlist(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update watchlist')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDeleteWatchlist = async () => {
    if (!deletingWatchlist) return

    setDeleteLoading(true)
    try {
      await watchlistsApi.delete(deletingWatchlist.id)
      await loadWatchlists()
      setDeletingWatchlist(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete watchlist')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading watchlists...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Watchlists</h1>
          <p className="mt-2 text-gray-600">
            Manage your stock watchlists and monitor performance
          </p>
        </div>
        <Link
          to="/upload"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Create Watchlist
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {watchlists.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No watchlists yet</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first watchlist</p>
          <Link
            to="/upload"
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Your First Watchlist
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {watchlists.map((watchlist) => (
            <div key={watchlist.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">{watchlist.name}</h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      {watchlist.items.length} symbols
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setEditingWatchlist(watchlist)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit watchlist"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeletingWatchlist(watchlist)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete watchlist"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {watchlist.description && (
                  <p className="text-gray-600 text-sm mb-4">{watchlist.description}</p>
                )}

                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Symbols</h4>
                  <div className="flex flex-wrap gap-2">
                    {watchlist.items.slice(0, 8).map((item) => (
                      <Link
                        key={item.id}
                        to={`/chart/${item.symbol}`}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium px-2 py-1 rounded transition-colors"
                      >
                        {item.symbol}
                      </Link>
                    ))}
                    {watchlist.items.length > 8 && (
                      <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-1 rounded">
                        +{watchlist.items.length - 8} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Created {new Date(watchlist.created_at).toLocaleDateString()}</span>
                  <Link 
                    to={`/watchlists/${watchlist.id}`}
                    className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View Details
                  </Link>
                </div>
              </div>

              {watchlist.items.length > 0 && (
                <div className="bg-gray-50 px-6 py-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Avg Entry:</span>
                      <div className="font-medium text-gray-900">
                        ${watchlist.items
                          .filter(item => item.entry_price)
                          .reduce((sum, item) => sum + (item.entry_price || 0), 0) / 
                          Math.max(watchlist.items.filter(item => item.entry_price).length, 1)
                        }.toFixed(2)
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Avg Target:</span>
                      <div className="font-medium text-green-600">
                        ${watchlist.items
                          .filter(item => item.target_price)
                          .reduce((sum, item) => sum + (item.target_price || 0), 0) / 
                          Math.max(watchlist.items.filter(item => item.target_price).length, 1)
                        }.toFixed(2)
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Avg Stop:</span>
                      <div className="font-medium text-red-600">
                        ${watchlist.items
                          .filter(item => item.stop_loss)
                          .reduce((sum, item) => sum + (item.stop_loss || 0), 0) / 
                          Math.max(watchlist.items.filter(item => item.stop_loss).length, 1)
                        }.toFixed(2)
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <EditWatchlistModal
        isOpen={!!editingWatchlist}
        onClose={() => setEditingWatchlist(null)}
        onSave={handleEditWatchlist}
        watchlist={editingWatchlist}
        isLoading={editLoading}
      />

      <DeleteConfirmModal
        isOpen={!!deletingWatchlist}
        onClose={() => setDeletingWatchlist(null)}
        onConfirm={handleDeleteWatchlist}
        title="Delete Watchlist"
        message={`Are you sure you want to delete "${deletingWatchlist?.name}"? This action cannot be undone and will remove all ${deletingWatchlist?.items.length || 0} items in this watchlist.`}
        confirmText="Delete Watchlist"
        isLoading={deleteLoading}
      />
    </div>
  )
}