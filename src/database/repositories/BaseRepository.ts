import { PrismaClient } from '@prisma/client';
import prisma from '../client';
import { QueryCacheOptions } from '../../config/cache-config';
import { withCache, withoutCache, withTTL, withCacheKey, CachedQuery } from '../../middleware/prisma-cache-middleware';

export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Execute in transaction
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
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
    cacheKey?: string
  ): any {
    const options: QueryCacheOptions = { useCache };
    
    if (ttl !== undefined) options.ttl = ttl;
    if (cacheKey) options.cacheKey = cacheKey;
    
    return {
      ...baseQuery,
      _cache: options
    } as any;
  }
}