import { PrismaClient } from '@prisma/client';
import prisma from '../client';
import { QueryCacheOptions } from '../../config/cache-config';
import { withCache, withoutCache, withTTL, withCacheKey, CachedQuery } from '../../middleware/prisma-cache-middleware';
import { logger } from '../../utils/logger';

export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Execute in transaction
   */
  async transaction<T>(callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  /**
   * Health check for repository
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute optimized raw query with prepared statement
   */
  protected async executeRawQuery<T = unknown>(
    query: string, 
    params: unknown[] = [],
  ): Promise<T[]> {
    const start = Date.now();
    try {
      // Use Prisma's $queryRawUnsafe with parameters for prepared statement optimization
      const result = await this.prisma.$queryRawUnsafe(query, ...params);
      
      const duration = Date.now() - start;
      if (duration > 1000) {
        // Log slow queries > 1s
        logger.warn('Slow raw query detected', { 
          query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
          duration: `${duration}ms`,
          paramCount: params.length,
        });
      }
      
      return result as T[];
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Raw query execution failed', { 
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        params: params.length, 
        duration: `${duration}ms`,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Execute optimized raw query that returns a single result
   */
  protected async executeRawQuerySingle<T = unknown>(
    query: string, 
    params: unknown[] = [],
  ): Promise<T | null> {
    const results = await this.executeRawQuery<T>(query, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute count query with prepared statement
   */
  protected async executeCountQuery(
    query: string, 
    params: unknown[] = [],
  ): Promise<number> {
    const result = await this.executeRawQuerySingle<{ count: bigint }>(query, params);
    return result ? Number(result.count) : 0;
  }

  /**
   * Cache utility methods for repositories
   */
  
  /**
   * Add cache options to a query
   */
  protected withCache<T>(query: T, options: QueryCacheOptions): CachedQuery<T> {
    return withCache(query, options);
  }

  /**
   * Disable cache for a query
   */
  protected withoutCache<T>(query: T): CachedQuery<T> {
    return withoutCache(query);
  }

  /**
   * Set custom TTL for a query
   */
  protected withTTL<T>(query: T, ttl: number): CachedQuery<T> {
    return withTTL(query, ttl);
  }

  /**
   * Set custom cache key for a query
   */
  protected withCacheKey<T>(query: T, cacheKey: string): CachedQuery<T> {
    return withCacheKey(query, cacheKey);
  }

  /**
   * Helper method to build cache-aware queries
   */
  protected buildCachedQuery<T>(
    baseQuery: T,
    useCache: boolean = true,
    ttl?: number,
    cacheKey?: string,
  ): CachedQuery<T> {
    if (!useCache) {
      return this.withoutCache(baseQuery);
    }
    
    const options: QueryCacheOptions = { useCache };
    
    if (ttl !== undefined) {
      options.ttl = ttl;
    }
    if (cacheKey) {
      options.cacheKey = cacheKey;
    }
    
    return this.withCache(baseQuery, options);
  }
}