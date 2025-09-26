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
  Selection
} from '@syncfusion/ej2-react-charts'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
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
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
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

const ProfessionalStockChart: React.FC<ProfessionalStockChartProps> = ({
  symbol,
  onClose,
  isFullscreen = false,
  onToggleFullscreen
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

      // Calculate date range for the timeframe
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - config.days)

      const dateFrom = startDate.toISOString().split('T')[0]
      const dateTo = endDate.toISOString().split('T')[0]

      const response = await fetch(
        `http://localhost:8000/api/prices/browse?symbol=${symbol}&date_from=${dateFrom}&date_to=${dateTo}&page_size=1000&sort_by=date&sort_order=asc`
      )

      if (response.ok) {
        const responseData = await response.json()
        // Transform data to Syncfusion format
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

        // Add technical indicators to chart data
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
      fill: item.close >= item.open ? '#22c55e' : '#ef4444'
    }))
  }

  const currentPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0
  const previousPrice = priceData.length > 1 ? priceData[priceData.length - 2].close : currentPrice
  const priceChange = currentPrice - previousPrice
  const priceChangePercent = previousPrice !== 0 ? (priceChange / previousPrice) * 100 : 0

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-white"
    : "relative w-full h-full"

  const chartHeight = isFullscreen ? "calc(100vh - 200px)" : "600px"

  if (loading) {
    return (
      <Card className={`${containerClass} ${!isFullscreen ? 'border-blue-100 bg-white/95 backdrop-blur' : ''}`}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold">{symbol} Chart</CardTitle>
          <Button variant="outline" size="sm" onClick={onClose}>
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading chart data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`${containerClass} ${!isFullscreen ? 'border-blue-100 bg-white/95 backdrop-blur' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-4">
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900">{symbol}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold">
                ${currentPrice.toFixed(2)}
              </span>
              <div className={`flex items-center gap-1 ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {priceChange >= 0 ?
                  <ArrowTrendingUpIcon className="h-4 w-4" /> :
                  <ArrowTrendingDownIcon className="h-4 w-4" />
                }
                <span className="font-medium">
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {technicalData && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-gray-600">RSI</div>
                <div className={`font-bold ${(technicalData.rsi14 || 0) > 70 ? 'text-red-600' : (technicalData.rsi14 || 0) < 30 ? 'text-green-600' : 'text-gray-900'}`}>
                  {technicalData.rsi14?.toFixed(1) || 'N/A'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">Volume</div>
                <div className="font-bold text-gray-900">
                  {((technicalData.volume || 0) / 1000000).toFixed(1)}M
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleFullscreen && (
            <Button variant="outline" size="sm" onClick={onToggleFullscreen}>
              {isFullscreen ?
                <ArrowsPointingInIcon className="h-4 w-4" /> :
                <ArrowsPointingOutIcon className="h-4 w-4" />
              }
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Timeframe Selection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Object.entries(TIMEFRAMES).map(([key, config]) => (
              <Button
                key={key}
                variant={selectedTimeframe === key ? "default" : "outline"}
                size="sm"
                onClick={() => handleTimeframeChange(key as TimeframePeriod)}
                className="text-xs px-3 py-1"
              >
                {config.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={chartType === 'candlestick' ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType('candlestick')}
              className="text-xs"
            >
              <ChartBarIcon className="h-3 w-3 mr-1" />
              Candles
            </Button>
            <Button
              variant={chartType === 'line' ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType('line')}
              className="text-xs"
            >
              Line
            </Button>
            <Button
              variant={chartType === 'area' ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType('area')}
              className="text-xs"
            >
              Area
            </Button>
            <Button
              variant={showTechnicals ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTechnicals(!showTechnicals)}
              className="text-xs"
            >
              <CogIcon className="h-3 w-3 mr-1" />
              Indicators
            </Button>
          </div>
        </div>

        {/* Technical Indicators Panel */}
        {showTechnicals && (
          <Card className="p-3 bg-gray-50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Technical Indicators:</span>
              {['sma20', 'sma50', 'sma200'].map(indicator => (
                <button
                  key={indicator}
                  onClick={() => toggleIndicator(indicator)}
                  className="cursor-pointer text-xs"
                >
                  <Badge
                    variant={enabledIndicators.includes(indicator) ? "default" : "outline"}
                    className="text-xs hover:bg-blue-100 transition-colors"
                  >
                    {indicator.toUpperCase()}
                  </Badge>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Main Chart */}
        <div className="border rounded-lg bg-white" style={{ height: chartHeight }}>
          <ChartComponent
            id="stock-chart"
            primaryXAxis={{
              valueType: 'DateTime',
              labelFormat: selectedTimeframe === '1D' ? 'HH:mm' : 'MMM dd',
              majorGridLines: { width: 0 },
              crosshairTooltip: { enable: true }
            }}
            primaryYAxis={{
              title: 'Price ($)',
              labelFormat: '${value}',
              opposedPosition: true,
              majorGridLines: { width: 1, color: '#f0f0f0' },
              crosshairTooltip: { enable: true }
            }}
            axes={[
              {
                name: 'volumeAxis',
                opposedPosition: false,
                rowIndex: 1,
                title: 'Volume',
                majorGridLines: { width: 0 },
                labelFormat: '{value}',
                maximum: Math.max(...priceData.map(d => d.volume)) * 4
              }
            ]}
            rows={[
              { height: '75%' },
              { height: '25%' }
            ]}
            tooltip={{
              enable: true,
              shared: true,
              format: '<b>${point.x}</b><br/>Open: <b>${point.open}</b><br/>High: <b>${point.high}</b><br/>Low: <b>${point.low}</b><br/>Close: <b>${point.close}</b><br/>Volume: <b>${point.volume}</b>'
            }}
            crosshair={{ enable: true }}
            zoomSettings={{
              enableMouseWheelZooming: true,
              enablePinchZooming: true,
              enableSelectionZooming: true,
              mode: 'X'
            }}
            legendSettings={{ visible: showTechnicals }}
            height="100%"
            background="transparent"
          >
            <Inject services={[
              CandleSeries, LineSeries, AreaSeries, ColumnSeries,
              Category, DateTime, Logarithmic, Legend, Tooltip,
              DataLabel, Zoom, Crosshair, Selection
            ]} />

            <SeriesCollectionDirective>
              {/* Main Price Series */}
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
                  bearFillColor="#ef4444"
                  bullFillColor="#22c55e"
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
                  fill="#3b82f6"
                />
              )}

              {chartType === 'area' && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Area"
                  xName="x"
                  yName="close"
                  name={symbol}
                  opacity={0.5}
                  fill="#3b82f6"
                />
              )}

              {/* Technical Indicators */}
              {showTechnicals && enabledIndicators.includes('sma20') && technicalData?.sma20 && (
                <SeriesDirective
                  dataSource={priceData}
                  type="Line"
                  xName="x"
                  yName="sma20"
                  name="SMA 20"
                  marker={{ visible: false }}
                  width={1}
                  fill="#f97316"
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
                  fill="#06b6d4"
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
                  fill="#8b5cf6"
                />
              )}

              {/* Volume Series */}
              <SeriesDirective
                dataSource={getVolumeData()}
                type="Column"
                xName="x"
                yName="y"
                name="Volume"
                yAxisName="volumeAxis"
                opacity={0.7}
                pointColorMapping="fill"
              />
            </SeriesCollectionDirective>
          </ChartComponent>
        </div>

        {/* Technical Data Summary */}
        {technicalData && (
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-600">SMA 20</div>
                <div className="font-bold text-sm">${technicalData.sma20?.toFixed(2) || 'N/A'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">SMA 50</div>
                <div className="font-bold text-sm">${technicalData.sma50?.toFixed(2) || 'N/A'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">SMA 200</div>
                <div className="font-bold text-sm">${technicalData.sma200?.toFixed(2) || 'N/A'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">RSI (14)</div>
                <div className={`font-bold text-sm ${(technicalData.rsi14 || 0) > 70 ? 'text-red-600' : (technicalData.rsi14 || 0) < 30 ? 'text-green-600' : 'text-gray-900'}`}>
                  {technicalData.rsi14?.toFixed(1) || 'N/A'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">MACD</div>
                <div className="font-bold text-sm">{technicalData.macd?.toFixed(3) || 'N/A'}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">52W High</div>
                <div className="font-bold text-sm">
                  {technicalData.distance_to_52w_high ?
                    `${((1 - technicalData.distance_to_52w_high) * 100).toFixed(1)}%` :
                    'N/A'
                  }
                </div>
              </div>
            </div>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}

export default ProfessionalStockChart