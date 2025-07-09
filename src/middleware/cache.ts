import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import config from '../config';
import { cache } from '../utils/cache';
import { logError, logCacheHit, logCacheMiss, logCacheSet } from '../utils/logger';

// In-memory cache stampede protection
const pendingRequests = new Map<string, Promise<unknown>>();

// Clean up old pending requests every 5 minutes to prevent memory leaks
setInterval(() => {
  // Remove promises that have been pending for too long (>5 minutes)
  for (const [key, promise] of pendingRequests.entries()) {
    // Check if promise is still pending by using a timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 100);
    });
    
    Promise.race([promise, timeoutPromise]).catch(() => {
      // If it times out or fails, it's likely stale
      pendingRequests.delete(key);
    });
  }
}, 5 * 60 * 1000); // 5 minutes

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

      // Check if there's already a pending request for this key (cache stampede protection)
      if (pendingRequests.has(cacheKey)) {
        try {
          const pendingData = await pendingRequests.get(cacheKey);
          logCacheHit(cacheKey);
          
          // Add cache headers
          res.setHeader('X-Cache', 'PENDING');
          res.setHeader('X-Cache-Key', cacheKey);
          
          res.json(pendingData);
          return;
        } catch (_error) {
          // If pending request failed, continue with normal flow
          pendingRequests.delete(cacheKey);
        }
      }

      logCacheMiss(cacheKey);

      // Cache miss - create a promise for this request to prevent cache stampede
      const requestPromise = new Promise<unknown>((resolve, reject) => {
        const originalJson = res.json;

        res.json = function(data: unknown) {
          // Add cache headers
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('X-Cache-Key', cacheKey);

          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300 && (data as { success?: boolean })?.success !== false) {
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
            
            // Resolve the promise with the data
            resolve(data);
          } else {
            reject(new Error('Response not cacheable'));
          }

          // Clean up pending request
          pendingRequests.delete(cacheKey);

          return originalJson.call(this, data);
        };

        // Handle errors
        res.on('error', (error) => {
          reject(error);
          pendingRequests.delete(cacheKey);
        });
      });

      // Store the promise
      pendingRequests.set(cacheKey, requestPromise);

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
    }, {} as Record<string, unknown>),
  };
  
  // Generate cache key with readable components for easier cache management
  const queryString = Object.keys(keyData.query).length > 0 
    ? `:${Object.keys(keyData.query).sort().map(k => `${k}=${keyData.query[k]}`).join('&')}`
    : '';
  
  // Build the full key
  const fullKey = `http:${method}:${path}${queryString}`;
  
  // If the key is too long, use a hash but keep the readable prefix for pattern matching
  if (fullKey.length > 250) { // Redis key length limit
    const hash = createHash('sha256').update(queryString).digest('hex').substring(0, 16);
    return `http:${method}:${path}:${hash}`;
  }
  
  return fullKey;
};
