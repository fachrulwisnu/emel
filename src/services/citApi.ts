// src/services/citApi.ts

const BASE_URL = '/api/cit';

export interface Currency {
  id: number;
  code?: string;
  currency_code?: string;
  name?: string;
}

export interface BranchEntity {
  id: number;
  name?: string;
  branch_name?: string;
}

export interface VaultTrip {
  id?: number;
  order_id: string;
  ticket_id: string;
  branch_name: string;
  location: string;
  status: string;
}

/**
 * Custom fetch wrapper that provides detailed error logging on failures.
 */
async function fetchWithLogging(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      let responseText = '';
      try {
        responseText = await response.clone().text();
      } catch (_) {
        responseText = '(Failed to read response text)';
      }
      console.error(`[CIT API ERROR]
- Full URL: ${url}
- Status Code: ${response.status}
- Response Data: ${responseText}`);
    }
    return response;
  } catch (error: any) {
    console.error(`[CIT API NETWORK ERROR]
- Full URL: ${url}
- Error: ${error.message || String(error)}`);
    throw error;
  }
}

export const citApi = {
  getCurrencies: async (): Promise<Currency[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/currencies`);
    const result = await response.json();
    return result.data || result || [];
  },
  getScItems: async (): Promise<any[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/scitems`);
    const result = await response.json();
    return result.data || result || [];
  },
  getEntityMasterDetails: async (): Promise<BranchEntity[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/entity-master-details`);
    const result = await response.json();
    return result.data || result || [];
  },
  getVaultTrips: async (): Promise<VaultTrip[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/vault-trips`);
    const result = await response.json();
    return result.data || result || [];
  },
  createDelivery: async (payload: {
    currency_id: number;
    branch_id: number;
    amount: number;
    order_date: string;
    source_reference: string;
    ticket_subject: string;
  }): Promise<{ success: boolean; data?: { id: number }; message?: string }> => {
    const response = await fetchWithLogging(`${BASE_URL}/create-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.json();
  },
  createDeliveryDetail: async (payload: {
    delivery_id: number;
    currency_id: number;
    amount: number;
    item_name: string;
    quantity: number;
  }): Promise<{ success: boolean; message?: string }> => {
    const response = await fetchWithLogging(`${BASE_URL}/create-delivery-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.json();
  },
  testConnection: async (): Promise<{ success: boolean; message: string; steps: string[] }> => {
    const response = await fetchWithLogging(`${BASE_URL}/test-connection`);
    return response.json();
  }
};

