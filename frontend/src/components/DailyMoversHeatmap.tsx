import React, { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BuildingOffice2Icon,
  CircleStackIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline'
import { DailyMoverStock, MoversGroup } from '../services/dailyMoversApi'

const MARKET_CAP_ORDER = ['mega', 'large', 'mid', 'small', 'micro', 'unknown'] as const

const MARKET_CAP_LABELS: Record<string, { label: string; description: string }> = {
  mega: { label: 'Mega Cap', description: '$200B+' },
  large: { label: 'Large Cap', description: '$10B-$200B' },
  mid: { label: 'Mid Cap', description: '$2B-$10B' },
  small: { label: 'Small Cap', description: '$300M-$2B' },
  micro: { label: 'Micro Cap', description: '<$300M' },
  unknown: { label: 'Unclassified', description: 'Not tagged' }
}

type MarketCapKey = typeof MARKET_CAP_ORDER[number]

type HeatmapView = 'sector' | 'marketCap'

type SegmentStats = {
  key: string
  label: string
  gainers: DailyMoverStock[]
  losers: DailyMoverStock[]
  netChange: number
  total: number
  topGainers: DailyMoverStock[]
  topLosers: DailyMoverStock[]
}

type CardStats = {
  key: string
  label: string
  totalGainers: number
  totalLosers: number
  netChange: number
  segments: SegmentStats[]
}

interface DailyMoversHeatmapProps {
  sectors: MoversGroup[]
  marketCaps: MoversGroup[]
  onSelectStock?: (symbol: string) => void
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '0.0%'
  const rounded = value.toFixed(1)
  return `${value > 0 ? '+' : ''}${rounded}%`
}

const normalizeLabel = (label: string | undefined | null): string => {
  if (!label || label.trim() === '' || label.trim().toUpperCase() === 'N/A') {
    return 'Unclassified'
  }
  return label
}

const dedupeBySymbol = (
  stocks: DailyMoverStock[],
  shouldReplace: (current: DailyMoverStock, candidate: DailyMoverStock) => boolean
): DailyMoverStock[] => {
  const map = new Map<string, DailyMoverStock>()

  stocks.forEach(stock => {
    const existing = map.get(stock.symbol)
    if (!existing || shouldReplace(existing, stock)) {
      map.set(stock.symbol, stock)
    }
  })

  return Array.from(map.values())
}

const computeNetChange = (stocks: DailyMoverStock[]): number => {
  if (!stocks.length) return 0
  const totalChange = stocks.reduce((sum, stock) => sum + stock.price_change_percent, 0)
  return totalChange / stocks.length
}

const computeSegmentStats = (
  gainers: DailyMoverStock[],
  losers: DailyMoverStock[],
  key: string,
  label: string
): SegmentStats => {
  const uniqueGainers = dedupeBySymbol(
    gainers,
    (current, candidate) => candidate.price_change_percent > current.price_change_percent
  )

  const uniqueLosers = dedupeBySymbol(
    losers,
    (current, candidate) => candidate.price_change_percent < current.price_change_percent
  )

  const combined = [...uniqueGainers, ...uniqueLosers]
  const netChange = computeNetChange(combined)
  return {
    key,
    label,
    gainers,
    losers,
    netChange,
    total: combined.length,
    topGainers: uniqueGainers
      .slice()
      .sort((a, b) => b.price_change_percent - a.price_change_percent)
      .slice(0, 5),
    topLosers: uniqueLosers
      .slice()
      .sort((a, b) => a.price_change_percent - b.price_change_percent)
      .slice(0, 5)
  }
}

const getHeatmapStyles = (netChange: number, total: number): React.CSSProperties => {
  if (!total) {
    return {
      backgroundColor: '#f3f4f6',
      borderColor: '#e5e7eb'
    }
  }

  const intensity = clamp(Math.abs(netChange) / 6, 0, 1)
  const lightnessBase = 92 - intensity * 38

  if (netChange > 0) {
    const start = `hsla(151, 72%, ${lightnessBase}%, 0.90)`
    const end = `hsla(153, 80%, ${lightnessBase + 6}%, 0.75)`
    return {
      backgroundImage: `linear-gradient(135deg, ${start}, ${end})`,
      borderColor: `hsla(151, 65%, ${lightnessBase - 10}%, 0.6)`
    }
  }

  if (netChange < 0) {
    const start = `hsla(2, 85%, ${lightnessBase}%, 0.90)`
    const end = `hsla(4, 92%, ${lightnessBase + 6}%, 0.75)`
    return {
      backgroundImage: `linear-gradient(135deg, ${start}, ${end})`,
      borderColor: `hsla(4, 75%, ${lightnessBase - 10}%, 0.6)`
    }
  }

  return {
    backgroundColor: '#fef3c7',
    borderColor: '#facc15'
  }
}

const buildCardStats = (
  group: MoversGroup,
  segmentSelector: (stock: DailyMoverStock) => string,
  segmentLabeller: (key: string) => string,
  segmentOrder?: string[]
): CardStats | null => {
  const segmentMap = new Map<string, { gainers: DailyMoverStock[]; losers: DailyMoverStock[] }>()

  const ensureEntry = (key: string) => {
    if (!segmentMap.has(key)) {
      segmentMap.set(key, { gainers: [], losers: [] })
    }
    return segmentMap.get(key)!
  }

  group.gainers.forEach(stock => {
    const key = segmentSelector(stock)
    ensureEntry(key).gainers.push(stock)
  })

  group.losers.forEach(stock => {
    const key = segmentSelector(stock)
    ensureEntry(key).losers.push(stock)
  })

  const order = segmentOrder ?? Array.from(segmentMap.keys())
  const segments = order
    .map(key => {
      const entry = segmentMap.get(key)
      if (!entry) return null
      return computeSegmentStats(entry.gainers, entry.losers, key, segmentLabeller(key))
    })
    .filter((segment): segment is SegmentStats => {
      if (!segment) return false
      return segment.total > 0
    })
    .sort((a, b) => Math.abs(b.netChange) - Math.abs(a.netChange))

  if (!segments.length) {
    return null
  }

  return {
    key: group.category,
    label: group.category,
    totalGainers: group.gainers.length,
    totalLosers: group.losers.length,
    netChange: computeNetChange([...group.gainers, ...group.losers]),
    segments
  }
}

const DailyMoversHeatmap: React.FC<DailyMoversHeatmapProps> = ({ sectors, marketCaps, onSelectStock }) => {
  const [activeView, setActiveView] = useState<HeatmapView>('sector')
  const [selectedMarketCap, setSelectedMarketCap] = useState<'all' | MarketCapKey>('all')
  const [selectedSector, setSelectedSector] = useState<'all' | string>('all')

  useEffect(() => {
    if (activeView === 'sector') {
      setSelectedSector('all')
    } else {
      setSelectedMarketCap('all')
    }
  }, [activeView])

  const sectorCards = useMemo(() => (
    sectors
      .map(group => buildCardStats(
        group,
        stock => (stock.market_cap_category as MarketCapKey) || 'unknown',
        (key) => MARKET_CAP_LABELS[key]?.label ?? key,
        MARKET_CAP_ORDER as unknown as string[]
      ))
      .filter((card): card is CardStats => card !== null)
      .map(card => ({
        ...card,
        label: normalizeLabel(card.label)
      }))
      .sort((a, b) => b.netChange - a.netChange)
  ), [sectors])

  const availableSectorNames = useMemo(() => {
    const values = new Set<string>()
    sectorCards.forEach(card => values.add(card.label))
    return Array.from(values).sort()
  }, [sectorCards])

  const marketCapCards = useMemo(() => (
    marketCaps
      .map(group => buildCardStats(
        group,
        stock => stock.sector || 'Unknown',
        key => normalizeLabel(key),
      ))
      .filter((card): card is CardStats => card !== null)
      .map(card => ({
        ...card,
        label: MARKET_CAP_LABELS[card.key]?.label ?? normalizeLabel(card.label)
      }))
      .sort((a, b) => b.netChange - a.netChange)
  ), [marketCaps])

  const filteredSectorCards = useMemo(() => (
    sectorCards
      .map(card => {
        if (selectedMarketCap === 'all') return card
        const filteredSegments = card.segments.filter(segment => segment.key === selectedMarketCap)
        if (!filteredSegments.length) return null
        return { ...card, segments: filteredSegments }
      })
      .filter((card): card is CardStats => card !== null)
  ), [sectorCards, selectedMarketCap])

  const filteredMarketCapCards = useMemo(() => (
    marketCapCards
      .map(card => {
        if (selectedSector === 'all') return card
        const filteredSegments = card.segments.filter(segment => segment.label === selectedSector)
        if (!filteredSegments.length) return null
        return { ...card, segments: filteredSegments }
      })
      .filter((card): card is CardStats => card !== null)
  ), [marketCapCards, selectedSector])

  const cardsToRender = activeView === 'sector' ? filteredSectorCards : filteredMarketCapCards

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Squares2X2Icon className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Market Heatmap</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('sector')}
            className={clsx(
              'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              activeView === 'sector'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            )}
          >
            <BuildingOffice2Icon className="mr-1 h-3.5 w-3.5" />
            Sectors
          </button>
          <button
            type="button"
            onClick={() => setActiveView('marketCap')}
            className={clsx(
              'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              activeView === 'marketCap'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            )}
          >
            <CircleStackIcon className="mr-1 h-3.5 w-3.5" />
            Market Caps
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {activeView === 'sector' ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedMarketCap('all')}
              className={clsx(
                'rounded-md border px-2 py-0.5 text-xs',
                selectedMarketCap === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
              )}
            >
              All
            </button>
            {MARKET_CAP_ORDER.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMarketCap(key)}
                className={clsx(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  selectedMarketCap === key
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                )}
              >
                {MARKET_CAP_LABELS[key].label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedSector('all')}
              className={clsx(
                'rounded-md border px-2 py-0.5 text-xs',
                selectedSector === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
              )}
            >
              All
            </button>
            {availableSectorNames.map(sector => (
              <button
                key={sector}
                type="button"
                onClick={() => setSelectedSector(sector)}
                className={clsx(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  selectedSector === sector
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                )}
              >
                {sector}
              </button>
            ))}
          </div>
        )}

        {cardsToRender.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
            <p className="text-xs font-medium text-gray-600">No movers match filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cardsToRender.map(card => (
              <div key={`${activeView}-${card.key}`} className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-gray-900">{card.label}</h3>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span>{card.totalGainers + card.totalLosers} movers</span>
                        <span className={card.netChange >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {formatPercent(card.netChange)}
                        </span>
                      </div>
                      {activeView === 'marketCap' && (
                        <p className="text-[10px] text-gray-400">
                          {MARKET_CAP_LABELS[card.key]?.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold">
                      <span className="flex items-center gap-0.5 text-green-600">
                        <ArrowTrendingUpIcon className="h-3 w-3" />
                        {card.totalGainers}
                      </span>
                      <span className="flex items-center gap-0.5 text-red-500">
                        <ArrowTrendingDownIcon className="h-3 w-3" />
                        {card.totalLosers}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2 space-y-2">
                  {card.segments.map(segment => (
                    <div
                      key={`${card.key}-${segment.key}`}
                      className="rounded-md border px-2 py-2 shadow-sm transition-shadow hover:shadow"
                      style={getHeatmapStyles(segment.netChange, segment.total)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-gray-900/90">
                            {segment.label}
                          </p>
                          <span className={`text-[10px] font-semibold ${segment.netChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatPercent(segment.netChange)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-medium">
                          <span className="text-green-700">↑{segment.gainers.length}</span>
                          <span className="text-red-600">↓{segment.losers.length}</span>
                        </div>
                      </div>

                      <div className="grid gap-1.5 text-[10px] md:grid-cols-2">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[9px] uppercase tracking-wide text-green-800">Gainers</p>
                          <div className="flex flex-wrap gap-1">
                            {segment.topGainers.length ? (
                              segment.topGainers.map(stock => (
                                <button
                                  key={stock.id}
                                  type="button"
                                  onClick={() => onSelectStock?.(stock.symbol)}
                                  className="rounded bg-white/70 px-1.5 py-0.5 font-semibold text-green-700 shadow-sm transition hover:bg-white text-[10px]"
                                >
                                  {stock.symbol} <span className="text-green-600">+{stock.price_change_percent.toFixed(1)}%</span>
                                </button>
                              ))
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <p className="font-semibold text-[9px] uppercase tracking-wide text-red-800">Decliners</p>
                          <div className="flex flex-wrap gap-1">
                            {segment.topLosers.length ? (
                              segment.topLosers.map(stock => (
                                <button
                                  key={stock.id}
                                  type="button"
                                  onClick={() => onSelectStock?.(stock.symbol)}
                                  className="rounded bg-white/70 px-1.5 py-0.5 font-semibold text-red-600 shadow-sm transition hover:bg-white text-[10px]"
                                >
                                  {stock.symbol} <span className="text-red-500">{stock.price_change_percent.toFixed(1)}%</span>
                                </button>
                              ))
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DailyMoversHeatmap
