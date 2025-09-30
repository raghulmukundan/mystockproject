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
      .slice(0, 3),
    topLosers: uniqueLosers
      .slice()
      .sort((a, b) => a.price_change_percent - b.price_change_percent)
      .slice(0, 3)
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Squares2X2Icon className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Market Heatmap Overview</h2>
            <p className="text-sm text-gray-600">Spot sector and market-cap momentum with the movers behind each block.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('sector')}
            className={clsx(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              activeView === 'sector'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            )}
          >
            <BuildingOffice2Icon className="mr-1.5 h-4 w-4" />
            By sector
          </button>
          <button
            type="button"
            onClick={() => setActiveView('marketCap')}
            className={clsx(
              'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              activeView === 'marketCap'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            )}
          >
            <CircleStackIcon className="mr-1.5 h-4 w-4" />
            By market cap
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {activeView === 'sector' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedMarketCap('all')}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm',
                selectedMarketCap === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
              )}
            >
              All market caps
            </button>
            {MARKET_CAP_ORDER.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMarketCap(key)}
                className={clsx(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSector('all')}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm',
                selectedSector === 'all'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
              )}
            >
              All sectors
            </button>
            {availableSectorNames.map(sector => (
              <button
                key={sector}
                type="button"
                onClick={() => setSelectedSector(sector)}
                className={clsx(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
            <p className="text-sm font-medium text-gray-600">No movers match the current filters.</p>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your filters to surface additional segments.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cardsToRender.map(card => (
              <div key={`${activeView}-${card.key}`} className="rounded-xl border border-gray-200 bg-white/70 shadow-sm">
                <div className="border-b border-gray-100 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-gray-900">{card.label}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>{card.totalGainers + card.totalLosers} movers</span>
                        <span>Avg {formatPercent(card.netChange)}</span>
                      </div>
                      {card.label === 'Unclassified' && (
                        <p className="text-[11px] text-amber-600">Sector metadata not yet linked for these symbols.</p>
                      )}
                      {activeView === 'marketCap' && (
                        <p className="text-[11px] text-gray-400">
                          {MARKET_CAP_LABELS[card.key]?.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs font-medium">
                      <span className="flex items-center gap-1 text-green-600">
                        <ArrowTrendingUpIcon className="h-4 w-4" />
                        {card.totalGainers}
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <ArrowTrendingDownIcon className="h-4 w-4" />
                        {card.totalLosers}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {card.segments.map(segment => (
                    <div
                      key={`${card.key}-${segment.key}`}
                      className="rounded-lg border px-3 py-3 shadow-inner transition-shadow hover:shadow-md"
                      style={getHeatmapStyles(segment.netChange, segment.total)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900/90">
                            {segment.label}
                          </p>
                          <p className="text-[11px] text-gray-700/80">
                            {segment.total} movers · {formatPercent(segment.netChange)}
                          </p>
                        </div>
                        <div className="text-right text-[11px] font-medium text-gray-700 leading-4">
                          <div className="text-green-700">
                            ↑ {segment.gainers.length}
                          </div>
                          <div className="text-red-600">
                            ↓ {segment.losers.length}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-2 text-[11px] text-gray-800 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="font-semibold uppercase tracking-wide text-green-900">Gainers</p>
                          <div className="flex flex-wrap gap-1.5">
                            {segment.topGainers.length ? (
                              segment.topGainers.map(stock => (
                                <button
                                  key={stock.id}
                                  type="button"
                                  onClick={() => onSelectStock?.(stock.symbol)}
                                  className="rounded-md bg-white/70 px-2 py-0.5 font-semibold text-green-700 shadow-sm transition hover:bg-white"
                                >
                                  {stock.symbol}
                                  <span className="ml-1 text-[10px] font-medium text-green-600">
                                    +{stock.price_change_percent.toFixed(1)}%
                                  </span>
                                </button>
                              ))
                            ) : (
                              <span className="text-gray-700">—</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="font-semibold uppercase tracking-wide text-red-800">Decliners</p>
                          <div className="flex flex-wrap gap-1.5">
                            {segment.topLosers.length ? (
                              segment.topLosers.map(stock => (
                                <button
                                  key={stock.id}
                                  type="button"
                                  onClick={() => onSelectStock?.(stock.symbol)}
                                  className="rounded-md bg-white/70 px-2 py-0.5 font-semibold text-red-600 shadow-sm transition hover:bg-white"
                                >
                                  {stock.symbol}
                                  <span className="ml-1 text-[10px] font-medium text-red-500">
                                    {stock.price_change_percent.toFixed(1)}%
                                  </span>
                                </button>
                              ))
                            ) : (
                              <span className="text-gray-700">—</span>
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
