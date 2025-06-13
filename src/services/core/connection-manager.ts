import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { logger, logError } from '../../utils/logger';
import {
  ConnectionProvider,
  CircuitBreakerState,
  ServiceHealth,
  RetryConfig,
} from '../types/service';
import { BlockchainConnection } from '../types/blockchain';
import { availRpc, availTypes } from '../../config/avail-types';

// Avail RPC Providers from Providers.md
const AVAIL_RPC_PROVIDERS: ConnectionProvider[] = [
  // Official Avail endpoint (highest priority)
  { url: 'wss://mainnet-rpc.avail.so/ws', type: 'ws', priority: 1, provider: 'Avail Official', region: 'global' },
  { url: 'https://mainnet-rpc.avail.so', type: 'http', priority: 1, provider: 'Avail Official', region: 'global' },
  
  // High-performance providers
  { url: 'wss://avail-mainnet.public.blastapi.io/', type: 'ws', priority: 2, provider: 'BlastAPI', region: 'global' },
  { url: 'https://avail-mainnet.public.blastapi.io/', type: 'http', priority: 2, provider: 'BlastAPI', region: 'global' },
  
  { url: 'wss://mainnet.avail-rpc.com/', type: 'ws', priority: 3, provider: 'Ankr', region: 'global' },
  // { url: 'https://mainnet.avail-rpc.com/', type: 'http', priority: 3, provider: 'Ankr', region: 'global' },
  
  // // Regional providers
  // { url: 'wss://avail-us.brightlystake.com', type: 'ws', priority: 4, provider: 'BrightlyStake', region: 'us' },
  // { url: 'https://avail-us.brightlystake.com', type: 'http', priority: 4, provider: 'BrightlyStake', region: 'us' },
  
  // { url: 'wss://rpc-avail.globalstake.io', type: 'ws', priority: 5, provider: 'GlobalStake', region: 'global' },
  // { url: 'https://rpc-avail.globalstake.io', type: 'http', priority: 5, provider: 'GlobalStake', region: 'global' },
  
  // // Community providers
  // { url: 'wss://avail.api.onfinality.io/public-ws', type: 'ws', priority: 6, provider: 'OnFinality', region: 'global' },
  // { url: 'https://avail.api.onfinality.io/public', type: 'http', priority: 6, provider: 'OnFinality', region: 'global' },
  
  // { url: 'wss://avail-rpc.lgns.net/', type: 'ws', priority: 7, provider: 'LugaNodes', region: 'global' },
  // { url: 'https://avail-rpc.lgns.net/', type: 'http', priority: 7, provider: 'LugaNodes', region: 'global' },
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

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  currentProvider?: string;
  lastFailover?: Date;
  connectionAttempts: number;
}

/**
 * ConnectionManager - Handles RPC connection management, failover, and circuit breaker logic
 * 
 * Responsibilities:
 * - Manage multiple RPC providers with priority-based failover
 * - Circuit breaker pattern for failed connections
 * - Connection pooling and health tracking
 * - Provider selection and switching logic
 */
