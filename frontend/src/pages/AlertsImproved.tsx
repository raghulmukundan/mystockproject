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
  ChevronUpIcon
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
  
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
  return `${Math.ceil(diffDays / 30)} months ago`
}

export default function AlertsImproved() {
  console.log('AlertsImproved component rendering...')
  const [alertsByWatchlist, setAlertsByWatchlist] = useState<Record<string, Alert[]>>({})
  const [oldAlerts, setOldAlerts] = useState<Alert[]>([])
  const [summary, setSummary] = useState<AlertSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showOldAlerts, setShowOldAlerts] = useState(false)
  const [collapsedWatchlists, setCollapsedWatchlists] = useState<Set<string>>(new Set())
  
  useEffect(() => {
    loadAlerts()
    loadSummary()
  }, [])

  const loadAlerts = async () => {
    try {
      setLoading(true)
      const [recentAlerts, oldAlertsData] = await Promise.all([
        alertsApi.getAlertsByWatchlist(true),
        alertsApi.getOldAlerts(7, 100)
      ])
      setAlertsByWatchlist(recentAlerts)
      setOldAlerts(oldAlertsData)
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
      // Update local state
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].map(alert => 
          alert.id === alertId ? { ...alert, is_read: true } : alert
        )
      }
      setAlertsByWatchlist(updatedAlerts)
      loadSummary()
    } catch (err: any) {
      setError('Failed to mark alert as read')
      console.error(err)
    }
  }

  const handleDismissAlert = async (alertId: number) => {
    try {
      await alertsApi.dismissAlert(alertId)
      // Remove from local state
      const updatedAlerts = { ...alertsByWatchlist }
      for (const watchlistName in updatedAlerts) {
        updatedAlerts[watchlistName] = updatedAlerts[watchlistName].filter(alert => alert.id !== alertId)
        if (updatedAlerts[watchlistName].length === 0) {
          delete updatedAlerts[watchlistName]
        }
      }
      setAlertsByWatchlist(updatedAlerts)
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

  const renderAlert = (alert: Alert) => (
    <div key={alert.id} className={`p-4 border-l-4 ${getSeverityColor(alert.severity)} ${!alert.is_read ? 'bg-blue-50' : 'bg-white'} mb-3 rounded-r-lg shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className={`flex-shrink-0 p-2 rounded-lg border ${getSeverityColor(alert.severity)}`}>
            {getSeverityIcon(alert.severity)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="text-sm font-medium text-gray-900">{alert.title}</h4>
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
            
            <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
            
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span>{formatAlertType(alert.alert_type)}</span>
              
              {alert.symbol && (
                <span className="font-mono text-blue-600">{alert.symbol}</span>
              )}
              
              {alert.value !== undefined && alert.value !== null && alert.threshold !== undefined && alert.threshold !== null && (
                <span>
                  {alert.value.toFixed(2)} / {alert.threshold.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-1 ml-4">
          {!alert.is_read && (
            <button
              onClick={() => handleMarkAsRead(alert.id)}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
              title="Mark as read"
            >
              <EyeIcon className="h-4 w-4" />
            </button>
          )}
          
          <button
            onClick={() => handleDismissAlert(alert.id)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Dismiss alert"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
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

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Smart Alerts</h1>
            <p className="mt-2 text-gray-600">
              AI-powered portfolio insights organized by watchlist
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Alert
            </button>
            <button
              onClick={handleTriggerAnalysis}
              disabled={analyzing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
              {analyzing ? 'Checking...' : 'Check Missing Alerts'}
            </button>
            <button
              onClick={handleCleanupOldAlerts}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Cleanup Old
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="mb-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BellIcon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Recent</dt>
                      <dd className="text-lg font-medium text-gray-900">{totalAlerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Unread</dt>
                      <dd className="text-lg font-medium text-blue-900">{summary.unread_alerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-red-50 overflow-hidden shadow rounded-lg border border-red-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-red-700 truncate">Critical</dt>
                      <dd className="text-lg font-medium text-red-900">{summary.critical_alerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 overflow-hidden shadow rounded-lg border border-orange-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-orange-700 truncate">High</dt>
                      <dd className="text-lg font-medium text-orange-900">{summary.high_alerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 overflow-hidden shadow rounded-lg border border-yellow-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BellIcon className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-yellow-700 truncate">Medium</dt>
                      <dd className="text-lg font-medium text-yellow-900">{summary.medium_alerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 overflow-hidden shadow rounded-lg border border-blue-200">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <BellIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-blue-700 truncate">Low</dt>
                      <dd className="text-lg font-medium text-blue-900">{summary.low_alerts}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Watchlist Groups */}
      <div className="space-y-6">
        {Object.keys(alertsByWatchlist).length === 0 ? (
          <div className="text-center py-12">
            <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No recent alerts</h3>
            <p className="text-gray-600 mb-4">
              Create a new watchlist or run an analysis to generate alerts.
            </p>
            <button
              onClick={handleTriggerAnalysis}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <ArrowPathIcon className="h-4 w-4 mr-2" />
              Check for Missing Alerts
            </button>
          </div>
        ) : (
          Object.entries(alertsByWatchlist).map(([watchlistName, alerts]) => {
            const isCollapsed = collapsedWatchlists.has(watchlistName)
            return (
              <div key={watchlistName} className="bg-white rounded-lg shadow">
                <div 
                  className="px-6 py-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleWatchlistCollapse(watchlistName)}
                >
                  <div className="flex items-center space-x-3">
                    <h2 className="text-lg font-medium text-gray-900">{watchlistName}</h2>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {isCollapsed ? 
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" /> : 
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  }
                </div>
                
                {!isCollapsed && (
                  <div className="p-6">
                    {alerts.map(renderAlert)}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Old Alerts Section */}
      {oldAlerts.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowOldAlerts(!showOldAlerts)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ClockIcon className="h-5 w-5" />
            <span>Older Alerts ({oldAlerts.length})</span>
            {showOldAlerts ? 
              <ChevronUpIcon className="h-4 w-4" /> : 
              <ChevronDownIcon className="h-4 w-4" />
            }
          </button>
          
          {showOldAlerts && (
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-sm text-gray-600 mb-4">Alerts older than 7 days:</p>
              {oldAlerts.map(renderAlert)}
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