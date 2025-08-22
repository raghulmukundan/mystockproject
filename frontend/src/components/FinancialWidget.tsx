import React, { useEffect, useRef } from 'react'

interface FinancialWidgetProps {
  type: 'economic-calendar' | 'market-overview' | 'top-gainers-losers' | 'market-movers' | 'symbol-overview' | 'technical-analysis' | 'fundamental-data' | 'company-profile' | 'financials'
  height?: string
  width?: string
  colorTheme?: 'light' | 'dark'
  symbol?: string  // Required for stock-specific widgets
}

const FinancialWidget: React.FC<FinancialWidgetProps> = ({
  type,
  height = '400px',
  width = '100%',
  colorTheme = 'light',
  symbol
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Clear any existing content
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }

    let scriptSrc = ''
    let widgetConfig: any = {}

    switch (type) {
      case 'economic-calendar':
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
        widgetConfig = {
          colorTheme: colorTheme,
          isTransparent: false,
          width: '100%',
          height: '100%',
          locale: 'en',
          importanceFilter: '-1,0,1',
          currencyFilter: 'USD'
        }
        break
      
      case 'market-overview':
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js'
        widgetConfig = {
          colorTheme: colorTheme,
          dateRange: '12M',
          showChart: true,
          locale: 'en',
          width: '100%',
          height: '100%',
          largeChartUrl: '',
          isTransparent: false,
          showSymbolLogo: true,
          showFloatingTooltip: false,
          plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
          plotLineColorFalling: 'rgba(41, 98, 255, 1)',
          gridLineColor: 'rgba(240, 243, 250, 0)',
          scaleFontColor: 'rgba(120, 123, 134, 1)',
          belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
          belowLineFillColorFalling: 'rgba(41, 98, 255, 0.12)',
          belowLineFillColorGrowingBottom: 'rgba(41, 98, 255, 0)',
          belowLineFillColorFallingBottom: 'rgba(41, 98, 255, 0)',
          symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
          tabs: [
            {
              title: 'Indices',
              symbols: [
                { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
                { s: 'FOREXCOM:NSXUSD', d: 'US 100' },
                { s: 'FOREXCOM:DJI', d: 'Dow 30' },
                { s: 'INDEX:NKY', d: 'Nikkei 225' },
                { s: 'INDEX:DEU40', d: 'DAX Index' },
                { s: 'FOREXCOM:UKXGBP', d: 'UK 100' }
              ],
              originalTitle: 'Indices'
            }
          ]
        }
        break

      case 'top-gainers-losers':
        // Using a market screener for top movers
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js'
        widgetConfig = {
          width: '100%',
          height: '100%',
          defaultColumn: 'overview',
          defaultScreen: 'most_capitalized',
          market: 'america',
          showToolbar: true,
          colorTheme: colorTheme,
          locale: 'en'
        }
        break

      case 'symbol-overview':
        if (!symbol) break
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js'
        widgetConfig = {
          symbols: [[
            `${symbol}|1D`
          ]],
          chartOnly: false,
          width: '100%',
          height: '100%',
          locale: 'en',
          colorTheme: colorTheme,
          autosize: true,
          showVolume: false,
          showMA: false,
          hideDateRanges: false,
          hideMarketStatus: false,
          hideSymbolLogo: false,
          scalePosition: 'right',
          scaleMode: 'Normal',
          fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
          fontSize: '10',
          noTimeScale: false,
          valuesTracking: '1',
          changeMode: 'price-and-percent',
          chartType: 'area',
          dateRanges: [
            '1d|1',
            '1m|30',
            '3m|60',
            '12m|1D',
            '60m|1W',
            'all|1M'
          ]
        }
        break

      case 'technical-analysis':
        if (!symbol) break
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js'
        widgetConfig = {
          interval: '1m',
          width: '100%',
          isTransparent: false,
          height: '100%',
          symbol: symbol,
          showIntervalTabs: true,
          locale: 'en',
          colorTheme: colorTheme
        }
        break

      case 'fundamental-data':
        if (!symbol) break
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js'
        widgetConfig = {
          symbol: symbol,
          width: '100%',
          locale: 'en',
          colorTheme: colorTheme,
          isTransparent: false
        }
        break

      case 'company-profile':
        if (!symbol) break
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js'
        widgetConfig = {
          width: '100%',
          height: '100%',
          isTransparent: false,
          colorTheme: colorTheme,
          symbol: symbol,
          locale: 'en'
        }
        break

      case 'financials':
        if (!symbol) break
        scriptSrc = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js'
        widgetConfig = {
          colorTheme: colorTheme,
          isTransparent: false,
          largeChartUrl: '',
          displayMode: 'regular',
          width: '100%',
          height: '100%',
          symbol: symbol,
          locale: 'en'
        }
        break
    }

    if (scriptSrc) {
      // Create the widget container
      const widgetContainer = document.createElement('div')
      widgetContainer.className = 'tradingview-widget-container'
      widgetContainer.style.height = height
      widgetContainer.style.width = width

      // Create the widget div
      const widgetDiv = document.createElement('div')
      widgetDiv.className = 'tradingview-widget-container__widget'
      widgetContainer.appendChild(widgetDiv)

      // Create the copyright div (required by TradingView)
      const copyrightDiv = document.createElement('div')
      copyrightDiv.className = 'tradingview-widget-copyright'
      copyrightDiv.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a>`
      widgetContainer.appendChild(copyrightDiv)

      // Create and configure the script
      const script = document.createElement('script')
      script.type = 'text/javascript'
      script.src = scriptSrc
      script.async = true
      script.innerHTML = JSON.stringify(widgetConfig, null, 2)
      widgetContainer.appendChild(script)

      // Add to container
      if (containerRef.current) {
        containerRef.current.appendChild(widgetContainer)
      }
    }

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [type, height, width, colorTheme])

  return (
    <div 
      ref={containerRef} 
      className="financial-widget-wrapper"
      style={{ height, width }}
    />
  )
}

export default FinancialWidget