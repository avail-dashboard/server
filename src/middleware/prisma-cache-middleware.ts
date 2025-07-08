import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { cache } from '../utils/cache';
import { 
  CACHE_CONFIG, 
  QueryCacheOptions, 
  isCacheEnabled, 
  getCacheTTL, 
  getInvalidationPatterns, 
} from '../config/cache-config';
import { logError, logCacheHit, logCacheMiss, logCacheSet } from '../utils/logger';

// Type for queries with cache options
export type CachedQuery<T> = T & { _cache?: QueryCacheOptions };

// Read operations that can be cached
const CACHEABLE_ACTIONS = [
  'findUnique',
  'findFirst', 
  'findMany',
  'count',
  'aggregate',
  'groupBy',
];

// Write operations that should invalidate cache
const WRITE_ACTIONS = [
  'create',
  'update',
  'upsert',
  'delete',
  'createMany',
  'updateMany',
  'deleteMany',
];

/**
 * Prisma middleware for database query caching
 * Implements cache-aside pattern with automatic invalidation
 */
export function createPrismaCacheMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const { model, action, args } = params;
    
    // Skip if no model (raw queries, etc.)
    if (!model) {
      return next(params);
    }

    // Extract cache options from args
    const cacheOptions = args?._cache as QueryCacheOptions;
    
    // Handle read operations with caching
    if (CACHEABLE_ACTIONS.includes(action)) {
      return handleCacheableQuery(params, next, cacheOptions);
    }
    
    // Handle write operations with cache invalidation
    if (WRITE_ACTIONS.includes(action)) {
      return handleWriteOperation(params, next);
    }
    
    // Execute non-cacheable operations directly
    return next(params);
  };
}

/**
 * Handle cacheable read operations
 */
async function handleCacheableQuery(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<any>,
  cacheOptions?: QueryCacheOptions,
): Promise<any> {
  const { model, action, args } = params;
  
  // Extract cache options from args if present
  const extractedOptions = args?._cache as QueryCacheOptions;
  const finalOptions = extractedOptions || cacheOptions;
  
  // Check if caching is enabled for this table
  if (!isCacheEnabled(model!) || finalOptions?.useCache === false) {
    // Remove _cache from args before executing query
    if (args?._cache) {
      const cleanArgs = { ...args };
      delete cleanArgs._cache;
      params.args = cleanArgs;
    }
    return next(params);
  }

  try {
    // Remove _cache from args for the actual query
    const cleanArgs = args ? { ...args } : {};
    if (cleanArgs._cache) {
      delete cleanArgs._cache;
    }
    
    // Generate cache key using clean args
    const cacheKey = generateCacheKey(model!, action, cleanArgs, finalOptions?.cacheKey);
    
    // Try to get from cache first
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult !== null) {
      logCacheHit(cacheKey);
      return cachedResult;
    }

    logCacheMiss(cacheKey);

    // Execute the query with clean args
    const cleanParams = { ...params, args: cleanArgs };
    const result = await next(cleanParams);
    
    // Cache the result if it's cacheable
    if (shouldCacheResult(result)) {
      const ttl = getCacheTTL(model!, finalOptions?.ttl);
      
      // Cache asynchronously to not block the response
      cache.set(cacheKey, result, ttl)
        .then((success) => {
          if (success) {
            logCacheSet(cacheKey, ttl);
          }
        })
        .catch((error) => {
          logError(error, {
            component: 'prisma-cache-middleware',
            action: 'set',
            key: cacheKey,
            model,
            operation: action,
          });
        });
    }

    return result;
  } catch (error) {
    // Log cache errors but don't break the query
    logError(error as Error, {
      component: 'prisma-cache-middleware',
      action: 'get',
      model,
      operation: action,
    });
    
    // Fall back to direct database query
    return next(params);
  }
}

/**
 * Handle write operations with cache invalidation
 */
async function handleWriteOperation(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<any>,
): Promise<any> {
  const { model } = params;
  
  // Execute the write operation
  const result = await next(params);
  
  // Invalidate related caches asynchronously
  invalidateCache(model!, params.action, result)
    .catch((error) => {
      logError(error as Error, {
        component: 'prisma-cache-middleware',
        action: 'invalidate',
        model,
        operation: params.action,
      });
    });
  
  return result;
}

/**
 * Generate deterministic cache key from query parameters
 */
function generateCacheKey(
  model: string,
  action: string,
  args: any,
  customKey?: string,
): string {
  if (customKey) {
    return `${CACHE_CONFIG.global.keyPrefix}${customKey}`;
  }
  
  // Create a clean args object without cache options
  const cleanArgs = { ...args };
  delete cleanArgs._cache;
  
  // Create deterministic cache key
  const keyData = {
    model,
    action,
    args: cleanArgs,
  };
  
  // Sort object keys for consistent hashing
  const normalizedData = JSON.stringify(keyData, Object.keys(keyData).sort());
  const hash = createHash('md5').update(normalizedData).digest('hex');
  
  const cacheKey = `${CACHE_CONFIG.global.keyPrefix}${model}:${action}:${hash}`;
  
  // Ensure key doesn't exceed max length
  if (cacheKey.length > CACHE_CONFIG.global.maxKeyLength) {
    const truncatedHash = createHash('md5').update(cacheKey).digest('hex');
    return `${CACHE_CONFIG.global.keyPrefix}${model}:${truncatedHash}`;
  }
  
  return cacheKey;
}

/**
 * Check if a result should be cached
 */
function shouldCacheResult(result: any): boolean {
  // Don't cache null, undefined, or empty results
  if (result === null || result === undefined) {
    return false;
  }
  
  // Don't cache empty arrays
  if (Array.isArray(result) && result.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Invalidate cache patterns for a given model
 */
async function invalidateCache(
  model: string,
  action: string,
  result?: any,
): Promise<void> {
  const patterns = getInvalidationPatterns(model);
  
  // Add model-specific patterns
  patterns.push(`${CACHE_CONFIG.global.keyPrefix}${model}:*`);
  
  // Invalidate all patterns
  const invalidationPromises = patterns.map(pattern => 
    cache.flushPattern(pattern),
  );
  
  await Promise.allSettled(invalidationPromises);
}

/**
 * Utility function to add cache options to Prisma queries
 */
export function withCache<T>(
  query: T,
  options: QueryCacheOptions,
): CachedQuery<T> {
  return {
    ...query,
    _cache: options,
  };
}

/**
 * Utility function to disable cache for a query
 */
export function withoutCache<T>(query: T): CachedQuery<T> {
  return {
    ...query,
    _cache: { useCache: false },
  };
}

/**
 * Utility function to set custom TTL for a query
 */
export function withTTL<T>(
  query: T,
  ttl: number,
): CachedQuery<T> {
  return {
    ...query,
    _cache: { ttl },
  };
}

/**
 * Utility function to set custom cache key
 */
export function withCacheKey<T>(
  query: T,
  cacheKey: string,
): CachedQuery<T> {
  return {
    ...query,
    _cache: { cacheKey },
  };
}