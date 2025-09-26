import React, { useState, useEffect, useCallback } from 'react'
import {
  ChartComponent,
  SeriesCollectionDirective,
  SeriesDirective,
  Inject,
  CandleSeries,
  LineSeries,
  AreaSeries,
  ColumnSeries,
  Category,
  DateTime,
  Logarithmic,
  Legend,
  Tooltip,
  DataLabel,
  Zoom,
  Crosshair,
  Selection,
  ChartAnnotation
} from '@syncfusion/ej2-react-charts'
import type { IAxisLabelRenderEventArgs } from '@syncfusion/ej2-charts'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import {
  XMarkIcon,
  ChartBarIcon,
  CogIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline'

interface TechnicalData {
  symbol: string
  date: string
  close: number
  volume: number
  sma20?: number
  sma50?: number
  sma200?: number
  rsi14?: number
  adx14?: number
  atr14?: number
  donch20_high?: number
  donch20_low?: number
  macd?: number
  macd_signal?: number
  macd_hist?: number
  avg_vol20?: number
  high_252?: number
  distance_to_52w_high?: number
  rel_volume?: number
  sma_slope?: number
}

interface ChartDataPoint {
  x: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  sma20?: number
  sma50?: number
  sma200?: number
}

interface ProfessionalStockChartProps {
  symbol: string
  onClose: () => void
}

type TimeframePeriod = '1D' | '7D' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y'

interface TimeframeConfig {
  label: string
  days: number
  interval: string
}

const TIMEFRAMES: Record<TimeframePeriod, TimeframeConfig> = {
  '1D': { label: '1D', days: 1, interval: '5min' },
  '7D': { label: '7D', days: 7, interval: '1hour' },
  '1M': { label: '1M', days: 30, interval: 'daily' },
  '3M': { label: '3M', days: 90, interval: 'daily' },
  '6M': { label: '6M', days: 180, interval: 'daily' },
  '1Y': { label: '1Y', days: 365, interval: 'daily' },
  '2Y': { label: '2Y', days: 730, interval: 'weekly' },
  '5Y': { label: '5Y', days: 1825, interval: 'weekly' }
}

const palette = {
  cardBgFrom: '#0f172a',
  cardBgVia: '#111a2a',
  cardBgTo: '#020617',
  cardBorder: '#1e293b',
  accent: '#3b82f6',
  accentSoft: 'rgba(59,130,246,0.22)',
  accentMuted: 'rgba(29,78,216,0.14)',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  bull: '#4ade80',
  bear: '#f87171',
  line: '#60a5fa',
  areaFill: 'rgba(59,130,246,0.30)',
  gridMajor: 'rgba(148, 163, 184, 0.18)',
  gridMinor: 'rgba(148, 163, 184, 0.05)',
  tooltipBg: '#1f2937',
  tooltipText: '#e2e8f0',
  volumeBull: 'rgba(74, 222, 128, 0.45)',
  volumeBear: 'rgba(248, 113, 113, 0.45)'
}

const formatCurrency = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}

const formatNumberShort = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—'
  }

  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(0)}B`
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`
  }

  return value.toString()
}

