import React, { useEffect, useRef } from 'react'

interface TradingViewWidgetProps {
  symbol: string
  height?: string
  width?: string
  colorTheme?: 'light' | 'dark'
  chartOnly?: boolean
  dateRange?: '1D' | '5D' | '1M' | '3M' | '6M' | '12M' | '60M' | 'ALL'
  noTimeScale?: boolean
  isTransparent?: boolean
}

const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  symbol,
  height = '400px',
  width = '100%',
  colorTheme = 'light',
  chartOnly = false,
  dateRange = '12M',
  noTimeScale = false,
  isTransparent = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Clear any existing content
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }

    // Create the widget container
    const widgetContainer = document.createElement('div')
    widgetContainer.className = 'tradingview-widget-container'
    widgetContainer.style.height = height
    widgetContainer.style.width = width

    // Create the widget div
    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetContainer.appendChild(widgetDiv)

    // Create the copyright div
    const copyrightDiv = document.createElement('div')
    copyrightDiv.className = 'tradingview-widget-copyright'
    copyrightDiv.innerHTML = `<a href="https://www.tradingview.com/symbols/${symbol}/" rel="noopener nofollow" target="_blank"><span class="blue-text">${symbol.split(':')[1] || symbol} chart by TradingView</span></a>`
    widgetContainer.appendChild(copyrightDiv)

    // Create and configure the script
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.async = true

    // Widget configuration
    const config = {
      symbol: symbol,
      chartOnly: chartOnly,
      dateRange: dateRange,
      noTimeScale: noTimeScale,
      colorTheme: colorTheme,
      isTransparent: isTransparent,
      locale: 'en',
      width: '100%',
      autosize: true,
      height: '100%'
    }

    script.innerHTML = JSON.stringify(config, null, 2)
    widgetContainer.appendChild(script)

    // Add to container
    if (containerRef.current) {
      containerRef.current.appendChild(widgetContainer)
    }

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [symbol, height, width, colorTheme, chartOnly, dateRange, noTimeScale, isTransparent])

  return (
    <div 
      ref={containerRef} 
      className="tradingview-widget-wrapper"
      style={{ height, width }}
    />
  )
}

export default TradingViewWidget