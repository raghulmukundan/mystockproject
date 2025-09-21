import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { WatchlistItem } from '../types'

interface AddItemModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (item: Omit<WatchlistItem, 'id' | 'created_at'>) => Promise<void>
  isLoading?: boolean
}

export default function AddItemModal({
  isOpen,
  onClose,
  onSave,
  isLoading = false
}: AddItemModalProps) {
  const [symbol, setSymbol] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')

  const resetForm = () => {
    setSymbol('')
    setCompanyName('')
    setEntryPrice('')
    setTargetPrice('')
    setStopLoss('')
  }

  const handleSave = async () => {
    if (!symbol.trim()) return

    const item = {
      symbol: symbol.trim().toUpperCase(),
      company_name: companyName.trim() || null,
      entry_price: entryPrice ? parseFloat(entryPrice) : null,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      stop_loss: stopLoss ? parseFloat(stopLoss) : null
    }

    await onSave(item)
    resetForm()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Add Stock Symbol
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                    onClick={handleClose}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Symbol *
                    </label>
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., AAPL"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Apple Inc."
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Entry Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stop Loss
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={handleClose}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    onClick={handleSave}
                    disabled={isLoading || !symbol.trim()}
                  >
                    {isLoading ? 'Adding...' : 'Add Symbol'}
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