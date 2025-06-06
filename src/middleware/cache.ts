import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import config from '../config';
import { cache } from '../utils/cache';
import { logError, logCacheHit, logCacheMiss, logCacheSet } from '../utils/logger';

// Cache middleware
export const cacheMiddleware = (ttl: number, keyGenerator?: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip caching if caching is disabled
    if (!config.features.caching) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator ? keyGenerator(req) : generateDefaultCacheKey(req);
      
      // Try to get from cache
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData !== null) {
        logCacheHit(cacheKey);
        
        // Add cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        res.json(cachedData);
        return;
      }

      logCacheMiss(cacheKey);

      // Cache miss - override res.json to cache the response
      const originalJson = res.json;

      res.json = function(data: any) {
        // Add cache headers
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);

        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && data?.success !== false) {
          // Cache the response asynchronously (don't wait for it)
          cache.set(cacheKey, data, ttl).then((success) => {
            if (success) {
              logCacheSet(cacheKey, ttl);
            }
          }).catch((error) => {
            logError(error, { 
              component: 'cache-middleware', 
              action: 'set',
              key: cacheKey,
            });
          });
        }

        return originalJson.call(this, data);
      };

      // Continue with the request
      next();

    } catch (error) {
      // If cache fails, log but don't break the request
      logError(error as Error, { component: 'cache-middleware', action: 'get' });
      next();
    }
  };
};

// Default cache key generator
const generateDefaultCacheKey = (req: Request): string => {
  const method = req.method;
  const path = req.path;
  const query = req.query;
  
  // Create a deterministic string from the request
  const keyData = {
    method,
    path,
    query: Object.keys(query).sort().reduce((acc, key) => {
      acc[key] = query[key];
      return acc;
    }, {} as any),
  };
  
  // Generate hash of the key data
  const keyString = JSON.stringify(keyData);
  const hash = createHash('md5').update(keyString).digest('hex');
  
  return `http:${method}:${path}:${hash}`;
};
