import { EventEmitter } from 'events';
import { RPCConnectionManager } from './connection';
import { RPCMethodsService } from './methods';
import { RPCSubscriptionService } from './subscriptions';
import { logError, rpcLogger } from '../../utils/logger';
import config from '../../config';
import {
  Block,
  Extrinsic,
  Account,
  ChainStats,
  Validator,
  BlocksQuery,
  ExtrinsicsQuery,
  DataSubmissionQuery,
} from '../../types';
import {
  DataAvailabilityProof,
  ApplicationData,
  RuntimeVersion,
  RuntimeMetadata,
  RPCMetrics,
} from '../../types/rpc';

export class AvailRPCService extends EventEmitter {
  private connectionManager: RPCConnectionManager;
  private methodsService: RPCMethodsService;
  private subscriptionService: RPCSubscriptionService;
  private isInitialized = false;
  private metricsInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.connectionManager = new RPCConnectionManager();
    this.methodsService = new RPCMethodsService(this.connectionManager);
    this.subscriptionService = new RPCSubscriptionService(this.connectionManager);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Connection events
    this.connectionManager.on('connection:established', (connection) => {
      this.emit('rpc:connection:established', connection);
    });

    this.connectionManager.on('connection:lost', (connection) => {
      this.emit('rpc:connection:lost', connection);
    });

    this.connectionManager.on('connection:error', (connection, error) => {
      this.emit('rpc:connection:error', connection, error);
    });

    // Subscription events
    this.subscriptionService.on('subscription:created', (subscription) => {
      this.emit('rpc:subscription:created', subscription);
    });

    this.subscriptionService.on('subscription:data', (subscriptionId, data) => {
      this.emit('rpc:subscription:data', subscriptionId, data);
    });

