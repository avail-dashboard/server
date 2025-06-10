import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { logger, logError } from '../../utils/logger';
import {
  BaseService,
  ServiceHealth,
  RetryConfig,
  ConnectionProvider,
  CircuitBreakerState,
  ServiceMetrics,
  ServiceLifecycle,
} from '../types/service';
import {
  BlockchainConnection,
  SubscriptionManager,
  BlockData,
  ChainInfo,
} from '../types/blockchain';

// Avail RPC Providers from Providers.md
const AVAIL_RPC_PROVIDERS: ConnectionProvider[] = [
  // Official Avail endpoint (highest priority)
  { url: 'wss://mainnet-rpc.avail.so/ws', type: 'ws', priority: 1, provider: 'Avail Official', region: 'global' },
  { url: 'https://mainnet-rpc.avail.so', type: 'http', priority: 1, provider: 'Avail Official', region: 'global' },
  
  // High-performance providers
  { url: 'wss://avail-mainnet.public.blastapi.io/', type: 'ws', priority: 2, provider: 'BlastAPI', region: 'global' },
  { url: 'https://avail-mainnet.public.blastapi.io/', type: 'http', priority: 2, provider: 'BlastAPI', region: 'global' },
  
  { url: 'wss://mainnet.avail-rpc.com/', type: 'ws', priority: 3, provider: 'Ankr', region: 'global' },
  { url: 'https://mainnet.avail-rpc.com/', type: 'http', priority: 3, provider: 'Ankr', region: 'global' },
  
  // Regional providers
  { url: 'wss://avail-us.brightlystake.com', type: 'ws', priority: 4, provider: 'BrightlyStake', region: 'us' },
  { url: 'https://avail-us.brightlystake.com', type: 'http', priority: 4, provider: 'BrightlyStake', region: 'us' },
  
  { url: 'wss://rpc-avail.globalstake.io', type: 'ws', priority: 5, provider: 'GlobalStake', region: 'global' },
  { url: 'https://rpc-avail.globalstake.io', type: 'http', priority: 5, provider: 'GlobalStake', region: 'global' },
  
  // Community providers
  { url: 'wss://avail.api.onfinality.io/public-ws', type: 'ws', priority: 6, provider: 'OnFinality', region: 'global' },
  { url: 'https://avail.api.onfinality.io/public', type: 'http', priority: 6, provider: 'OnFinality', region: 'global' },
  
  { url: 'wss://avail-rpc.lgns.net/', type: 'ws', priority: 7, provider: 'LugaNodes', region: 'global' },
  { url: 'https://avail-rpc.lgns.net/', type: 'http', priority: 7, provider: 'LugaNodes', region: 'global' },
];

