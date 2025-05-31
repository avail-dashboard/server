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

export interface BridgeInfo {
  availChainName: string;
  bridgeContractAddress: string;
  vectorXChainId: string;
  vectorXContractAddress: string;
}

export interface EthereumHead {
  slot: number;
  timestamp: number;
  timestampDiff: number;
}

export interface AvailHead {
  data: {
    end: number;
    start: number;
  };
}

export interface SP1VectorHead {
  head: number;
}

export interface MerkleProof {
  blobRoot: string;
  blockHash: string;
  bridgeRoot: string;
  dataRoot: string;
  dataRootCommitment: string;
  dataRootIndex: number;
  dataRootProof: string[];
  leaf: string;
  leafIndex: number;
  leafProof: string[];
  message: {
    destinationDomain: number;
    from: string;
    id: number;
    message: {
      fungibleToken: {
        amount: string;
        asset_id: string;
      };
    };
    originDomain: number;
    to: string;
  };
  rangeHash: string;
}

export interface StorageProof {
  accountProof: string[];
  storageProof: string[];
}

export interface BridgeTransaction {
  amount: string;
  depositorAddress: string;
  destinationBlockHash?: string;
  destinationBlockNumber?: number;
  destinationTimestamp?: string;
  destinationTransactionIndex?: number;
  messageId: number;
  receiverAddress: string;
  sourceBlockHash: string;
  sourceBlockNumber: number;
  sourceTimestamp: string;
  sourceTransactionHash?: string;
  status: string;
  tokenId: string;
}

export interface BridgeTransactions {
  availSend: BridgeTransaction[];
  ethSend: BridgeTransaction[];
}

export class AvailBridgeService extends EventEmitter {
  private httpClient: AxiosInstance;
  private isInitialized = false;
  private baseURL: string;
  private timeout: number;
  private ethereumRpcUrl: string;
  private contracts: any;

