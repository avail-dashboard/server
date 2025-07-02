import { logger } from '../../utils/logger';
import { AvailConnectionManager } from './avail-connection-manager';
import { 
  BaseService, 
  ServiceHealth, 
  ConnectionProvider,
} from '../types/service';
import {
  SubscriptionManager,
  ChainInfo,
  BlockData,
} from '../types/blockchain';
import { cache, CacheKeys, CACHE_TTL } from '../../utils/cache';
import { config } from '../../config';

// Default Avail RPC Providers for avail-sdk
const DEFAULT_AVAIL_PROVIDERS: ConnectionProvider[] = [
  { url: 'wss://mainnet-rpc.avail.so/ws', type: 'ws', priority: 1, provider: 'Avail Official (SDK)', region: 'global' },
  { url: 'wss://avail-mainnet.public.blastapi.io/', type: 'ws', priority: 2, provider: 'BlastAPI (SDK)', region: 'global' },
  { url: 'wss://mainnet.avail-rpc.com/', type: 'ws', priority: 3, provider: 'Ankr (SDK)', region: 'global' },
];

class AvailSubscriptionManager implements SubscriptionManager {
  public subscriptions = new Map<string, any>();

  async subscribe<T>(key: string, callback: (data: T) => void): Promise<() => void> {
    if (this.subscriptions.has(key)) {
      await this.unsubscribe(key);
    }

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
 * AvailBlockchainService - Avail-SDK based blockchain operations
 * 
 * This service provides native Avail blockchain operations using avail-js-sdk
 * with enhanced support for Avail-specific features like data submissions
 */
export class AvailBlockchainService implements BaseService {
  private connectionManager: AvailConnectionManager;
  private subscriptionManager: AvailSubscriptionManager;

  constructor(providers?: ConnectionProvider[]) {
    this.connectionManager = new AvailConnectionManager(providers || DEFAULT_AVAIL_PROVIDERS);
    this.subscriptionManager = new AvailSubscriptionManager();
  }

  /**
   * Start the avail blockchain service
   */
  async start(): Promise<void> {
    try {
      logger.info('AvailBlockchainService: Starting service', { component: 'avail-blockchain' });
      
      await this.connectionManager.initialize();
      
      logger.info('AvailBlockchainService: Service started successfully', { component: 'avail-blockchain' });
      
    } catch (error) {
      logger.error('AvailBlockchainService: Error starting service', { component: 'avail-blockchain', error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Stop the avail blockchain service
   */
  async stop(): Promise<void> {
    try {
      logger.info('AvailBlockchainService: Stopping service', { component: 'avail-blockchain' });
      
      await this.subscriptionManager.unsubscribeAll();
      await this.connectionManager.disconnect();
      
      logger.info('AvailBlockchainService: Service stopped', { component: 'avail-blockchain' });
      
    } catch (error) {
      logger.error('AvailBlockchainService: Error stopping service', { component: 'avail-blockchain', error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      const connectionHealth = await this.connectionManager.getHealth();
      
      return {
        healthy: connectionHealth.healthy,
        lastCheck: now,
        error: !connectionHealth.healthy ? 'Avail SDK connection issues' : undefined,
        details: {
          connection: connectionHealth,
          subscriptions: this.subscriptionManager.subscriptions.size,
          sdkType: 'avail-js-sdk',
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          subscriptions: this.subscriptionManager.subscriptions.size,
          sdkType: 'avail-js-sdk',
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    // Check if we have an active connection
    try {
      const metrics = this.connectionManager.getMetrics();
      return metrics.activeConnections > 0;
    } catch {
      return false;
    }
  }

  // Domain-specific blockchain operations using avail-sdk

  /**
   * Get API instance (avail-sdk version)
   */
  async getApi(): Promise<any> {
    const connection = await this.connectionManager.getHealthyConnection();
    return connection.api;
  }

  /**
   * Get chain information using avail-sdk
   * Cached for 30 minutes as runtime metadata rarely changes
   */
  async getChainInfo(): Promise<ChainInfo> {
    // Try cache first
    if (config.cache.redis.enabled) {
      const cacheKey = CacheKeys.runtimeMetadata();
      const cached = await cache.get<ChainInfo>(cacheKey);
      
      if (cached) {
        logger.debug('Chain info cache hit', { component: 'avail-blockchain' });
        return cached;
      }
    }
    
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    
    logger.debug('Getting chain info via avail-sdk', { component: 'avail-blockchain' });
    
    const [chain, nodeName, nodeVersion, runtimeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.state.getRuntimeVersion(),
    ]);

    const chainInfo = {
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

    // Cache the chain info for 30 minutes
    if (config.cache.redis.enabled) {
      const cacheKey = CacheKeys.runtimeMetadata();
      await cache.set(cacheKey, chainInfo, CACHE_TTL.RUNTIME_METADATA);
      
      logger.debug('Chain info cached', { 
        component: 'avail-blockchain',
        ttl: CACHE_TTL.RUNTIME_METADATA,
      });
    }

    return chainInfo;
  }

  /**
   * Get latest finalized block using avail-sdk
   */
  async getLatestBlock(): Promise<BlockData> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    const hash = await api.rpc.chain.getFinalizedHead();
    return this.getBlock(hash.toString());
  }

  /**
   * Get specific block by hash or number using avail-sdk
   * This method provides enhanced data submission handling with Avail SDK
   * Includes intelligent caching for old blocks (>100 blocks old)
   */
  async getBlock(hashOrNumber: string | number): Promise<BlockData> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    
    const hash = typeof hashOrNumber === 'string' 
      ? hashOrNumber 
      : (await api.rpc.chain.getBlockHash(hashOrNumber)).toString();
    
    // Try cache first for old blocks
    if (config.cache.redis.enabled && typeof hashOrNumber === 'number') {
      const latestBlock = await this.getLatestBlock();
      const blockAge = latestBlock.number - hashOrNumber;
      
      if (blockAge > 100) {
        const cacheKey = CacheKeys.oldBlock(hashOrNumber);
        const cached = await cache.get<BlockData>(cacheKey);
        
        if (cached) {
          logger.debug('Block cache hit', {
            component: 'avail-blockchain',
            blockNumber: hashOrNumber,
            blockAge,
          });
          return cached;
        }
      }
    }
    
    logger.debug('Fetching block via avail-sdk', { 
      component: 'avail-blockchain',
      hashOrNumber,
      hash: hash.substring(0, 20) + '...',
    });
    
    const [block, events, header] = await Promise.all([
      api.rpc.chain.getBlock(hash),
      api.query.system.events.at(hash),
      api.derive.chain.getHeader(hash),
    ]);

    // Extract block author from the extended header
    let blockAuthor: string | undefined;
    try {
      if (header && header.author) {
        blockAuthor = header.author.toString();
        logger.debug('Block author extracted', {
          component: 'avail-blockchain',
          blockNumber: header.number.toNumber(),
          author: blockAuthor ? blockAuthor.substring(0, 20) + '...' : 'unknown',
        });
      }
    } catch (error) {
      logger.debug('Could not extract block author', {
        component: 'avail-blockchain',
        blockNumber: block.block.header.number.toNumber(),
        error: (error as Error).message,
      });
    }

    // Extract more complete information using avail-sdk capabilities
    const blockData: BlockData = {
      hash: hash, // Use the actual block hash, not header.hash
      number: block.block.header.number.toNumber(),
      parentHash: block.block.header.parentHash.toString(),
      stateRoot: block.block.header.stateRoot.toString(),
      extrinsicsRoot: block.block.header.extrinsicsRoot.toString(),
      timestamp: Date.now(), // Should be extracted from timestamp extrinsic
      validator: blockAuthor, // Add the extracted block author
      extrinsics: this.extractExtrinsicsData(block.block.extrinsics),
      events: this.extractEventsData(events as any),
    };

    // Enhanced processing for avail-specific features
    logger.debug('Block fetched successfully via avail-sdk', {
      component: 'avail-blockchain',
      blockNumber: blockData.number,
      extrinsicsCount: block.block.extrinsics.length,
      eventsCount: Array.isArray(events) ? events.length : 0,
      hasAuthor: !!blockData.validator,
    });

    // Cache old blocks (>100 blocks old) for 24 hours
    if (config.cache.redis.enabled && typeof hashOrNumber === 'number') {
      const latestBlock = await this.getLatestBlock();
      const blockAge = latestBlock.number - blockData.number;
      
      if (blockAge > 100) {
        const cacheKey = CacheKeys.oldBlock(hashOrNumber);
        await cache.set(cacheKey, blockData, CACHE_TTL.OLD_BLOCKS);
        
        logger.debug('Block cached', {
          component: 'avail-blockchain',
          blockNumber: hashOrNumber,
          blockAge,
          ttl: CACHE_TTL.OLD_BLOCKS,
        });
      }
    }

    return blockData;
  }

  /**
   * Extract extrinsics data from raw block extrinsics
   */
  private extractExtrinsicsData(rawExtrinsics: any[]): any[] {
    return rawExtrinsics.map((extrinsic, index) => {
      try {
        // Try to extract extrinsic data safely
        const hash = extrinsic.hash?.toString() || `0x${index.toString().padStart(64, '0')}`;
        
        // Extract method information if available
        let method = { section: 'unknown', method: 'unknown' };
        try {
          if (extrinsic.method) {
            method = {
              section: extrinsic.method.section || 'unknown',
              method: extrinsic.method.method || 'unknown',
            };
          }
        } catch (methodError) {
          logger.debug('Failed to extract method from extrinsic', {
            component: 'avail-blockchain',
            extrinsicIndex: index,
            error: (methodError as Error).message,
          });
        }

        // Extract signer information if available
        let signer;
        try {
          signer = extrinsic.signer?.toString();
        } catch {
          // Signer extraction failed - this is common for unsigned extrinsics
        }

        return {
          hash,
          index,
          method,
          signer,
          success: true, // Will be determined by events in processor
          fee: null, // Fee calculation requires more complex logic
        };
      } catch (error) {
        logger.warn('Failed to extract extrinsic data', {
          component: 'avail-blockchain',
          extrinsicIndex: index,
          error: (error as Error).message,
        });
        
        // Return minimal extrinsic data to maintain count
        return {
          hash: `0x${index.toString().padStart(64, '0')}`,
          index,
          method: { section: 'unknown', method: 'unknown' },
          signer: undefined,
          success: false,
          fee: null,
        };
      }
    });
  }

  /**
   * Extract events data from raw events
   */
  private extractEventsData(rawEvents: any[]): any[] {
    return rawEvents.map((event, index) => {
      try {
        return {
          index,
          section: event.event?.section || 'unknown',
          method: event.event?.method || 'unknown',
          data: event.event?.data || [],
          phase: event.phase || { finalization: 0 },
        };
      } catch (error) {
        logger.warn('Failed to extract event data', {
          component: 'avail-blockchain',
          eventIndex: index,
          error: (error as Error).message,
        });
        
        return {
          index,
          section: 'unknown',
          method: 'unknown',
          data: [],
          phase: { finalization: 0 },
        };
      }
    });
  }

  /**
   * Get block with enhanced data submission analysis
   * This is the key advantage of using avail-sdk
   */
  async getBlockWithDataSubmissions(hashOrNumber: string | number): Promise<{
    block: BlockData;
    dataSubmissions: Array<{
      extrinsicIndex: number;
      txHash: string;
      submitter?: string;
      dataSize?: number;
      success: boolean;
    }>;
  }> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    
    const hash = typeof hashOrNumber === 'string' 
      ? hashOrNumber 
      : (await api.rpc.chain.getBlockHash(hashOrNumber)).toString();
    
    logger.debug('Fetching block with data submissions via avail-sdk', { 
      component: 'avail-blockchain',
      hashOrNumber,
    });
    
    const [block] = await Promise.all([
      api.rpc.chain.getBlock(hash),
    ]);

    const blockData = await this.getBlock(hashOrNumber);
    const dataSubmissions: Array<{
      extrinsicIndex: number;
      txHash: string;
      submitter?: string;
      dataSize?: number;
      success: boolean;
    }> = [];

    // Analyze extrinsics for data submissions
    block.block.extrinsics.forEach((ext: any, index: number) => {
      try {
        if (ext.method.section === 'dataAvailability' && ext.method.method === 'submitData') {
          const submission = {
            extrinsicIndex: index,
            txHash: ext.hash.toHex(),
            submitter: ext.isSigned ? ext.signer.toString() : undefined,
            dataSize: ext.method.args.length > 0 ? (ext.method.args[0].toString().length - 2) / 2 : undefined,
            success: true, // Will be validated against events
          };
          
          dataSubmissions.push(submission);
          
          logger.debug('Data submission found via avail-sdk', {
            component: 'avail-blockchain',
            extrinsicIndex: index,
            submitter: submission.submitter,
            dataSize: submission.dataSize,
          });
        }
      } catch (error) {
        logger.warn('Failed to analyze extrinsic for data submission', {
          component: 'avail-blockchain',
          extrinsicIndex: index,
          error: (error as Error).message,
        });
      }
    });

    return {
      block: blockData,
      dataSubmissions,
    };
  }

  // Subscription methods using avail-sdk

  /**
   * Subscribe to new block headers using avail-sdk
   */
  async subscribeToNewHeads(callback: (header: any) => void): Promise<() => void> {
    const connection = await this.connectionManager.getHealthyConnection();
    const api = connection.api;
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(callback);
    
    return this.subscriptionManager.subscribe('newHeads', callback).then(() => unsubscribe);
  }

  /**
   * Subscribe to finalized block headers using avail-sdk
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
   * Force connection provider switch
   */
  async switchProvider(reason: string) {
    return this.connectionManager.switchProvider(reason);
  }

  /**
   * Get the underlying connection manager for advanced operations
   */
  getConnectionManager(): AvailConnectionManager {
    return this.connectionManager;
  }
}

// Factory function for dependency injection
export const createAvailBlockchainService = (providers?: ConnectionProvider[]): AvailBlockchainService => {
  return new AvailBlockchainService(providers);
};