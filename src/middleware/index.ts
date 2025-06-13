import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult, ValidationChain } from 'express-validator';
import config from '../config';
import { APIResponse, APIError } from '../types';
import { logRequest, logError } from '../utils/logger';
import { camelCaseResponse } from './camelCaseResponse';
import { correlationIdMiddleware } from '../utils/correlationId';

// Export the camelCaseResponse middleware
export { camelCaseResponse };

// Export correlation ID middleware
export { correlationIdMiddleware };

// Export test camelCase validator middleware
export { default as testCamelCaseValidator } from './testCamelCaseValidator';

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
  _next: NextFunction,
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

  // Create base error response
  const errorResponse: APIResponse = {
    success: false,
    error: {
      code,
      message,
      details: config.server.isDev ? apiError.details : undefined,
    },
  };

  // Enhanced development error details
  if (config.server.isDev) {
    const developmentDetails: any = {
      // Include original error details if they exist
      ...(apiError.details || {}),
      
      // Error metadata
      errorType: err.constructor.name,
      originalMessage: err.message,
      
      // Request context for debugging
      requestContext: {
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query,
        headers: {
          'user-agent': req.get('User-Agent'),
          'content-type': req.get('Content-Type'),
          'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
        },
        body: req.method !== 'GET' ? sanitizeRequestBody(req.body) : undefined,
        ip: req.ip,
      },
      
      // Timestamp
      timestamp: new Date().toISOString(),
      
      // Stack trace
      stack: err.stack,
      
      // Additional error properties
      ...(Object.getOwnPropertyNames(err).reduce((acc, key) => {
        if (!['name', 'message', 'stack'].includes(key)) {
          acc[key] = (err as any)[key];
        }
        return acc;
      }, {} as any)),
    };

    errorResponse.error!.details = developmentDetails;
  }

  res.status(statusCode).json(errorResponse);
};

// Helper function to sanitize request body for logging
const sanitizeRequestBody = (body: any): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
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
          details: { errors: errors.array() },
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

// Re-export cache middleware from separate file
export { cacheMiddleware } from './cache';

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

// Request validation helpers - re-export from asyncHandler for backward compatibility
export { 
  createValidationError, 
  createNotFoundError, 
  createInternalError,
  createDatabaseError,
  createExternalServiceError,
  asyncHandler,
} from '../utils/asyncHandler';

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
    // Check database health
    let databaseHealth = { connected: false, note: 'Database check failed' };
    try {
      const { db } = await import('../utils/database');
      const isDbHealthy = await db.checkHealth();
      databaseHealth = { connected: isDbHealthy, note: isDbHealthy ? 'Connected' : 'Connection failed' };
    } catch (error) {
      databaseHealth = { connected: false, note: `Database error: ${(error as Error).message}` };
    }

    // Check cache health
    let cacheHealth = { connected: false, ping: undefined as number | undefined, note: 'Cache check failed' };
    try {
      if (config.features.caching) {
        const { cache } = await import('../utils/cache');
        const cacheStatus = await cache.getHealth();
        cacheHealth = { 
          connected: cacheStatus.connected, 
          ping: cacheStatus.ping,
          note: cacheStatus.connected ? 'Connected' : 'Connection failed',
        };
      } else {
        cacheHealth = { connected: false, ping: undefined, note: 'Caching disabled' };
      }
    } catch (error) {
      cacheHealth = { connected: false, ping: undefined, note: `Cache error: ${(error as Error).message}` };
    }

    // Overall health status
    const isHealthy = databaseHealth.connected && (cacheHealth.connected || !config.features.caching);
    
    const health = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: config.server.env,
      services: {
        database: databaseHealth,
        caching: cacheHealth,
        websocket: { enabled: config.features.websockets },
      },
    };

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json({
      success: isHealthy,
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
    });
  }
};
