// Universe API service
const API_BASE_URL = 'http://localhost:8000';

export interface RefreshRequest {
  download?: boolean;
}

export interface RefreshResponse {
  inserted: number;
  updated: number;
  total: number;
  file_path: string;
}

export interface StatsResponse {
  count: number;
  last_updated_at?: string;
}

export interface FacetsResponse {
  exchanges: string[];
  etf_flags: string[];
  counts: {
    all: number;
    etfs: number;
    non_etfs: number;
  };
}

export interface SymbolItem {
  symbol: string;
  security_name: string;
  listing_exchange?: string;
  market_category?: string;
  test_issue?: string;
  financial_status?: string;
  round_lot_size?: number;
  etf?: string;
  nextshares?: string;
  stooq_symbol: string;
  updated_at: string;
}

export interface SymbolsResponse {
  items: SymbolItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface NextRefreshResponse {
  next_refresh_time: string;
  formatted_time: string;
  timezone: string;
}

export interface QueryParams {
  q?: string;
  exchange?: string;
  etf?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
}

class UniverseApi {
  async refreshUniverse(request: RefreshRequest = { download: true }): Promise<RefreshResponse> {
    const response = await fetch(`${API_BASE_URL}/api/universe/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getStats(): Promise<StatsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/universe/stats`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    return response.json();
  }

  async getFacets(): Promise<FacetsResponse> {
    const response = await fetch(`${API_BASE_URL}/api/universe/facets`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch facets: ${response.statusText}`);
    }

    return response.json();
  }

  async querySymbols(params: QueryParams = {}): Promise<SymbolsResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(`${API_BASE_URL}/api/universe/symbols?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to query symbols: ${response.statusText}`);
    }

    return response.json();
  }

  async getNextRefresh(): Promise<NextRefreshResponse> {
    const response = await fetch(`${API_BASE_URL}/api/universe/next-refresh`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch next refresh time: ${response.statusText}`);
    }

    return response.json();
  }

  async exportCsv(params: QueryParams = {}): Promise<Blob> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const response = await fetch(`${API_BASE_URL}/api/universe/symbols.csv?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`Failed to export CSV: ${response.statusText}`);
    }

    return response.blob();
  }

  downloadCsv(blob: Blob, filename = 'symbols.csv') {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export const universeApi = new UniverseApi();