import { useState, useEffect, useRef } from 'react'
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
  ChevronRightIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import { Alert, AlertSummary, alertsApi } from '../services/alertsApi'
import CreateAlertModal from '../components/CreateAlertModal'

// Alert type color mappings
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

// Alert categories for tabs
const ALERT_CATEGORIES = {
  ALL: 'all',
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNREAD: 'unread'
}

export default function Alerts() {
  // Core data states
  const [alertsByWatchlist, setAlertsByWatchlist] = useState<Record<string, Alert[]>>({})
  const [oldAlerts, setOldAlerts] = useState<Alert[]>([])
  const [summary, setSummary] = useState<AlertSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  
  // UI states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showOldAlerts, setShowOldAlerts] = useState(false)
  const [activeTab, setActiveTab] = useState(ALERT_CATEGORIES.ALL)
  const [selectedWatchlist, setSelectedWatchlist] = useState<string | null>(null)
  const [expandedAlerts, setExpandedAlerts] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)
  
  // Selection mode states
  const [selectedAlerts, setSelectedAlerts] = useState<Set<number>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  
  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Refs
  const alertsContainerRef = useRef<HTMLDivElement>(null)
  
  // Load initial data
  useEffect(() => {
    loadAlerts()
    loadSummary()
  }, [])
  
  // Filter alerts when filter changes
  useEffect(() => {
    if (!loading) {
      applyFilters()
    }
  }, [activeTab, selectedWatchlist, searchTerm, severityFilter, unreadOnly])
  
  // Function to apply all active filters
  const applyFilters = () => {
    loadAlerts(true)
  }
  
  // Main data loading function
  const loadAlerts = async (keepCurrentFilters = false) => {
    try {
      if (!keepCurrentFilters) {
        setLoading(true)
      }
      
      // Reset pagination when filters change
      if (keepCurrentFilters) {
        setPage(1)
      }
      
      // Determine active filters based on tab or manual filters
      const activeFilters = {
        severity: activeTab !== ALERT_CATEGORIES.ALL && activeTab !== ALERT_CATEGORIES.UNREAD 
          ? activeTab 
          : severityFilter,
        unread_only: activeTab === ALERT_CATEGORIES.UNREAD || unreadOnly,
        watchlist: selectedWatchlist,
        search: searchTerm.trim()
      }
      
      // Load all alerts first
      const [recentAlerts, oldAlertsData] = await Promise.all([
        alertsApi.getAlertsByWatchlist(true),
        alertsApi.getOldAlerts(7, 100)
      ])
      
      // Apply filters locally
      if (activeFilters.severity || activeFilters.unread_only || activeFilters.watchlist || activeFilters.search) {
        // Filter watchlist alerts
        const filteredAlerts: Record<string, Alert[]> = {}
        
        for (const [watchlistName, alerts] of Object.entries(recentAlerts)) {
          // Apply all filters except watchlist selection
          const filteredWatchlistAlerts = alerts.filter(alert => {
            const matchesSeverity = !activeFilters.severity || alert.severity === activeFilters.severity
            const matchesReadStatus = !activeFilters.unread_only || !alert.is_read
            const matchesSearch = !activeFilters.search || 
              alert.title.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
              alert.message.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
              (alert.symbol && alert.symbol.toLowerCase().includes(activeFilters.search.toLowerCase()))
            
            return matchesSeverity && matchesReadStatus && matchesSearch
          })
          
          if (filteredWatchlistAlerts.length > 0) {
            filteredAlerts[watchlistName] = filteredWatchlistAlerts
          }
        }
        
        setAlertsByWatchlist(filteredAlerts)
        
        // Filter old alerts
        setOldAlerts(oldAlertsData.filter(alert => {
          const matchesSeverity = !activeFilters.severity || alert.severity === activeFilters.severity
          const matchesReadStatus = !activeFilters.unread_only || !alert.is_read
          const matchesSearch = !activeFilters.search || 
            alert.title.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
            alert.message.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
            (alert.symbol && alert.symbol.toLowerCase().includes(activeFilters.search.toLowerCase()))
          const matchesWatchlist = !activeFilters.watchlist || 
            (alert.watchlist_id?.toString() === activeFilters.watchlist)
          
          return matchesSeverity && matchesReadStatus && matchesSearch && matchesWatchlist
        }))
      } else {
        setAlertsByWatchlist(recentAlerts)
        setOldAlerts(oldAlertsData)
      }
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

  const toggleAlertExpand = (alertId: number) => {
    const newExpanded = new Set(expandedAlerts)
    if (newExpanded.has(alertId)) {
      newExpanded.delete(alertId)
    } else {
      newExpanded.add(alertId)
    }
    setExpandedAlerts(newExpanded)
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

  const resetFilters = () => {
    setSeverityFilter('')
    setUnreadOnly(false)
    setSearchTerm('')
    setShowFilters(false)
    setActiveTab(ALERT_CATEGORIES.ALL)
    setSelectedWatchlist(null)
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

  // Helper to get alerts for the current view
  const getCurrentAlerts = () => {
    // Always return all alerts, regardless of selection
    return Object.values(alertsByWatchlist).flat()
  }
  
  // Get watchlist abbreviation (first 3 letters)
  const getWatchlistAbbreviation = (watchlistName: string) => {
    return watchlistName.substring(0, 3).toUpperCase();
  };

  // Find which watchlist an alert belongs to
  const findAlertWatchlist = (alertId: number) => {
    for (const [watchlistName, alerts] of Object.entries(alertsByWatchlist)) {
      if (alerts.some(a => a.id === alertId)) {
        return watchlistName;
      }
    }
    return null;
  };

  // Render compact alert card
  const renderAlertCard = (alert: Alert, showWatchlistTag = false) => {
    const isExpanded = expandedAlerts.has(alert.id)
    
    return (
      <div key={alert.id} 
        className={`rounded-lg shadow-sm border-t-4 mb-0 ${
          getSeverityColor(alert.severity)
        } ${
          !alert.is_read ? 'bg-blue-50' : 'bg-white'
        } ${
          selectedAlerts.has(alert.id) ? 'ring-2 ring-blue-500' : ''
        } transition-all overflow-hidden`}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-1">
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
            </div>
            
            {!selectMode && (
              <div className="flex items-center space-x-1">
                {!alert.is_read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkAsRead(alert.id) }}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                    title="Mark as read"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </button>
                )}
                
                <button
                  onClick={(e) => { e.stopPropagation(); handleDismissAlert(alert.id) }}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                  title="Dismiss alert"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
                
                <button
                  onClick={(e) => { e.stopPropagation(); toggleAlertExpand(alert.id) }}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                  title={isExpanded ? "Collapse details" : "Expand details"}
                >
                  {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
          
          <h4 
            className="text-sm font-medium text-gray-900 mb-1 cursor-pointer hover:text-blue-700"
            onClick={() => toggleAlertExpand(alert.id)}
          >
            {alert.title}
          </h4>
          
          {/* Always visible content */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="flex items-center">
              <ClockIcon className="h-3 w-3 mr-1" />
              {getAlertAge(alert.created_at)}
            </span>
            
            {alert.symbol && (
              <span className="font-mono text-blue-600">{alert.symbol}</span>
            )}
            
            {/* Show watchlist tag when viewing all watchlists */}
            {showWatchlistTag && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-purple-100 text-xs font-medium text-purple-800">
                {getWatchlistAbbreviation(findAlertWatchlist(alert.id) || "UNK")}
              </span>
            )}
          </div>
          
          {/* Expandable content */}
          <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 mt-2' : 'max-h-0'}`}>
            <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
            
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                {formatAlertType(alert.alert_type)}
              </span>
              
              {alert.value !== undefined && alert.value !== null && alert.threshold !== undefined && alert.threshold !== null && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">
                  Value: {alert.value.toFixed(2)} / Threshold: {alert.threshold.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading alerts...</p>
        </div>
      </div>
    )
  }

  // Counts for the UI
  const totalAlerts = Object.values(alertsByWatchlist).reduce((sum, alerts) => sum + alerts.length, 0) + oldAlerts.length
  const hasUnreadAlerts = summary && summary.unread_alerts > 0
  const watchlistsCount = Object.keys(alertsByWatchlist).length
  
  // Get all watchlists for the sidebar
  const allWatchlists = Object.keys(alertsByWatchlist)
  
  // Current alerts based on filtering
  const currentAlerts = getCurrentAlerts()
  
  // Calculate pagination
  const totalPages = Math.ceil(currentAlerts.length / itemsPerPage)
  const paginatedAlerts = currentAlerts.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  
  return (
    <div className="flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Smart Alerts</h1>
              <p className="text-sm text-gray-600">
                {totalAlerts} alerts {selectedWatchlist ? `in ${selectedWatchlist}` : 'across all watchlists'}
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
                  searchTerm || severityFilter || unreadOnly
                    ? 'text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100'
                    : 'text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <FunnelIcon className="h-4 w-4 mr-1.5" />
                Filters {(searchTerm || severityFilter || unreadOnly) && '(Active)'}
              </button>
            </div>
          </div>
          
          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-full sm:w-auto">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Search</label>
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search alerts..."
                    className="w-full sm:w-auto px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Severity</label>
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

                <div className="flex items-end">
                  <label className="flex items-center cursor-pointer h-9">
                    <input
                      type="checkbox"
                      checked={unreadOnly}
                      onChange={(e) => setUnreadOnly(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Unread only</span>
                  </label>
                </div>
                
                <div className="ml-auto self-end">
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
          
          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          
          {/* Summary Bar (Compact) */}
          {summary && (
            <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="grid grid-cols-5 divide-x divide-gray-200">
                <div className="p-3 text-center">
                  <span className="block text-xs text-gray-500">Total</span>
                  <span className="text-lg font-semibold text-gray-900">{summary.total_alerts}</span>
                </div>
                
                <div className="p-3 text-center">
                  <span className="block text-xs text-gray-500">Unread</span>
                  <span className="text-lg font-semibold text-blue-600">{summary.unread_alerts}</span>
                </div>
                
                <div className="p-3 text-center">
                  <span className="block text-xs text-red-500">Critical</span>
                  <span className="text-lg font-semibold text-red-600">{summary.critical_alerts}</span>
                </div>
                
                <div className="p-3 text-center">
                  <span className="block text-xs text-orange-500">High</span>
                  <span className="text-lg font-semibold text-orange-600">{summary.high_alerts}</span>
                </div>
                
                <div className="p-3 text-center">
                  <span className="block text-xs text-yellow-500">Medium</span>
                  <span className="text-lg font-semibold text-yellow-600">{summary.medium_alerts}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Tabs */}
          <div className="mt-5 border-b border-gray-200">
            <nav className="-mb-px flex space-x-4 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.ALL)
                  setSeverityFilter('')
                  setUnreadOnly(false)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.ALL
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                All Alerts
              </button>
              
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.UNREAD)
                  setSeverityFilter('')
                  setUnreadOnly(true)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.UNREAD
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Unread
                {summary && summary.unread_alerts > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {summary.unread_alerts}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.CRITICAL)
                  setSeverityFilter('critical')
                  setUnreadOnly(false)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.CRITICAL
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Critical
                {summary && summary.critical_alerts > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {summary.critical_alerts}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.HIGH)
                  setSeverityFilter('high')
                  setUnreadOnly(false)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.HIGH
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                High
                {summary && summary.high_alerts > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    {summary.high_alerts}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.MEDIUM)
                  setSeverityFilter('medium')
                  setUnreadOnly(false)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.MEDIUM
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Medium
                {summary && summary.medium_alerts > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {summary.medium_alerts}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => {
                  setActiveTab(ALERT_CATEGORIES.LOW)
                  setSeverityFilter('low')
                  setUnreadOnly(false)
                }}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === ALERT_CATEGORIES.LOW
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Low
                {summary && summary.low_alerts > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {summary.low_alerts}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </div>
      
      {/* Main Content Area with Sidebar and Alerts */}
      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white hidden md:block overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Watchlists</h2>
            
            <ul className="mt-3 space-y-1">
              <li>
                <button
                  onClick={() => setSelectedWatchlist(null)}
                  className={`flex items-center px-3 py-2 text-sm rounded-md w-full text-left ${
                    selectedWatchlist === null
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FolderIcon className="h-4 w-4 mr-2 text-gray-400" />
                  All Watchlists
                </button>
              </li>
              
              {allWatchlists.map(watchlist => (
                <li key={watchlist}>
                  <button
                    onClick={() => setSelectedWatchlist(watchlist)}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md w-full text-left ${
                      selectedWatchlist === watchlist
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center">
                      <FolderIcon className="h-4 w-4 mr-2 text-gray-400" />
                      {watchlist}
                    </span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {alertsByWatchlist[watchlist].length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            
            {oldAlerts.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Other</h2>
                <ul className="mt-3 space-y-1">
                  <li>
                    <button
                      onClick={() => setShowOldAlerts(!showOldAlerts)}
                      className="flex items-center justify-between px-3 py-2 text-sm rounded-md w-full text-left text-gray-700 hover:bg-gray-50"
                    >
                      <span className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                        Older Alerts
                      </span>
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                        {oldAlerts.length}
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
            )}
            
            {hasUnreadAlerts && (
              <div className="mt-6">
                <button
                  onClick={markAllAsRead}
                  className="inline-flex items-center px-3 py-1.5 w-full border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <CheckIcon className="h-4 w-4 mr-1.5" />
                  Mark All Read
                </button>
              </div>
            )}
            
            {(Object.keys(alertsByWatchlist).length > 0 || oldAlerts.length > 0) && (
              <div className="mt-2">
                <button
                  onClick={() => setSelectMode(!selectMode)}
                  className={`inline-flex items-center px-3 py-1.5 w-full border rounded-md text-sm font-medium ${selectMode 
                    ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
                >
                  {selectMode ? 'Cancel Selection' : 'Select Alerts'}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50" ref={alertsContainerRef}>
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6">
            {/* Mobile Watchlist Selector */}
            <div className="md:hidden mb-4">
              <label htmlFor="watchlist-select" className="sr-only">Select Watchlist</label>
              <select
                id="watchlist-select"
                value={selectedWatchlist || ''}
                onChange={(e) => setSelectedWatchlist(e.target.value || null)}
                className="w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="">All Watchlists</option>
                {allWatchlists.map(watchlist => (
                  <option key={watchlist} value={watchlist}>{watchlist}</option>
                ))}
              </select>
            </div>
            
            {/* Selection Controls for Mobile */}
            {selectMode && (
              <div className="md:hidden mb-4 flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg shadow-sm">
                <span className="text-sm text-gray-600">
                  {selectedAlerts.size} selected
                </span>
                
                <div className="flex items-center gap-2 ml-auto">
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
                </div>
                
                <div className="flex items-center gap-2 w-full mt-2">
                  <button
                    onClick={deleteSelectedAlerts}
                    disabled={selectedAlerts.size === 0}
                    className={`flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium ${selectedAlerts.size === 0 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-red-600 text-white hover:bg-red-700'}`}
                  >
                    <TrashIcon className="h-4 w-4 mr-1.5" />
                    Delete Selected
                  </button>
                  
                  <button
                    onClick={deleteAllAlerts}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700"
                  >
                    <TrashIcon className="h-4 w-4 mr-1.5" />
                    Delete All
                  </button>
                </div>
              </div>
            )}
            
            {/* No Alerts State */}
            {totalAlerts === 0 ? (
              <div className="text-center py-10 bg-white rounded-lg shadow">
                <BellIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts found</h3>
                <p className="text-gray-600 mb-4 max-w-md mx-auto">
                  {searchTerm || severityFilter || unreadOnly || activeTab !== ALERT_CATEGORIES.ALL || selectedWatchlist
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
                  
                  {(searchTerm || severityFilter || unreadOnly || activeTab !== ALERT_CATEGORIES.ALL || selectedWatchlist) && (
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
              <>
                {/* Selection Controls for Desktop */}
                {selectMode && !selectedWatchlist && (
                  <div className="hidden md:flex mb-4 items-center justify-between bg-white p-3 rounded-lg shadow-sm">
                    <span className="text-sm text-gray-600">
                      {selectedAlerts.size} selected
                    </span>
                    
                    <div className="flex items-center gap-3">
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
                  </div>
                )}
                
                {/* Alert Cards */}
                {selectedWatchlist ? (
                  <div className="mb-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">{selectedWatchlist}</h3>
                        <p className="text-sm text-gray-600">{alertsByWatchlist[selectedWatchlist]?.length || 0} alerts</p>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {alertsByWatchlist[selectedWatchlist]?.map(alert => renderAlertCard(alert, true)) || (
                            <p className="text-gray-500">No alerts in this watchlist.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Other Watchlists</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {Object.entries(alertsByWatchlist)
                        .filter(([name]) => name !== selectedWatchlist)
                        .map(([watchlistName, alerts]) => (
                          <div key={watchlistName} className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="px-4 py-3 border-b border-gray-200">
                              <h3 className="text-lg font-medium text-gray-900">{watchlistName}</h3>
                              <p className="text-sm text-gray-600">{alerts.length} alerts</p>
                            </div>
                            <div className="p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {alerts.map(alert => renderAlertCard(alert, true))}
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {paginatedAlerts.map(alert => renderAlertCard(alert, true))}
                  </div>
                )}
                
                {/* Pagination - only show when not in watchlist view */}
                {!selectedWatchlist && totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 bg-white p-3 rounded-lg shadow-sm">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(page * itemsPerPage, currentAlerts.length)}</span> of{' '}
                        <span className="font-medium">{currentAlerts.length}</span> alerts
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Old Alerts (Only show in mobile or when explicitly selected) */}
                {showOldAlerts && oldAlerts.length > 0 && (
                  <div className="mt-6 bg-white rounded-lg p-4 shadow-sm">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Older Alerts</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {oldAlerts.map(alert => renderAlertCard(alert, true))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Create Alert Modal */}
      <CreateAlertModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onAlertCreated={handleAlertCreated}
      />
    </div>
  )
}