import { ApiPromise } from '@polkadot/api';
import { WsProvider } from '@polkadot/rpc-provider';
import { EventEmitter } from 'events';
import config from '../../config';
import { logError, rpcLogger } from '../../utils/logger';
import {
  RPCConnection,
  HealthCheckResult,
  RPCConnectionConfig,
} from '../../types/rpc';

export class RPCConnectionManager extends EventEmitter {
  private connections: Map<string, RPCConnection> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private config: RPCConnectionConfig;
  private isShuttingDown = false;

  constructor() {
    super();
    this.config = config.dataSources.rpc;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('connection:established', (connection: RPCConnection) => {
      rpcLogger.info(`RPC connection established: ${connection.endpoint}`, {
        connectionId: connection.id,
        endpoint: connection.endpoint,
      });
    });

    this.on('connection:lost', (connection: RPCConnection) => {
      logError(new Error('RPC connection lost'), {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        lastError: connection.lastError?.message,
      });
    });

    this.on('connection:error', (connection: RPCConnection, error: Error) => {
      logError(error, {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        component: 'rpc-connection',
      });
    });
  }

  async initialize(): Promise<void> {
    rpcLogger.info('Initializing RPC Connection Manager', {
      endpoints: this.config.endpoints,
      maxConnections: this.config.maxConnections,
    });

    // Create connections to all endpoints
    const connectionPromises = this.config.endpoints
      .slice(0, this.config.maxConnections)
      .map((endpoint, index) => this.createConnection(endpoint, index));

    try {
      await Promise.allSettled(connectionPromises);
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      rpcLogger.info('RPC Connection Manager initialized', {
        activeConnections: this.getActiveConnections().length,
        totalConnections: this.connections.size,
      });
    } catch (error) {
      logError(error as Error, { component: 'rpc-connection-manager', action: 'initialize' });
      throw error;
    }
  }

  private async createConnection(endpoint: string, index: number): Promise<RPCConnection> {
    const connectionId = `rpc-${index}-${Date.now()}`;
    
    const connection: RPCConnection = {
      id: connectionId,
      provider: new WsProvider(endpoint, this.config.connectionPoolSize),
      api: null as any, // Will be set after creation
      endpoint,
      isConnected: false,
      isHealthy: false,
      lastHealthCheck: new Date(),
      connectionAttempts: 0,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        uptime: 0,
        reconnections: 0,
      },
    };

