import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon } from '@heroicons/react/24/outline'
import { AlertSummary, alertsApi } from '../services/alertsApi'

export default function AlertBadge() {
  const [summary, setSummary] = useState<AlertSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSummary()
    
    // Refresh summary every 5 minutes
    const interval = setInterval(loadSummary, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  const loadSummary = async () => {
    try {
      const summaryData = await alertsApi.getAlertSummary()
      setSummary(summaryData)
    } catch (err: any) {
      console.error('Failed to load alert summary:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !summary) {
    return (
      <Link
        to="/alerts"
        className="text-gray-400 hover:text-gray-600 transition-colors p-2"
      >
        <BellIcon className="h-6 w-6" />
      </Link>
    )
  }

  const hasUnreadAlerts = summary.unread_alerts > 0
  const hasCriticalAlerts = summary.critical_alerts > 0

  return (
    <Link
      to="/alerts"
      className="relative text-gray-400 hover:text-gray-600 transition-colors p-2"
    >
      <BellIcon className={`h-6 w-6 ${hasCriticalAlerts ? 'text-red-500' : hasUnreadAlerts ? 'text-blue-500' : ''}`} />
      
      {hasUnreadAlerts && (
        <span className={`absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 rounded-full ${
          hasCriticalAlerts ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {summary.unread_alerts > 99 ? '99+' : summary.unread_alerts}
        </span>
      )}
    </Link>
  )
}