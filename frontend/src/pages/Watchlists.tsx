import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import {
  PlusIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  TrashIcon,
  StarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowTrendingDownIcon,
  MagnifyingGlassIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { watchlistsApiService, Watchlist, StockPrice } from '../services/watchlistsApi'
import CreateWatchlistModal from '../components/CreateWatchlistModal'

interface WatchlistWithPrices extends Watchlist {
  prices: StockPrice[]
  totalValue: number
  totalChange: number
  totalChangePercent: number
  topGainer?: { symbol: string; change_percent: number }
  topLoser?: { symbol: string; change_percent: number }
}

const Watchlists: React.FC = () => {
  const [watchlists, setWatchlists] = useState<WatchlistWithPrices[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [topPerformers, setTopPerformers] = useState<StockPrice[]>([])
  const [topDecliners, setTopDecliners] = useState<StockPrice[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const sortOption: 'recent' = 'recent'
  const navigate = useNavigate()

  const safePercent = (value: number | undefined | null) => {
    if (value === undefined || value === null) {
      return 0
    }

    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return 0
    }

    return value
  }

  const getChronoValue = (watchlist: WatchlistWithPrices) => {
    const timestampSource = watchlist.updated_at || watchlist.created_at
    if (!timestampSource) {
      return 0
    }

    const parsed = new Date(timestampSource).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const filteredWatchlists = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const matchesSearch = (watchlist: WatchlistWithPrices) => {
      if (!query) return true

      if (watchlist.name.toLowerCase().includes(query)) {
        return true
      }

      if (watchlist.description && watchlist.description.toLowerCase().includes(query)) {
        return true
      }

      return watchlist.items.some(item => {
        if (item.symbol.toLowerCase().includes(query)) {
          return true
        }

        const company = item.company_name?.toLowerCase() ?? ''
        return company.includes(query)
      })
    }

    const sorted = watchlists.filter(matchesSearch)

    sorted.sort((a, b) => {
      switch (sortOption) {
        case 'winners':
          return safePercent(b.totalChangePercent) - safePercent(a.totalChangePercent)
        case 'laggards':
          return safePercent(a.totalChangePercent) - safePercent(b.totalChangePercent)
        case 'size':
          return b.items.length - a.items.length
        case 'recent':
        default:
          return getChronoValue(b) - getChronoValue(a)
      }
    })

    return sorted
  }, [watchlists, searchTerm, sortOption])

  const watchlistsToShow = filteredWatchlists

  const hasWatchlists = watchlistsToShow.length > 0
  const hasMarketMovers = topPerformers.length > 0 || topDecliners.length > 0

  const loadWatchlists = async () => {
    try {
      setLoading(true)
      const watchlistsData = await watchlistsApiService.getWatchlists()

      // Load prices for each watchlist
      const watchlistsWithPrices: WatchlistWithPrices[] = []
      const allPrices: StockPrice[] = []

      for (const watchlist of watchlistsData) {
        let prices: StockPrice[] = []
        let totalValue = 0
        let totalChange = 0

        if (watchlist.items.length > 0) {
          try {
            prices = await watchlistsApiService.getWatchlistPrices(watchlist.id)

            // Filter out invalid prices and add to all prices
            const validPrices = prices.filter(price =>
              price &&
              typeof price.current_price === 'number' &&
              !isNaN(price.current_price) &&
              typeof price.change === 'number' &&
              !isNaN(price.change) &&
              typeof price.change_percent === 'number' &&
              !isNaN(price.change_percent)
            )

            allPrices.push(...validPrices)
            prices = validPrices

            // Calculate totals
            totalValue = prices.reduce((sum, price) => sum + (price.current_price || 0), 0)
            totalChange = prices.reduce((sum, price) => sum + (price.change || 0), 0)
          } catch (error) {
            console.warn(`Failed to load prices for watchlist ${watchlist.id}:`, error)
            prices = []
          }
        }

        const totalChangePercent = totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0

        // Find top gainer and loser in this watchlist
        let topGainer: { symbol: string; change_percent: number } | undefined
        let topLoser: { symbol: string; change_percent: number } | undefined

        if (prices.length > 0) {
          const sortedByChange = [...prices].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0))
          if (sortedByChange[0]?.change_percent !== undefined) {
            topGainer = { symbol: sortedByChange[0].symbol, change_percent: sortedByChange[0].change_percent }
          }
          if (sortedByChange[sortedByChange.length - 1]?.change_percent !== undefined) {
            topLoser = { symbol: sortedByChange[sortedByChange.length - 1].symbol, change_percent: sortedByChange[sortedByChange.length - 1].change_percent }
          }
        }

        watchlistsWithPrices.push({
          ...watchlist,
          prices,
          totalValue,
          totalChange,
          totalChangePercent,
          topGainer,
          topLoser
        })
      }

      // Calculate overall top performers and decliners
      if (allPrices.length > 0) {
        const sortedPrices = [...allPrices].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0))
        setTopPerformers(sortedPrices.slice(0, 10))
        setTopDecliners(sortedPrices.slice(-10).reverse())
      } else {
        setTopPerformers([])
        setTopDecliners([])
      }

      setWatchlists(watchlistsWithPrices)
    } catch (error) {
      console.error('Failed to load watchlists:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWatchlists()
  }, [])

  const handleCreateWatchlist = async (data: { name: string; description?: string }) => {
    try {
      await watchlistsApiService.createWatchlist(data)
      setShowCreateModal(false)
      await loadWatchlists()
    } catch (error) {
      console.error('Failed to create watchlist:', error)
    }
  }

  const handleDeleteWatchlist = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete watchlist "${name}"?`)) {
      try {
        await watchlistsApiService.deleteWatchlist(id)
        await loadWatchlists()
      } catch (error) {
        console.error('Failed to delete watchlist:', error)
      }
    }
  }

  function formatCurrency(value: number | undefined | null) {
    const numeric = typeof value === 'number' ? value : Number(value)

    if (value === undefined || value === null || Number.isNaN(numeric) || !Number.isFinite(numeric)) {
      return '$0.00'
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(numeric)
  }

  function formatPercent(value: number | undefined | null) {
    const numeric = safePercent(value)
    return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-blue-100 bg-white/80 px-10 py-12 shadow-lg shadow-blue-100">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          <p className="text-sm font-medium text-blue-700">Syncing your watchlists…</p>
        </div>
      </div>
    )
  }

  return (
  <div className="flex min-h-screen bg-gray-50">
    <aside className="hidden lg:flex lg:w-60 xl:w-64 flex-col border-r border-gray-200 bg-white/80 backdrop-blur">
        <div className="relative border-b border-gray-200 px-6 py-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-blue-100/60 to-purple-50 opacity-70" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-2xl font-semibold text-gray-900">Market Movers</h2>
          </div>
        </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="rounded-2xl border border-green-100 bg-white/70 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 text-green-700">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <ArrowTrendingUpIcon className="h-4 w-4" />
                Top Performers
              </div>
              <Badge variant="success" className="bg-green-100/70 text-green-700">
                {topPerformers.length}
              </Badge>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto px-4 pb-4 pr-2">
              {topPerformers.length > 0 ? (
                topPerformers.map(stock => {
                  const belongsToWatchlist = watchlists.find(w =>
                    w.items.some(item => item.symbol === stock.symbol)
                  )

                  return (
                    <div
                      key={stock.symbol}
                      className="rounded-xl border border-green-100 bg-green-50/70 px-3 py-2 text-sm transition-colors duration-200 hover:border-green-200 hover:bg-green-100/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-green-900">{stock.symbol}</p>
                          {belongsToWatchlist && (
                            <p className="truncate text-xs text-green-700">{belongsToWatchlist.name}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-green-700">
                          <div className="text-sm font-semibold text-gray-900">{formatCurrency(stock.current_price)}</div>
                          <div className="flex items-center justify-end gap-1 font-semibold">
                            <ArrowUpIcon className="h-3 w-3" />
                            {formatPercent(stock.change_percent)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
            ) : (
              <div className="rounded-xl border border-dashed border-green-200 px-4 py-6 text-center text-xs text-green-600">
                No gainers yet
              </div>
            )}
          </div>
        </div>
          <div className="rounded-2xl border border-red-100 bg-white/70 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 text-red-700">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <ArrowTrendingDownIcon className="h-4 w-4" />
                Top Decliners
              </div>
              <Badge variant="destructive" className="bg-red-100/80 text-red-700">
                {topDecliners.length}
              </Badge>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto px-4 pb-4 pr-2">
              {topDecliners.length > 0 ? (
                topDecliners.map(stock => {
                  const belongsToWatchlist = watchlists.find(w =>
                    w.items.some(item => item.symbol === stock.symbol)
                  )

                  return (
                    <div
                      key={stock.symbol}
                      className="rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 text-sm transition-colors duration-200 hover:border-red-200 hover:bg-red-100/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-red-900">{stock.symbol}</p>
                          {belongsToWatchlist && (
                            <p className="truncate text-xs text-red-700">{belongsToWatchlist.name}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-red-700">
                          <div className="text-sm font-semibold text-gray-900">{formatCurrency(stock.current_price)}</div>
                          <div className="flex items-center justify-end gap-1 font-semibold">
                            <ArrowDownIcon className="h-3 w-3" />
                            {formatPercent(stock.change_percent)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
            ) : (
              <div className="rounded-xl border border-dashed border-red-200 px-4 py-6 text-center text-xs text-red-600">
                No decliners yet
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>

    <main className="flex-1">
      <div className="flex-1 space-y-6 overflow-y-auto p-6 lg:p-8">
        <section className="rounded-3xl border border-blue-100 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="text-3xl font-semibold text-gray-900">Watchlists</h1>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search lists or symbols..."
                  className="w-full rounded-full border border-blue-100 bg-white py-2 pl-11 pr-4 text-sm text-gray-700 shadow-inner focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="gap-2 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4" />
                Create watchlist
              </Button>
            </div>
          </div>
        </section>

        {hasMarketMovers && (
          <div className="grid gap-4 lg:hidden md:grid-cols-2">
            <div className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-green-700">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowTrendingUpIcon className="h-4 w-4" />
                  Top Performers
                </div>
                <span className="text-xs font-medium text-green-600">{topPerformers.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {topPerformers.slice(0, 3).map(stock => (
                  <div key={stock.symbol} className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50/80 px-3 py-2">
                    <span className="text-sm font-semibold text-green-900">{stock.symbol}</span>
                    <span className="text-xs font-semibold text-green-700">{formatPercent(stock.change_percent)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-red-700">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowTrendingDownIcon className="h-4 w-4" />
                  Top Decliners
                </div>
                <span className="text-xs font-medium text-red-600">{topDecliners.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {topDecliners.slice(0, 3).map(stock => (
                  <div key={stock.symbol} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/80 px-3 py-2">
                    <span className="text-sm font-semibold text-red-900">{stock.symbol}</span>
                    <span className="text-xs font-semibold text-red-700">{formatPercent(stock.change_percent)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

          {hasWatchlists ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {watchlistsToShow.map(watchlist => {
                const itemsToShow = 3

                return (
                  <Card
                    key={watchlist.id}
                    className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/80 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
                    onClick={() => navigate(`/watchlists/${watchlist.id}`)}
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <CardHeader className="px-5 pb-0 pt-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                              <CardTitle className="text-lg font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
                                {watchlist.name}
                              </CardTitle>
                            </div>
                            {watchlist.description && (
                              <p className="mt-1 text-sm text-gray-600">{watchlist.description}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 text-xs font-medium">
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                              {watchlist.items.length} symbols
                            </span>
                            {watchlist.totalValue > 0 && (
                              <span className="rounded-full bg-blue-100/70 px-3 py-1 text-blue-900">
                                {formatCurrency(watchlist.totalValue)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span className={`rounded-full px-3 py-1 ${
                            safePercent(watchlist.totalChangePercent) >= 0
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {formatPercent(watchlist.totalChangePercent)}
                          </span>
                          <span className="text-gray-400">day move</span>
                        </div>
                      </div>
                      {(watchlist.topGainer || watchlist.topLoser) && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {watchlist.topGainer && (
                            <div className="flex items-center justify-between rounded-xl bg-green-50/80 px-3 py-2 text-xs font-medium text-green-700">
                              <span className="flex items-center gap-1">
                                <ArrowTrendingUpIcon className="h-4 w-4" />
                                {watchlist.topGainer.symbol}
                              </span>
                              <span>{formatPercent(watchlist.topGainer.change_percent)}</span>
                            </div>
                          )}
                          {watchlist.topLoser && (
                            <div className="flex items-center justify-between rounded-xl bg-red-50/80 px-3 py-2 text-xs font-medium text-red-700">
                              <span className="flex items-center gap-1">
                                <ArrowTrendingDownIcon className="h-4 w-4" />
                                {watchlist.topLoser.symbol}
                              </span>
                              <span>{formatPercent(watchlist.topLoser.change_percent)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3 px-5 pt-5">
                      {watchlist.items.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {watchlist.items.slice(0, itemsToShow).map(item => {
                              const stockPrice = watchlist.prices.find(p => p.symbol === item.symbol)
                              const changeClass = stockPrice && stockPrice.change >= 0 ? 'text-green-600' : 'text-red-600'
                              const symbolClass = stockPrice
                                ? stockPrice.change >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                                : 'text-gray-900'

                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-white/70 px-3 py-1.5 transition-colors duration-200 hover:border-blue-200 hover:bg-blue-50/60"
                                >
                                  <div>
                                    <div className={`text-sm font-semibold ${symbolClass}`}>{item.symbol}</div>
                                    <div className="text-xs text-gray-500">{item.company_name ?? item.sector ?? '—'}</div>
                                  </div>
                                  {stockPrice ? (
                                    <div className="text-right">
                                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(stockPrice.current_price)}</div>
                                      <div className={`text-xs font-medium ${changeClass}`}>{formatPercent(stockPrice.change_percent)}</div>
                                    </div>
                                ) : (
                                  <div className="text-xs font-medium text-gray-400">No price</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                          {watchlist.items.length > itemsToShow && (
                            <div className="rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-medium text-blue-600">
                              +{watchlist.items.length - itemsToShow} more symbols
                            </div>
                          )}
                        </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-white/50 px-4 py-8 text-center">
                        <StarIcon className="mx-auto mb-3 h-6 w-6 text-gray-400" />
                        <p className="text-sm text-gray-500">No stocks added yet</p>
                        <p className="text-xs text-gray-400">Tap to start building this list</p>
                      </div>
                    )}
                      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/watchlists/${watchlist.id}`)
                          }}
                        >
                          <EyeIcon className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDeleteWatchlist(watchlist.id, watchlist.name)
                          }}
                        >
                          <TrashIcon className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="border-2 border-dashed border-blue-200 bg-white/80">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <SparklesIcon className="h-8 w-8 text-blue-400" />
              <p className="max-w-sm text-sm text-gray-600">
                Create your first watchlist to start tracking performance and discovering market signals.
              </p>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="gap-2 bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4" />
                Create watchlist
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>

    {showCreateModal && (
      <CreateWatchlistModal
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateWatchlist}
      />
    )}
  </div>
)

}

export default Watchlists
