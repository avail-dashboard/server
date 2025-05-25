import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult, ValidationChain } from 'express-validator';
import config from '../config';
import { APIResponse, APIError } from '../types';
import { logRequest, logError } from '../utils/logger';
import { cache } from '../utils/cache';
import { db } from '../utils/database';

// Request timing middleware
export const requestTimer = (req: Request, res: Response, next: NextFunction): void => {
  req.startTime = Date.now();
  next();
};

// Response logging middleware
export const responseLogger = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.json;
  
  res.json = function(body: any) {
    const responseTime = req.startTime ? Date.now() - req.startTime : undefined;
    logRequest(req, res, responseTime);
    return originalSend.call(this, body);
  };
  
  next();
};

// Error handling middleware
export const errorHandler = (
  err: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Log the error
  logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Determine error details
  const apiError = err as APIError;
  const statusCode = apiError.statusCode || 500;
  const code = apiError.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Create error response
  const errorResponse: APIResponse = {
    success: false,
    error: {
      code,
      message,
      details: config.server.isDev ? apiError.details : undefined,
    },
  };

  // Add stack trace in development
  if (config.server.isDev && err.stack) {
    errorResponse.error!.details = {
      ...errorResponse.error!.details,
      stack: err.stack,
    };
  }

  res.status(statusCode).json(errorResponse);
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const response: APIResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };

  res.status(404).json(response);
};

// Rate limiting middleware
export const createRateLimit = (windowMs: number = 60000, max: number = 100) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/metrics';
    },
  });
};

// API rate limiting
export const apiRateLimit = createRateLimit(60000, config.security.apiRateLimit);

// Search rate limiting (more restrictive)
export const searchRateLimit = createRateLimit(60000, 20);

// Validation middleware
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: errors.array(),
        },
      };

      res.status(400).json(response);
      return;
    }

    next();
  };
};

// Pagination middleware
export const pagination = (req: Request, res: Response, next: NextFunction): void => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(
    parseInt(req.query.limit as string) || config.api.defaultPageSize,
    config.api.maxPageSize,
  );
  const offset = (page - 1) * limit;

  req.query.page = page.toString();
  req.query.limit = limit.toString();
  req.query.offset = offset.toString();

  next();
};

// CORS middleware (in case express cors middleware needs customization)
export const corsHandler = (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', config.server.corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

// Cache middleware
export const cacheMiddleware = (ttl: number, keyGenerator?: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!config.features.caching) {
      next();
      return;
    }

    // Generate cache key
    const cacheKey = keyGenerator ? keyGenerator(req) : `api:${req.originalUrl}`;

    try {
      // Try to get cached response
      const cached = await cache.get(cacheKey);
      if (cached) {
        const response: APIResponse = {
          ...cached,
          meta: {
            ...cached.meta,
            cached: true,
            source: 'cache',
          },
        };
        res.json(response);
        return;
      }

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(body: APIResponse) {
        // Cache successful responses
        if (body.success && body.data) {
          cache.set(cacheKey, body, ttl).catch(err => {
            logError(err, { component: 'cache', action: 'set', key: cacheKey });
          });
        }
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logError(error as Error, { component: 'cache', action: 'get', key: cacheKey });
      next();
    }
  };
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (config.server.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

// Request validation helpers
export const createValidationError = (message: string, field?: string): APIError => {
  const error = new Error(message) as APIError;
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  error.details = field ? { field } : undefined;
  return error;
};

export const createNotFoundError = (resource: string, identifier?: string): APIError => {
  const error = new Error(`${resource} not found`) as APIError;
  error.code = 'NOT_FOUND';
  error.statusCode = 404;
  error.details = identifier ? { identifier } : undefined;
  return error;
};

export const createInternalError = (message: string, details?: any): APIError => {
  const error = new Error(message) as APIError;
  error.code = 'INTERNAL_SERVER_ERROR';
  error.statusCode = 500;
  error.details = details;
  return error;
};

// Request IP extraction
export const getClientIP = (req: Request): string => {
  return (
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection as any)?.socket?.remoteAddress ||
    'unknown'
  );
};

// Health check middleware
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const healthChecks = [];
    
    // Database health check
    healthChecks.push(db.getHealth());
    
    // Cache health check (only if caching is enabled)
    if (config.features.caching) {
      healthChecks.push(cache.getHealth());
    } else {
      healthChecks.push(Promise.resolve({ connected: false, disabled: true }));
    }

    const [dbHealth, cacheHealth] = await Promise.all(healthChecks);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: config.server.env,
      services: {
        database: dbHealth,
        caching: cacheHealth,
        websocket: config.features.websockets,
      },
    };

    // Check if critical services are healthy
    const databaseHealthy = dbHealth.connected;
    const cachingHealthy = !config.features.caching || cacheHealth.connected;
    const allHealthy = databaseHealthy && cachingHealthy;

    // Set overall status
    health.status = allHealthy ? 'healthy' : 'degraded';

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, { component: 'health-check' });
    
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

// Metrics middleware (basic implementation)
export const metricsHandler = (req: Request, res: Response): void => {
  // Basic metrics - would be replaced with proper Prometheus metrics
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: Date.now(),
  };

  res.set('Content-Type', 'application/json');
  res.json(metrics);
}; 