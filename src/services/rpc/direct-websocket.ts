import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logError, rpcLogger } from '../../utils/logger';
import { Block, Extrinsic, ChainStats } from '../../types';

export interface DirectWSConfig {
  endpoint: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  requestTimeout: number;
  pingInterval: number;
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  method: string;
}

export class DirectAvailWebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: DirectWSConfig;
  private requestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private isConnected = false;
  private reconnectAttempts = 0;
  private pingInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(config: Partial<DirectWSConfig> = {}) {
    super();
    this.config = {
      endpoint: 'wss://mainnet-rpc.avail.so/ws',
      reconnectAttempts: 10,
      reconnectDelay: 5000,
      requestTimeout: 30000,
      pingInterval: 30000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down');
    }

    return new Promise((resolve, reject) => {
      try {
        rpcLogger.info('DirectWS: Connecting to Avail endpoint', { 
          endpoint: this.config.endpoint,
          attempt: this.reconnectAttempts + 1,
        });

        this.ws = new WebSocket(this.config.endpoint);

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.terminate();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPingInterval();
          
          rpcLogger.info('DirectWS: Connected successfully', { 
            endpoint: this.config.endpoint,
          });
          
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(connectionTimeout);
          this.handleDisconnection(code, reason.toString());
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          this.handleError(error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.id && this.pendingRequests.has(message.id)) {
        const request = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if (message.error) {
          const error = new Error(message.error.message || 'RPC Error');
          (error as any).code = message.error.code;
          request.reject(error);
        } else {
          request.resolve(message.result);
        }
      } else if (message.method) {
        // Handle subscription updates
        this.emit('subscription', message);
      }
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        action: 'parse-message',
        dataLength: data.length,
      });
    }
  }

  private handleDisconnection(code: number, reason: string): void {
    this.isConnected = false;
    this.stopPingInterval();
    
    rpcLogger.warn('DirectWS: Connection lost', { 
      endpoint: this.config.endpoint,
      code,
      reason,
    });

    // Reject all pending requests
    for (const [, request] of this.pendingRequests) {
      request.reject(new Error('Connection lost'));
    }
    this.pendingRequests.clear();

    this.emit('disconnected', { code, reason });

    // Attempt reconnection
    if (!this.isShuttingDown && this.reconnectAttempts < this.config.reconnectAttempts) {
      this.scheduleReconnection();
    }
  }

  private handleError(error: Error): void {
    logError(error, { 
      component: 'direct-websocket', 
      endpoint: this.config.endpoint,
    });
    this.emit('error', error);
  }

  private scheduleReconnection(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000,
    );

    rpcLogger.info('DirectWS: Scheduling reconnection', {
      endpoint: this.config.endpoint,
      attempt: this.reconnectAttempts,
      delay,
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logError(error as Error, { 
          component: 'direct-websocket', 
          action: 'reconnect',
        });
      }
    }, delay);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.ping();
      }
    }, this.config.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  async call(method: string, params: any[] = []): Promise<any> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = this.requestId++;
    const message = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      const request: PendingRequest = {
        resolve,
        reject,
        timestamp: Date.now(),
        method,
      };

      this.pendingRequests.set(id, request);

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, this.config.requestTimeout);

      try {
        this.ws!.send(JSON.stringify(message));
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  // ===========================================
  // ENHANCED AVAIL-SPECIFIC RPC METHODS
  // ===========================================

  async getFinalizedHead(): Promise<string> {
    try {
      return await this.call('chain_getFinalizedHead');
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getFinalizedHead',
      });
      throw error;
    }
  }

  async getRuntimeVersion(): Promise<any> {
    try {
      return await this.call('state_getRuntimeVersion');
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getRuntimeVersion',
      });
      throw error;
    }
  }

  async getRuntimeMetadata(): Promise<any> {
    try {
      return await this.call('state_getMetadata');
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getRuntimeMetadata',
      });
      throw error;
    }
  }

  async getSystemHealth(): Promise<any> {
    try {
      return await this.call('system_health');
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getSystemHealth',
      });
      throw error;
    }
  }

  async getSystemProperties(): Promise<any> {
    try {
      return await this.call('system_properties');
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getSystemProperties',
      });
      throw error;
    }
  }

  async getTotalIssuance(): Promise<bigint> {
    try {
      const result = await this.call('state_getStorage', ['0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9de1e86a9a8c739864cf3cc5ec2bea59fd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d']);
      return result ? BigInt(result) : BigInt(0);
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getTotalIssuance',
      });
      return BigInt(0);
    }
  }

  async getChainStats(): Promise<ChainStats> {
    try {
      const [header, totalIssuance] = await Promise.all([
        this.call('chain_getHeader'),
        this.getTotalIssuance(),
      ]);

      const blockHeight = BigInt(parseInt(header.number, 16));

      // Calculate block time from recent blocks
      let blockTime = 20000; // Default 20s for Avail
      try {
        const prevBlockHash = await this.call('chain_getBlockHash', [`0x${(blockHeight - BigInt(1)).toString(16)}`]);
        const [currentBlock, prevBlock] = await Promise.all([
          this.call('chain_getBlock', [header.hash]),
          this.call('chain_getBlock', [prevBlockHash]),
        ]);

        const currentTimestamp = this.extractTimestampFromBlock(currentBlock);
        const prevTimestamp = this.extractTimestampFromBlock(prevBlock);
        
        if (currentTimestamp && prevTimestamp) {
          blockTime = Number(currentTimestamp - prevTimestamp);
        }
      } catch (error) {
        rpcLogger.warn('DirectWS: Failed to calculate block time, using default', { error });
      }

      return {
        blockHeight,
        blockTime,
        totalIssuance,
        activeValidators: 0, // Would need staking queries
        nominators: 0, // Would need staking queries
        minimumStake: BigInt(0), // Would need staking queries
        averageStake: BigInt(0), // Would need calculation
        inflation: 0, // Would need calculation
        stakingRatio: 0, // Would need calculation
        lastUpdateTime: BigInt(Date.now()),
      };
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getChainStats',
      });
      throw error;
    }
  }

  // ===========================================
  // ENHANCED TRANSFORMATION HELPERS
  // ===========================================

  private extractTimestampFromBlock(block: any): bigint | null {
    try {
      // Look for timestamp extrinsic (usually the first one)
      const timestampExtrinsic = block.block.extrinsics.find((ext: any) => 
        ext.method && ext.method.section === 'timestamp' && ext.method.method === 'set',
      );
      
      if (timestampExtrinsic && timestampExtrinsic.method.args && timestampExtrinsic.method.args.now) {
        return BigInt(timestampExtrinsic.method.args.now);
      }
      
      return null;
    } catch (error) {
      rpcLogger.warn('DirectWS: Failed to extract timestamp from block', { error });
      return null;
    }
  }

  private transformBlock(block: any, header: any): Block {
    const blockNumber = BigInt(parseInt(header.number, 16));
    const timestamp = this.extractTimestampFromBlock(block) || BigInt(Date.now());
    
    return {
      number: blockNumber,
      hash: header.hash || block.hash,
      parentHash: header.parentHash,
      stateRoot: header.stateRoot,
      timestamp,
      extrinsicsCount: block.block.extrinsics.length,
      extrinsicsRoot: header.extrinsicsRoot,
      size: JSON.stringify(block).length, // Approximate size
      weight: '0', // Would need to calculate from extrinsics
      spec: 0, // Would need runtime version
      finalized: true, // Assume finalized for now
      authorId: this.extractAuthorFromDigest(header.digest), // Extract from BABE logs
    };
  }

  private extractAuthorFromDigest(digest: any): string {
    try {
      // Look for BABE PreRuntime log to extract author
      if (digest && digest.logs) {
        const preRuntimeLog = digest.logs.find((log: any) => 
          log.PreRuntime && log.PreRuntime[0] === 'BABE',
        );
        
        if (preRuntimeLog) {
          // Extract author from BABE PreRuntime data (simplified)
          return preRuntimeLog.PreRuntime[1].substring(0, 10) + '...';
        }
      }
      return '';
    } catch (error) {
      return '';
    }
  }

  private transformExtrinsic(
    ext: any,
    blockNumber: bigint,
    index: number,
    timestamp: bigint,
  ): Extrinsic | null {
    try {
      // Enhanced extrinsic parsing based on Avail Explorer analysis
      const extrinsic: Extrinsic = {
        hash: ext.hash || `${blockNumber}-${index}`,
        blockNumber,
        extrinsicIndex: index,
        module: 'Unknown',
        call: 'Unknown',
        signer: '',
        signature: '',
        fee: BigInt(0),
        success: true, // Would need to check events for actual success
        timestamp,
        tip: BigInt(0),
        args: {},
        events: [],
        isSigned: ext.isSigned || false,
        isUserTransaction: false,
      };

      // Extract method information
      if (ext.method) {
        extrinsic.module = ext.method.section || 'Unknown';
        extrinsic.call = ext.method.method || 'Unknown';
        extrinsic.args = ext.method.args || {};
      }

      // Handle signed extrinsics
      if (ext.isSigned && ext.signature) {
        extrinsic.isSigned = true;
        extrinsic.isUserTransaction = true;
        
        // Extract signer information
        if (ext.signature.signer) {
          extrinsic.signer = ext.signature.signer.toString();
        }
        
        // Extract signature
        if (ext.signature.signature) {
          extrinsic.signature = ext.signature.signature.toString();
        }
        
        // Extract tip if available
        if (ext.signature.tip) {
          extrinsic.tip = BigInt(ext.signature.tip.toString());
        }
      }

      return extrinsic;
    } catch (error) {
      rpcLogger.warn('DirectWS: Failed to transform extrinsic', { 
        blockNumber: blockNumber.toString(),
        index,
        error: (error as Error).message,
      });
      return null;
    }
  }

  // ===========================================
  // AVAIL-SPECIFIC RPC METHODS
  // ===========================================

  async getDataAvailabilityProof(blockHash: string, extrinsicIndex: number): Promise<any> {
    try {
      return await this.call('kate_queryProof', [blockHash, extrinsicIndex]);
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getDataAvailabilityProof',
        blockHash,
        extrinsicIndex,
      });
      return null;
    }
  }

  async getApplicationData(blockHash: string, appId: number): Promise<any[]> {
    try {
      return await this.call('kate_queryDataProof', [blockHash, appId]);
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getApplicationData',
        blockHash,
        appId,
      });
      return [];
    }
  }

  async getBlockDataRoot(blockHash: string): Promise<string | null> {
    try {
      const result = await this.call('kate_blockLength', [blockHash]);
      return result?.dataRoot || null;
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getBlockDataRoot',
        blockHash,
      });
      return null;
    }
  }

  // ===========================================
  // CONNECTION MANAGEMENT
  // ===========================================

  isHealthy(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      endpoint: this.config.endpoint,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
      readyState: this.ws?.readyState,
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopPingInterval();

    // Reject all pending requests
    for (const [, request] of this.pendingRequests) {
      request.reject(new Error('Service shutting down'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    rpcLogger.info('DirectWS: Service shutdown complete');
  }

  // ===========================================
  // CORE BLOCKCHAIN METHODS
  // ===========================================

  async getLatestBlocks(limit: number = 10): Promise<Block[]> {
    try {
      const header = await this.call('chain_getHeader');
      const latestNumber = parseInt(header.number, 16);
      
      const blocks: Block[] = [];
      const promises = [];

      for (let i = 0; i < limit; i++) {
        const blockNumber = latestNumber - i;
        if (blockNumber >= 0) {
          promises.push(this.getBlockByNumber(BigInt(blockNumber)));
        }
      }

      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          blocks.push(result.value);
        }
      }

      return blocks.sort((a, b) => Number(b.number - a.number));
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getLatestBlocks',
        limit,
      });
      throw error;
    }
  }

  async getBlockByNumber(blockNumber: bigint): Promise<Block | null> {
    try {
      const blockHash = await this.call('chain_getBlockHash', [`0x${blockNumber.toString(16)}`]);
      return await this.getBlockByHash(blockHash);
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getBlockByNumber',
        blockNumber: blockNumber.toString(),
      });
      return null;
    }
  }

  async getBlockByHash(blockHash: string): Promise<Block | null> {
    try {
      const [block, header] = await Promise.all([
        this.call('chain_getBlock', [blockHash]),
        this.call('chain_getHeader', [blockHash]),
      ]);

      return this.transformBlock(block, header);
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getBlockByHash',
        blockHash,
      });
      return null;
    }
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    try {
      const blockHash = await this.call('chain_getBlockHash', [`0x${blockNumber.toString(16)}`]);
      const block = await this.call('chain_getBlock', [blockHash]);
      
      const extrinsics: Extrinsic[] = [];
      const timestamp = this.extractTimestampFromBlock(block) || BigInt(Date.now());

      block.block.extrinsics.forEach((ext: any, index: number) => {
        try {
          const extrinsic = this.transformExtrinsic(ext, blockNumber, index, timestamp);
          if (extrinsic) {
            extrinsics.push(extrinsic);
          }
        } catch (error) {
          rpcLogger.warn('DirectWS: Failed to transform extrinsic', { 
            blockNumber: blockNumber.toString(),
            index,
            error: (error as Error).message,
          });
        }
      });

      return extrinsics;
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getExtrinsicsByBlock',
        blockNumber: blockNumber.toString(),
      });
      return [];
    }
  }

  async getAccountDetails(address: string): Promise<any> {
    try {
      const accountInfo = await this.call('system_account', [address]);
      
      return {
        address,
        balance: BigInt(accountInfo.data.free || 0),
        nonce: accountInfo.nonce || 0,
        accountInfo: {
          free: BigInt(accountInfo.data.free || 0),
          reserved: BigInt(accountInfo.data.reserved || 0),
          frozen: BigInt(accountInfo.data.frozen || 0),
          flags: BigInt(accountInfo.data.flags || 0),
        },
      };
    } catch (error) {
      logError(error as Error, { 
        component: 'direct-websocket', 
        method: 'getAccountDetails',
        address,
      });
      return null;
    }
  }
} 