class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
  };
  
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds
  private readonly halfOpenMaxCalls = 3;
  private halfOpenCalls = 0;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        this.state = { state: 'CLOSED', failureCount: 0 };
      }
    } else {
      this.state.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.failureCount >= this.failureThreshold) {
      this.state.state = 'OPEN';
      this.state.nextAttemptTime = new Date(Date.now() + this.recoveryTimeout);
    }
  }

  private shouldAttemptReset(): boolean {
    return this.state.nextAttemptTime ? new Date() >= this.state.nextAttemptTime : false;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

class SubscriptionManagerImpl implements SubscriptionManager {
  public subscriptions = new Map<string, any>();

  async subscribe<T>(key: string, callback: (data: T) => void): Promise<() => void> {
    if (this.subscriptions.has(key)) {
      await this.unsubscribe(key);
    }

    // This will be implemented based on the specific subscription type
    // For now, return a placeholder unsubscribe function
    const unsubscribe = () => {
      this.subscriptions.delete(key);
    };

    this.subscriptions.set(key, { callback, unsubscribe });
    return unsubscribe;
  }

  async unsubscribe(key: string): Promise<void> {
    const subscription = this.subscriptions.get(key);
    if (subscription && subscription.unsubscribe) {
      await subscription.unsubscribe();
    }
    this.subscriptions.delete(key);
  }

  async unsubscribeAll(): Promise<void> {
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map(key => 
      this.unsubscribe(key),
    );
    await Promise.all(unsubscribePromises);
  }
}

export class BlockchainService implements BaseService {
  private connections: Map<string, BlockchainConnection> = new Map();
  private currentConnection: BlockchainConnection | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private subscriptionManager: SubscriptionManagerImpl;
  private metrics: ServiceMetrics;
  private lifecycle: ServiceLifecycle;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private retryConfig: RetryConfig;

  constructor() {
    this.subscriptionManager = new SubscriptionManagerImpl();
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      uptime: 0,
    };
    this.lifecycle = {
      status: 'STOPPED',
      restartCount: 0,
    };
    
    // Use existing retry configuration or defaults
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      exponentialFactor: 2,
      jitterEnabled: true,
    };
  }

  async start(): Promise<void> {
    try {
      this.lifecycle.status = 'STARTING';
      this.lifecycle.startedAt = new Date();
      
      logger.info('BlockchainService: Starting service', { component: 'blockchain' });
      
      await this.initializeConnections();
      await this.establishPrimaryConnection();
      
      this.startHealthChecking();
      
      this.lifecycle.status = 'RUNNING';
      logger.info('BlockchainService: Service started successfully', { 
        component: 'blockchain',
        primaryProvider: this.currentConnection?.url, 
      });
      
    } catch (error) {
      this.lifecycle.status = 'ERROR';
      logError(error as Error, { component: 'blockchain', action: 'start' });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.lifecycle.status = 'STOPPING';
      
      logger.info('BlockchainService: Stopping service', { component: 'blockchain' });
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      await this.subscriptionManager.unsubscribeAll();
      await this.disconnectAll();
      
      this.lifecycle.status = 'STOPPED';
      this.lifecycle.stoppedAt = new Date();
      
      logger.info('BlockchainService: Service stopped', { component: 'blockchain' });
      
    } catch (error) {
      this.lifecycle.status = 'ERROR';
      logError(error as Error, { component: 'blockchain', action: 'stop' });
      throw error;
    }
  }

  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      if (!this.currentConnection || !this.currentConnection.isConnected) {
        return {
          healthy: false,
          lastCheck: now,
          error: 'No active connection',
          details: {
            status: this.lifecycle.status,
            connections: this.connections.size,
            metrics: this.metrics,
          },
        };
      }

      // Test the connection with a simple RPC call
      const chainInfo = await this.withRetry(() => 
        this.currentConnection!.api.rpc.system.chain(),
      );

      return {
        healthy: true,
        lastCheck: now,
        details: {
          status: this.lifecycle.status,
          provider: this.currentConnection.url,
          chain: chainInfo.toString(),
          connections: this.connections.size,
          subscriptions: this.subscriptionManager.subscriptions.size,
          metrics: this.metrics,
          uptime: this.lifecycle.startedAt ? now.getTime() - this.lifecycle.startedAt.getTime() : 0,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          status: this.lifecycle.status,
          connections: this.connections.size,
          metrics: this.metrics,
        },
      };
    }
  }

  isHealthy(): boolean {
    return this.lifecycle.status === 'RUNNING' && 
           this.currentConnection !== null && 
           this.currentConnection.isConnected;
  }

  // Public API methods
  async getApi(): Promise<ApiPromise> {
    if (!this.currentConnection) {
      throw new Error('No active blockchain connection');
    }
    return this.currentConnection.api;
  }

  async getChainInfo(): Promise<ChainInfo> {
    const api = await this.getApi();
    
    const [chain, nodeName, nodeVersion, runtimeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.state.getRuntimeVersion(),
    ]);

    return {
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      specName: runtimeVersion.specName.toString(),
      specVersion: runtimeVersion.specVersion.toNumber(),
      implName: runtimeVersion.implName.toString(),
      implVersion: runtimeVersion.implVersion.toNumber(),
      properties: {
        ss58Format: api.registry.chainSS58 || 0,
        tokenDecimals: api.registry.chainDecimals || [18],
        tokenSymbol: api.registry.chainTokens || ['AVAIL'],
      },
    };
  }

  async getLatestBlock(): Promise<BlockData> {
    const api = await this.getApi();
    const hash = await api.rpc.chain.getFinalizedHead();
    return this.getBlock(hash.toString());
  }

  async getBlock(hashOrNumber: string | number): Promise<BlockData> {
    const api = await this.getApi();
    
    const hash = typeof hashOrNumber === 'string' 
      ? hashOrNumber 
      : (await api.rpc.chain.getBlockHash(hashOrNumber)).toString();
    
    const [block, events] = await Promise.all([
      api.rpc.chain.getBlock(hash),
      api.query.system.events.at(hash),
    ]);

    // Transform the data to our BlockData interface
    return {
      hash: block.block.header.hash.toString(),
      number: block.block.header.number.toNumber(),
      parentHash: block.block.header.parentHash.toString(),
      stateRoot: block.block.header.stateRoot.toString(),
      extrinsicsRoot: block.block.header.extrinsicsRoot.toString(),
      timestamp: Date.now(), // This should be extracted from timestamp extrinsic
      extrinsics: [], // Will be populated by ExtrinsicService
      events: [], // Will be populated from events query
    };
  }

  // Subscription methods
  async subscribeToNewHeads(callback: (header: any) => void): Promise<() => void> {
    const api = await this.getApi();
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(callback);
    
    return this.subscriptionManager.subscribe('newHeads', callback).then(() => unsubscribe);
  }

  async subscribeToFinalizedHeads(callback: (header: any) => void): Promise<() => void> {
    const api = await this.getApi();
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(callback);
    
    return this.subscriptionManager.subscribe('finalizedHeads', callback).then(() => unsubscribe);
  }

  // Private methods
  private async initializeConnections(): Promise<void> {
    const providers = this.getPreferredProviders();
    
    for (const provider of providers) {
      try {
        const connection = await this.createConnection(provider);
        this.connections.set(provider.url, connection);
        this.circuitBreakers.set(provider.url, new CircuitBreaker());
        
        logger.info('BlockchainService: Connection initialized', {
          component: 'blockchain',
          provider: provider.provider,
          url: provider.url,
          type: provider.type,
        });
        
      } catch (error) {
        logError(error as Error, {
          component: 'blockchain',
          action: 'initializeConnection',
          provider: provider.provider,
          url: provider.url,
        });
      }
    }
  }

  private async createConnection(provider: ConnectionProvider): Promise<BlockchainConnection> {
    const wsProvider = provider.type === 'ws' 
      ? new WsProvider(provider.url)
      : new HttpProvider(provider.url);

    const api = await ApiPromise.create({ provider: wsProvider });
    await api.isReady;

    return {
      api,
      provider: wsProvider,
      url: provider.url,
      isConnected: true,
      lastActivity: new Date(),
    };
  }

  private async establishPrimaryConnection(): Promise<void> {
    const sortedConnections = Array.from(this.connections.entries())
      .sort(([urlA], [urlB]) => {
        const providerA = AVAIL_RPC_PROVIDERS.find(p => p.url === urlA);
        const providerB = AVAIL_RPC_PROVIDERS.find(p => p.url === urlB);
        return (providerA?.priority || 999) - (providerB?.priority || 999);
      });

    for (const [url, connection] of sortedConnections) {
      try {
        const circuitBreaker = this.circuitBreakers.get(url)!;
        
        await circuitBreaker.execute(async () => {
          // Test the connection
          await connection.api.rpc.system.chain();
          this.currentConnection = connection;
          connection.lastActivity = new Date();
        });

        logger.info('BlockchainService: Primary connection established', {
          component: 'blockchain',
          url,
          provider: AVAIL_RPC_PROVIDERS.find(p => p.url === url)?.provider,
        });
        
        return;
        
      } catch (error) {
        logError(error as Error, {
          component: 'blockchain',
          action: 'establishPrimaryConnection',
          url,
        });
      }
    }

    throw new Error('Failed to establish any blockchain connection');
  }

  private getPreferredProviders(): ConnectionProvider[] {
    // Prefer WebSocket connections for real-time data
    const wsProviders = AVAIL_RPC_PROVIDERS
      .filter(p => p.type === 'ws')
      .sort((a, b) => a.priority - b.priority);
    
    const httpProviders = AVAIL_RPC_PROVIDERS
      .filter(p => p.type === 'http')
      .sort((a, b) => a.priority - b.priority);
    
    // Return WS providers first, then HTTP as fallback
    return [...wsProviders, ...httpProviders];
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        
        // Update metrics
        this.metrics.requestCount++;
        const responseTime = Date.now() - startTime;
        this.metrics.averageResponseTime = 
          (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
          this.metrics.requestCount;
        this.metrics.lastRequestTime = new Date();
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        this.metrics.errorCount++;
        
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.exponentialFactor, attempt - 1),
          this.retryConfig.maxDelay,
        );
        
        const jitter = this.retryConfig.jitterEnabled 
          ? Math.random() * delay * 0.1 
          : 0;
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    
    throw lastError!;
  }

  private startHealthChecking(): void {
    const interval = 30000; // 30 seconds
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getHealth();
      } catch (error) {
        logError(error as Error, { 
          component: 'blockchain', 
          action: 'healthCheck', 
        });
      }
    }, interval);
  }

  private async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        await connection.api.disconnect();
      } catch (error) {
        logError(error as Error, { 
          component: 'blockchain', 
          action: 'disconnect',
          url: connection.url, 
        });
      }
    });
    
    await Promise.all(disconnectPromises);
    this.connections.clear();
    this.currentConnection = null;
  }

  // Getter methods for monitoring
  getMetrics(): ServiceMetrics {
    return { ...this.metrics };
  }

  getLifecycle(): ServiceLifecycle {
    return { ...this.lifecycle };
  }

  getConnections(): Array<{ url: string; isConnected: boolean; provider: string }> {
    return Array.from(this.connections.entries()).map(([url, connection]) => ({
      url,
      isConnected: connection.isConnected,
      provider: AVAIL_RPC_PROVIDERS.find(p => p.url === url)?.provider || 'Unknown',
    }));
  }

  getCircuitBreakerStates(): Array<{ url: string; state: CircuitBreakerState }> {
    return Array.from(this.circuitBreakers.entries()).map(([url, breaker]) => ({
      url,
      state: breaker.getState(),
    }));
  }
}

// Singleton instance
export const blockchainService = new BlockchainService(); 