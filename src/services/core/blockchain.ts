import { ApiPromise } from '@polkadot/api';
import { logger, logError } from '../../utils/logger';
import {
  BaseService,
  ServiceHealth,
} from '../types/service';
import {
  SubscriptionManager,
  BlockData,
  ChainInfo,
} from '../types/blockchain';
import { ConnectionManager, createConnectionManager } from './connection-manager';

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

/**
 * BlockchainService - Orchestrates blockchain operations using separated concerns
 * 
 * Responsibilities:
 * - Domain-specific blockchain operations (getLatestBlock, getChainInfo, etc.)
 * - Subscription management for real-time data
 * - Coordinate ConnectionManager
 * - Provide clean API interface for domain services
 */
export class BlockchainService implements BaseService {
  private connectionManager: ConnectionManager;
  private subscriptionManager: SubscriptionManagerImpl;

  constructor() {
    // Create connection manager instance
    this.connectionManager = createConnectionManager();
    this.subscriptionManager = new SubscriptionManagerImpl();
  }

  /**
   * Start the blockchain service
   */
  async start(): Promise<void> {
    try {
      logger.info('BlockchainService: Starting service', { component: 'blockchain' });
      
      // Initialize connection manager
      await this.connectionManager.initialize();
      
      logger.info('BlockchainService: Service started successfully', { 
        component: 'blockchain',
        connections: this.connectionManager.getConnections().length,
      });
      
    } catch (error) {
      logError(error as Error, { component: 'blockchain', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the blockchain service
   */
  async stop(): Promise<void> {
    try {
      logger.info('BlockchainService: Stopping service', { component: 'blockchain' });
      
      // Unsubscribe from all subscriptions
      await this.subscriptionManager.unsubscribeAll();
      
      // Disconnect from blockchain
      await this.connectionManager.disconnect();
      
      logger.info('BlockchainService: Service stopped', { component: 'blockchain' });
      
    } catch (error) {
      logError(error as Error, { component: 'blockchain', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Get health from connection manager
      const connectionHealth = await this.connectionManager.getHealth();
      
      return {
        healthy: connectionHealth.healthy,
        lastCheck: now,
        error: !connectionHealth.healthy ? 'Connection issues' : undefined,
        details: {
          connection: connectionHealth,
          subscriptions: this.subscriptionManager.subscriptions.size,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          subscriptions: this.subscriptionManager.subscriptions.size,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    // Simple health check based on connection manager state
    return this.connectionManager.getConnections().some(conn => conn.isConnected);
  }

  // Domain-specific blockchain operations

  /**
   * Get API instance
   */
  async getApi(): Promise<ApiPromise> {
    const connection = await this.connectionManager.getHealthyConnection();
    return connection.api;
  }

  /**
   * Get chain information
   */
  async getChainInfo(): Promise<ChainInfo> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    
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

  /**
   * Get latest finalized block
   */
  async getLatestBlock(): Promise<BlockData> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    const hash = await api.rpc.chain.getFinalizedHead();
    return this.getBlock(hash.toString());
  }

  /**
   * Get specific block by hash or number
   */
  async getBlock(hashOrNumber: string | number): Promise<BlockData> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    
    const hash = typeof hashOrNumber === 'string' 
      ? hashOrNumber 
      : (await api.rpc.chain.getBlockHash(hashOrNumber)).toString();
    
    const [block] = await Promise.all([
      api.rpc.chain.getBlock(hash),
      api.query.system.events.at(hash), // Events will be processed by domain services
    ]);

    // Transform the data to our BlockData interface
    return {
      hash: hash, // Use the actual block hash, not header.hash
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

  /**
   * Subscribe to new block headers
   */
  async subscribeToNewHeads(callback: (header: any) => void): Promise<() => void> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(callback);
    
    return this.subscriptionManager.subscribe('newHeads', callback).then(() => unsubscribe);
  }

  /**
   * Subscribe to finalized block headers
   */
  async subscribeToFinalizedHeads(callback: (header: any) => void): Promise<() => void> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(callback);
    
    return this.subscriptionManager.subscribe('finalizedHeads', callback).then(() => unsubscribe);
  }

  // Monitoring and management methods

  /**
   * Get connection metrics
   */
  getConnectionMetrics() {
    return this.connectionManager.getMetrics();
  }

  /**
   * Get connection details
   */
  getConnections() {
    return this.connectionManager.getConnections();
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates() {
    return this.connectionManager.getCircuitBreakerStates();
  }

  /**
   * Force connection provider switch
   */
  async switchProvider(reason: string) {
    return this.connectionManager.switchProvider(reason);
  }
}

// Factory function for dependency injection
export const createBlockchainService = (): BlockchainService => {
  return new BlockchainService();
};

// Class exported above with declaration