    this.subscriptionService.on('subscription:error', (subscriptionId, error) => {
      this.emit('rpc:subscription:error', subscriptionId, error);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      rpcLogger.warn('RPC service already initialized');
      return;
    }

    try {
      rpcLogger.info('Initializing Avail RPC Service');

      // Initialize connection manager
      await this.connectionManager.initialize();

      // Start metrics collection if enabled
      if (config.features.metrics) {
        this.startMetricsCollection();
      }

      this.isInitialized = true;
      this.emit('rpc:initialized');

      rpcLogger.info('Avail RPC Service initialized successfully');
    } catch (error) {
      logError(error as Error, { component: 'avail-rpc-service', action: 'initialize' });
      throw error;
    }
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.getMetrics();
        this.emit('rpc:metrics', metrics);
      } catch (error) {
        logError(error as Error, { component: 'rpc-metrics' });
      }
    }, 30000); // Collect metrics every 30 seconds
  }

  // ===========================================
  // BLOCK OPERATIONS
  // ===========================================

  async getLatestBlocks(query?: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    this.ensureInitialized();
    return this.methodsService.getLatestBlocks(query);
  }

  async getBlockByNumber(blockNumber: bigint): Promise<Block | null> {
    this.ensureInitialized();
    return this.methodsService.getBlockByNumber(blockNumber);
  }

  async getBlockByHash(blockHash: string): Promise<Block | null> {
    this.ensureInitialized();
    return this.methodsService.getBlockByHash(blockHash);
  }

  // ===========================================
  // EXTRINSIC OPERATIONS
  // ===========================================

  async getLatestExtrinsics(query?: ExtrinsicsQuery): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    this.ensureInitialized();
    return this.methodsService.getLatestExtrinsics(query);
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    this.ensureInitialized();
    return this.methodsService.getExtrinsicsByBlock(blockNumber);
  }

  // ===========================================
  // ACCOUNT OPERATIONS
  // ===========================================

  async getAccountDetails(address: string): Promise<Account | null> {
    this.ensureInitialized();
    return this.methodsService.getAccountDetails(address);
  }

  // ===========================================
  // CHAIN STATE OPERATIONS
  // ===========================================

  async getChainStats(): Promise<ChainStats> {
    this.ensureInitialized();
    return this.methodsService.getChainStats();
  }

  async getValidators(): Promise<Validator[]> {
    this.ensureInitialized();
    return this.methodsService.getValidators();
  }

  // ===========================================
  // AVAIL-SPECIFIC OPERATIONS
  // ===========================================

  async getDataAvailabilityProof(
    blockHash: string,
    extrinsicIndex: number,
  ): Promise<DataAvailabilityProof | null> {
    this.ensureInitialized();
    return this.methodsService.getDataAvailabilityProof(blockHash, extrinsicIndex);
  }

  async getApplicationData(blockHash: string, appId: number): Promise<ApplicationData[]> {
    this.ensureInitialized();
    return this.methodsService.getApplicationData(blockHash, appId);
  }

  async getDataSubmissions(query: DataSubmissionQuery = {}) {
    this.ensureInitialized();
    return this.methodsService.getDataSubmissions(query);
  }

  async getDataSubmissionStats() {
    this.ensureInitialized();
    return this.methodsService.getDataSubmissionStats();
  }

  async getBlockDataRoot(blockHash: string): Promise<string | null> {
    this.ensureInitialized();
    return this.methodsService.getBlockDataRoot(blockHash);
  }

  // ===========================================
  // RUNTIME OPERATIONS
  // ===========================================

  async getRuntimeVersion(): Promise<RuntimeVersion | null> {
    this.ensureInitialized();
    return this.methodsService.getRuntimeVersion();
  }

  async getRuntimeMetadata(): Promise<RuntimeMetadata | null> {
    this.ensureInitialized();
    return this.methodsService.getRuntimeMetadata();
  }

  // ===========================================
  // SUBSCRIPTION OPERATIONS
  // ===========================================

  async subscribeToNewBlocks(callback: (block: Block) => void): Promise<string> {
    this.ensureInitialized();
    return this.subscriptionService.subscribeToNewBlocks(callback);
  }

  async subscribeToFinalizedBlocks(callback: (block: Block) => void): Promise<string> {
    this.ensureInitialized();
    return this.subscriptionService.subscribeToFinalizedBlocks(callback);
  }

  async subscribeToAccountBalance(
    address: string,
    callback: (balance: { free: string; reserved: string }) => void,
  ): Promise<string> {
    this.ensureInitialized();
    return this.subscriptionService.subscribeToAccountBalance(address, callback);
  }

  async subscribeToDataAvailability(callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.subscriptionService.subscribeToDataAvailability(callback);
  }

  async subscribeToApplicationData(appId: number, callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.subscriptionService.subscribeToApplicationData(appId, callback);
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.subscriptionService.unsubscribe(subscriptionId);
  }

  // ===========================================
  // HEALTH AND MONITORING
  // ===========================================

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    if (!this.isInitialized) {
      return {
        healthy: false,
        details: { error: 'RPC service not initialized' },
      };
    }

    return this.methodsService.getHealth();
  }

  async getMetrics(): Promise<RPCMetrics> {
    const connectionStats = this.connectionManager.getAllConnections().map(conn => conn.metrics);
    const subscriptionStats = this.subscriptionService.getSubscriptionStats();
    const healthStatus = await this.connectionManager.getHealthStatus();

    const totalRequests = connectionStats.reduce((sum, stats) => sum + stats.totalRequests, 0);
    const successfulRequests = connectionStats.reduce((sum, stats) => sum + stats.successfulRequests, 0);
    const failedRequests = connectionStats.reduce((sum, stats) => sum + stats.failedRequests, 0);
    const avgResponseTime = connectionStats.length > 0 
      ? connectionStats.reduce((sum, stats) => sum + stats.averageResponseTime, 0) / connectionStats.length
      : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: avgResponseTime,
      requestsPerSecond: 0, // TODO: Calculate RPS
      activeConnections: healthStatus.activeConnections,
      activeSubscriptions: subscriptionStats.active,
      cacheStats: {
        hits: 0, // TODO: Get from cache service
        misses: 0,
        hitRate: 0,
        totalEntries: 0,
        totalSize: 0,
        evictions: 0,
      },
      connectionStats,
      lastUpdated: new Date(),
    };
  }

  getConnectionStats() {
    return {
      total: this.connectionManager.getAllConnections().length,
      active: this.connectionManager.getActiveConnections().length,
      connections: this.connectionManager.getAllConnections().map(conn => ({
        id: conn.id,
        endpoint: conn.endpoint,
        isConnected: conn.isConnected,
        isHealthy: conn.isHealthy,
        metrics: conn.metrics,
      })),
    };
  }

  getSubscriptionStats() {
    return this.subscriptionService.getSubscriptionStats();
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('RPC service not initialized. Call initialize() first.');
    }
  }

  async shutdown(): Promise<void> {
    rpcLogger.info('Shutting down Avail RPC Service');

    // Clear metrics interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Cleanup subscriptions
    await this.subscriptionService.cleanup();

    // Shutdown connection manager
    await this.connectionManager.shutdown();

    this.isInitialized = false;
    this.removeAllListeners();

    rpcLogger.info('Avail RPC Service shutdown complete');
  }
}

// Create and export singleton instance
export const availRPCService = new AvailRPCService();
export default availRPCService; 