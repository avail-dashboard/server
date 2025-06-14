import { initialize } from "avail-js-sdk/chain";
import { ApiPromise } from "@polkadot/api";
import { logger, logError } from '../../utils/logger';
import {
  ConnectionProvider,
  CircuitBreakerState,
  ServiceHealth,
  RetryConfig,
} from '../types/service';

export interface AvailConnection {
  api: ApiPromise;
  url: string;
  isConnected: boolean;
  lastActivity: Date;
  connectionType: 'avail-sdk';
}

export interface AvailConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  currentProvider?: string;
  lastFailover?: Date;
  connectionAttempts: number;
}

/**
 * AvailConnectionManager - Manages connections using avail-js-sdk
 * 
 * This is parallel to the existing ConnectionManager but specifically
 * uses avail-js-sdk for better handling of Avail-specific operations
 */
export class AvailConnectionManager {
  private connections: Map<string, AvailConnection> = new Map();
  private currentConnection: AvailConnection | null = null;
  private circuitBreakers: Map<string, AvailCircuitBreaker> = new Map();
  private connectionMetrics: AvailConnectionMetrics;
  private retryConfig: RetryConfig;
  private providers: ConnectionProvider[];

  constructor(providers: ConnectionProvider[], retryConfig?: Partial<RetryConfig>) {
    this.providers = providers;
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
   * Initialize all connections using avail-js-sdk
   */
  async initialize(): Promise<void> {
    logger.info('AvailConnectionManager: Initializing connections', { 
      component: 'avail-connection-manager',
      providers: this.providers.length 
    });
    
    // Create connection promises with individual timeouts
    const connectionPromises = this.providers.map(async (provider) => {
      try {
        const connection = await Promise.race([
          this.createAvailConnection(provider),
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
          this.connections.set(provider.url, connection);
          this.circuitBreakers.set(provider.url, new AvailCircuitBreaker());
          this.connectionMetrics.totalConnections++;
          
          logger.info('AvailConnectionManager: Connection initialized', {
            component: 'avail-connection-manager',
            provider: provider.provider,
            url: provider.url,
            type: provider.type,
          });
        } else {
          this.connectionMetrics.failedConnections++;
          logError(error as Error, {
            component: 'avail-connection-manager',
            action: 'initializeConnection',
            provider: provider.provider,
            url: provider.url,
          });
        }
      }
    }

    await this.establishPrimaryConnection();
  }

  /**
   * Get a healthy avail-sdk connection
   */
  async getHealthyConnection(): Promise<AvailConnection> {
    if (!this.currentConnection || !this.currentConnection.isConnected) {
      await this.establishPrimaryConnection();
    }

    if (!this.currentConnection) {
      throw new Error('No healthy avail-sdk connection available');
    }

    this.currentConnection.lastActivity = new Date();
    return this.currentConnection;
  }

  /**
   * Switch to a different provider (for failover scenarios)
   */
  async switchProvider(reason: string): Promise<void> {
    logger.info('AvailConnectionManager: Switching provider', { 
      component: 'avail-connection-manager',
      reason,
      currentProvider: this.currentConnection?.url,
    });

    this.connectionMetrics.lastFailover = new Date();
    await this.establishPrimaryConnection();
  }

  /**
   * Test connection health
   */
  async testConnection(connection: AvailConnection): Promise<boolean> {
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
          error: 'No active avail-sdk connection',
          details: {
            metrics: this.connectionMetrics,
            totalProviders: this.providers.length,
            activeConnections: this.connectionMetrics.activeConnections,
          },
        };
      }

      // Test the current connection
      const isHealthy = await this.testConnection(this.currentConnection);
      
      if (!isHealthy) {
        await this.switchProvider('health_check_failed');
      }

      return {
        healthy: this.currentConnection !== null && this.currentConnection.isConnected,
        lastCheck: now,
        details: {
          currentProvider: this.currentConnection?.url,
          providerName: this.providers.find(p => p.url === this.currentConnection?.url)?.provider,
          metrics: this.connectionMetrics,
          totalConnections: this.connections.size,
          connectionType: 'avail-sdk',
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
    logger.info('AvailConnectionManager: Disconnecting all connections', { 
      component: 'avail-connection-manager' 
    });
    
    const disconnectPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        await connection.api.disconnect();
      } catch (error) {
        logError(error as Error, { 
          component: 'avail-connection-manager', 
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
  getMetrics(): AvailConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  // Private methods

  /**
   * Create connection using avail-js-sdk
   */
  private async createAvailConnection(provider: ConnectionProvider): Promise<AvailConnection> {
    this.connectionMetrics.connectionAttempts++;
    
    logger.debug('Creating avail-sdk connection', {
      component: 'avail-connection-manager',
      provider: provider.provider,
      url: provider.url
    });

    const api = await initialize(provider.url);
    
    const connection: AvailConnection = {
      api,
      url: provider.url,
      isConnected: true,
      lastActivity: new Date(),
      connectionType: 'avail-sdk',
    };

    this.connectionMetrics.activeConnections++;
    return connection;
  }

  /**
   * Establish primary connection
   */
  private async establishPrimaryConnection(): Promise<void> {
    const sortedConnections = Array.from(this.connections.entries())
      .sort(([urlA], [urlB]) => {
        const providerA = this.providers.find(p => p.url === urlA);
        const providerB = this.providers.find(p => p.url === urlB);
        return (providerA?.priority || 999) - (providerB?.priority || 999);
      });

    for (const [url, connection] of sortedConnections) {
      try {
        const circuitBreaker = this.circuitBreakers.get(url)!;
        
        await circuitBreaker.execute(async () => {
          await connection.api.rpc.system.chain();
          this.currentConnection = connection;
          connection.lastActivity = new Date();
          this.connectionMetrics.currentProvider = this.providers.find(p => p.url === url)?.provider;
        });

        logger.info('AvailConnectionManager: Primary connection established', {
          component: 'avail-connection-manager',
          url,
          provider: this.providers.find(p => p.url === url)?.provider,
        });
        
        return;
        
      } catch (error) {
        logError(error as Error, {
          component: 'avail-connection-manager',
          action: 'establishPrimaryConnection',
          url,
        });
      }
    }

    throw new Error('Failed to establish any avail-sdk connection');
  }
}

/**
 * Circuit breaker for avail-sdk connections
 */
class AvailCircuitBreaker {
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
        throw new Error('Avail SDK circuit breaker is OPEN');
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

// Factory function for dependency injection
export const createAvailConnectionManager = (providers: ConnectionProvider[]): AvailConnectionManager => {
  return new AvailConnectionManager(providers);
};