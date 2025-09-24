import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { XMarkIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import { watchlistsApiService, SymbolSearchResult } from '../services/watchlistsApi'

interface CreateWatchlistModalProps {
  onClose: () => void
  onSubmit: (data: { name: string; description?: string; symbols?: string[] }) => Promise<void>
}

const CreateWatchlistModal: React.FC<CreateWatchlistModalProps> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([])
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Debounced search
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }

    if (searchQuery.length >= 2) {
      setIsSearching(true)
      const timeout = setTimeout(async () => {
        const results = await watchlistsApiService.searchSymbols(searchQuery)
        setSearchResults(results)
        setIsSearching(false)
      }, 300)
      setSearchTimeout(timeout)
    } else {
      setSearchResults([])
      setIsSearching(false)
    }

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [searchQuery])

  const handleAddSymbol = (symbol: string) => {
    if (!selectedSymbols.includes(symbol)) {
      setSelectedSymbols([...selectedSymbols, symbol])
      setSearchQuery('')
      setSearchResults([])
    }
  }

  const handleRemoveSymbol = (symbol: string) => {
    setSelectedSymbols(selectedSymbols.filter(s => s !== symbol))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      setIsSubmitting(true)
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        symbols: selectedSymbols.length > 0 ? selectedSymbols : undefined
      })
    } catch (error) {
      console.error('Error creating watchlist:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create New Watchlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Watchlist Details */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Watchlist Name*
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tech Stocks, Growth Plays"
                className="w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <Input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this watchlist"
                className="w-full"
              />
            </div>
          </div>

          {/* Symbol Search */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Stocks (optional)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stocks by symbol or company name"
                  className="pl-10 w-full"
                />
                {isSearching && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {searchResults.map((symbol) => (
                    <button
                      key={symbol.symbol}
                      type="button"
                      onClick={() => handleAddSymbol(symbol.symbol)}
                      disabled={selectedSymbols.includes(symbol.symbol)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{symbol.symbol}</div>
                        <div className="text-xs text-gray-600">{symbol.security_name}</div>
                      </div>
                      {!selectedSymbols.includes(symbol.symbol) && (
                        <PlusIcon className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Symbols */}
            {selectedSymbols.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Stocks ({selectedSymbols.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedSymbols.map((symbol) => (
                    <span
                      key={symbol}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full"
                    >
                      {symbol}
                      <button
                        type="button"
                        onClick={() => handleRemoveSymbol(symbol)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <XMarkIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </div>
            ) : (
              'Create Watchlist'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CreateWatchlistModal