import { useEffect, useRef } from 'react'
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData,
  LineData,
  Time
} from 'lightweight-charts'
import { ChartData, MarkerData } from '../types'

interface StockChartProps {
  data: ChartData[]
  overlayLines?: { price: number; color: string; title: string }[]
  markers?: MarkerData[]
  symbol: string
}

export default function StockChart({ data, overlayLines = [], markers = [], symbol }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      rightPriceScale: {
        borderColor: '#cccccc',
      },
      timeScale: {
        borderColor: '#cccccc',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00C851',
      downColor: '#ff4444',
      borderDownColor: '#ff4444',
      borderUpColor: '#00C851',
      wickDownColor: '#ff4444',
      wickUpColor: '#00C851',
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!candlestickSeriesRef.current || !data.length) return

    const chartData: CandlestickData[] = data.map(item => ({
      time: item.time as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }))

    candlestickSeriesRef.current.setData(chartData)

    if (markers.length > 0) {
      const formattedMarkers = markers.map(marker => ({
        time: marker.time as Time,
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.text,
      }))
      candlestickSeriesRef.current.setMarkers(formattedMarkers)
    }
  }, [data, markers])

  useEffect(() => {
    if (!chartRef.current) return

    overlayLines.forEach((line, index) => {
      const lineSeries = chartRef.current!.addLineSeries({
        color: line.color,
        lineWidth: 2,
        lineStyle: 2,
        title: line.title,
      })

      if (data.length > 0) {
        const lineData: LineData[] = [
          { time: data[0].time as Time, value: line.price },
          { time: data[data.length - 1].time as Time, value: line.price },
        ]
        lineSeries.setData(lineData)
      }
    })
  }, [overlayLines, data])

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{symbol} Chart</h3>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  )
}