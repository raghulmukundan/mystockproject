import React, { useState, useEffect } from 'react';

const SimpleAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        console.log('Fetching alerts...');
        const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/alerts/`;
        console.log('API URL:', API_URL);
        
        const response = await fetch(API_URL);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Alerts data:', data);
        
        setAlerts(data);
      } catch (err: any) {
        console.error('Error fetching alerts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  if (loading) {
    return <div>Loading alerts...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Simple Alerts Test</h1>
      <p>Found {alerts.length} alerts</p>
      <ul>
        {alerts.slice(0, 5).map((alert: any) => (
          <li key={alert.id}>
            <strong>{alert.title}</strong> - {alert.severity} - {alert.message}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SimpleAlerts;