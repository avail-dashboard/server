import Redis from 'ioredis';
import config from '../config';
import { logCacheHit, logCacheMiss, logCacheSet, logError, logger } from './logger';

class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn('Cache: Too many Redis connection attempts, giving up', { component: 'cache', attempts: times });
          return null; // stop retrying
        }
        const delay = Math.min(times * 500, 5000);
        logger.info(`Cache: Retrying Redis connection in ${delay}ms (attempt ${times})`, { component: 'cache', attempt: times, delay });
        return delay;
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('Cache: Connected to Redis', { component: 'cache' });
    });

    this.redis.on('error', (error) => {
      this.isConnected = false;
      logError(error, { component: 'cache' });
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      logger.info('Cache: Redis connection closed', { component: 'cache' });
    });
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'connect' });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Remove all event listeners to prevent memory leaks
      this.redis.removeAllListeners();
      await this.redis.disconnect();
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'disconnect' });
    }
  }

  /**
   * Clear cache entries by pattern
   */
  async clearByPattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);
      logger.info('Cache: Cleared keys by pattern', {
        component: 'cache',
        pattern,
        count: keys.length,
      });
      
      return keys.length;
    } catch (error) {
      logError(error as Error, { 
        component: 'cache', 
        action: 'clearByPattern',
        pattern,
      });
      return 0;
    }
  }

  /**
   * Clear all cache entries for a specific API endpoint
   */
  async clearEndpoint(method: string, path: string): Promise<number> {
    const pattern = `http:${method}:${path}*`;
    return this.clearByPattern(pattern);
  }

  /**
   * Clear all HTTP cache entries
   */
  async clearAllHttpCache(): Promise<number> {
    return this.clearByPattern('http:*');
  }

  /**
   * Get all cache keys (for debugging/monitoring)
   */
  async getAllKeys(): Promise<string[]> {
    if (!this.isConnected) {
      return [];
    }

    try {
      return await this.redis.keys('*');
    } catch (error) {
      logError(error as Error, { 
        component: 'cache', 
        action: 'getAllKeys',
      });
      return [];
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      logCacheMiss(key);
      return null;
    }

    try {
      const value = await this.redis.get(key);
      
      if (value === null) {
        logCacheMiss(key);
        return null;
      }

      const parsed = JSON.parse(value);
      logCacheHit(key);
      return parsed;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'get', key });
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      logCacheSet(key, ttl || 0);
      return true;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'set', key });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'del', key });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'exists', key });
      return false;
    }
  }

  async incr(key: string): Promise<number | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const result = await this.redis.incr(key);
      return result;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'incr', key });
      return null;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.redis.expire(key, ttl);
      return true;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'expire', key });
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      return [];
    }

    try {
      const keys = await this.redis.keys(pattern);
      return keys;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'keys', pattern });
      return [];
    }
  }

  async flushPattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);
      return keys.length;
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'flushPattern', pattern });
      return 0;
    }
  }

  async getHealth(): Promise<{ connected: boolean; ping?: number }> {
    if (!this.isConnected) {
      return { connected: false };
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      const ping = Date.now() - start;
      return { connected: true, ping };
    } catch {
      return { connected: false };
    }
  }
}

// Cache key builders
export const CacheKeys = {
  // Blocks
  latestBlocks: () => 'blocks:latest',
  blockByNumber: (number: number) => `blocks:number:${number}`,
  blockByHash: (hash: string) => `blocks:hash:${hash}`,
  blockExtrinsics: (number: number) => `blocks:${number}:extrinsics`,
  blocks: () => 'blocks:list',
  
  // Blockchain cache keys for stable data (simple Redis cache plan)
  validatorIdentity: (address: string) => `validator:identity:${address}`,
  runtimeMetadata: () => 'runtime:metadata',
  chainConstants: () => 'chain:constants',
  oldBlock: (number: number) => `block:old:${number}`,
  recentBlock: (number: number) => `block:recent:${number}`,
  blockHeader: (hash: string) => `block:header:${hash}`,
  eraData: (era: number) => `era:${era}`,
  sessionData: (session: number) => `session:${session}`,

  // Extrinsics
  latestExtrinsics: () => 'extrinsics:latest',
  extrinsicByHash: (hash: string) => `extrinsics:hash:${hash}`,
  extrinsicsByBlock: (blockNumber: number) => `extrinsics:block:${blockNumber}`,

  // Accounts
  accountDetails: (address: string) => `accounts:${address}:details`,
  accountBalance: (address: string) => `accounts:${address}:balance`,
  accountTransactions: (address: string) => `accounts:${address}:transactions`,
  accountStaking: (address: string) => `accounts:${address}:staking`,

  // Chain Data
  chainStats: () => 'chain:stats',
  chainHealth: () => 'chain:health',

  // Validators
  validatorsList: () => 'validators:list',
  validators: () => 'validators:all',
  validatorDetails: (address: string) => `validators:${address}:details`,
  validatorStats: () => 'validators:stats',

  // Search
  searchResults: (query: string) => `search:${Buffer.from(query).toString('base64')}`,
  searchSuggestions: (query: string) => `search:suggestions:${Buffer.from(query).toString('base64')}`,

  // Analytics
  tokenDistribution: () => 'analytics:token-distribution',
  blocksPerDay: () => 'analytics:blocks-per-day',
  transactionVolume: () => 'analytics:transaction-volume',

  // Token Price
  tokenPrice: () => 'token:price',

  // Rate Limiting
  rateLimit: (ip: string) => `rate_limit:${ip}`,
  
  // Staking-specific cache keys
  validatorPrefs: (validatorId: string) => `staking:validators:${validatorId}`,
  stakingLedger: (controllerAddress: string) => `staking:ledger:${controllerAddress}`,
  bondedController: (stashAddress: string) => `staking:bonded:${stashAddress}`,
  eraStakers: (era: number, validatorId: string) => `staking:era:${era}:${validatorId}`,
  activeEra: () => 'staking:active-era',
};

// Cache TTL constants (in seconds) - Simple Redis Cache Plan
export const CACHE_TTL = {
  validatorIdentity: 300,    // 5 minutes
  runtimeMetadata: 1800,     // 30 minutes
  chainConstants: 3600,      // 1 hour
  oldBlocks: 86400,          // 24 hours
  eraData: 1800,             // 30 minutes
  sessionData: 900,          // 15 minutes
  chainStats: 60,            // 1 minute
  validators: 300,           // 5 minutes
  accountBalance: 30,        // 30 seconds
  blocks: 60,               // 1 minute
  blockByHash: 3600,        // 1 hour
  blockByNumber: 3600,      // 1 hour
  
  // Staking-specific TTLs
  validatorPrefs: 300,       // 5 minutes
  stakingLedger: 300,        // 5 minutes  
  bondedController: 900,     // 15 minutes
  eraStakers: 1800,          // 30 minutes (more stable)
  activeEra: 300,            // 5 minutes
  
  // Block-specific TTLs
  recentBlocks: 300,         // 5 minutes for recent blocks
  blockHeaders: 600,         // 10 minutes for block headers
};

// Create cache service instance
export const cache = new CacheService();

// Helper functions for common caching patterns
export const cacheWrapper = async <T>(
  key: string,
  fetchFunction: () => Promise<T>,
  ttl?: number,
): Promise<{ data: T; cached: boolean }> => {
  // Try to get from cache first
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return { data: cached, cached: true };
  }

  // Fetch fresh data
  const data = await fetchFunction();
  
  // Cache the result
  await cache.set(key, data, ttl);
  
  return { data, cached: false };
};

export default cache; 