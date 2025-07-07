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
      await cache.set(cacheKey, chainInfo, CACHE_TTL.runtimeMetadata);
      
      logger.debug('Chain info cached', { 
        component: 'avail-blockchain',
        ttl: CACHE_TTL.runtimeMetadata,
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

    // Extract events first to determine extrinsic success
    const extractedEvents = this.extractEventsData(events as any);
    const extrinsicSuccessMap = this.determineExtrinsicSuccess(extractedEvents);

    // Extract more complete information using avail-sdk capabilities
    const blockData: BlockData = {
      hash: hash, // Use the actual block hash, not header.hash
      number: block.block.header.number.toNumber(),
      parentHash: block.block.header.parentHash.toString(),
      stateRoot: block.block.header.stateRoot.toString(),
      extrinsicsRoot: block.block.header.extrinsicsRoot.toString(),
      timestamp: Date.now(), // Should be extracted from timestamp extrinsic
      validator: blockAuthor, // Add the extracted block author
      extrinsics: this.extractExtrinsicsData(block.block.extrinsics, extrinsicSuccessMap),
      events: extractedEvents,
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
        await cache.set(cacheKey, blockData, CACHE_TTL.oldBlocks);
        
        logger.debug('Block cached', {
          component: 'avail-blockchain',
          blockNumber: hashOrNumber,
          blockAge,
          ttl: CACHE_TTL.oldBlocks,
        });
      }
    }

    return blockData;
  }

  /**
   * Determine extrinsic success from events
   */
  private determineExtrinsicSuccess(extractedEvents: any[]): Map<number, boolean> {
    const successMap = new Map<number, boolean>();
    
    extractedEvents.forEach(event => {
      // Check if this event has an ApplyExtrinsic phase
      if (event.phase && typeof event.phase === 'object' && 'applyExtrinsic' in event.phase) {
        const extrinsicIndex = event.phase.applyExtrinsic;
        
        // Check for system success/failure events
        if (event.section === 'system') {
          if (event.method === 'ExtrinsicSuccess') {
            successMap.set(extrinsicIndex, true);
          } else if (event.method === 'ExtrinsicFailed') {
            successMap.set(extrinsicIndex, false);
          }
        }
      }
    });
    
    return successMap;
  }

  /**
   * Extract extrinsics data from raw block extrinsics with complete field extraction
   */
  private extractExtrinsicsData(rawExtrinsics: any[], extrinsicSuccessMap?: Map<number, boolean>): any[] {
    return rawExtrinsics.map((extrinsic, index) => {
      try {
        // Try to extract extrinsic data safely
        const hash = extrinsic.hash?.toString() || `0x${index.toString().padStart(64, '0')}`;
        
        // Extract method information with complete args
        let method = { section: 'unknown', method: 'unknown', args: {} };
        try {
          if (extrinsic.method) {
            method = {
              section: extrinsic.method.section || 'unknown',
              method: extrinsic.method.method || 'unknown',
              args: this.extractMethodArgs(extrinsic.method.args) || {},
            };
          }
        } catch (methodError) {
          logger.debug('Failed to extract method from extrinsic', {
            component: 'avail-blockchain',
            extrinsicIndex: index,
            error: (methodError as Error).message,
          });
        }

        // Debug: Log the raw extrinsic structure for the first few extrinsics
        if (index < 3) {
          logger.debug('Raw extrinsic structure debug', {
            component: 'avail-blockchain',
            extrinsicIndex: index,
            hasMethod: !!extrinsic.method,
            hasSignature: !!extrinsic.signature,
            hasNonce: !!extrinsic.nonce,
            hasEra: !!extrinsic.era,
            isSigned: !!extrinsic.isSigned,
            methodSection: extrinsic.method?.section,
            methodMethod: extrinsic.method?.method,
            availableKeys: Object.keys(extrinsic),
          });
        }

        // Extract signer information if available
        let signer;
        try {
          signer = extrinsic.signer?.toString();
        } catch {
          // Signer extraction failed - this is common for unsigned extrinsics
        }

        // Extract signature and nonce information (adapted for Substrate types)
        let nonce;
        let signature;
        let tip;
        let lifetime;
        try {
          if (extrinsic.isSigned) {
            // For signed extrinsics, extract nonce from the signature
            if (extrinsic.signature) {
              nonce = extrinsic.signature.nonce?.toNumber?.() || extrinsic.nonce?.toNumber?.();
              tip = extrinsic.signature.tip?.toString?.() || extrinsic.tip?.toString?.();
              
              // Extract signature details
              signature = {
                signature: extrinsic.signature.toString(),
                signedExtensions: {},
              };
            }

            // Extract era/lifetime information (Substrate mortality)
            if (extrinsic.era) {
              if (extrinsic.era.isMortalEra) {
                // Defensive: ensure birth/death are numbers, not functions or objects
                let birth = extrinsic.era.asMortalEra.birth;
                let death = extrinsic.era.asMortalEra.death;
                if (typeof birth === 'function') { birth = birth(); }
                else if (birth && typeof birth.toNumber === 'function') { birth = birth.toNumber(); }
                else if (typeof birth !== 'number') { birth = Number(birth) || 0; }
                if (typeof death === 'function') { death = death(); }
                else if (death && typeof death.toNumber === 'function') { death = death.toNumber(); }
                else if (typeof death !== 'number') { death = Number(death) || 0; }
                lifetime = {
                  birth,
                  death,
                  immortal: false,
                };
              } else {
                lifetime = {
                  birth: 0,
                  death: 0,
                  immortal: true,
                };
              }
            }
          }
        } catch (signatureError) {
          logger.debug('Failed to extract signature data from extrinsic', {
            component: 'avail-blockchain',
            extrinsicIndex: index,
            error: (signatureError as Error).message,
            rawExtrinsic: {
              isSigned: extrinsic.isSigned,
              hasSignature: !!extrinsic.signature,
              hasNonce: !!extrinsic.nonce,
              hasEra: !!extrinsic.era,
            },
          });
        }

        // Determine if this is a signed extrinsic
        const isSigned = !!extrinsic.isSigned;

        return {
          hash,
          index,
          isSigned,
          method,
          signer,
          nonce,
          tip,
          signature,
          lifetime,
          success: extrinsicSuccessMap?.get(index) ?? null, // Determined from events
          fee: null, // Fee calculation requires event processing
          actualFee: null, // Will be calculated from events
          transferCount: this.countTransfersInExtrinsic(method),
          length: extrinsic.encodedLength || 0,
          paysFee: this.determineIfPaysFee(method),
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
          isSigned: false,
          method: { section: 'unknown', method: 'unknown', args: {} },
          signer: undefined,
          success: false,
          fee: null,
        };
      }
    });
  }

  /**
   * Extract method arguments safely from Substrate types
   */
  private extractMethodArgs(args: any): Record<string, any> {
    if (!args) return {};
    
    try {
      // Handle different formats of args
      if (Array.isArray(args)) {
        // If args is an array, convert to object with numeric keys
        const extractedArgs: Record<string, any> = {};
        args.forEach((arg, index) => {
          extractedArgs[index.toString()] = this.convertSubstrateValue(arg);
        });
        return extractedArgs;
      } else if (typeof args === 'object') {
        // If args is an object, convert each property
        const extractedArgs: Record<string, any> = {};
        Object.keys(args).forEach(key => {
          extractedArgs[key] = this.convertSubstrateValue(args[key]);
        });
        return extractedArgs;
      } else {
        // Single value
        return { value: this.convertSubstrateValue(args) };
      }
    } catch (error) {
      logger.debug('Failed to extract method args', {
        component: 'avail-blockchain',
        error: (error as Error).message,
        argsType: typeof args,
        isArray: Array.isArray(args),
      });
      return {};
    }
  }

  /**
   * Convert Substrate type values to JSON-serializable format
   */
  private convertSubstrateValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    try {
      // Handle Substrate types with toString() method
      if (typeof value.toString === 'function') {
        return value.toString();
      }
      
      // Handle arrays recursively
      if (Array.isArray(value)) {
        return value.map(item => this.convertSubstrateValue(item));
      }
      
      // Handle objects recursively
      if (typeof value === 'object') {
        const converted: any = {};
        Object.keys(value).forEach(key => {
          converted[key] = this.convertSubstrateValue(value[key]);
        });
        return converted;
      }
      
      // Return primitive values as-is
      return value;
    } catch {
      return 'conversion_failed';
    }
  }

  /**
   * Extract signed extensions from signature
   */
  private extractSignedExtensions(signature: any): Record<string, any> {
    try {
      if (!signature || !signature.signedExtensions) return {};
      
      const extensions: Record<string, any> = {};
      Object.keys(signature.signedExtensions).forEach(key => {
        const value = signature.signedExtensions[key];
        extensions[key] = value?.toString() || value;
      });
      
      return extensions;
    } catch {
      return {};
    }
  }

  /**
   * Count transfers within an extrinsic method
   */
  private countTransfersInExtrinsic(method: any): number {
    if (!method) return 0;
    
    if (method.section === 'balances' && method.method === 'transfer') {
      return 1;
    }
    
    if (method.section === 'balances' && method.method === 'transferAll') {
      return 1;
    }
    
    if (method.section === 'utility' && method.method === 'batch') {
      // Count transfers in batch calls
      const calls = method.args?.calls || [];
      return calls.filter((call: any) => 
        call.section === 'balances' && 
        (call.method === 'transfer' || call.method === 'transferAll')
      ).length;
    }
    
    return 0;
  }

  /**
   * Determine if extrinsic pays fees
   */
  private determineIfPaysFee(method: any): boolean {
    if (!method) return false;
    
    // Unsigned extrinsics that don't pay fees
    const freeMethods = [
      'timestamp.set',
      'parachainSystem.setValidationData',
      'parachainSystem.sudo',
    ];
    
    const methodName = `${method.section}.${method.method}`;
    return !freeMethods.includes(methodName);
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