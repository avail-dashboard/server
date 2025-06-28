import { logger } from '../../../utils/logger';

export interface BlockchainCallMetrics {
  totalCalls: number;
  duplicateCalls: number;
  callsByEndpoint: Record<string, number>;
  callsByDomain: Record<string, number>;
  averageResponseTime: number;
  failureRate: number;
  cacheHitRate: number;
}

export interface CallOptimizationOptions {
  cacheable?: boolean;
  batchable?: boolean;
  timeout?: number;
  retryAttempts?: number;
  priority?: 'high' | 'medium' | 'low';
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number;
}

export interface ValidatorData {
  id: string;
  address: string;
  commission: string;
  blocked: boolean;
  [key: string]: any;
}

/**
 * Phase 4: Blockchain Call Optimizer
 * 
 * Optimizes blockchain RPC calls through:
 * - Intelligent caching based on data volatility
 * - Call deduplication for in-flight requests
 * - Batching for bulk operations
 * - Performance metrics collection
 */
export class BlockchainCallOptimizer {
  private callMetrics: BlockchainCallMetrics;
  private recentCalls: Map<string, { timestamp: number; result: any; promise?: Promise<any> }>;
  private batchQueue: Map<string, { params: any[]; resolve: (value: any) => void; reject: (error: any) => void }[]>;
  private cache: Map<string, { data: any; expiry: number }>;
  private batchTimers: Map<string, NodeJS.Timeout>;

  constructor() {
    this.callMetrics = {
      totalCalls: 0,
      duplicateCalls: 0,
      callsByEndpoint: {},
      callsByDomain: {},
      averageResponseTime: 0,
      failureRate: 0,
      cacheHitRate: 0,
    };
    this.recentCalls = new Map();
    this.batchQueue = new Map();
    this.cache = new Map();
    this.batchTimers = new Map();
    
    // Clean up expired cache entries every 5 minutes
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
  }

