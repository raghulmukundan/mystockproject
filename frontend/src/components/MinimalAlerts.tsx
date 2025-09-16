import React, { useState, useEffect } from 'react';

interface MinimalAlert {
  id: number;
  title: string;
  severity: string;
}

const MinimalAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<MinimalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const API_URL = `/api/alerts/`;
        const response = await fetch(API_URL);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Map to minimal structure to avoid any null/undefined issues
        const minimalAlerts = data.map((alert: any) => ({
          id: alert.id,
          title: alert.title || 'No title',
          severity: alert.severity || 'unknown'
        }));
        
        setAlerts(minimalAlerts);
      } catch (err: any) {
        setError(err.message);
        console.error('Error loading alerts:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Loading Alerts...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error Loading Alerts</h1>
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Smart Alerts ({alerts.length})</h1>
      
      {alerts.length === 0 ? (
        <p>No alerts found.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="border p-4 rounded">
              <h3 className="font-semibold">{alert.title}</h3>
              <p className="text-sm text-gray-600">Severity: {alert.severity}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MinimalAlerts;
