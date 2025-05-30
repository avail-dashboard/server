import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import config from '../config';
import { logError, rpcLogger } from '../utils/logger';

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
        rpcLogger.debug('Nexus API HTTP request', {
          method: config.method,
          url: config.url,
          params: config.params,
        });
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
        rpcLogger.debug('Nexus API HTTP response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
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
    try {
      // Test connection by checking health
      await this.checkHealth();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      rpcLogger.info('Avail Nexus Service initialized successfully');
    } catch (error) {
      logError(error as Error, { component: 'nexus-api', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // NEXUS API METHODS
  // ===========================================

  async checkHealth(): Promise<NexusHealth> {
    try {
      const response = await this.httpClient.get('/health');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'checkHealth' });
      throw error;
    }
  }

  async getAccountState(address: string): Promise<AccountState> {
    try {
      const response = await this.httpClient.get(`/account/state/${address}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getAccountState', address });
      throw error;
    }
  }

  async getAccountStateWithProof(address: string): Promise<AccountStateWithProof> {
    try {
      const response = await this.httpClient.get(`/account/state/${address}?with_proof=true`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getAccountStateWithProof', address });
      throw error;
    }
  }

  async getAccountStateHex(address: string): Promise<{ data: string }> {
    try {
      const response = await this.httpClient.get(`/account/state/hex/${address}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getAccountStateHex', address });
      throw error;
    }
  }

  async getBlockByHash(hash: string): Promise<BlockResponse> {
    try {
      const response = await this.httpClient.get(`/block/hash/${hash}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockByHash', hash });
      throw error;
    }
  }

  async getBlockByHeight(height: number): Promise<BlockResponse> {
    try {
      const response = await this.httpClient.get(`/block/height/${height}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockByHeight', height });
      throw error;
    }
  }

  async getHeaderByHash(hash: string): Promise<BlockHeader> {
    try {
      const response = await this.httpClient.get(`/header/${hash}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getHeaderByHash', hash });
      throw error;
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const response = await this.httpClient.get(`/transaction/status/${txHash}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getTransactionStatus', txHash });
      throw error;
    }
  }

  async getBlockRangeForProof(startBlock: number, endBlock: number): Promise<BlockRange> {
    try {
      const response = await this.httpClient.get(`/block/range/${startBlock}/${endBlock}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockRangeForProof', startBlock, endBlock });
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

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const health = await this.checkHealth();

      return {
        healthy: true,
        details: {
          service: 'Avail Nexus API',
          status: health.status,
          timestamp: health.timestamp,
          initialized: this.isInitialized,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: (error as Error).message },
      };
    }
  }

  async shutdown(): Promise<void> {
    try {
      this.isInitialized = false;
      rpcLogger.info('Avail Nexus Service shutdown complete');
    } catch (error) {
      logError(error as Error, { component: 'nexus-api', action: 'shutdown' });
    }
  }
} 