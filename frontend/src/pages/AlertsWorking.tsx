import React, { useState, useEffect } from 'react'
import { alertsApi } from '../services/alertsApi'

interface Alert {
  id: number;
  title: string;
  message: string;
  severity: string;
  alert_type: string;
  created_at: string;
  watchlist_id?: number | null;
  symbol?: string | null;
  is_read: boolean;
}

const AlertsWorking: React.FC = () => {
  const [alertsByWatchlist, setAlertsByWatchlist] = useState<Record<string, Alert[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    try {
      console.log('Loading alerts by watchlist...')
      const alertsData = await alertsApi.getAlertsByWatchlist(true)
      console.log('Alerts data received:', alertsData)
      setAlertsByWatchlist(alertsData)
    } catch (err: any) {
      console.error('Error loading alerts:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRunAnalysis = async () => {
    try {
      console.log('Running missing alerts analysis...')
      await alertsApi.triggerAnalysis()
      setTimeout(() => {
        loadAlerts()
      }, 2000)
    } catch (err: any) {
      console.error('Analysis error:', err)
      setError(err.message)
    }
  }

  const getAlertAge = (dateString: string) => {
    const now = new Date()
    const alertDate = new Date(dateString)
    const diffTime = Math.abs(now.getTime() - alertDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    return `${Math.ceil(diffDays / 7)} weeks ago`
  }

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Loading Smart Alerts...</h1>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Error Loading Alerts</h1>
        <p>{error}</p>
        <button onClick={loadAlerts}>Retry</button>
      </div>
    )
  }

  const totalAlerts = Object.values(alertsByWatchlist).reduce((sum, alerts) => sum + alerts.length, 0)

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1>Smart Alerts ({totalAlerts} recent)</h1>
        <p>Alerts organized by watchlist - Auto-created when you upload/create watchlists</p>
        <button 
          onClick={handleRunAnalysis}
          style={{ 
            backgroundColor: '#3B82F6', 
            color: 'white', 
            padding: '8px 16px', 
            border: 'none', 
            borderRadius: '4px',
            margin: '10px 0'
          }}
        >
          Check for Missing Alerts (Smart Analysis)
        </button>
      </div>

      {Object.keys(alertsByWatchlist).length === 0 ? (
        <div>
          <h2>No recent alerts found</h2>
          <p>Upload a watchlist or create one manually to generate alerts automatically.</p>
          <button onClick={handleRunAnalysis}>Run Analysis</button>
        </div>
      ) : (
        <div>
          {Object.entries(alertsByWatchlist).map(([watchlistName, alerts]) => (
            <div key={watchlistName} style={{ marginBottom: '30px', border: '1px solid #ccc', borderRadius: '8px' }}>
              <div style={{ 
                backgroundColor: '#f5f5f5', 
                padding: '15px', 
                borderBottom: '1px solid #ccc',
                borderRadius: '8px 8px 0 0'
              }}>
                <h2>📊 {watchlistName}</h2>
                <span style={{ color: '#666' }}>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div style={{ padding: '15px' }}>
                {alerts.map((alert) => (
                  <div key={alert.id} style={{ 
                    marginBottom: '15px', 
                    padding: '12px', 
                    border: '1px solid #ddd', 
                    borderRadius: '6px',
                    backgroundColor: alert.is_read ? '#fff' : '#f0f8ff',
                    borderLeft: `4px solid ${
                      alert.severity === 'critical' ? '#DC2626' :
                      alert.severity === 'high' ? '#EA580C' :  
                      alert.severity === 'medium' ? '#CA8A04' : '#2563EB'
                    }`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <h4 style={{ margin: 0, color: '#333' }}>{alert.title}</h4>
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#666',
                            backgroundColor: '#e5e7eb',
                            padding: '2px 8px',
                            borderRadius: '12px'
                          }}>
                            {alert.severity.toUpperCase()}
                          </span>
                          {!alert.is_read && (
                            <span style={{ 
                              fontSize: '12px', 
                              backgroundColor: '#3B82F6', 
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '12px'
                            }}>
                              NEW
                            </span>
                          )}
                        </div>
                        
                        <p style={{ margin: '0 0 8px 0', color: '#555' }}>{alert.message}</p>
                        
                        <div style={{ fontSize: '12px', color: '#888', display: 'flex', gap: '15px' }}>
                          <span>Type: {alert.alert_type.replace(/_/g, ' ')}</span>
                          {alert.symbol && <span>Symbol: {alert.symbol}</span>}
                          <span>⏰ {getAlertAge(alert.created_at)}</span>
                        </div>
                      </div>
                      
                      <div style={{ marginLeft: '15px' }}>
                        <button 
                          onClick={() => console.log(`Dismiss alert ${alert.id}`)}
                          style={{ 
                            backgroundColor: '#EF4444', 
                            color: 'white', 
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h3>✅ Features Now Active:</h3>
        <ul>
          <li><strong>Auto-creation</strong>: Alerts created automatically when you upload/create watchlists</li>
          <li><strong>Smart Analysis</strong>: "Check Missing Alerts" only creates new alerts (no duplicates)</li>
          <li><strong>Watchlist Organization</strong>: Alerts grouped by source watchlist</li>
          <li><strong>Manual Alerts</strong>: Custom alerts grouped separately</li>
          <li><strong>Age Display</strong>: Shows how old each alert is</li>
          <li><strong>Recent Focus</strong>: Only shows alerts from last 7 days by default</li>
        </ul>
      </div>
    </div>
  )
}

export default AlertsWorking