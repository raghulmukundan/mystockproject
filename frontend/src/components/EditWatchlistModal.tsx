import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Watchlist, WatchlistItem } from '../types'

interface EditWatchlistModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    description: string
    items: Omit<WatchlistItem, 'id' | 'created_at'>[]
  }) => Promise<void>
  watchlist: Watchlist | null
  isLoading?: boolean
}

interface EditableItem {
  symbol: string
  company_name: string
  sector: string
  industry: string
  market_cap: string
  entry_price: string
  target_price: string
  stop_loss: string
}

export default function EditWatchlistModal({
  isOpen,
  onClose,
  onSave,
  watchlist,
  isLoading = false
}: EditWatchlistModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<EditableItem[]>([])

  useEffect(() => {
    if (watchlist) {
      setName(watchlist.name)
      setDescription(watchlist.description || '')
      setItems(watchlist.items.map(item => ({
        symbol: item.symbol,
        company_name: item.company_name || '',
        sector: item.sector || '',
        industry: item.industry || '',
        market_cap: item.market_cap?.toString() || '',
        entry_price: item.entry_price?.toString() || '',
        target_price: item.target_price?.toString() || '',
        stop_loss: item.stop_loss?.toString() || ''
      })))
    }
  }, [watchlist])

  const addItem = () => {
    setItems([...items, {
      symbol: '',
      company_name: '',
      sector: '',
      industry: '',
      market_cap: '',
      entry_price: '',
      target_price: '',
      stop_loss: ''
    }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof EditableItem, value: string) => {
    setItems(items.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ))
  }

  const handleSave = async () => {
    if (!name.trim()) return

    const processedItems = items
      .filter(item => item.symbol.trim())
      .map(item => ({
        symbol: item.symbol.trim().toUpperCase(),
        company_name: item.company_name.trim() || undefined,
        sector: item.sector.trim() || undefined,
        industry: item.industry.trim() || undefined,
        market_cap: item.market_cap ? parseFloat(item.market_cap) : undefined,
        entry_price: item.entry_price ? parseFloat(item.entry_price) : undefined,
        target_price: item.target_price ? parseFloat(item.target_price) : undefined,
        stop_loss: item.stop_loss ? parseFloat(item.stop_loss) : undefined
      }))

    await onSave({
      name: name.trim(),
      description: description.trim(),
      items: processedItems
    })
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Edit Watchlist
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-6 max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Watchlist name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Optional description"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-900">Watchlist Items</h4>
                      <button
                        type="button"
                        onClick={addItem}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
                      >
                        <PlusIcon className="h-4 w-4 mr-1" />
                        Add Item
                      </button>
                    </div>

                    <div className="space-y-4">
                      {items.map((item, index) => (
                        <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Symbol *</label>
                              <input
                                type="text"
                                value={item.symbol}
                                onChange={(e) => updateItem(index, 'symbol', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="AAPL"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
                              <input
                                type="text"
                                value={item.company_name}
                                onChange={(e) => updateItem(index, 'company_name', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Apple Inc."
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Sector</label>
                              <input
                                type="text"
                                value={item.sector}
                                onChange={(e) => updateItem(index, 'sector', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Technology"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
                              <input
                                type="text"
                                value={item.industry}
                                onChange={(e) => updateItem(index, 'industry', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Consumer Electronics"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Market Cap</label>
                              <input
                                type="number"
                                value={item.market_cap}
                                onChange={(e) => updateItem(index, 'market_cap', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="3000000000"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Entry Price</label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.entry_price}
                                onChange={(e) => updateItem(index, 'entry_price', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="150.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Target Price</label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.target_price}
                                onChange={(e) => updateItem(index, 'target_price', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="180.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Stop Loss</label>
                              <input
                                type="number"
                                step="0.01"
                                value={item.stop_loss}
                                onChange={(e) => updateItem(index, 'stop_loss', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="130.00"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="w-full px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                              >
                                <TrashIcon className="h-4 w-4 mx-auto" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {items.length === 0 && (
                        <p className="text-center text-gray-500 py-4">
                          No items in this watchlist. Click "Add Item" to get started.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    onClick={handleSave}
                    disabled={isLoading || !name.trim()}
                  >
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}