    try {
      await this.connectToEndpoint(connection);
      this.connections.set(connectionId, connection);
      return connection;
    } catch (error) {
      logError(error as Error, {
        connectionId,
        endpoint,
        component: 'rpc-connection',
        action: 'create',
      });
      throw error;
    }
  }

  private async connectToEndpoint(connection: RPCConnection): Promise<void> {
    const startTime = Date.now();
    connection.connectionAttempts++;

    try {
      // Configure provider options
      connection.provider.on('connected', () => {
        connection.isConnected = true;
        connection.metrics.uptime = Date.now();
        this.emit('connection:established', connection);
      });

      connection.provider.on('disconnected', () => {
        connection.isConnected = false;
        this.emit('connection:lost', connection);
        this.scheduleReconnection(connection);
      });

      connection.provider.on('error', (error: Error) => {
        connection.lastError = error;
        this.emit('connection:error', connection, error);
      });

      // Create API instance
      connection.api = await ApiPromise.create({
        provider: connection.provider,
        throwOnConnect: true,
      });

      await connection.api.isReady;

      connection.isConnected = true;
      connection.isHealthy = true;
      connection.lastHealthCheck = new Date();

      rpcLogger.debug('RPC connection established', {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        duration: Date.now() - startTime,
        attempts: connection.connectionAttempts,
      });

    } catch (error) {
      connection.lastError = error as Error;
      connection.isConnected = false;
      connection.isHealthy = false;
      
      logError(error as Error, {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        attempts: connection.connectionAttempts,
      });

      throw error;
    }
  }

  private scheduleReconnection(connection: RPCConnection): void {
    if (this.isShuttingDown || connection.connectionAttempts >= this.config.reconnectAttempts) {
      logError(new Error('Max reconnection attempts reached'), {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        attempts: connection.connectionAttempts,
      });
      return;
    }

    const delay = Math.min(
      this.config.retryDelay * Math.pow(2, connection.connectionAttempts - 1),
      this.config.maxRetryDelay,
    );

    const timeoutId = setTimeout(async () => {
      try {
        rpcLogger.info('Attempting to reconnect', {
          connectionId: connection.id,
          endpoint: connection.endpoint,
          attempt: connection.connectionAttempts + 1,
        });

        await this.connectToEndpoint(connection);
        connection.metrics.reconnections++;
        
        this.reconnectTimeouts.delete(connection.id);
      } catch (error) {
        logError(error as Error, {
          connectionId: connection.id,
          endpoint: connection.endpoint,
          component: 'rpc-reconnection',
        });
      }
    }, delay);

    this.reconnectTimeouts.set(connection.id, timeoutId);
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.connections.values()).map(connection =>
      this.checkConnectionHealth(connection),
    );

    try {
      await Promise.allSettled(healthPromises);
    } catch (error) {
      logError(error as Error, { component: 'rpc-health-check' });
    }
  }

  private async checkConnectionHealth(connection: RPCConnection): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      if (!connection.isConnected || !connection.api) {
        throw new Error('Connection not established');
      }

      // Perform a simple health check by getting the latest block number
      const blockNumber = await connection.api.rpc.chain.getHeader();
      const responseTime = Date.now() - startTime;

      connection.isHealthy = true;
      connection.lastHealthCheck = new Date();

      return {
        endpoint: connection.endpoint,
        isHealthy: true,
        responseTime,
        blockNumber: blockNumber.number.toNumber(),
        timestamp: new Date(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      connection.isHealthy = false;
      connection.lastError = error as Error;

      logError(error as Error, {
        connectionId: connection.id,
        endpoint: connection.endpoint,
        component: 'rpc-health-check',
      });

      return {
        endpoint: connection.endpoint,
        isHealthy: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }

  getHealthyConnection(): RPCConnection | null {
    const healthyConnections = this.getActiveConnections();
    
    if (healthyConnections.length === 0) {
      return null;
    }

    // Return connection with best performance metrics
    return healthyConnections.reduce((best, current) => {
      if (current.metrics.averageResponseTime < best.metrics.averageResponseTime) {
        return current;
      }
      return best;
    });
  }

  getActiveConnections(): RPCConnection[] {
    return Array.from(this.connections.values()).filter(
      connection => connection.isConnected && connection.isHealthy,
    );
  }

  getAllConnections(): RPCConnection[] {
    return Array.from(this.connections.values());
  }

  async getConnectionById(id: string): Promise<RPCConnection | null> {
    return this.connections.get(id) || null;
  }

  updateConnectionMetrics(connectionId: string, responseTime: number, success: boolean): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.metrics.totalRequests++;
    connection.metrics.lastRequestTime = new Date();

    if (success) {
      connection.metrics.successfulRequests++;
    } else {
      connection.metrics.failedRequests++;
    }

    // Update average response time using exponential moving average
    const alpha = 0.1; // Smoothing factor
    connection.metrics.averageResponseTime = 
      alpha * responseTime + (1 - alpha) * connection.metrics.averageResponseTime;
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    activeConnections: number;
    totalConnections: number;
    healthChecks: HealthCheckResult[];
  }> {
    const activeConnections = this.getActiveConnections();
    const healthChecks = await Promise.all(
      Array.from(this.connections.values()).map(connection =>
        this.checkConnectionHealth(connection),
      ),
    );

    return {
      healthy: activeConnections.length > 0,
      activeConnections: activeConnections.length,
      totalConnections: this.connections.size,
      healthChecks,
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    rpcLogger.info('Shutting down RPC Connection Manager');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Clear reconnection timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();

    // Disconnect all connections
    const disconnectPromises = Array.from(this.connections.values()).map(async connection => {
      try {
        if (connection.api) {
          await connection.api.disconnect();
        }
        if (connection.provider) {
          await connection.provider.disconnect();
        }
      } catch (error) {
        logError(error as Error, {
          connectionId: connection.id,
          endpoint: connection.endpoint,
          component: 'rpc-shutdown',
        });
      }
    });

    await Promise.allSettled(disconnectPromises);
    this.connections.clear();

    rpcLogger.info('RPC Connection Manager shutdown complete');
  }
}