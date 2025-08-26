import { useState, useEffect } from 'react'
import { 
  BellIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  EyeIcon,
  ArrowPathIcon,
  FunnelIcon,
  PlusIcon,
  ClockIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline'
import { Alert, AlertSummary, alertsApi } from '../services/alertsApi'
import CreateAlertModal from '../components/CreateAlertModal'

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200'
    case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'low': return 'text-blue-600 bg-blue-50 border-blue-200'
    default: return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'critical': return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
    case 'high': return <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
    case 'medium': return <BellIcon className="h-5 w-5 text-yellow-600" />
    case 'low': return <BellIcon className="h-5 w-5 text-blue-600" />
    default: return <BellIcon className="h-5 w-5 text-gray-600" />
  }
}

const formatAlertType = (type: string) => {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

const getAlertAge = (dateString: string) => {
  const now = new Date()
  const alertDate = new Date(dateString)
  const diffTime = Math.abs(now.getTime() - alertDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffTime / (1000 * 60))
  
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
  return `${Math.ceil(diffDays / 30)} months ago`
}

export default function Alerts() {
  const [alertsByWatchlist, setAlertsByWatchlist] = useState<Record<string, Alert[]>>({})
  const [oldAlerts, setOldAlerts] = useState<Alert[]>([])
  const [summary, setSummary] = useState<AlertSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showOldAlerts, setShowOldAlerts] = useState(false)
  const [collapsedWatchlists, setCollapsedWatchlists] = useState<Set<string>>(new Set())
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedAlerts, setSelectedAlerts] = useState<Set<number>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  useEffect(() => {
    loadAlerts()
    loadSummary()
  }, [severityFilter, unreadOnly])

  const loadAlerts = async () => {
    try {
      setLoading(true)
      const [recentAlerts, oldAlertsData] = await Promise.all([
        alertsApi.getAlertsByWatchlist(true),
        alertsApi.getOldAlerts(7, 100)
      ])
      
      // Apply filters if needed
      if (severityFilter || unreadOnly) {
        const filteredAlerts: Record<string, Alert[]> = {}
        
        for (const [watchlistName, alerts] of Object.entries(recentAlerts)) {
          const filteredWatchlistAlerts = alerts.filter(alert => {
            const matchesSeverity = !severityFilter || alert.severity === severityFilter
            const matchesReadStatus = !unreadOnly || !alert.is_read
            return matchesSeverity && matchesReadStatus
          })
          
          if (filteredWatchlistAlerts.length > 0) {
            filteredAlerts[watchlistName] = filteredWatchlistAlerts
          }
        }
        
        setAlertsByWatchlist(filteredAlerts)
      } else {
        setAlertsByWatchlist(recentAlerts)
      }
      
      setOldAlerts(oldAlertsData.filter(alert => {
        const matchesSeverity = !severityFilter || alert.severity === severityFilter
        const matchesReadStatus = !unreadOnly || !alert.is_read
        return matchesSeverity && matchesReadStatus
      }))
    } catch (err: any) {
      setError('Failed to load alerts')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const summaryData = await alertsApi.getAlertSummary()
      setSummary(summaryData)
    } catch (err: any) {
      console.error('Failed to load alert summary:', err)
    }
  }

  const handleTriggerAnalysis = async () => {
    try {
      setAnalyzing(true)
      await alertsApi.triggerAnalysis()
      // Reload alerts after a short delay
      setTimeout(() => {
        loadAlerts()
        loadSummary()
      }, 2000)
    } catch (err: any) {
      setError('Failed to trigger analysis')
      console.error(err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCleanupOldAlerts = async () => {
    try {
      await alertsApi.cleanupOldAlerts(30)
      loadAlerts()
      loadSummary()
    } catch (err: any) {
      setError('Failed to cleanup old alerts')
      console.error(err)
    }
  }

  const handleMarkAsRead = async (alertId: number) => {
    try {
      await alertsApi.markAsRead(alertId)
      
      // Update local state for recent alerts
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].map(alert => 
          alert.id === alertId ? { ...alert, is_read: true } : alert
        )
      }
      setAlertsByWatchlist(updatedAlerts)
      
      // Update old alerts if needed
      setOldAlerts(oldAlerts.map(alert => 
        alert.id === alertId ? { ...alert, is_read: true } : alert
      ))
      
      loadSummary()
    } catch (err: any) {
      setError('Failed to mark alert as read')
      console.error(err)
    }
  }

  const handleDismissAlert = async (alertId: number) => {
    try {
      await alertsApi.dismissAlert(alertId)
      
      // Remove from local state (recent alerts)
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].filter(alert => alert.id !== alertId)
        if (updatedAlerts[watchlistName].length === 0) {
          delete updatedAlerts[watchlistName]
        }
      }
      setAlertsByWatchlist(updatedAlerts)
      
      // Remove from old alerts if needed
      setOldAlerts(oldAlerts.filter(alert => alert.id !== alertId))
      
      loadSummary()
    } catch (err: any) {
      setError('Failed to dismiss alert')
      console.error(err)
    }
  }

  const handleAlertCreated = () => {
    loadAlerts()
    loadSummary()
  }

  const toggleWatchlistCollapse = (watchlistName: string) => {
    const newCollapsed = new Set(collapsedWatchlists)
    if (newCollapsed.has(watchlistName)) {
      newCollapsed.delete(watchlistName)
    } else {
      newCollapsed.add(watchlistName)
    }
    setCollapsedWatchlists(newCollapsed)
  }

  const expandAllWatchlists = () => {
    setCollapsedWatchlists(new Set())
  }

  const collapseAllWatchlists = () => {
    setCollapsedWatchlists(new Set(Object.keys(alertsByWatchlist)))
  }

  const resetFilters = () => {
    setSeverityFilter('')
    setUnreadOnly(false)
    setShowFilters(false)
  }

  const markAllAsRead = async () => {
    try {
      // Collect all unread alert IDs
      const unreadAlertIds: number[] = []
      
      Object.values(alertsByWatchlist).forEach(alerts => {
        alerts.forEach(alert => {
          if (!alert.is_read) {
            unreadAlertIds.push(alert.id)
          }
        })
      })
      
      oldAlerts.forEach(alert => {
        if (!alert.is_read) {
          unreadAlertIds.push(alert.id)
        }
      })
      
      // Mark each as read (could be optimized with a batch endpoint)
      for (const alertId of unreadAlertIds) {
        await alertsApi.markAsRead(alertId)
      }
      
      // Update local state
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].map(alert => ({ ...alert, is_read: true }))
      }
      setAlertsByWatchlist(updatedAlerts)
      setOldAlerts(oldAlerts.map(alert => ({ ...alert, is_read: true })))
      
      loadSummary()
    } catch (err: any) {
      setError('Failed to mark all alerts as read')
      console.error(err)
    }
  }

  const toggleSelectAlert = (alertId: number) => {
    const newSelected = new Set(selectedAlerts)
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId)
    } else {
      newSelected.add(alertId)
    }
    setSelectedAlerts(newSelected)
  }

  const selectAllAlerts = () => {
    const allIds = new Set<number>()
    Object.values(alertsByWatchlist).forEach(alerts => {
      alerts.forEach(alert => allIds.add(alert.id))
    })
    oldAlerts.forEach(alert => allIds.add(alert.id))
    setSelectedAlerts(allIds)
  }

  const deselectAllAlerts = () => {
    setSelectedAlerts(new Set())
  }

  const deleteSelectedAlerts = async () => {
    try {
      // Delete each selected alert
      const promises = Array.from(selectedAlerts).map(alertId =>
        alertsApi.deleteAlert(alertId)
      )
      await Promise.all(promises)
      
      // Update local state
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].filter(
          alert => !selectedAlerts.has(alert.id)
        )
        if (updatedAlerts[watchlistName].length === 0) {
          delete updatedAlerts[watchlistName]
        }
      }
      setAlertsByWatchlist(updatedAlerts)
      
      // Update old alerts
      setOldAlerts(oldAlerts.filter(alert => !selectedAlerts.has(alert.id)))
      
      // Reset selection
      setSelectedAlerts(new Set())
      setSelectMode(false)
      
      loadSummary()
    } catch (err: any) {
      setError('Failed to delete selected alerts')
      console.error(err)
    }
  }

  const deleteAllAlerts = async () => {
    // First select all alerts
    selectAllAlerts()
    // Then delete all selected
    await deleteSelectedAlerts()
  }

  const renderAlert = (alert: Alert) => (
    <div key={alert.id} 
      className={`p-4 rounded-lg shadow-sm mb-3 border-t-4 ${
        getSeverityColor(alert.severity)
      } ${
        !alert.is_read ? 'bg-blue-50' : 'bg-white'
      } ${
        selectedAlerts.has(alert.id) ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {selectMode && (
            <input
              type="checkbox"
              checked={selectedAlerts.has(alert.id)}
              onChange={() => toggleSelectAlert(alert.id)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
          )}
          
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
            alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
            alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {alert.severity}
          </span>
          
          {!alert.is_read && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              New
            </span>
          )}
          
          <span className="text-xs text-gray-500 flex items-center">
            <ClockIcon className="h-3 w-3 mr-1" />
            {getAlertAge(alert.created_at)}
          </span>
        </div>
        
        {!selectMode && (
          <div className="flex items-center space-x-1">
            {!alert.is_read && (
              <button
                onClick={() => handleMarkAsRead(alert.id)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                title="Mark as read"
              >
                <EyeIcon className="h-4 w-4" />
              </button>
            )}
            
            <button
              onClick={() => handleDismissAlert(alert.id)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
              title="Dismiss alert"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      
      <h4 className="text-sm font-medium text-gray-900 mb-2">{alert.title}</h4>
      <p className="text-sm text-gray-700 mb-3">{alert.message}</p>
      
      <div className="flex items-center flex-wrap gap-2 mt-auto">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
          {formatAlertType(alert.alert_type)}
        </span>
        
        {alert.symbol && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 font-mono text-xs text-blue-600">
            {alert.symbol}
          </span>
        )}
        
        {alert.value !== undefined && alert.value !== null && alert.threshold !== undefined && alert.threshold !== null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
            Value: {alert.value.toFixed(2)} / Threshold: {alert.threshold.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading alerts...</p>
        </div>
      </div>
    )
  }

  const totalAlerts = Object.values(alertsByWatchlist).reduce((sum, alerts) => sum + alerts.length, 0)
  const hasUnreadAlerts = summary && summary.unread_alerts > 0
  const watchlistsCount = Object.keys(alertsByWatchlist).length

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Smart Alerts</h1>
            <p className="mt-1 text-gray-600">
              AI-powered portfolio insights organized by watchlist
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <PlusIcon className="h-4 w-4 mr-1.5" />
              Create Alert
            </button>
            
            <button
              onClick={handleTriggerAnalysis}
              disabled={analyzing}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-1.5 ${analyzing ? 'animate-spin' : ''}`} />
              {analyzing ? 'Analyzing...' : 'Run Analysis'}
            </button>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md ${
                severityFilter || unreadOnly
                  ? 'text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100'
                  : 'text-gray-700 bg-white hover:bg-gray-50'
              }`}
            >
              <FunnelIcon className="h-4 w-4 mr-1.5" />
              Filters {(severityFilter || unreadOnly) && '(Active)'}
            </button>
            
            {hasUnreadAlerts && (
              <button
                onClick={markAllAsRead}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <EyeIcon className="h-4 w-4 mr-1.5" />
                Mark All Read
              </button>
            )}
            
            {oldAlerts.length > 0 && (
              <button
                onClick={handleCleanupOldAlerts}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <TrashIcon className="h-4 w-4 mr-1.5" />
                Clean Old
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Severity:</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-md border-gray-300 text-sm py-1.5"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Unread only</span>
              </label>
            </div>
            
            <div className="ml-auto">
              <button
                onClick={resetFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BellIcon className="h-5 w-5 text-gray-400" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-gray-500 truncate">Total</dt>
                    <dd className="text-lg font-medium text-gray-900">{summary.total_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-blue-500" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-gray-500 truncate">Unread</dt>
                    <dd className="text-lg font-medium text-blue-900">{summary.unread_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-red-50 overflow-hidden shadow-sm rounded-lg border border-red-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-red-700 truncate">Critical</dt>
                    <dd className="text-lg font-medium text-red-900">{summary.critical_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 overflow-hidden shadow-sm rounded-lg border border-orange-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-orange-700 truncate">High</dt>
                    <dd className="text-lg font-medium text-orange-900">{summary.high_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 overflow-hidden shadow-sm rounded-lg border border-yellow-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BellIcon className="h-5 w-5 text-yellow-600" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-yellow-700 truncate">Medium</dt>
                    <dd className="text-lg font-medium text-yellow-900">{summary.medium_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 overflow-hidden shadow-sm rounded-lg border border-blue-200">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BellIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-blue-700 truncate">Low</dt>
                    <dd className="text-lg font-medium text-blue-900">{summary.low_alerts}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Watchlist Controls */}
      {watchlistsCount > 1 && (
        <div className="mb-4 flex justify-end">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={expandAllWatchlists}
              className="relative inline-flex items-center rounded-l-md bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10"
            >
              <ChevronDownIcon className="h-4 w-4 mr-1.5" />
              Expand All
            </button>
            <button
              onClick={collapseAllWatchlists}
              className="relative -ml-px inline-flex items-center rounded-r-md bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10"
            >
              <ChevronUpIcon className="h-4 w-4 mr-1.5" />
              Collapse All
            </button>
          </div>
        </div>
      )}

      {/* Watchlist Groups */}
      {/* Selection Controls */}
      {(Object.keys(alertsByWatchlist).length > 0 || oldAlerts.length > 0) && (
        <div className="mb-4 flex justify-between items-center">
          <button
            onClick={() => setSelectMode(!selectMode)}
            className={`inline-flex items-center px-3 py-1.5 border rounded-md text-sm font-medium ${selectMode 
              ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
              : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
          >
            {selectMode ? 'Cancel Selection' : 'Select Alerts'}
          </button>
          
          {selectMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedAlerts.size} selected
              </span>
              
              <button
                onClick={selectAllAlerts}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Select All
              </button>
              
              <button
                onClick={deselectAllAlerts}
                className="text-sm text-blue-600 hover:text-blue-800"
                disabled={selectedAlerts.size === 0}
              >
                Deselect All
              </button>
              
              <button
                onClick={deleteSelectedAlerts}
                disabled={selectedAlerts.size === 0}
                className={`inline-flex items-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium ${selectedAlerts.size === 0 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                <TrashIcon className="h-4 w-4 mr-1.5" />
                Delete Selected
              </button>
              
              <button
                onClick={deleteAllAlerts}
                className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              >
                <TrashIcon className="h-4 w-4 mr-1.5" />
                Delete All
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {Object.keys(alertsByWatchlist).length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts found</h3>
            <p className="text-gray-600 mb-4 max-w-md mx-auto">
              {severityFilter || unreadOnly 
                ? 'Try adjusting your filters or run a new analysis.' 
                : 'Run an analysis to generate smart alerts for your portfolio.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={handleTriggerAnalysis}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                Run Analysis
              </button>
              
              {(severityFilter || unreadOnly) && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          Object.entries(alertsByWatchlist).map(([watchlistName, alerts]) => {
            const isCollapsed = collapsedWatchlists.has(watchlistName)
            return (
              <div key={watchlistName} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div 
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-t-lg"
                  onClick={() => toggleWatchlistCollapse(watchlistName)}
                >
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-medium text-gray-900">{watchlistName}</h2>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {alerts.length}
                      </span>
                      
                      {alerts.some(a => !a.is_read) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {alerts.filter(a => !a.is_read).length} new
                        </span>
                      )}
                      
                      {alerts.some(a => a.severity === 'critical') && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {alerts.filter(a => a.severity === 'critical').length} critical
                        </span>
                      )}
                    </div>
                  </div>
                  {isCollapsed ? 
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" /> : 
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  }
                </div>
                
                {!isCollapsed && (
                  <div className="p-4 border-t border-gray-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {alerts.map(renderAlert)}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Old Alerts Section */}
      {oldAlerts.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowOldAlerts(!showOldAlerts)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-3"
          >
            <ClockIcon className="h-5 w-5" />
            <span>Older Alerts ({oldAlerts.length})</span>
            {showOldAlerts ? 
              <ChevronUpIcon className="h-4 w-4" /> : 
              <ChevronDownIcon className="h-4 w-4" />
            }
          </button>
          
          {showOldAlerts && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-3">Alerts older than 7 days:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {oldAlerts.map(renderAlert)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Alert Modal */}
      <CreateAlertModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onAlertCreated={handleAlertCreated}
      />
    </div>
  )
}