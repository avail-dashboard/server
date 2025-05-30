import axios, { AxiosInstance } from 'axios';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import config from '../config';
import { logError, rpcLogger } from '../utils/logger';

export interface LightClientStatus {
  modes: {
    app_client: boolean;
    fat_client: boolean;
  };
  blocks: {
    available: number;
    app_id: number;
    latest: number;
  };
  genesis_hash: string;
  network: string;
  version: string;
}

export interface BlockStatus {
  block_num: number;
  confidence?: number;
  data_root?: string;
}

export interface BlockHeader {
  parent_hash: string;
  number: string;
  state_root: string;
  extrinsics_root: string;
  digest: any;
  extension: any;
}

export interface BlockData {
  block: {
    header: BlockHeader;
    extrinsics: string[];
  };
  data_transactions: any[];
}

export class AvailLightClientService extends EventEmitter {
  private httpClient: AxiosInstance;
  private wsEndpoint: string;
  private ws?: WebSocket;
  private isInitialized = false;

  constructor() {
    super();
    
    const lightClientConfig = config.dataSources.lightClient;
    
    this.httpClient = axios.create({
      baseURL: lightClientConfig.httpEndpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Avail-Explorer/1.0.0',
      },
    });

    this.wsEndpoint = lightClientConfig.wsEndpoint;
    this.setupHttpInterceptors();
  }

  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        rpcLogger.debug('Light Client HTTP request', {
          method: config.method,
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        logError(error, { component: 'light-client-http', action: 'request' });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        rpcLogger.debug('Light Client HTTP response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        logError(error, {
          component: 'light-client-http',
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
      // Test HTTP connection
      const version = await this.getVersion();
      rpcLogger.info('Light Client HTTP connection established', { version });

      // Initialize WebSocket connection
      await this.connectWebSocket();

      this.isInitialized = true;
      this.emit('initialized');
      
      rpcLogger.info('Avail Light Client Service initialized successfully');
    } catch (error) {
      logError(error as Error, { component: 'light-client', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // HTTPS API METHODS
  // ===========================================

  async getVersion(): Promise<{ version: string }> {
    try {
      const response = await this.httpClient.get('/version');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getVersion' });
      throw error;
    }
  }

  async getStatus(): Promise<LightClientStatus> {
    try {
      const response = await this.httpClient.get('/status');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getStatus' });
      throw error;
    }
  }

  async getBlockStatus(blockNumber: number): Promise<BlockStatus> {
    try {
      const response = await this.httpClient.get(`/status/${blockNumber}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockStatus', blockNumber });
      throw error;
    }
  }

  async getBlockHeader(blockNumber: number): Promise<BlockHeader> {
    try {
      const response = await this.httpClient.get(`/header/${blockNumber}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockHeader', blockNumber });
      throw error;
    }
  }

  async getBlockData(blockNumber: number): Promise<BlockData> {
    try {
      const response = await this.httpClient.get(`/data/${blockNumber}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getBlockData', blockNumber });
      throw error;
    }
  }

  async submitData(data: any, appId?: number): Promise<{ tx_hash: string; block_hash: string }> {
    try {
      const payload = {
        data: typeof data === 'string' ? data : JSON.stringify(data),
        app_id: appId || 0,
      };

      const response = await this.httpClient.post('/submit', payload);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'submitData', appId });
      throw error;
    }
  }

  // ===========================================
  // WEBSOCKET API METHODS
  // ===========================================

  async connectWebSocket(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsEndpoint);

        this.ws.on('open', () => {
          rpcLogger.info('Light Client WebSocket connected');
          this.emit('ws:connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error) {
            logError(error as Error, { component: 'light-client-ws', action: 'parse-message' });
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          rpcLogger.warn('Light Client WebSocket disconnected', { code, reason: reason.toString() });
          this.emit('ws:disconnected', { code, reason });
          this.scheduleReconnection();
        });

        this.ws.on('error', (error: Error) => {
          logError(error, { component: 'light-client-ws' });
          this.emit('ws:error', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(message: any): void {
    rpcLogger.debug('Light Client WebSocket message received', { 
      id: message.id, 
      method: message.method,
    });

    this.emit('ws:message', message);

    // Handle specific message types
    if (message.method === 'version') {
      this.emit('ws:version', message.result);
    } else if (message.method === 'status') {
      this.emit('ws:status', message.result);
    }
  }

  private scheduleReconnection(): void {
    setTimeout(async () => {
      try {
        rpcLogger.info('Attempting Light Client WebSocket reconnection');
        await this.connectWebSocket();
      } catch (error) {
        logError(error as Error, { component: 'light-client-ws', action: 'reconnect' });
      }
    }, 5000);
  }

  async requestVersion(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      jsonrpc: '2.0',
      method: 'version',
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  async requestStatus(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      jsonrpc: '2.0',
      method: 'status',
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  async requestSubmitData(data: any, appId?: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      jsonrpc: '2.0',
      method: 'submit',
      params: {
        data: typeof data === 'string' ? data : JSON.stringify(data),
        app_id: appId || 0,
      },
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(message));
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isConnected(): boolean {
    return this.isInitialized && this.ws?.readyState === WebSocket.OPEN;
  }

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const status = await this.getStatus();
      const version = await this.getVersion();

      return {
        healthy: true,
        details: {
          version: version.version,
          network: status.network,
          modes: status.modes,
          blocks: status.blocks,
          websocket: this.ws?.readyState === WebSocket.OPEN,
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
      if (this.ws) {
        this.ws.close();
      }
      
      rpcLogger.info('Avail Light Client Service shutdown complete');
    } catch (error) {
      logError(error as Error, { component: 'light-client', action: 'shutdown' });
    }
  }
} 