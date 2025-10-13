import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  CalendarDaysIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ViewColumnsIcon,
  Bars3BottomLeftIcon,
  ClockIcon,
  HashtagIcon,
} from '@heroicons/react/24/outline'
import { watchlistsApiService, Watchlist, StockPrice } from '../services/watchlistsApi'
import { WatchlistItem } from '../types'
import AddItemModal from '../components/AddItemModal'
import StockDetailView from '../components/StockDetailView'
import { screenerApi, ScreenerResult } from '../services/screenerApi'

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
  const [showCreateInline, setShowCreateInline] = useState(false)
  const [createWatchlistName, setCreateWatchlistName] = useState('')
  const [createWatchlistDescription, setCreateWatchlistDescription] = useState('')
  const [createWatchlistError, setCreateWatchlistError] = useState('')
  const [createWatchlistLoading, setCreateWatchlistLoading] = useState(false)
  const [topPerformers, setTopPerformers] = useState<StockPrice[]>([])
  const [topDecliners, setTopDecliners] = useState<StockPrice[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeWatchlistId, setActiveWatchlistId] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'created' | 'stocks' | 'performance'>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [addItemLoading, setAddItemLoading] = useState(false)
  const [addItemTargetId, setAddItemTargetId] = useState<number | null>(null)
  const [showInlineAdd, setShowInlineAdd] = useState(false)
  const [inlineSearchQuery, setInlineSearchQuery] = useState('')
  const [inlineSearchResults, setInlineSearchResults] = useState<any[]>([])
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false)
  const [activeStockSymbol, setActiveStockSymbol] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState('')
  const [sortColumn, setSortColumn] = useState<string>('symbol')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [screenerData, setScreenerData] = useState<Record<string, ScreenerResult>>({})
  const [showLegendPopover, setShowLegendPopover] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [filterMarketCap, setFilterMarketCap] = useState<string[]>([])
  const [filterAssetType, setFilterAssetType] = useState<string[]>([])
  const [filterSignals, setFilterSignals] = useState<string[]>([])
  const navigate = useNavigate()
  const detailContainerRef = useRef<HTMLDivElement | null>(null)
  const legendPopoverRef = useRef<HTMLDivElement | null>(null)

  const previewButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-indigo-500 transition-transform duration-150 hover:-translate-y-0.5 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200'
  const addButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-500 transition-transform duration-150 hover:-translate-y-0.5 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200'
  const dangerButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition-transform duration-150 hover:-translate-y-0.5 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200'
  const outlineButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-sky-500 transition-transform duration-150 hover:-translate-y-0.5 hover:text-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200'
  const pillPrimaryButtonClass = 'inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200'
  const pillSuccessButtonClass = 'inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200'
  const tableViewButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-600 transition-transform duration-150 hover:-translate-y-0.5 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200'
  const tableRemoveButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-full text-red-600 transition-transform duration-150 hover:-translate-y-0.5 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200'

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

    const getSortValue = (watchlist: WatchlistWithPrices) => {
      switch (sortBy) {
        case 'created':
          return getChronoValue(watchlist)
        case 'stocks':
          return watchlist.items.length
        case 'performance':
          return watchlist.totalChangePercent || 0
        default:
          return 0
      }
    }

    const filtered = watchlists.filter(matchesSearch)
    filtered.sort((a, b) => {
      const aVal = getSortValue(a)
      const bVal = getSortValue(b)
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })
    return filtered
  }, [watchlists, searchTerm, sortBy, sortOrder])

  const watchlistsToShow = filteredWatchlists

  const hasWatchlists = watchlistsToShow.length > 0
  const hasMarketMovers = topPerformers.length > 0 || topDecliners.length > 0
  const activeWatchlist = useMemo(
    () => (activeWatchlistId !== null ? watchlists.find(w => w.id === activeWatchlistId) ?? null : null),
    [watchlists, activeWatchlistId]
  )

  // Removed scrollIntoView to prevent header from disappearing

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
      setActiveWatchlistId(prev => {
        if (prev === null) return prev
        return watchlistsWithPrices.some(w => w.id === prev) ? prev : null
      })
    } catch (error) {
      console.error('Failed to load watchlists:', error)
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    loadWatchlists()
  }, [])

  // Auto-show search form for empty watchlists
  useEffect(() => {
    if (activeWatchlistId) {
      const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId)
      if (activeWatchlist && activeWatchlist.items.length === 0) {
        setShowInlineAdd(true)
      }
    }
  }, [activeWatchlistId, watchlists])

  // Close legend popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (legendPopoverRef.current && !legendPopoverRef.current.contains(event.target as Node)) {
        setShowLegendPopover(false)
      }
    }

    if (showLegendPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showLegendPopover])

  const handleCreateInlineWatchlist = async () => {
    if (!createWatchlistName.trim()) {
      setCreateWatchlistError('Please enter a watchlist name')
      return
    }

    try {
      setCreateWatchlistLoading(true)
      setCreateWatchlistError('')
      const newWatchlist = await watchlistsApiService.createWatchlist({
        name: createWatchlistName.trim(),
        description: createWatchlistDescription.trim() || undefined
      })

      // Reset inline form
      setShowCreateInline(false)
      setCreateWatchlistName('')
      setCreateWatchlistDescription('')

      await loadWatchlists()

      // Automatically open the newly created watchlist
      setActiveWatchlistId(newWatchlist.id)
    } catch (error: any) {
      console.error('Failed to create watchlist:', error)
      if (error.response?.data?.detail) {
        setCreateWatchlistError(error.response.data.detail)
      } else {
        setCreateWatchlistError('Failed to create watchlist')
      }
    } finally {
      setCreateWatchlistLoading(false)
    }
  }

  const handleCancelCreateInline = () => {
    setShowCreateInline(false)
    setCreateWatchlistName('')
    setCreateWatchlistDescription('')
    setCreateWatchlistError('')
  }

  const handleCreateInlineSearch = (query: string) => {
    setCreateWatchlistName(query)
    setCreateWatchlistError('')
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getFilteredAndSortedItems = (items: any[], prices: any[]) => {
    // First filter items
    let filtered = items.filter(item => {
      const screener = screenerData[item.symbol]
      if (!screener) return true // Show items without screener data

      // Market cap filter
      if (filterMarketCap.length > 0 && screener.market_cap_category) {
        const cap = screener.market_cap_category.toLowerCase()
        const matches = filterMarketCap.some(f => {
          if (f === 'XL') return cap.includes('mega')
          if (f === 'L') return cap.includes('large')
          if (f === 'M') return cap.includes('mid')
          if (f === 'S') return cap.includes('small')
          if (f === 'XS') return cap.includes('micro')
          return false
        })
        if (!matches) return false
      }

      // Asset type filter
      if (filterAssetType.length > 0 && screener.asset_type) {
        const type = screener.asset_type.toLowerCase() === 'etf' ? 'ETF' : 'STK'
        if (!filterAssetType.includes(type)) return false
      }

      // Signal filters
      if (filterSignals.length > 0) {
        const hasSignal = filterSignals.every(signal => {
          switch (signal) {
            case 'donch': return screener.donch20_breakout
            case 'stack': return screener.sma_bull_stack
            case '200': return screener.price_above_200
            case 'macd': return screener.macd_cross_up
            case 'htz': return screener.high_tight_zone
            case 'bull': return screener.close_above_30w
            case 'weekly': return screener.weekly_strong
            default: return true
          }
        })
        if (!hasSignal) return false
      }

      return true
    })

    // Then sort
    return [...filtered].sort((a, b) => {
      let aValue, bValue

      switch (sortColumn) {
        case 'symbol':
          aValue = a.symbol
          bValue = b.symbol
          break
        case 'price':
          const aPriceData = prices.find(p => p.symbol === a.symbol)
          const bPriceData = prices.find(p => p.symbol === b.symbol)
          aValue = aPriceData?.current_price || 0
          bValue = bPriceData?.current_price || 0
          break
        case 'change':
          const aChangeData = prices.find(p => p.symbol === a.symbol)
          const bChangeData = prices.find(p => p.symbol === b.symbol)
          aValue = aChangeData?.change_percent || 0
          bValue = bChangeData?.change_percent || 0
          break
        case 'entry':
          aValue = a.entry_price || 0
          bValue = b.entry_price || 0
          break
        case 'pnl':
          const aPnlData = prices.find(p => p.symbol === a.symbol)
          const bPnlData = prices.find(p => p.symbol === b.symbol)
          const aPnl = aPnlData && a.entry_price ? aPnlData.current_price - a.entry_price : 0
          const bPnl = bPnlData && b.entry_price ? bPnlData.current_price - b.entry_price : 0
          aValue = aPnl
          bValue = bPnl
          break
        default:
          aValue = a.symbol
          bValue = b.symbol
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return sortDirection === 'asc'
          ? (aValue || 0) - (bValue || 0)
          : (bValue || 0) - (aValue || 0)
      }
    })
  }

  const handleDeleteWatchlist = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete watchlist "${name}"?`)) {
      try {
        if (activeWatchlistId === id) {
          setActiveWatchlistId(null)
        }
        await watchlistsApiService.deleteWatchlist(id)
        await loadWatchlists()
      } catch (error) {
        console.error('Failed to delete watchlist:', error)
      }
    }
  }

  const loadScreenerDataForWatchlist = async (items: WatchlistItem[]) => {
    const data: Record<string, ScreenerResult> = {}

    // Fetch screener data for each symbol
    for (const item of items) {
      try {
        const result = await screenerApi.querySymbol(item.symbol)
        if (result.results.length > 0) {
          data[item.symbol] = result.results[0]
        }
      } catch (error) {
        console.error(`Failed to load screener data for ${item.symbol}:`, error)
      }
    }

    setScreenerData(data)
  }

  const handleOpenWatchlist = (id: number) => {
    setActiveWatchlistId(current => (current === id ? current : id))
    setDetailCollapsed(false)

    // Load screener data for the watchlist
    const watchlist = watchlists.find(w => w.id === id)
    if (watchlist) {
      loadScreenerDataForWatchlist(watchlist.items)
    }
  }

  const handleOpenAddItemModal = (watchlistId: number) => {
    setActiveWatchlistId(watchlistId)
    setDetailCollapsed(false)
    setShowInlineAdd(true)
  }

  const handleInlineSearch = async (query: string) => {
    setInlineSearchQuery(query)
    setInlineError('')
    if (!query.trim() || query.length < 2) {
      setInlineSearchResults([])
      return
    }

    try {
      setInlineSearchLoading(true)
      const results = await watchlistsApiService.searchSymbols(query)
      setInlineSearchResults(results.slice(0, 5)) // Limit to 5 suggestions
    } catch (error) {
      console.error('Error searching symbols:', error)
      setInlineSearchResults([])
    } finally {
      setInlineSearchLoading(false)
    }
  }

  const handleInlineAddStock = async (symbol?: string) => {
    const stockSymbol = symbol || inlineSearchQuery.trim().toUpperCase()
    if (!stockSymbol) {
      setInlineError('Please enter a stock symbol')
      return
    }
    if (!activeWatchlistId) return

    try {
      setAddItemLoading(true)
      setInlineError('')
      await watchlistsApiService.addItemToWatchlist(activeWatchlistId, {
        symbol: stockSymbol
      })

      // Reset inline add state
      setShowInlineAdd(false)
      setInlineSearchQuery('')
      setInlineSearchResults([])

      // Refresh watchlists
      await loadWatchlists()

      // Fetch screener data for the newly added stock
      const watchlist = watchlists.find(w => w.id === activeWatchlistId)
      if (watchlist) {
        try {
          const result = await screenerApi.querySymbol(stockSymbol)
          if (result.results.length > 0) {
            setScreenerData(prev => ({
              ...prev,
              [stockSymbol]: result.results[0]
            }))
          }
        } catch (error) {
          console.error(`Failed to load screener data for ${stockSymbol}:`, error)
        }
      }
    } catch (error: any) {
      console.error('Failed to add stock:', error)

      // Extract error message from API response
      if (error.response?.data?.detail) {
        setInlineError(error.response.data.detail)
      } else if (error.message) {
        setInlineError(error.message)
      } else {
        setInlineError('Failed to add stock to watchlist')
      }
    } finally {
      setAddItemLoading(false)
    }
  }

  const handleCancelInlineAdd = () => {
    setShowInlineAdd(false)
    setInlineSearchQuery('')
    setInlineSearchResults([])
    setInlineError('')
    // If watchlist is empty, also close the detail view
    if (activeWatchlist && activeWatchlist.items.length === 0) {
      setActiveWatchlistId(null)
    }
  }




  const handleAddItem = async (item: Omit<WatchlistItem, 'id' | 'created_at'>) => {
    if (!addItemTargetId) return

    try {
      setAddItemLoading(true)
      await watchlistsApiService.addItemToWatchlist(addItemTargetId, {
        symbol: item.symbol,
        company_name: item.company_name ?? undefined,
        entry_price: item.entry_price ?? undefined,
        target_price: item.target_price ?? undefined,
        stop_loss: item.stop_loss ?? undefined
      })
      await loadWatchlists()
      setShowAddItemModal(false)
      setAddItemTargetId(null)
    } catch (error) {
      console.error('Failed to add symbol to watchlist:', error)
    } finally {
      setAddItemLoading(false)
    }
  }

  const handleRemoveItem = async (watchlistId: number, itemId: number, symbol: string) => {
    if (!window.confirm(`Remove ${symbol} from this watchlist?`)) {
      return
    }

    try {
      await watchlistsApiService.removeItemFromWatchlist(watchlistId, itemId)
      await loadWatchlists()
    } catch (error) {
      console.error('Failed to remove symbol from watchlist:', error)
    }
  }

  const handleOpenStockChart = (symbol: string) => {
    setActiveStockSymbol(symbol)
  }

  const handleCloseStockChart = () => {
    setActiveStockSymbol(null)
  }

  const handleCloseWatchlist = () => {
    setActiveWatchlistId(null)
    setDetailCollapsed(false)
  }

  const toggleDetailCollapsed = () => {
    setDetailCollapsed(previous => !previous)
  }

  const closeDetailView = () => {
    setActiveWatchlistId(null)
    setDetailCollapsed(false)
    setShowInlineAdd(false)
  }

  const handleCloseAddItemModal = () => {
    setShowAddItemModal(false)
    setAddItemTargetId(null)
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

  function formatDate(value: string | undefined) {
    if (!value) {
      return '—'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)
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
  <>
  <div className="flex min-h-screen bg-gray-50">
    {/* Left Sidebar - Always Market Movers, optionally slim when detail view is open */}
    <aside className={`hidden lg:flex ${activeWatchlist ? 'lg:w-48 xl:w-52' : 'lg:w-60 xl:w-64'} flex-col border-r border-gray-200 bg-white/80 backdrop-blur transition-all duration-300`}>
      <div className="relative border-b border-gray-200 px-4 py-3">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-blue-100/60 to-purple-50 opacity-70" aria-hidden="true" />
        <div className="relative">
          <h2 className={`${activeWatchlist ? 'text-lg' : 'text-xl'} font-semibold text-gray-900`}>Market Movers</h2>
        </div>
      </div>
      <div className={`flex-1 ${activeWatchlist ? 'space-y-2' : 'space-y-4'} overflow-y-auto ${activeWatchlist ? 'p-2' : 'p-4'}`}>
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
                topPerformers.map((stock, index) => {
                  const belongsToWatchlist = watchlists.find(w =>
                    w.items.some(item => item.symbol === stock.symbol)
                  )

                  return (
                    <div
                      key={`top-performer-${stock.symbol}-${index}`}
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
                topDecliners.map((stock, index) => {
                  const belongsToWatchlist = watchlists.find(w =>
                    w.items.some(item => item.symbol === stock.symbol)
                  )

                  return (
                    <div
                      key={`top-decliner-${stock.symbol}-${index}`}
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

    <main className={`flex-1 ${activeWatchlist ? 'flex' : ''}`}>
      <div className={`${activeWatchlist ? 'flex-1' : ''} space-y-3 overflow-y-auto p-3 lg:p-4`}>
        {/* Watchlists Header */}
        <div className="border-b border-gray-200 pb-3 mb-3">
          <h1 className="text-2xl font-semibold text-gray-900">Watchlists</h1>
        </div>

        {/* Search and Create Controls - Only show when not in detail view */}
        {!activeWatchlist && (
          <div className="flex items-center justify-between mb-6">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search lists or symbols..."
                className="w-64 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Sorting Controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Bars3BottomLeftIcon className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'created' | 'stocks' | 'performance')}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="created">
                    📅 Created
                  </option>
                  <option value="stocks">
                    🔢 Stock Count
                  </option>
                  <option value="performance">
                    📈 Performance
                  </option>
                </select>

                <button
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                  title={`Sort ${sortOrder === 'desc' ? 'ascending' : 'descending'}`}
                >
                  {sortOrder === 'desc' ?
                    <ArrowDownIcon className="h-3 w-3" /> :
                    <ArrowUpIcon className="h-3 w-3" />
                  }
                  {sortOrder === 'desc' ? 'High→Low' : 'Low→High'}
                </button>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                onClick={() => setShowCreateInline(true)}
                title="Create new watchlist"
              >
                <PlusIcon className="h-4 w-4" />
                New Watchlist
              </button>
            </div>
          </div>
        )}

        {activeWatchlist && (
          <section
            ref={detailContainerRef}
            className="rounded-2xl border border-slate-200/60 bg-white shadow-xl shadow-slate-200/50 overflow-hidden"
          >
            {/* Header Section */}
            <div className="relative bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 border-b border-slate-200/60">
              <div className="px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{activeWatchlist.name}</h2>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {activeWatchlist.items.length} {activeWatchlist.items.length === 1 ? 'stock' : 'stocks'}
                        </span>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          safePercent(activeWatchlist.totalChangePercent) >= 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {formatPercent(activeWatchlist.totalChangePercent)}
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {formatCurrency(activeWatchlist.totalValue)}
                        </span>
                      </div>
                    </div>

                    {/* Filters Section */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Market Cap Filters */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-600 font-medium">Cap:</span>
                        {['XL', 'L', 'M', 'S', 'XS'].map((cap) => (
                          <button
                            key={cap}
                            onClick={() => {
                              setFilterMarketCap(prev =>
                                prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
                              )
                            }}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                              filterMarketCap.includes(cap)
                                ? cap === 'XL' ? 'bg-emerald-500 text-white'
                                : cap === 'L' ? 'bg-blue-500 text-white'
                                : cap === 'M' ? 'bg-purple-500 text-white'
                                : cap === 'S' ? 'bg-orange-500 text-white'
                                : 'bg-gray-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {cap}
                          </button>
                        ))}
                      </div>

                      {/* Asset Type Filters */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-600 font-medium">Type:</span>
                        {['STK', 'ETF'].map((type) => (
                          <button
                            key={type}
                            onClick={() => {
                              setFilterAssetType(prev =>
                                prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                              )
                            }}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                              filterAssetType.includes(type)
                                ? type === 'ETF' ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>

                      {/* Signal Filters */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-600 font-medium">Signals:</span>
                        {[
                          { key: 'donch', label: 'D', color: 'amber' },
                          { key: 'stack', label: 'S', color: 'sky' },
                          { key: '200', label: '200', color: 'emerald' },
                          { key: 'macd', label: 'M↑', color: 'violet' },
                          { key: 'htz', label: '🔥', color: 'rose' },
                          { key: 'bull', label: '🐂', color: 'teal' },
                          { key: 'weekly', label: 'W⭐', color: 'indigo' }
                        ].map((signal) => (
                          <button
                            key={signal.key}
                            onClick={() => {
                              setFilterSignals(prev =>
                                prev.includes(signal.key) ? prev.filter(s => s !== signal.key) : [...prev, signal.key]
                              )
                            }}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                              filterSignals.includes(signal.key)
                                ? `bg-${signal.color}-500 text-white`
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {signal.label}
                          </button>
                        ))}
                      </div>

                      {/* Clear Filters */}
                      {(filterMarketCap.length > 0 || filterAssetType.length > 0 || filterSignals.length > 0) && (
                        <button
                          onClick={() => {
                            setFilterMarketCap([])
                            setFilterAssetType([])
                            setFilterSignals([])
                          }}
                          className="px-2 py-1 text-[10px] font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-all"
                        >
                          Clear All
                        </button>
                      )}

                      {/* Description Toggle */}
                      {activeWatchlist.description && (
                        <button
                          onClick={() => setShowDescription(!showDescription)}
                          className="ml-auto px-2 py-1 text-[10px] font-medium text-slate-600 hover:text-slate-700 hover:bg-slate-100 rounded transition-all flex items-center gap-1"
                        >
                          {showDescription ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
                          Info
                        </button>
                      )}
                    </div>

                    {/* Collapsible Description */}
                    {showDescription && activeWatchlist.description && (
                      <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-600 leading-relaxed">{activeWatchlist.description}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!detailCollapsed && (
                      <button
                        type="button"
                        className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all duration-200 hover:shadow-sm"
                        onClick={() => setShowInlineAdd(true)}
                        title="Add Stock"
                      >
                        <PlusIcon className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="p-2 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-all duration-200 hover:shadow-sm"
                      onClick={() => setShowLegendPopover(!showLegendPopover)}
                      title="Technical Indicators Guide"
                    >
                      <SparklesIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all duration-200 hover:shadow-sm"
                      onClick={() => navigate(`/watchlists/${activeWatchlist.id}`)}
                      title="Full View"
                    >
                      <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleDetailCollapsed}
                      className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200"
                      title={detailCollapsed ? "Expand watchlist" : "Minimize watchlist"}
                    >
                      {detailCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={closeDetailView}
                      className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200"
                      title="Close detail view"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Legend Popover Modal */}
            {showLegendPopover && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 bg-black/30 z-[99]" onClick={() => setShowLegendPopover(false)}></div>

                {/* Popover */}
                <div
                  ref={legendPopoverRef}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[700px] max-h-[80vh] overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-2xl"
                >
                  <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 border-b border-slate-200 sticky top-0 z-10 bg-white">
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="h-5 w-5 text-purple-600" />
                      <h3 className="text-sm font-bold text-slate-800">Technical Indicators Guide</h3>
                      <button
                        onClick={() => setShowLegendPopover(false)}
                        className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      {/* Trend Scores */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="font-semibold text-blue-600 mb-2">D/W/C Trend Scores</div>
                        <div className="space-y-1 text-slate-600">
                          <div><span className="font-medium">D</span> = Daily (0-100)</div>
                          <div><span className="font-medium">W</span> = Weekly (0-100)</div>
                          <div><span className="font-medium">C</span> = Combined (D + W = 0-200)</div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div className="text-xs font-medium mb-1">Individual Score Guide:</div>
                            <div className="text-xs">0-20: Very weak</div>
                            <div className="text-xs">20-40: Weak to moderate</div>
                            <div className="text-xs">40-60: Moderate to strong</div>
                            <div className="text-xs">60-100: Strong to very strong</div>
                            <div className="text-xs mt-1 text-blue-600">Combined 100+: Very strong overall</div>
                          </div>
                        </div>
                      </div>

                      {/* RSI */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="font-semibold text-gray-700 mb-2">RSI (Relative Strength)</div>
                        <div className="space-y-1 text-slate-600">
                          <div>Measures momentum (0-100)</div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div><span className="font-medium">&lt;30:</span> Oversold (potential bounce)</div>
                            <div><span className="font-medium">30-70:</span> Normal range</div>
                            <div><span className="font-medium">&gt;70:</span> Overbought (potential pullback)</div>
                          </div>
                        </div>
                      </div>

                      {/* 52W High */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="font-semibold text-gray-700 mb-2">52W High (%)</div>
                        <div className="space-y-1 text-slate-600">
                          <div>Distance from 52-week high</div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div><span className="text-green-600 font-medium">Green (-5% to 0%):</span> Near high (strong)</div>
                            <div><span className="font-medium">-10%:</span> Moderate pullback</div>
                            <div><span className="font-medium">-20%+:</span> Significant decline</div>
                          </div>
                        </div>
                      </div>

                      {/* Donchian */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-amber-600">D: (Donch)</span>
                          <span className="text-xs text-slate-600">(number)</span>
                        </div>
                        <div className="space-y-1 text-slate-600">
                          <div>Price broke above 20-day high</div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div><span className="font-medium">Number</span> = Daily trend score</div>
                            <div className="text-amber-600 font-medium">Higher is better (30-60+)</div>
                            <div className="text-xs mt-1">Strong breakout in strong trend</div>
                          </div>
                        </div>
                      </div>

                      {/* Stack */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sky-600">S: (Stack)</span>
                          <span className="text-xs text-slate-600">(number)</span>
                        </div>
                        <div className="space-y-1 text-slate-600">
                          <div>SMAs aligned bullishly</div>
                          <div className="text-xs">(SMA10 &gt; SMA30 &gt; SMA40)</div>
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <div><span className="font-medium">Number</span> = Weekly trend score</div>
                            <div className="text-sky-600 font-medium">Higher is better (30-60+)</div>
                            <div className="text-xs mt-1">Strong weekly momentum</div>
                          </div>
                        </div>
                      </div>

                      {/* Other Signals */}
                      <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                        <div className="font-semibold text-gray-700 mb-2">Other Signals</div>
                        <div className="space-y-2 text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-emerald-600">200</span>
                            <span className="text-xs">Above 200-day MA</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-violet-600">M↑</span>
                            <span className="text-xs">MACD cross up</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-rose-600">🔥</span>
                            <span className="text-xs">High-Tight Zone</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-teal-600">🐂</span>
                            <span className="text-xs">Bull (30w MA)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-indigo-600">W⭐</span>
                            <span className="text-xs">Weekly Strong</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-600">
                      <div className="flex items-start gap-2">
                        <span className="font-medium text-blue-600">💡 Pro Tip:</span>
                        <span>Look for combinations: Multiple signals (D:30+, S:30+, 200, 🐂) with higher scores indicate stronger setups. Lower scores mean signals are present but trends are weaker.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

              {!detailCollapsed && (
                <div className="bg-white">
                  {/* Inline Add Form - At top for better dropdown visibility */}
                  {showInlineAdd && (
                    <div className="border-b border-slate-200/60 bg-slate-50/50 p-5">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 max-w-md">
                          <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                              type="text"
                              value={inlineSearchQuery}
                              onChange={(e) => handleInlineSearch(e.target.value)}
                              placeholder="Search stocks (e.g., AAPL, MSFT)"
                              className="w-full pl-10 pr-4 py-3 border border-slate-300 bg-white rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  setInlineSearchResults([])
                                  handleInlineAddStock()
                                }
                              }}
                              autoFocus
                            />
                            {/* Search Suggestions Dropdown */}
                            {inlineSearchResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                                {inlineSearchResults.map((result) => (
                                  <button
                                    key={result.symbol}
                                    onClick={() => {
                                      setInlineSearchResults([])
                                      handleInlineAddStock(result.symbol)
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 flex flex-col"
                                  >
                                    <span className="font-semibold text-gray-900">{result.symbol}</span>
                                    <span className="text-xs text-gray-600 truncate">{result.security_name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setInlineSearchResults([])
                              handleInlineAddStock()
                            }}
                            disabled={addItemLoading || !inlineSearchQuery.trim()}
                            className="px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {addItemLoading ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Adding...
                              </>
                            ) : (
                              <>
                                <CheckIcon className="h-4 w-4" />
                                Add
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleCancelInlineAdd}
                            className="px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      {inlineError && (
                        <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-600">{inlineError}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="max-h-96 overflow-y-auto space-y-2 p-3">
                    {activeWatchlist.items.length > 0 ? (
                      getFilteredAndSortedItems(activeWatchlist.items, activeWatchlist.prices).map(item => {
                        const stockPrice = activeWatchlist.prices.find(price => price.symbol === item.symbol)
                        const changeClass = stockPrice && stockPrice.change >= 0 ? 'text-green-600' : 'text-red-600'
                        const entry = item.entry_price ?? 0
                        const pnl = stockPrice && entry
                          ? stockPrice.current_price - entry
                          : null
                        const pnlClass = pnl !== null ? (pnl >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'
                        const screener = screenerData[item.symbol]

                        return (
                          <div key={item.id} className="group bg-gradient-to-r from-white to-slate-50/50 rounded-xl border border-slate-200/60 px-5 py-3.5 hover:border-blue-400/60 hover:shadow-md hover:shadow-blue-100/50 transition-all duration-200">
                            {/* First Row: Symbol, Price, 52W High, Change, Entry, P&L */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-4">
                                {/* Symbol, Type, Sector, Cap */}
                                <div className="flex items-center gap-2 w-[250px]">
                                  <div
                                    className="text-sm font-bold text-blue-600 cursor-pointer hover:text-blue-700 transition-colors"
                                    onClick={() => handleOpenStockChart(item.symbol)}
                                  >
                                    {item.symbol}
                                  </div>
                                  {screener?.asset_type && (
                                    <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold ${
                                      screener.asset_type.toLowerCase() === 'etf'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {screener.asset_type.toLowerCase() === 'etf' ? 'ETF' : 'STK'}
                                    </span>
                                  )}
                                  {screener?.market_cap_category && (() => {
                                    const cap = screener.market_cap_category.toLowerCase()
                                    let label = ''
                                    let color = ''
                                    if (cap.includes('mega')) {
                                      label = 'XL'
                                      color = 'bg-emerald-100 text-emerald-700'
                                    } else if (cap.includes('large')) {
                                      label = 'L'
                                      color = 'bg-blue-100 text-blue-700'
                                    } else if (cap.includes('mid')) {
                                      label = 'M'
                                      color = 'bg-purple-100 text-purple-700'
                                    } else if (cap.includes('small')) {
                                      label = 'S'
                                      color = 'bg-orange-100 text-orange-700'
                                    } else if (cap.includes('micro')) {
                                      label = 'XS'
                                      color = 'bg-gray-100 text-gray-700'
                                    }
                                    return label ? (
                                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold ${color}`} title={screener.market_cap_category}>
                                        {label}
                                      </span>
                                    ) : null
                                  })()}
                                  <div className="text-xs text-gray-600 truncate">
                                    {item.sector || 'N/A'}
                                  </div>
                                </div>

                                {/* Price */}
                                <div className="text-sm font-semibold text-gray-900 w-[100px]">
                                  {stockPrice ? formatCurrency(stockPrice.current_price) : '—'}
                                </div>

                                {/* 52W High (%) */}
                                <div
                                  className="text-sm text-gray-700 w-[200px] cursor-help"
                                  title="52-Week High and distance from it. Green if within 5% of high (strong relative position)"
                                >
                                  <span className="text-gray-600">52W:</span>{' '}
                                  <span className="font-semibold">
                                    {screener?.high_52w ? formatCurrency(parseFloat(screener.high_52w.toString())) : '—'}
                                  </span>
                                  {' '}
                                  <span className={`font-semibold ${
                                    screener?.pct_from_52w_high && parseFloat(screener.pct_from_52w_high.toString()) >= -5
                                      ? 'text-green-600'
                                      : ''
                                  }`}>
                                    ({screener?.pct_from_52w_high ? parseFloat(screener.pct_from_52w_high.toString()).toFixed(0) + '%' : '—'})
                                  </span>
                                </div>

                                {/* Change */}
                                <div className={`text-sm font-semibold ${changeClass} w-[80px]`}>
                                  {stockPrice ? formatPercent(stockPrice.change_percent) : '—'}
                                </div>

                                {/* Entry */}
                                <div className="text-sm text-gray-700 w-[120px]">
                                  <span className="text-gray-600">Entry</span>{' '}
                                  <span className="font-semibold">
                                    {item.entry_price ? formatCurrency(item.entry_price) : '—'}
                                  </span>
                                </div>
                              </div>

                              {/* Actions on right */}
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                    onClick={() => navigate(`/watchlists/${activeWatchlist.id}?symbol=${encodeURIComponent(item.symbol)}`)}
                                    title="Open full view"
                                  >
                                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                    onClick={() => handleRemoveItem(activeWatchlist.id, item.id, item.symbol)}
                                    title="Remove"
                                  >
                                    <TrashIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Second Row: Scores below Symbol, RSI below Price, Signals below 52W, P&L below Entry */}
                            <div className="flex items-center gap-4">
                              {/* Scores (aligned below Symbol/Sector) */}
                              <div
                                className="text-sm text-gray-700 w-[250px] cursor-help"
                                title="Trend Scores (0-100): Daily / Weekly / Combined - Higher is stronger"
                              >
                                <span className="text-blue-600 font-semibold">D/W/C</span>{' '}
                                <span className="font-semibold">
                                  {screener?.trend_score_d ?? '—'}/{screener?.trend_score_w ?? '—'}/{screener?.combined_score ?? '—'}
                                </span>
                              </div>

                              {/* RSI (aligned below Price) */}
                              <div
                                className="text-sm text-gray-700 w-[100px] cursor-help"
                                title="RSI (Relative Strength Index): <30 oversold, >70 overbought"
                              >
                                <span className="text-gray-600">RSI:</span>{' '}
                                <span className="font-semibold">
                                  {screener?.rsi14 ? parseFloat(screener.rsi14.toString()).toFixed(0) : '—'}
                                </span>
                              </div>

                              {/* Signals (aligned below 52W) */}
                              <div className="flex items-center gap-2 w-[200px] flex-wrap">
                                {screener?.donch20_breakout && (
                                  <span
                                    className="text-xs font-semibold text-amber-600 cursor-help"
                                    title={`Donchian Breakout: Price broke above 20-day high with ${screener?.trend_score_d}/100 daily trend strength`}
                                  >
                                    D:{screener?.trend_score_d ?? ''}
                                  </span>
                                )}
                                {screener?.sma_bull_stack && (
                                  <span
                                    className="text-xs font-semibold text-sky-600 cursor-help"
                                    title={`SMA Bull Stack: Moving averages aligned bullishly with ${screener?.trend_score_w}/100 weekly trend strength`}
                                  >
                                    S:{screener?.trend_score_w ?? ''}
                                  </span>
                                )}
                                {screener?.price_above_200 && (
                                  <span
                                    className="text-xs font-semibold text-emerald-600 cursor-help"
                                    title="Above 200 SMA: Price is above the 200-day moving average (long-term bullish)"
                                  >
                                    200
                                  </span>
                                )}
                                {screener?.macd_cross_up && (
                                  <span
                                    className="text-xs font-semibold text-violet-600 cursor-help"
                                    title="MACD Cross Up: MACD line crossed above signal line (momentum turning bullish)"
                                  >
                                    M↑
                                  </span>
                                )}
                                {screener?.high_tight_zone && (
                                  <span
                                    className="text-xs font-semibold text-rose-600 cursor-help"
                                    title="High-Tight Zone: Strong uptrend with minimal pullback (powerful pattern)"
                                  >
                                    🔥
                                  </span>
                                )}
                                {screener?.close_above_30w && (
                                  <span
                                    className="text-xs font-semibold text-teal-600 cursor-help"
                                    title="Weekly Bull: Price closed above 30-week moving average (weekly timeframe bullish)"
                                  >
                                    🐂
                                  </span>
                                )}
                                {screener?.weekly_strong && (
                                  <span
                                    className="text-xs font-semibold text-indigo-600 cursor-help"
                                    title="Weekly Strong: Above 30w MA AND SMA stack (double confirmation)"
                                  >
                                    W⭐
                                  </span>
                                )}
                              </div>

                              {/* Spacer for Change */}
                              <div className="w-[80px]"></div>

                              {/* P&L (aligned below Entry) */}
                              <div className="text-sm text-gray-700 w-[120px]">
                                <span className="text-gray-600">P&L</span>{' '}
                                <span className={`font-bold ${pnl !== null ? pnlClass : 'text-gray-400'}`}>
                                  {pnl !== null ? formatCurrency(pnl) : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="px-5 py-10 text-center">
                        <ViewColumnsIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          No stocks in this watchlist
                        </h3>
                        <p className="text-gray-600 mb-6">
                          Add your first stock to get started
                        </p>
                      </div>
                    )}

                  </div>
                </div>
              )}
          </section>
        )}

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
                {topPerformers.slice(0, 3).map((stock, index) => (
                  <div key={`mobile-top-performer-${stock.symbol}-${index}`} className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50/80 px-3 py-2">
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
                {topDecliners.slice(0, 3).map((stock, index) => (
                  <div key={`mobile-top-decliner-${stock.symbol}-${index}`} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/80 px-3 py-2">
                    <span className="text-sm font-semibold text-red-900">{stock.symbol}</span>
                    <span className="text-xs font-semibold text-red-700">{formatPercent(stock.change_percent)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

          {/* Inline Create Watchlist Form */}
        {/* Cards View - Only show when not in detail view */}
        {!activeWatchlist && (
          <>
            {showCreateInline && (
            <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1 grid gap-4 md:grid-cols-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={createWatchlistName}
                      onChange={(e) => handleCreateInlineSearch(e.target.value)}
                      placeholder="Watchlist name (e.g., Tech Stocks, Growth Plays)"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateInlineWatchlist()
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <input
                    type="text"
                    value={createWatchlistDescription}
                    onChange={(e) => setCreateWatchlistDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateInlineWatchlist()
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCreateInlineWatchlist()}
                    disabled={createWatchlistLoading || !createWatchlistName.trim()}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {createWatchlistLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Create
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelCreateInline}
                    className="px-3 py-3 text-gray-600 hover:text-gray-800 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {createWatchlistError && (
                <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{createWatchlistError}</p>
                </div>
              )}
            </div>
          )}

          {hasWatchlists ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {watchlistsToShow.map(watchlist => {
                const itemsToShow = 3

                return (
                  <div
                    key={watchlist.id}
                    className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/80 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
                    onClick={() => handleOpenWatchlist(watchlist.id)}
                  >
                    <Card className="h-full border-none bg-transparent shadow-none">
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <CardHeader className="px-5 pb-3 pt-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {watchlist.name}
                          </CardTitle>
                          {watchlist.description && (
                            <p className="mt-1 text-sm text-gray-600 line-clamp-1">{watchlist.description}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-gray-600">
                                {watchlist.items.length} stocks
                              </span>
                              <span className={`text-xs font-semibold ${
                                safePercent(watchlist.totalChangePercent) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatPercent(watchlist.totalChangePercent)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <CalendarDaysIcon className="h-3 w-3" />
                              <span>{formatDate(watchlist.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenWatchlist(watchlist.id)
                          }}
                          title="View details"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
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
                                  <div
                                    className="cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenWatchlist(watchlist.id)
                                      handleOpenStockChart(item.symbol)
                                    }}
                                  >
                                    <div className={`text-sm font-semibold ${symbolClass} hover:text-blue-600 transition-colors`}>{item.symbol}</div>
                                    <div className="text-xs text-gray-500">
                                      {item.sector || '—'}
                                    </div>
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
                      <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-3">
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenWatchlist(watchlist.id)
                          }}
                        >
                          View Details
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-gray-400 hover:text-green-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenAddItemModal(watchlist.id)
                            }}
                            title="Add stock"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteWatchlist(watchlist.id, watchlist.name)
                            }}
                            title="Delete watchlist"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                  </CardContent>
                </Card>
                  </div>
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
                onClick={() => setShowCreateInline(true)}
                className="gap-2 bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4" />
                Create watchlist
              </Button>
            </CardContent>
          </Card>
        )}
          </>
        )}
      </div>

      {/* Fixed Slide-out Watchlist Sidebar (only visible in detail view) */}
      {activeWatchlist && (
        <div className="fixed top-1/2 right-0 transform -translate-y-1/2 z-20 group">
          {/* Hover trigger tab */}
          <div className="bg-blue-600 text-white px-2 py-4 rounded-l-lg shadow-lg cursor-pointer group-hover:bg-blue-700 transition-colors duration-300">
            <div className="transform -rotate-90 text-xs font-medium whitespace-nowrap">
              Lists
            </div>
          </div>

          {/* Slide-out panel */}
          <div className="absolute right-full top-0 translate-x-2 opacity-0 invisible group-hover:translate-x-0 group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out">
            <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-l-xl shadow-xl p-4 min-w-48 max-w-56">
              <div className="text-xs font-medium text-gray-600 mb-3">Switch to:</div>
              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400 pr-1">
                {watchlists.filter(w => w.id !== activeWatchlistId).map((watchlist, index) => {
                  const colors = [
                    { bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-200', text: 'text-blue-700', tip: 'bg-blue-200' },
                    { bg: 'bg-gray-50 hover:bg-gray-100', border: 'border-gray-200', text: 'text-gray-700', tip: 'bg-gray-200' },
                    { bg: 'bg-indigo-50 hover:bg-indigo-100', border: 'border-indigo-200', text: 'text-indigo-700', tip: 'bg-indigo-200' },
                    { bg: 'bg-purple-50 hover:bg-purple-100', border: 'border-purple-200', text: 'text-purple-700', tip: 'bg-purple-200' },
                    { bg: 'bg-green-50 hover:bg-green-100', border: 'border-green-200', text: 'text-green-700', tip: 'bg-green-200' },
                    { bg: 'bg-teal-50 hover:bg-teal-100', border: 'border-teal-200', text: 'text-teal-700', tip: 'bg-teal-200' }
                  ]
                  const colorScheme = colors[index % colors.length]

                  return (
                    <button
                      key={watchlist.id}
                      onClick={() => setActiveWatchlistId(watchlist.id)}
                      className={`group/item relative w-full ${colorScheme.bg} ${colorScheme.border} border rounded-lg p-3 text-left transition-all duration-200 hover:shadow-md`}
                      title={`Switch to ${watchlist.name}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${colorScheme.text} truncate`}>
                            {watchlist.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {watchlist.items.length} stocks
                          </div>
                        </div>
                      </div>

                      {/* Triangle tip (signpost style) */}
                      <div className={`absolute -right-2 top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-4 border-t-4 border-b-4 ${colorScheme.tip} border-r-0 border-t-transparent border-b-transparent`}></div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
    </div>

    <AddItemModal
      isOpen={showAddItemModal}
      onClose={handleCloseAddItemModal}
      onSave={handleAddItem}
      isLoading={addItemLoading}
    />

    {/* Stock Detail Modal */}
    {activeStockSymbol && (
      <StockDetailView
        symbol={activeStockSymbol}
        isOpen={!!activeStockSymbol}
        onClose={handleCloseStockChart}
      />
    )}

  </>
)

}

export default Watchlists
