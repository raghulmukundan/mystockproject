import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'
import { WatchlistItem } from '../types'
import { StockPrice, CompanyProfile } from '../services/stockApi'

interface StockDetailsSidebarProps {
  isOpen: boolean
  onClose: () => void
  item: WatchlistItem | null
  stockPrice: StockPrice | null
  companyProfile: CompanyProfile | null
  isLoading?: boolean
}

function formatMarketCap(marketCap?: number): string {
  if (!marketCap) return 'N/A'
  
  const cap = marketCap / 1000000000
  if (cap >= 1000) return `$${(cap / 1000).toFixed(1)}T`
  if (cap >= 1) return `$${cap.toFixed(1)}B`
  return `$${(marketCap / 1000000).toFixed(0)}M`
}

function getMarketCapCategory(marketCap?: number): string {
  if (!marketCap) return 'Unknown'
  
  const cap = marketCap / 1000000000
  if (cap >= 200) return 'Mega Cap'
  if (cap >= 10) return 'Large Cap'
  if (cap >= 2) return 'Mid Cap'
  if (cap >= 0.3) return 'Small Cap'
  if (cap >= 0.05) return 'Micro Cap'
  return 'Nano Cap'
}

export default function StockDetailsSidebar({
  isOpen,
  onClose,
  item,
  stockPrice,
  companyProfile,
  isLoading = false
}: StockDetailsSidebarProps) {
  if (!item) return null

  const performance = stockPrice && item.entry_price ? {
    gainLoss: stockPrice.current_price - item.entry_price,
    gainLossPercent: ((stockPrice.current_price - item.entry_price) / item.entry_price) * 100
  } : null

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

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                    <div className="px-6 py-6 bg-gradient-to-r from-blue-500 to-blue-600">
                      <div className="flex items-center justify-between">
                        <Dialog.Title className="text-xl font-semibold text-white">
                          {item.symbol}
                        </Dialog.Title>
                        <button
                          type="button"
                          className="rounded-md bg-blue-600 text-blue-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                          onClick={onClose}
                        >
                          <XMarkIcon className="h-6 w-6" />
                        </button>
                      </div>
                      {companyProfile?.company_name && (
                        <p className="mt-1 text-sm text-blue-100">
                          {companyProfile.company_name}
                        </p>
                      )}
                    </div>

                    <div className="flex-1 px-6 py-6 space-y-6">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : (
                        <>
                          {/* Price Information */}
                          {stockPrice && (
                            <div className="space-y-4">
                              <h3 className="text-lg font-medium text-gray-900">Price Information</h3>
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-gray-500">Current Price</span>
                                  <span className="text-2xl font-bold text-gray-900">
                                    ${stockPrice.current_price}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-500">Today's Change</span>
                                  <div className={`flex items-center space-x-1 ${stockPrice.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {stockPrice.change >= 0 ? (
                                      <ArrowTrendingUpIcon className="h-4 w-4" />
                                    ) : (
                                      <ArrowTrendingDownIcon className="h-4 w-4" />
                                    )}
                                    <span className="font-medium">
                                      {stockPrice.change >= 0 ? '+' : ''}${stockPrice.change} ({stockPrice.change_percent >= 0 ? '+' : ''}{stockPrice.change_percent.toFixed(2)}%)
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Volume</span>
                                    <span className="text-gray-900">{stockPrice.volume.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Portfolio Performance */}
                          {performance && (
                            <div className="space-y-4">
                              <h3 className="text-lg font-medium text-gray-900">Portfolio Performance</h3>
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="space-y-3">
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Entry Price</span>
                                    <span className="text-sm font-medium">${item.entry_price}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Current Value</span>
                                    <span className="text-sm font-medium">${stockPrice?.current_price}</span>
                                  </div>
                                  <div className="pt-3 border-t border-gray-200">
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm font-medium text-gray-500">Total Gain/Loss</span>
                                      <div className={`text-right ${performance.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        <div className="font-semibold">
                                          {performance.gainLoss >= 0 ? '+' : ''}${performance.gainLoss.toFixed(2)}
                                        </div>
                                        <div className="text-sm">
                                          ({performance.gainLossPercent >= 0 ? '+' : ''}{performance.gainLossPercent.toFixed(2)}%)
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Trading Levels */}
                          <div className="space-y-4">
                            <h3 className="text-lg font-medium text-gray-900">Trading Levels</h3>
                            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                              {item.target_price && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Target Price</span>
                                  <span className="text-sm font-medium text-green-600">${item.target_price}</span>
                                </div>
                              )}
                              {item.stop_loss && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Stop Loss</span>
                                  <span className="text-sm font-medium text-red-600">${item.stop_loss}</span>
                                </div>
                              )}
                              {!item.target_price && !item.stop_loss && (
                                <p className="text-sm text-gray-500 italic">No trading levels set</p>
                              )}
                            </div>
                          </div>

                          {/* Company Information */}
                          {companyProfile && (
                            <div className="space-y-4">
                              <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
                              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Sector</span>
                                  <span className="text-sm font-medium">{companyProfile.sector}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Industry</span>
                                  <span className="text-sm font-medium">{companyProfile.industry}</span>
                                </div>
                                {companyProfile.market_cap && (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500">Market Cap</span>
                                      <span className="text-sm font-medium">{formatMarketCap(companyProfile.market_cap)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm text-gray-500">Cap Category</span>
                                      <span className="text-sm font-medium">{getMarketCapCategory(companyProfile.market_cap)}</span>
                                    </div>
                                  </>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Exchange</span>
                                  <span className="text-sm font-medium">{companyProfile.exchange}</span>
                                </div>
                                {companyProfile.country && (
                                  <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Country</span>
                                    <span className="text-sm font-medium">{companyProfile.country}</span>
                                  </div>
                                )}
                              </div>
                              
                              {companyProfile.description && (
                                <div>
                                  <h4 className="text-sm font-medium text-gray-900 mb-2">Description</h4>
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                    {companyProfile.description.length > 300 
                                      ? `${companyProfile.description.substring(0, 300)}...`
                                      : companyProfile.description
                                    }
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}