import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import config from '../config';
import { 
  logError, 
  rpcLogger,
  logAvailHttpRequest,
  logAvailHttpResponse,
  logAvailConnectionState,
  logAvailPerformanceMetric,
  logAvailServiceHealth,
} from '../utils/logger';

export interface NexusHealth {
  status: string;
  timestamp: string;
}

export interface AccountState {
  account: string;
  balance: {
    free: string;
    reserved: string;
    miscFrozen: string;
    feeFrozen: string;
  };
  nonce: number;
  consumers: number;
  providers: number;
  sufficients: number;
  data: {
    free: string;
    reserved: string;
    miscFrozen: string;
    feeFrozen: string;
  };
}

export interface AccountStateWithProof extends AccountState {
  proof: string[];
  root: string;
}

export interface BlockResponse {
  hash: string;
  number: number;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  timestamp: number;
  extrinsics: any[];
  events: any[];
}

export interface BlockHeader {
  hash: string;
  parentHash: string;
  number: number;
  stateRoot: string;
  extrinsicsRoot: string;
  digest: any;
  extension: any;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'included' | 'finalized' | 'invalid';
  blockHash?: string;
  blockNumber?: number;
  extrinsicIndex?: number;
  events?: any[];
}

export interface BlockRange {
  startBlock: number;
  endBlock: number;
  blocks: Array<{
    number: number;
    hash: string;
    dataRoot: string;
  }>;
}

export class AvailNexusService extends EventEmitter {
  private httpClient: AxiosInstance;
  private isInitialized = false;
  private baseURL: string;
  private timeout: number;

