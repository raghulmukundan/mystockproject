const API_BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/alerts`;

export interface Alert {
  id: number;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  watchlist_id?: number | null;
  symbol?: string | null;
  value?: number | null;
  threshold?: number | null;
  is_active: boolean;
  is_read: boolean;
  created_at: string;
  resolved_at?: string | null;
  context_data?: string | null;
}

export interface AlertSummary {
  total_alerts: number;
  unread_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
}

export interface CreateAlertRequest {
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  watchlist_id?: number;
  symbol?: string;
  value?: number;
  threshold?: number;
}

class AlertsApi {
  async getAlerts(params?: {
    limit?: number;
    unread_only?: boolean;
    severity?: string;
    alert_type?: string;
  }): Promise<Alert[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.unread_only) queryParams.append('unread_only', 'true');
    if (params?.severity) queryParams.append('severity', params.severity);
    if (params?.alert_type) queryParams.append('alert_type', params.alert_type);
    
    const url = `${API_BASE_URL}/?${queryParams}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch alerts: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getAlertSummary(): Promise<AlertSummary> {
    const response = await fetch(`${API_BASE_URL}/summary`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch alert summary: ${response.statusText}`);
    }
    
    return response.json();
  }

  async triggerAnalysis(): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to trigger analysis: ${response.statusText}`);
    }
    
    return response.json();
  }

  async markAsRead(alertId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/${alertId}/action`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'read' }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to mark alert as read: ${response.statusText}`);
    }
    
    return response.json();
  }

  async dismissAlert(alertId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/${alertId}/action`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'dismiss' }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to dismiss alert: ${response.statusText}`);
    }
    
    return response.json();
  }

  async deleteAlert(alertId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/${alertId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete alert: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getAlertTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/types`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch alert types: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getAlertSeverities(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/severities`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch alert severities: ${response.statusText}`);
    }
    
    return response.json();
  }

  async createAlert(alertData: CreateAlertRequest): Promise<Alert> {
    const response = await fetch(`${API_BASE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create alert: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getAlertsByWatchlist(recentOnly: boolean = true): Promise<Record<string, Alert[]>> {
    const queryParams = new URLSearchParams();
    if (recentOnly) queryParams.append('recent_only', 'true');
    
    const response = await fetch(`${API_BASE_URL}/by-watchlist?${queryParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch alerts by watchlist: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getOldAlerts(daysOld: number = 7, limit: number = 100): Promise<Alert[]> {
    const queryParams = new URLSearchParams();
    queryParams.append('days_old', daysOld.toString());
    queryParams.append('limit', limit.toString());
    
    const response = await fetch(`${API_BASE_URL}/old?${queryParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch old alerts: ${response.statusText}`);
    }
    
    return response.json();
  }

  async cleanupOldAlerts(daysOld: number = 30): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days_old: daysOld }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to cleanup old alerts: ${response.statusText}`);
    }
    
    return response.json();
  }
}

export const alertsApi = new AlertsApi();