  /**
   * Intelligent call optimization with caching and deduplication
   */
  async optimizeCall<T>(
    endpoint: string,
    params: any,
    executor: () => Promise<T>,
    options: CallOptimizationOptions = {},
  ): Promise<T> {
    const callId = this.generateCallId(endpoint, params);
    const startTime = Date.now();
    
    this.updateMetrics('totalCalls', 1);
    this.updateEndpointMetrics(endpoint);
    
    try {
      // Check cache first
      if (options.cacheable) {
        const cached = this.getCachedResult<T>(callId);
        if (cached) {
          this.updateMetrics('cacheHitRate', 1);
          logger.debug('Cache hit for blockchain call', { endpoint, callId });
          return cached;
        }
      }
      
      // Check for duplicate in-flight calls
      const inFlight = this.getInFlightCall<T>(callId);
      if (inFlight) {
        this.updateMetrics('duplicateCalls', 1);
        logger.debug('Deduplicated blockchain call', { endpoint, callId });
        return await inFlight;
      }
      
      // Execute call with metrics tracking
      const resultPromise = this.executeWithMetrics(executor, endpoint, startTime);
      
      // Store in-flight call for deduplication
      this.recentCalls.set(callId, {
        timestamp: Date.now(),
        result: null,
        promise: resultPromise,
      });
      
      const result = await resultPromise;
      
      // Cache result if cacheable
      if (options.cacheable) {
        this.cacheResult(callId, result, endpoint);
      }
      
      // Update in-flight tracking
      this.recentCalls.set(callId, {
        timestamp: Date.now(),
        result,
      });
      
      return result;
      
    } catch (error) {
      this.updateMetrics('failureRate', 1);
      logger.error('Blockchain call optimization failed', {
        endpoint,
        callId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Batch validator queries for efficiency
   */
  async batchValidatorQueries(
    validatorIds: string[],
    executor: (ids: string[]) => Promise<ValidatorData[]>
  ): Promise<ValidatorData[]> {
    if (validatorIds.length === 0) return [];
    
    const chunkSize = 10; // Process 10 validators at a time
    const chunks = this.chunkArray(validatorIds, chunkSize);
    const results: ValidatorData[] = [];
    
    logger.debug('Batching validator queries', {
      totalValidators: validatorIds.length,
      chunks: chunks.length,
      chunkSize,
    });
    
    for (const chunk of chunks) {
      try {
        const chunkResults = await this.optimizeCall(
          'validator.batch',
          { ids: chunk },
          () => executor(chunk),
          { cacheable: true, batchable: true },
        );
        results.push(...chunkResults);
      } catch (error) {
        logger.error('Batch validator query failed', {
          chunk,
          error: (error as Error).message,
        });
        // Continue with other chunks even if one fails
      }
    }
    
    return results;
  }

  /**
   * Get optimization metrics
   */
  getMetrics(): BlockchainCallMetrics {
    return { ...this.callMetrics };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.callMetrics = {
      totalCalls: 0,
      duplicateCalls: 0,
      callsByEndpoint: {},
      callsByDomain: {},
      averageResponseTime: 0,
      failureRate: 0,
      cacheHitRate: 0,
    };
  }

  private generateCallId(endpoint: string, params: any): string {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  private getCachedResult<T>(callId: string): T | null {
    const cached = this.cache.get(callId);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    
    if (cached) {
      this.cache.delete(callId); // Remove expired entry
    }
    
    return null;
  }

  private getInFlightCall<T>(callId: string): Promise<T> | null {
    const inFlight = this.recentCalls.get(callId);
    if (inFlight && inFlight.promise && Date.now() - inFlight.timestamp < 30000) {
      return inFlight.promise as Promise<T>;
    }
    return null;
  }

  private async executeWithMetrics<T>(
    executor: () => Promise<T>,
    endpoint: string,
    startTime: number
  ): Promise<T> {
    try {
      const result = await executor();
      const duration = Date.now() - startTime;
      this.updateResponseTime(duration);
      
      logger.debug('Blockchain call completed', {
        endpoint,
        duration,
        success: true,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateResponseTime(duration);
      
      logger.error('Blockchain call failed', {
        endpoint,
        duration,
        error: (error as Error).message,
      });
      
      throw error;
    }
  }

  private cacheResult(callId: string, result: any, endpoint: string): void {
    const config = this.getCacheConfig(endpoint);
    if (config.ttl > 0) {
      this.cache.set(callId, {
        data: result,
        expiry: Date.now() + (config.ttl * 1000),
      });
      
      // Implement cache size limit
      if (config.maxSize && this.cache.size > config.maxSize) {
        this.evictOldestCacheEntries(Math.floor(config.maxSize * 0.1));
      }
    }
  }

  private getCacheConfig(endpoint: string): CacheConfig {
    const configs: Record<string, CacheConfig> = {
      'block.byNumber': { ttl: 0 }, // Never cache (immutable once finalized)
      'validator.info': { ttl: 300, maxSize: 1000 }, // 5 minutes
      'validator.batch': { ttl: 300, maxSize: 100 }, // 5 minutes  
      'account.balance': { ttl: 60, maxSize: 5000 }, // 1 minute
      'staking.exposure': { ttl: 3600, maxSize: 500 }, // 1 hour
      'chain.finalizedHead': { ttl: 12, maxSize: 10 }, // 12 seconds
    };
    
    return configs[endpoint] || { ttl: 60, maxSize: 1000 }; // Default 1 minute
  }

  private updateMetrics(metric: keyof BlockchainCallMetrics, value: number): void {
    if (typeof this.callMetrics[metric] === 'number') {
      (this.callMetrics[metric] as number) += value;
    }
  }

  private updateEndpointMetrics(endpoint: string): void {
    this.callMetrics.callsByEndpoint[endpoint] = 
      (this.callMetrics.callsByEndpoint[endpoint] || 0) + 1;
  }

  private updateResponseTime(duration: number): void {
    const currentAvg = this.callMetrics.averageResponseTime;
    const totalCalls = this.callMetrics.totalCalls;
    
    this.callMetrics.averageResponseTime = 
      (currentAvg * (totalCalls - 1) + duration) / totalCalls;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (value.expiry <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesRemoved: cleaned });
    }
  }

  private evictOldestCacheEntries(count: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].expiry - b[1].expiry)
      .slice(0, count);
    
    for (const [key] of entries) {
      this.cache.delete(key);
    }
    
    logger.debug('Cache eviction completed', { entriesEvicted: count });
  }
} 