export class ConnectionManager {
  private connections: Map<string, BlockchainConnection> = new Map();
  private currentConnection: BlockchainConnection | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private connectionMetrics: ConnectionMetrics;
  private retryConfig: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      exponentialFactor: 2,
      jitterEnabled: true,
      ...retryConfig,
    };

    this.connectionMetrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      connectionAttempts: 0,
    };
  }

  /**
   * Initialize all RPC connections
   */
  async initialize(): Promise<void> {
    logger.info('ConnectionManager: Initializing connections', { component: 'connection-manager' });
    
    const providers = this.getPreferredProviders();
    
    // Create connection promises with individual timeouts for each provider
    const connectionPromises = providers.map(async (provider) => {
      try {
        // Create connection with 10-second timeout
        const connection = await Promise.race([
          this.createConnection(provider),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000),
          ),
        ]);
        
        return { provider, connection, success: true };
      } catch (error) {
        return { provider, error, success: false };
      }
    });

    // Attempt all connections in parallel
    const results = await Promise.allSettled(connectionPromises);
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { provider, connection, success, error } = result.value;
        
        if (success && connection) {
          // Successfully connected
          this.connections.set(provider.url, connection);
          this.circuitBreakers.set(provider.url, new CircuitBreaker());
          this.connectionMetrics.totalConnections++;
          
          logger.info('ConnectionManager: Connection initialized', {
            component: 'connection-manager',
            provider: provider.provider,
            url: provider.url,
            type: provider.type,
          });
        } else {
          // Connection failed
          this.connectionMetrics.failedConnections++;
          logError(error as Error, {
            component: 'connection-manager',
            action: 'initializeConnection',
            provider: provider.provider,
            url: provider.url,
          });
        }
      } else {
        // Promise itself was rejected (shouldn't happen with our error handling, but just in case)
        logger.error('ConnectionManager: Unexpected promise rejection', {
          component: 'connection-manager',
          error: result.reason,
        });
      }
    }

    await this.establishPrimaryConnection();
  }

  /**
   * Get a healthy connection (current primary connection)
   */
  async getHealthyConnection(): Promise<BlockchainConnection> {
    if (!this.currentConnection || !this.currentConnection.isConnected) {
      await this.establishPrimaryConnection();
    }

    if (!this.currentConnection) {
      throw new Error('No healthy connection available');
    }

    this.currentConnection.lastActivity = new Date();
    return this.currentConnection;
  }

  /**
   * Switch to a different provider (for failover scenarios)
   */
  async switchProvider(reason: string): Promise<void> {
    logger.info('ConnectionManager: Switching provider', { 
      component: 'connection-manager',
      reason,
      currentProvider: this.currentConnection?.url,
    });

    this.connectionMetrics.lastFailover = new Date();
    await this.establishPrimaryConnection();
  }

  /**
   * Test connection health
   */
  async testConnection(connection: BlockchainConnection): Promise<boolean> {
    try {
      await connection.api.rpc.system.chain();
      connection.lastActivity = new Date();
      return true;
    } catch {
      connection.isConnected = false;
      return false;
    }
  }

  /**
   * Get connection health status
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      if (!this.currentConnection || !this.currentConnection.isConnected) {
        return {
          healthy: false,
          lastCheck: now,
          error: 'No active connection',
          details: {
            metrics: this.connectionMetrics,
            totalProviders: AVAIL_RPC_PROVIDERS.length,
            activeConnections: this.connectionMetrics.activeConnections,
          },
        };
      }

      // Test the current connection
      const isHealthy = await this.testConnection(this.currentConnection);
      
      if (!isHealthy) {
        // Try to failover to another connection
        await this.switchProvider('health_check_failed');
      }

      return {
        healthy: this.currentConnection !== null && this.currentConnection.isConnected,
        lastCheck: now,
        details: {
          currentProvider: this.currentConnection?.url,
          providerName: AVAIL_RPC_PROVIDERS.find(p => p.url === this.currentConnection?.url)?.provider,
          metrics: this.connectionMetrics,
          totalConnections: this.connections.size,
          circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([url, breaker]) => ({
            url: url.substring(0, 30) + '...',
            state: breaker.getState().state,
            failures: breaker.getState().failureCount,
          })),
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          metrics: this.connectionMetrics,
        },
      };
    }
  }

  /**
   * Disconnect all connections
   */
  async disconnect(): Promise<void> {
    logger.info('ConnectionManager: Disconnecting all connections', { component: 'connection-manager' });
    
    const disconnectPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        await connection.api.disconnect();
      } catch (error) {
        logError(error as Error, { 
          component: 'connection-manager', 
          action: 'disconnect',
          url: connection.url, 
        });
      }
    });
    
    await Promise.all(disconnectPromises);
    this.connections.clear();
    this.currentConnection = null;
    this.connectionMetrics.activeConnections = 0;
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  /**
   * Get connection details for monitoring
   */
  getConnections(): Array<{ url: string; isConnected: boolean; provider: string }> {
    return Array.from(this.connections.entries()).map(([url, connection]) => ({
      url,
      isConnected: connection.isConnected,
      provider: AVAIL_RPC_PROVIDERS.find(p => p.url === url)?.provider || 'Unknown',
    }));
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): Array<{ url: string; state: CircuitBreakerState }> {
    return Array.from(this.circuitBreakers.entries()).map(([url, breaker]) => ({
      url,
      state: breaker.getState(),
    }));
  }

  // Private methods

  private async createConnection(provider: ConnectionProvider): Promise<BlockchainConnection> {
    this.connectionMetrics.connectionAttempts++;
    
    const wsProvider = provider.type === 'ws' 
      ? new WsProvider(provider.url)
      : new HttpProvider(provider.url);

    // Create API with Avail-specific types and error handling
    const api = await ApiPromise.create({ 
      provider: wsProvider,
      types: availTypes,
      rpc: availRpc,
      // Handle runtime compatibility issues gracefully
      throwOnConnect: false,
      throwOnUnknown: false,
      // Skip unknown call indices instead of throwing errors
      noInitWarn: true,
    });
    
    await api.isReady;

    const connection: BlockchainConnection = {
      api,
      provider: wsProvider,
      url: provider.url,
      isConnected: true,
      lastActivity: new Date(),
    };

    this.connectionMetrics.activeConnections++;
    return connection;
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
          this.connectionMetrics.currentProvider = AVAIL_RPC_PROVIDERS.find(p => p.url === url)?.provider;
        });

        logger.info('ConnectionManager: Primary connection established', {
          component: 'connection-manager',
          url,
          provider: AVAIL_RPC_PROVIDERS.find(p => p.url === url)?.provider,
        });
        
        return;
        
      } catch (error) {
        logError(error as Error, {
          component: 'connection-manager',
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
}

// Factory function for dependency injection
export const createConnectionManager = (): ConnectionManager => {
  return new ConnectionManager();
};

// Class exported above with declaration 