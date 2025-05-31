import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { config } from '../config';
import { 
  logError, 
  rpcLogger, 
  logWebSocketConnection, 
  logWebSocketMessage,
  logAvailHttpRequest,
  logAvailHttpResponse,
  logAvailWebSocketSend,
  logAvailWebSocketReceive,
  logAvailConnectionState,
  logAvailPerformanceMetric,
  logAvailServiceHealth,
  logAvailDataSubmission,
} from '../utils/logger';

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
  private httpEndpoint: string;
  private appId: number;
  private timeout: number;

  constructor() {
    super();
    
    const lightClientConfig = config.dataSources.lightClient;
    this.httpEndpoint = lightClientConfig.httpEndpoint;
    this.wsEndpoint = lightClientConfig.wsEndpoint;
    this.appId = lightClientConfig.appId;
    this.timeout = lightClientConfig.timeout;
    
    this.httpClient = axios.create({
      baseURL: this.httpEndpoint,
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
          'lightClient',
          config.method?.toUpperCase() || 'GET',
          `${this.httpEndpoint}${config.url}`,
          config.params || config.data,
          config.headers as Record<string, string>,
        );
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
        const responseSize = JSON.stringify(response.data).length;
        logAvailHttpResponse(
          'lightClient',
          response.config.method?.toUpperCase() || 'GET',
          `${this.httpEndpoint}${response.config.url}`,
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
          'lightClient',
          error.config?.method?.toUpperCase() || 'GET',
          `${this.httpEndpoint}${error.config?.url}`,
          error.response?.status || 0,
          0,
          responseSize,
          false,
          error.message,
        );
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
    const startTime = Date.now();
    try {
      logAvailConnectionState('lightClient', this.httpEndpoint, 'connecting');
      
      // Test HTTP connection
      const version = await this.getVersion();
      logAvailConnectionState('lightClient', this.httpEndpoint, 'connected', { version });

      // Initialize WebSocket connection
      await this.connectWebSocket();

      this.isInitialized = true;
      this.emit('initialized');
      
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'initialize', duration, true);
      rpcLogger.info('Avail Light Client Service initialized successfully');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'initialize', duration, false);
      logAvailConnectionState('lightClient', this.httpEndpoint, 'error', { error: (error as Error).message });
      logError(error as Error, { component: 'light-client', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // HTTPS API METHODS
  // ===========================================

  async getVersion(): Promise<{ version: string }> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('lightClient', 'GET', `${this.httpEndpoint}/version`);
      
      const response = await this.httpClient.get('/version');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'GET', `${this.httpEndpoint}/version`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('lightClient', 'getVersion', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'getVersion', duration, false);
      logError(error as Error, { method: 'getVersion' });
      throw error;
    }
  }

  async getStatus(): Promise<LightClientStatus> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('lightClient', 'GET', `${this.httpEndpoint}/status`);
      
      const response = await this.httpClient.get('/status');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'GET', `${this.httpEndpoint}/status`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('lightClient', 'getStatus', duration, true, { 
        responseSize,
        network: response.data.network,
        latestBlock: response.data.blocks?.latest,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'getStatus', duration, false);
      logError(error as Error, { method: 'getStatus' });
      throw error;
    }
  }

  async getBlockStatus(blockNumber: number): Promise<BlockStatus> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('lightClient', 'GET', `${this.httpEndpoint}/status/${blockNumber}`, { blockNumber });
      
      const response = await this.httpClient.get(`/status/${blockNumber}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'GET', `${this.httpEndpoint}/status/${blockNumber}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('lightClient', 'getBlockStatus', duration, true, { blockNumber, responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'getBlockStatus', duration, false, { blockNumber });
      logError(error as Error, { method: 'getBlockStatus', blockNumber });
      throw error;
    }
  }

  async getBlockHeader(blockNumber: number): Promise<BlockHeader> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('lightClient', 'GET', `${this.httpEndpoint}/header/${blockNumber}`, { blockNumber });
      
      const response = await this.httpClient.get(`/header/${blockNumber}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'GET', `${this.httpEndpoint}/header/${blockNumber}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('lightClient', 'getBlockHeader', duration, true, { blockNumber, responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'getBlockHeader', duration, false, { blockNumber });
      logError(error as Error, { method: 'getBlockHeader', blockNumber });
      throw error;
    }
  }

  async getBlockData(blockNumber: number): Promise<BlockData> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('lightClient', 'GET', `${this.httpEndpoint}/data/${blockNumber}`, { blockNumber });
      
      const response = await this.httpClient.get(`/data/${blockNumber}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'GET', `${this.httpEndpoint}/data/${blockNumber}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('lightClient', 'getBlockData', duration, true, { 
        blockNumber, 
        responseSize,
        extrinsicsCount: response.data.block?.extrinsics?.length || 0,
        dataTransactionsCount: response.data.data_transactions?.length || 0,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'getBlockData', duration, false, { blockNumber });
      logError(error as Error, { method: 'getBlockData', blockNumber });
      throw error;
    }
  }

  async submitData(data: any, appId?: number): Promise<{ tx_hash: string; block_hash: string }> {
    const startTime = Date.now();
    const actualAppId = appId || this.appId;
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const dataSize = Buffer.byteLength(dataString, 'utf8');
    
    try {
      const payload = {
        data: dataString,
        app_id: actualAppId,
      };

      logAvailHttpRequest('lightClient', 'POST', `${this.httpEndpoint}/submit`, payload);
      
      const response = await this.httpClient.post('/submit', payload);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('lightClient', 'POST', `${this.httpEndpoint}/submit`, 200, duration, responseSize, true);
      logAvailDataSubmission('lightClient', actualAppId, dataSize, response.data.tx_hash, response.data.block_hash, true);
      logAvailPerformanceMetric('lightClient', 'submitData', duration, true, { 
        appId: actualAppId, 
        dataSize,
        txHash: response.data.tx_hash,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailDataSubmission('lightClient', actualAppId, dataSize, undefined, undefined, false, (error as Error).message);
      logAvailPerformanceMetric('lightClient', 'submitData', duration, false, { appId: actualAppId, dataSize });
      logError(error as Error, { method: 'submitData', appId: actualAppId });
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
        logAvailConnectionState('lightClient', this.wsEndpoint, 'connecting');
        this.ws = new WebSocket(this.wsEndpoint);

        this.ws.on('open', () => {
          logAvailConnectionState('lightClient', this.wsEndpoint, 'connected', { readyState: this.ws?.readyState });
          logWebSocketConnection(
            this.wsEndpoint,
            'connected',
            'lightClient',
            { readyState: this.ws?.readyState },
          );
          this.emit('ws:connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          const messageStartTime = Date.now();
          try {
            const message = JSON.parse(data.toString());
            const messageSize = data.length;
            const duration = Date.now() - messageStartTime;
            
            logAvailWebSocketReceive(
              'lightClient',
              this.wsEndpoint,
              message.method || 'response',
              message.id || 'unknown',
              duration,
              messageSize,
              true,
            );
            
            logWebSocketMessage(
              this.wsEndpoint,
              message.method || 'unknown',
              'lightClient',
              message.id,
              duration,
              messageSize,
            );
            
            this.handleWebSocketMessage(message);
          } catch (error) {
            logAvailWebSocketReceive(
              'lightClient',
              this.wsEndpoint,
              'parse-error',
              'unknown',
              0,
              data.length,
              false,
              (error as Error).message,
            );
            logError(error as Error, { 
              component: 'light-client-ws', 
              action: 'parse-message',
              messageSize: data.length,
            });
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logAvailConnectionState('lightClient', this.wsEndpoint, 'disconnected', { 
            code, 
            reason: reason.toString(),
          });
          logWebSocketConnection(
            this.wsEndpoint,
            'disconnected',
            'lightClient',
            { code, reason: reason.toString() },
          );
          this.emit('ws:disconnected', { code, reason });
          this.scheduleReconnection();
        });

        this.ws.on('error', (error: Error) => {
          logAvailConnectionState('lightClient', this.wsEndpoint, 'error', { error: error.message });
          logWebSocketConnection(
            this.wsEndpoint,
            'error',
            'lightClient',
            { error: error.message },
          );
          this.emit('ws:error', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            const timeoutError = new Error('WebSocket connection timeout');
            logAvailConnectionState('lightClient', this.wsEndpoint, 'error', { error: 'connection timeout' });
            reject(timeoutError);
          }
        }, 10000);

      } catch (error) {
        logAvailConnectionState('lightClient', this.wsEndpoint, 'error', { error: (error as Error).message });
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
        logAvailConnectionState('lightClient', this.wsEndpoint, 'reconnecting');
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

    const messageId = Date.now();
    const message = {
      jsonrpc: '2.0',
      method: 'version',
      id: messageId,
    };

    const messageString = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageString, 'utf8');
    
    logAvailWebSocketSend('lightClient', this.wsEndpoint, 'version', messageId, undefined, messageSize);
    this.ws.send(messageString);
  }

  async requestStatus(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageId = Date.now();
    const message = {
      jsonrpc: '2.0',
      method: 'status',
      id: messageId,
    };

    const messageString = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageString, 'utf8');
    
    logAvailWebSocketSend('lightClient', this.wsEndpoint, 'status', messageId, undefined, messageSize);
    this.ws.send(messageString);
  }

  async requestSubmitData(data: any, appId?: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageId = Date.now();
    const actualAppId = appId || this.appId;
    const params = {
      data: typeof data === 'string' ? data : JSON.stringify(data),
      app_id: actualAppId,
    };
    
    const message = {
      jsonrpc: '2.0',
      method: 'submit',
      params,
      id: messageId,
    };

    const messageString = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageString, 'utf8');
    
    logAvailWebSocketSend('lightClient', this.wsEndpoint, 'submit', messageId, params, messageSize);
    this.ws.send(messageString);
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isConnected(): boolean {
    return this.isInitialized && this.ws?.readyState === WebSocket.OPEN;
  }

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    const startTime = Date.now();
    try {
      const status = await this.getStatus();
      const version = await this.getVersion();
      const duration = Date.now() - startTime;

      const healthDetails = {
        version: version.version,
        network: status.network,
        modes: status.modes,
        blocks: status.blocks,
        websocket: this.ws?.readyState === WebSocket.OPEN,
        httpEndpoint: this.httpEndpoint,
        wsEndpoint: this.wsEndpoint,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('lightClient', true, healthDetails);
      
      return {
        healthy: true,
        details: healthDetails,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const healthDetails = { 
        error: (error as Error).message,
        httpEndpoint: this.httpEndpoint,
        wsEndpoint: this.wsEndpoint,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('lightClient', false, healthDetails);
      
      return {
        healthy: false,
        details: healthDetails,
      };
    }
  }

  async shutdown(): Promise<void> {
    const startTime = Date.now();
    try {
      if (this.ws) {
        logAvailConnectionState('lightClient', this.wsEndpoint, 'disconnected', { reason: 'shutdown' });
        this.ws.close();
      }
      
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'shutdown', duration, true);
      rpcLogger.info('Avail Light Client Service shutdown complete');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('lightClient', 'shutdown', duration, false);
      logError(error as Error, { component: 'light-client', action: 'shutdown' });
    }
  }
} 