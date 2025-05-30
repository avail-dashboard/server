import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import config from '../config';
import { logError, rpcLogger } from '../utils/logger';

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
        rpcLogger.debug('Bridge API HTTP request', {
          method: config.method,
          url: config.url,
          params: config.params,
        });
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
        rpcLogger.debug('Bridge API HTTP response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
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
    try {
      // Test connection by checking health
      await this.checkHealth();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      rpcLogger.info('Avail Bridge Service initialized successfully');
    } catch (error) {
      logError(error as Error, { component: 'bridge-api', action: 'initialize' });
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

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const health = await this.checkHealth();
      const versions = await this.getVersions();
      const bridgeInfo = await this.getBridgeInfo();

      return {
        healthy: true,
        details: {
          service: health.name,
          versions,
          bridgeInfo,
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
      rpcLogger.info('Avail Bridge Service shutdown complete');
    } catch (error) {
      logError(error as Error, { component: 'bridge-api', action: 'shutdown' });
    }
  }
} 