  constructor() {
    super();
    
    const nexusConfig = config.dataSources.nexus;
    this.baseURL = nexusConfig.apiEndpoint;
    this.timeout = nexusConfig.timeout;
    
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Avail-Explorer/1.0.0',
      },
    });

    this.setupHttpInterceptors();
  }

  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        logAvailHttpRequest(
          'nexus',
          config.method?.toUpperCase() || 'GET',
          `${this.baseURL}${config.url}`,
          config.params || config.data,
          config.headers as Record<string, string>,
        );
        return config;
      },
      (error) => {
        logError(error, { component: 'nexus-api-http', action: 'request' });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const responseSize = JSON.stringify(response.data).length;
        logAvailHttpResponse(
          'nexus',
          response.config.method?.toUpperCase() || 'GET',
          `${this.baseURL}${response.config.url}`,
          response.status,
          0, // Duration will be calculated in individual methods
          responseSize,
          true,
        );
        return response;
      },
      (error) => {
        const responseSize = error.response?.data ? JSON.stringify(error.response.data).length : 0;
        logAvailHttpResponse(
          'nexus',
          error.config?.method?.toUpperCase() || 'GET',
          `${this.baseURL}${error.config?.url}`,
          error.response?.status || 0,
          0,
          responseSize,
          false,
          error.message,
        );
        logError(error, {
          component: 'nexus-api-http',
          action: 'response',
          status: error.response?.status,
          url: error.config?.url,
        });
        return Promise.reject(error);
      },
    );
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();
    try {
      logAvailConnectionState('nexus', this.baseURL, 'connecting');
      
      // Test connection with a simple API call
      await this.getHealth();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      const duration = Date.now() - startTime;
      logAvailConnectionState('nexus', this.baseURL, 'connected');
      logAvailPerformanceMetric('nexus', 'initialize', duration, true);
      rpcLogger.info('Avail Nexus Service initialized successfully');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'initialize', duration, false);
      logAvailConnectionState('nexus', this.baseURL, 'error', { error: (error as Error).message });
      logError(error as Error, { component: 'nexus', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // NEXUS API METHODS
  // ===========================================

  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/health`);
      
      const response = await this.httpClient.get('/health');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/health`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getHealth', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getHealth', duration, false);
      logError(error as Error, { method: 'getHealth' });
      throw error;
    }
  }

  async getNetworkStats(): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/network/stats`);
      
      const response = await this.httpClient.get('/network/stats');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/network/stats`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getNetworkStats', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getNetworkStats', duration, false);
      logError(error as Error, { method: 'getNetworkStats' });
      throw error;
    }
  }

  async getValidators(params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/validators`, params);
      
      const response = await this.httpClient.get('/validators', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/validators`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getValidators', duration, true, { 
        responseSize,
        validatorCount: response.data.validators?.length || 0,
        ...params,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getValidators', duration, false, params);
      logError(error as Error, { method: 'getValidators', params });
      throw error;
    }
  }

  async getValidatorById(validatorId: string): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/validators/${validatorId}`, { validatorId });
      
      const response = await this.httpClient.get(`/validators/${validatorId}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/validators/${validatorId}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getValidatorById', duration, true, { 
        responseSize,
        validatorId,
        status: response.data.status,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getValidatorById', duration, false, { validatorId });
      logError(error as Error, { method: 'getValidatorById', validatorId });
      throw error;
    }
  }

  async getBlocks(params: {
    page?: number;
    limit?: number;
    from?: number;
    to?: number;
  } = {}): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/blocks`, params);
      
      const response = await this.httpClient.get('/blocks', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/blocks`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getBlocks', duration, true, { 
        responseSize,
        blockCount: response.data.blocks?.length || 0,
        ...params,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getBlocks', duration, false, params);
      logError(error as Error, { method: 'getBlocks', params });
      throw error;
    }
  }

  async getBlockById(blockId: string): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/blocks/${blockId}`, { blockId });
      
      const response = await this.httpClient.get(`/blocks/${blockId}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/blocks/${blockId}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getBlockById', duration, true, { 
        responseSize,
        blockId,
        blockNumber: response.data.number,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getBlockById', duration, false, { blockId });
      logError(error as Error, { method: 'getBlockById', blockId });
      throw error;
    }
  }

  async getTransactions(params: {
    page?: number;
    limit?: number;
    blockNumber?: number;
    address?: string;
  } = {}): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/transactions`, params);
      
      const response = await this.httpClient.get('/transactions', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/transactions`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getTransactions', duration, true, { 
        responseSize,
        transactionCount: response.data.transactions?.length || 0,
        ...params,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getTransactions', duration, false, params);
      logError(error as Error, { method: 'getTransactions', params });
      throw error;
    }
  }

  async getAnalytics(timeframe: string = '24h'): Promise<any> {
    const startTime = Date.now();
    const params = { timeframe };
    try {
      logAvailHttpRequest('nexus', 'GET', `${this.baseURL}/analytics`, params);
      
      const response = await this.httpClient.get('/analytics', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('nexus', 'GET', `${this.baseURL}/analytics`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('nexus', 'getAnalytics', duration, true, { 
        responseSize,
        timeframe,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'getAnalytics', duration, false, params);
      logError(error as Error, { method: 'getAnalytics', params });
      throw error;
    }
  }

  // ===========================================
  // ENHANCED METHODS (NEXUS-SPECIFIC)
  // ===========================================

  async getAccountHistory(address: string, limit = 50, offset = 0): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      const response = await this.httpClient.get(`/account/${address}/history?${params.toString()}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getAccountHistory', address, limit, offset });
      throw error;
    }
  }

  async getBlockEvents(blockNumber: number): Promise<any[]> {
    try {
      const response = await this.httpClient.get(`/block/${blockNumber}/events`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockEvents', blockNumber });
      throw error;
    }
  }

  async searchTransactions(query: {
    address?: string;
    blockNumber?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionStatus[]> {
    try {
      const params = new URLSearchParams();
      
      if (query.address) {
        params.append('address', query.address);
      }
      if (query.blockNumber) {
        params.append('block_number', query.blockNumber.toString());
      }
      if (query.status) {
        params.append('status', query.status);
      }
      if (query.limit) {
        params.append('limit', query.limit.toString());
      }
      if (query.offset) {
        params.append('offset', query.offset.toString());
      }
      
      const response = await this.httpClient.get(`/search/transactions?${params.toString()}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'searchTransactions', query });
      throw error;
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isReady(): boolean {
    return this.isInitialized;
  }

  async getServiceHealth(): Promise<{ healthy: boolean; details: any }> {
    const startTime = Date.now();
    try {
      const health = await this.getHealth();
      const stats = await this.getNetworkStats();
      const duration = Date.now() - startTime;

      const healthDetails = {
        apiStatus: health.status,
        networkStats: stats,
        endpoint: this.baseURL,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('nexus', true, healthDetails);
      
      return {
        healthy: true,
        details: healthDetails,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const healthDetails = { 
        error: (error as Error).message,
        endpoint: this.baseURL,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('nexus', false, healthDetails);
      
      return {
        healthy: false,
        details: healthDetails,
      };
    }
  }

  async shutdown(): Promise<void> {
    const startTime = Date.now();
    try {
      // No persistent connections to close for HTTP-only service
      this.isInitialized = false;
      
      const duration = Date.now() - startTime;
      logAvailConnectionState('nexus', this.baseURL, 'disconnected', { reason: 'shutdown' });
      logAvailPerformanceMetric('nexus', 'shutdown', duration, true);
      rpcLogger.info('Avail Nexus Service shutdown complete');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('nexus', 'shutdown', duration, false);
      logError(error as Error, { component: 'nexus', action: 'shutdown' });
    }
  }
} 