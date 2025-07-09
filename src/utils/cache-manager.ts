import { cache } from './cache';
import { logger } from './logger';

/**
 * Cache Management Utility
 * Provides high-level cache management with pattern-based clearing
 */
export class CacheManager {
  /**
   * Clear cache for all blocks endpoints
   */
  static async clearBlocksCache(): Promise<number> {
    logger.info('CacheManager: Clearing blocks cache');
    return cache.clearEndpoint('GET', '/api/blocks');
  }

  /**
   * Clear cache for all extrinsics endpoints
   */
  static async clearExtrinsicsCache(): Promise<number> {
    logger.info('CacheManager: Clearing extrinsics cache');
    return cache.clearEndpoint('GET', '/api/extrinsics');
  }

  /**
   * Clear cache for all data submissions endpoints
   */
  static async clearDataSubmissionsCache(): Promise<number> {
    logger.info('CacheManager: Clearing data submissions cache');
    return cache.clearEndpoint('GET', '/api/data-submissions');
  }

  /**
   * Clear cache for all validators endpoints
   */
  static async clearValidatorsCache(): Promise<number> {
    logger.info('CacheManager: Clearing validators cache');
    return cache.clearEndpoint('GET', '/api/validators');
  }

  /**
   * Clear cache for all accounts endpoints
   */
  static async clearAccountsCache(): Promise<number> {
    logger.info('CacheManager: Clearing accounts cache');
    return cache.clearEndpoint('GET', '/api/accounts');
  }

  /**
   * Clear cache for all transfers endpoints
   */
  static async clearTransfersCache(): Promise<number> {
    logger.info('CacheManager: Clearing transfers cache');
    return cache.clearEndpoint('GET', '/api/transfers');
  }

  /**
   * Clear cache for all analytics endpoints
   */
  static async clearAnalyticsCache(): Promise<number> {
    logger.info('CacheManager: Clearing analytics cache');
    return cache.clearEndpoint('GET', '/api/analytics');
  }

  /**
   * Clear cache for chain info endpoints
   */
  static async clearChainCache(): Promise<number> {
    logger.info('CacheManager: Clearing chain cache');
    return cache.clearEndpoint('GET', '/api/chain');
  }

  /**
   * Clear all API caches
   */
  static async clearAllApiCache(): Promise<number> {
    logger.info('CacheManager: Clearing all API cache');
    return cache.clearAllHttpCache();
  }

  /**
   * Clear cache for specific block
   */
  static async clearBlockCache(blockIdentifier: string | number): Promise<number> {
    logger.info('CacheManager: Clearing cache for specific block', { blockIdentifier });
    const pattern = `http:GET:/api/blocks/${blockIdentifier}*`;
    return cache.clearByPattern(pattern);
  }

  /**
   * Clear cache for specific account
   */
  static async clearAccountCache(address: string): Promise<number> {
    logger.info('CacheManager: Clearing cache for specific account', { address });
    const pattern = `http:GET:/api/accounts/${address}*`;
    return cache.clearByPattern(pattern);
  }

  /**
   * Clear cache for specific extrinsic
   */
  static async clearExtrinsicCache(hash: string): Promise<number> {
    logger.info('CacheManager: Clearing cache for specific extrinsic', { hash });
    const pattern = `http:GET:/api/extrinsics/${hash}*`;
    return cache.clearByPattern(pattern);
  }

  /**
   * Clear cache when new block is indexed
   */
  static async clearCacheForNewBlock(blockNumber: number): Promise<void> {
    logger.info('CacheManager: Clearing cache for new block', { blockNumber });
    
    // Clear caches that are affected by new blocks
    await Promise.all([
      this.clearBlocksCache(), // Paginated blocks list changes
      this.clearAnalyticsCache(), // Network stats change
      this.clearChainCache(), // Latest block info changes
    ]);
  }

  /**
   * Clear cache when new data submission is indexed
   */
  static async clearCacheForNewDataSubmission(appId: number): Promise<void> {
    logger.info('CacheManager: Clearing cache for new data submission', { appId });
    
    // Clear caches that are affected by new data submissions
    await Promise.all([
      this.clearDataSubmissionsCache(),
      this.clearAnalyticsCache(),
      cache.clearByPattern(`*app_id=${appId}*`), // App-specific queries
    ]);
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    totalKeys: number;
    apiKeys: number;
    blockKeys: number;
    otherKeys: number;
  }> {
    const allKeys = await cache.getAllKeys();
    const apiKeys = allKeys.filter(key => key.startsWith('http:')).length;
    const blockKeys = allKeys.filter(key => key.includes('/api/blocks')).length;
    const otherKeys = allKeys.length - apiKeys;

    return {
      totalKeys: allKeys.length,
      apiKeys,
      blockKeys,
      otherKeys,
    };
  }
}

// Export a default instance
export const cacheManager = CacheManager;