  constructor() {
    super();
    
    this.baseURL = config.dataSources.bridge.apiEndpoint;
    this.timeout = config.dataSources.bridge.timeout;
    this.ethereumRpcUrl = config.dataSources.bridge.ethereumRpcUrl;
    this.contracts = config.dataSources.bridge.contracts;
    
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
          'bridge',
          config.method?.toUpperCase() || 'GET',
          `${this.baseURL}${config.url}`,
          config.params || config.data,
          config.headers as Record<string, string>,
        );
        return config;
      },
      (error) => {
        logError(error, { component: 'bridge-api-http', action: 'request' });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        const responseSize = JSON.stringify(response.data).length;
        logAvailHttpResponse(
          'bridge',
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
          'bridge',
          error.config?.method?.toUpperCase() || 'GET',
          `${this.baseURL}${error.config?.url}`,
          error.response?.status || 0,
          0,
          responseSize,
          false,
          error.message,
        );
        logError(error, {
          component: 'bridge-api-http',
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
      logAvailConnectionState('bridge', this.baseURL, 'connecting');
      
      // Test connection with a simple API call
      await this.getHealth();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      const duration = Date.now() - startTime;
      logAvailConnectionState('bridge', this.baseURL, 'connected');
      logAvailPerformanceMetric('bridge', 'initialize', duration, true);
      rpcLogger.info('Avail Bridge Service initialized successfully');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'initialize', duration, false);
      logAvailConnectionState('bridge', this.baseURL, 'error', { error: (error as Error).message });
      logError(error as Error, { component: 'bridge', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // REST API METHODS
  // ===========================================

  async checkHealth(): Promise<{ name: string }> {
    try {
      const response = await this.httpClient.get('/');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'checkHealth' });
      throw error;
    }
  }

  async getVersions(): Promise<string[]> {
    try {
      const response = await this.httpClient.get('/versions');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getVersions' });
      throw error;
    }
  }

  async getBridgeInfo(): Promise<BridgeInfo> {
    try {
      const response = await this.httpClient.get('/v1/info');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBridgeInfo' });
      throw error;
    }
  }

  async getEthereumHead(): Promise<EthereumHead> {
    try {
      const response = await this.httpClient.get('/v1/eth/head');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getEthereumHead' });
      throw error;
    }
  }

  async getAvailHead(): Promise<AvailHead> {
    try {
      const response = await this.httpClient.get('/v1/avl/head');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getAvailHead' });
      throw error;
    }
  }

  async getSP1VectorHead(chainId: string): Promise<SP1VectorHead> {
    try {
      const response = await this.httpClient.get(`/v1/head/${chainId}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getSP1VectorHead', chainId });
      throw error;
    }
  }

  async generateMerkleProof(blockHash: string, index: number): Promise<MerkleProof> {
    try {
      const response = await this.httpClient.get(`/v1/eth/proof/${blockHash}?index=${index}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'generateMerkleProof', blockHash, index });
      throw error;
    }
  }

  async generateProofByChain(chainId: string, blockHash: string, index: number): Promise<MerkleProof> {
    try {
      const params = new URLSearchParams({
        block_hash: blockHash,
        index: index.toString(),
      });
      
      const response = await this.httpClient.get(`/v1/proof/${chainId}?${params.toString()}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'generateProofByChain', chainId, blockHash, index });
      throw error;
    }
  }

  async getStorageProof(blockHash: string, messageId: string): Promise<StorageProof> {
    try {
      const response = await this.httpClient.get(`/v1/avl/proof/${blockHash}/${messageId}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getStorageProof', blockHash, messageId });
      throw error;
    }
  }

  async getBridgeTransactions(availAddress?: string, ethAddress?: string): Promise<BridgeTransactions> {
    try {
      const params = new URLSearchParams();
      if (availAddress) {
        params.append('availAddress', availAddress);
      }
      if (ethAddress) {
        params.append('ethAddress', ethAddress);
      }
      
      const response = await this.httpClient.get(`/v1/transactions?${params.toString()}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBridgeTransactions', availAddress, ethAddress });
      throw error;
    }
  }

  // Deprecated but keeping for backward compatibility
  async mapSlotToBlockNumber(slotNumber: number): Promise<{ blockHash: string; blockNumber: number }> {
    try {
      const response = await this.httpClient.get(`/beacon/slot/${slotNumber}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'mapSlotToBlockNumber', slotNumber });
      throw error;
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isReady(): boolean {
    return this.isInitialized;
  }

  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/health`);
      
      const response = await this.httpClient.get('/health');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/health`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getHealth', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getHealth', duration, false);
      logError(error as Error, { method: 'getHealth' });
      throw error;
    }
  }

  async getBridgeStats(): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/stats`);
      
      const response = await this.httpClient.get('/stats');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/stats`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getBridgeStats', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getBridgeStats', duration, false);
      logError(error as Error, { method: 'getBridgeStats' });
      throw error;
    }
  }

  async getTransactions(params: {
    page?: number;
    limit?: number;
    status?: string;
    from?: string;
    to?: string;
  } = {}): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/transactions`, params);
      
      const response = await this.httpClient.get('/transactions', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/transactions`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getTransactions', duration, true, { 
        responseSize,
        transactionCount: response.data.transactions?.length || 0,
        ...params,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getTransactions', duration, false, params);
      logError(error as Error, { method: 'getTransactions', params });
      throw error;
    }
  }

  async getTransactionById(txId: string): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/transactions/${txId}`, { txId });
      
      const response = await this.httpClient.get(`/transactions/${txId}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/transactions/${txId}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getTransactionById', duration, true, { 
        responseSize,
        txId,
        status: response.data.status,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getTransactionById', duration, false, { txId });
      logError(error as Error, { method: 'getTransactionById', txId });
      throw error;
    }
  }

  async getValidatorSet(): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/validator-set`);
      
      const response = await this.httpClient.get('/validator-set');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/validator-set`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getValidatorSet', duration, true, { 
        responseSize,
        validatorCount: response.data.validators?.length || 0,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getValidatorSet', duration, false);
      logError(error as Error, { method: 'getValidatorSet' });
      throw error;
    }
  }

  async getProofs(blockHash: string, transactionIndex: number): Promise<any> {
    const startTime = Date.now();
    const params = { blockHash, transactionIndex };
    try {
      logAvailHttpRequest('bridge', 'GET', `${this.baseURL}/proofs`, params);
      
      const response = await this.httpClient.get('/proofs', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'GET', `${this.baseURL}/proofs`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'getProofs', duration, true, { 
        responseSize,
        blockHash,
        transactionIndex,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'getProofs', duration, false, params);
      logError(error as Error, { method: 'getProofs', params });
      throw error;
    }
  }

  async submitBridgeTransaction(transaction: any): Promise<any> {
    const startTime = Date.now();
    const transactionSize = JSON.stringify(transaction).length;
    try {
      logAvailHttpRequest('bridge', 'POST', `${this.baseURL}/submit`, transaction);
      
      const response = await this.httpClient.post('/submit', transaction);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('bridge', 'POST', `${this.baseURL}/submit`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('bridge', 'submitBridgeTransaction', duration, true, { 
        responseSize,
        transactionSize,
        txHash: response.data.txHash,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'submitBridgeTransaction', duration, false, { transactionSize });
      logError(error as Error, { method: 'submitBridgeTransaction' });
      throw error;
    }
  }

  async getServiceHealth(): Promise<{ healthy: boolean; details: any }> {
    const startTime = Date.now();
    try {
      const health = await this.getHealth();
      const stats = await this.getBridgeStats();
      const duration = Date.now() - startTime;

      const healthDetails = {
        apiStatus: health.status,
        bridgeStats: stats,
        endpoint: this.baseURL,
        contracts: this.contracts,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('bridge', true, healthDetails);
      
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

      logAvailServiceHealth('bridge', false, healthDetails);
      
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
      logAvailConnectionState('bridge', this.baseURL, 'disconnected', { reason: 'shutdown' });
      logAvailPerformanceMetric('bridge', 'shutdown', duration, true);
      rpcLogger.info('Avail Bridge Service shutdown complete');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('bridge', 'shutdown', duration, false);
      logError(error as Error, { component: 'bridge', action: 'shutdown' });
    }
  }
} 