const formatPercent = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '—'
  }

  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const ProfessionalStockChart: React.FC<ProfessionalStockChartProps> = ({
  symbol,
  onClose
}) => {
  const [priceData, setPriceData] = useState<ChartDataPoint[]>([])
  const [technicalData, setTechnicalData] = useState<TechnicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframePeriod>('1M')
  const [showTechnicals, setShowTechnicals] = useState(false)
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick')
  const [enabledIndicators, setEnabledIndicators] = useState<string[]>(['sma20'])

  const fetchPriceData = useCallback(async (timeframe: TimeframePeriod) => {
    setLoading(true)
    try {
      const config = TIMEFRAMES[timeframe]

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - config.days)

      const dateFrom = startDate.toISOString().split('T')[0]
      const dateTo = endDate.toISOString().split('T')[0]

      const pageSize = config.days <= 7 ? 200 : config.days <= 180 ? 300 : 500

      const response = await fetch(
        `http://localhost:8000/api/prices/browse?symbol=${symbol}&date_from=${dateFrom}&date_to=${dateTo}&page_size=${pageSize}&sort_by=date&sort_order=asc`
      )

      if (response.ok) {
        const responseData = await response.json()
        const transformedData: ChartDataPoint[] = responseData.prices.map((item: any) => ({
          x: new Date(item.date),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume || 0
        }))
        setPriceData(transformedData)
      }
    } catch (error) {
      console.error('Error fetching price data:', error)
    } finally {
      setLoading(false)
    }
  }, [symbol])

  const fetchTechnicalData = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/technical/latest/${symbol}`)
      if (response.ok) {
        const data = await response.json()
        setTechnicalData(data)

        if (data && priceData.length > 0) {
          const updatedData = priceData.map(point => ({
            ...point,
            sma20: data.sma20,
            sma50: data.sma50,
            sma200: data.sma200
          }))
          setPriceData(updatedData)
        }
      }
    } catch (error) {
      console.error('Error fetching technical data:', error)
    }
  }, [symbol, priceData])

  useEffect(() => {
    fetchPriceData(selectedTimeframe)
  }, [selectedTimeframe, fetchPriceData])

  useEffect(() => {
    if (priceData.length > 0 && !technicalData) {
      fetchTechnicalData()
    }
  }, [priceData, technicalData, fetchTechnicalData])

  const handleTimeframeChange = (timeframe: TimeframePeriod) => {
    setSelectedTimeframe(timeframe)
  }

  const toggleIndicator = (indicator: string) => {
    setEnabledIndicators(prev =>
      prev.includes(indicator)
        ? prev.filter(i => i !== indicator)
        : [...prev, indicator]
    )
  }

  const getVolumeData = () => {
    return priceData.map(item => ({
      x: item.x,
      y: item.volume,
      fill: item.close >= item.open ? palette.volumeBull : palette.volumeBear
    }))
  }

  const currentPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0
  const previousPrice = priceData.length > 1 ? priceData[priceData.length - 2].close : currentPrice
  const priceChange = currentPrice - previousPrice
  const priceChangePercent = previousPrice !== 0 ? (priceChange / previousPrice) * 100 : 0

const chartHeight = '320px'

  const latestPoint = priceData.length > 0 ? priceData[priceData.length - 1] : null
  const sessionHigh = priceData.length > 0 ? Math.max(...priceData.map(point => point.high)) : undefined
  const sessionLow = priceData.length > 0 ? Math.min(...priceData.map(point => point.low)) : undefined
  const volumeSummary = latestPoint?.volume
  const averageVolume = technicalData?.avg_vol20
  const rsi = technicalData?.rsi14
  const fiftyTwoWeekHigh = technicalData?.high_252
  const fiftyTwoWeekProgress = technicalData?.distance_to_52w_high !== undefined
    ? Math.max(0, Math.min(100, (1 - technicalData.distance_to_52w_high) * 100))
    : undefined

  const volumeValues = priceData.map(d => d.volume)
  const maxVolume = volumeValues.length > 0 ? Math.max(...volumeValues) : 0
  const volumeInterval = (() => {
    if (maxVolume <= 0) return undefined
    const raw = maxVolume / 4
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    const normalized = Math.ceil(raw / magnitude)
    return normalized * magnitude
  })()

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-700/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold text-slate-100">{symbol}</div>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex h-32 items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
            <span className="text-sm text-slate-300">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  const handleAxisLabelRender = (args: IAxisLabelRenderEventArgs) => {
    if (args.axis.name === 'volumeAxis') {
      const numeric = Number(args.value)
      if (numeric <= 0) {
        args.text = ''
        return
      }
      args.text = formatNumberShort(numeric)
    }
  }

  const priceMarkerAnnotation: any[] = []

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-sm">
      {/* Compact Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-100">{symbol}</span>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold text-slate-100">{formatCurrency(currentPrice)}</span>
            <span className={`flex items-center gap-1 text-sm font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {priceChange >= 0 ? (
                <ArrowTrendingUpIcon className="h-3 w-3" />
              ) : (
                <ArrowTrendingDownIcon className="h-3 w-3" />
              )}
              {formatPercent(priceChangePercent)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Compact controls */}
          <div className="flex gap-1">
            {Object.entries(TIMEFRAMES).slice(2, 6).map(([key, config]) => {
              const isActive = selectedTimeframe === key
              return (
                <button
                  key={key}
                  onClick={() => handleTimeframeChange(key as TimeframePeriod)}
                  className={`px-2 py-1 text-xs font-medium rounded transition ${isActive
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Compact Stats Bar */}
      <div className="flex items-center justify-between border-b border-slate-700/30 px-4 py-2 text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Vol:</span>
            <span className="text-slate-300 font-medium">{formatNumberShort(volumeSummary)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Range:</span>
            <span className="text-slate-300 font-medium">{formatCurrency(sessionLow)} - {formatCurrency(sessionHigh)}</span>
          </div>
          {rsi !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">RSI:</span>
              <span className={`font-medium ${rsi > 70 ? 'text-rose-400' : rsi < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>
                {rsi.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChartType(chartType === 'candlestick' ? 'line' : 'candlestick')}
            className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChartBarIcon className="h-3 w-3" />
            <span className="text-xs">{chartType === 'candlestick' ? 'Line' : 'Candles'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTechnicals(!showTechnicals)}
            className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${showTechnicals
              ? 'text-blue-400'
              : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CogIcon className="h-3 w-3" />
            SMA
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-2">
        <div
          className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-900/50"
          style={{ height: chartHeight }}
        >
          <ChartComponent
            id="stock-chart"
            annotations={priceMarkerAnnotation}
            axisLabelRender={handleAxisLabelRender}
            primaryXAxis={{
              valueType: 'DateTime',
              labelFormat: selectedTimeframe === '1D' ? 'HH:mm' : 'MMM dd',
              majorGridLines: { width: 0 },
              crosshairTooltip: { enable: true },
              edgeLabelPlacement: 'Shift',
              labelStyle: { color: palette.textSecondary, fontFamily: 'Inter' }
            }}
            primaryYAxis={{
              title: 'Price ($)',
              labelFormat: '${value}',
              opposedPosition: true,
              majorGridLines: { width: 1, color: palette.gridMajor },
              minorTicksPerInterval: 1,
              minorGridLines: { width: 0.5, color: palette.gridMinor },
              crosshairTooltip: { enable: true },
              titleStyle: { size: '12px', color: palette.textSecondary, fontFamily: 'Inter' },
              labelStyle: { color: palette.textSecondary, fontFamily: 'Inter' },
              rowIndex: 0
            }}
            axes={[
              {
                name: 'volumeAxis',
                opposedPosition: false,
                rowIndex: 1,
                title: 'Volume',
                majorGridLines: { width: 0 },
                labelFormat: '{value}',
                minimum: 0,
                maximum: maxVolume > 0 ? maxVolume * 1.2 : undefined,
                interval: volumeInterval,
                titleStyle: { size: '11px', color: palette.textMuted, fontFamily: 'Inter' },
                labelStyle: { color: palette.textMuted, fontFamily: 'Inter', size: '10px' },
                majorTickLines: { width: 0 },
                rangePadding: 'None',
                lineStyle: { width: 0 },
                plotOffset: 0,
                plotOffsetTop: 0,
                plotOffsetBottom: 0
              }
            ]}
            rows={[
              { height: '75%', border: { width: 0 } },
              { height: '25%', border: { width: 0 } }
            ]}
            tooltip={{
              enable: true,
              shared: false,
              fill: palette.tooltipBg,
              opacity: 0.9,
              textStyle: { color: palette.tooltipText, fontFamily: 'Inter' }
            }}
            crosshair={{ enable: true, line: { color: palette.accent, width: 1 } }}
            chartArea={{ border: { width: 0 } }}
            background="#050c1a"
            zoomSettings={{
              enableMouseWheelZooming: true,
              enablePinchZooming: true,
              enableSelectionZooming: true,
              mode: 'X'
            }}
            legendSettings={{
              visible: showTechnicals,
              textStyle: { color: palette.textSecondary, fontFamily: 'Inter' }
            }}
            height="100%"
          >
            <Inject services={[
              CandleSeries,
              LineSeries,
              AreaSeries,
              ColumnSeries,
              Category,
              DateTime,
              Logarithmic,
              Legend,
              Tooltip,
              DataLabel,
              Zoom,
              Crosshair,
              Selection,
              ChartAnnotation
            ]} />

            <SeriesCollectionDirective>
              {chartType === 'candlestick' && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Candle"
                  xName="x"
                  open="open"
                  high="high"
                  low="low"
                  close="close"
                  name={symbol}
                  bearFillColor={palette.bear}
                  bullFillColor={palette.bull}
                  width={1}
                  columnWidth={0.3}
                />
              )}

              {chartType === 'line' && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Line"
                  xName="x"
                  yName="close"
                  name={symbol}
                  marker={{ visible: false }}
                  width={2}
                  fill={palette.line}
                />
              )}

              {chartType === 'area' && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Area"
                  xName="x"
                  yName="close"
                  name={symbol}
                  opacity={0.45}
                  fill={palette.areaFill}
                />
              )}

              {showTechnicals && enabledIndicators.includes('sma20') && technicalData?.sma20 && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Line"
                  xName="x"
                  yName="sma20"
                  name="SMA 20"
                  marker={{ visible: false }}
                  width={1}
                  fill="#fbbf24"
                />
              )}

              {showTechnicals && enabledIndicators.includes('sma50') && technicalData?.sma50 && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Line"
                  xName="x"
                  yName="sma50"
                  name="SMA 50"
                  marker={{ visible: false }}
                  width={1}
                  fill="#38bdf8"
                />
              )}

              {showTechnicals && enabledIndicators.includes('sma200') && technicalData?.sma200 && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Line"
                  xName="x"
                  yName="sma200"
                  name="SMA 200"
                  marker={{ visible: false }}
                  width={2}
                  fill="#a855f7"
                />
              )}

              <SeriesDirective
                dataSource={getVolumeData()}
                type="Column"
                xName="x"
                yName="y"
                name="Volume"
                yAxisName="volumeAxis"
                opacity={0.85}
                pointColorMapping="fill"
                width={0.6}
              />
            </SeriesCollectionDirective>
          </ChartComponent>
        </div>
      </div>

      {/* Optional Technical Indicators Footer */}
      {showTechnicals && technicalData && (
        <div className="border-t border-slate-700/30 px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-slate-500">SMA20:</span>
                <span className="text-amber-400 font-medium">{technicalData.sma20?.toFixed(2) ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">SMA50:</span>
                <span className="text-sky-400 font-medium">{technicalData.sma50?.toFixed(2) ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">SMA200:</span>
                <span className="text-purple-400 font-medium">{technicalData.sma200?.toFixed(2) ?? '—'}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-slate-500">MACD:</span>
                <span className="text-slate-300 font-medium">{technicalData.macd?.toFixed(3) ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">ATR:</span>
                <span className="text-slate-300 font-medium">{technicalData.atr14?.toFixed(2) ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfessionalStockChart
