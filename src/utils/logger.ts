import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  }),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  }),
);

// Add a custom filter for Polkadot API warnings
const polkadotApiFilter = winston.format((info) => {
  // Filter out known Avail-specific warnings that are not critical
  const message = typeof info.message === 'string' ? info.message : '';
  
  // List of known Avail-specific warnings to suppress or reduce level
  const availWarnings = [
    'PORTABLEREGISTRY: Unable to determine runtime Call type',
    'REGISTRY: Unknown signed extensions CheckAppId',
    'API/INIT: RPC methods not decorated',
    'API/INIT: avail/47: Not decorating unknown runtime apis',
    'kate_blockLength',
    'kate_queryDataProof',
    'kate_queryProof',
    'kate_queryRows',
    'KateApi/1',
  ];

  // Check if this is an Avail-specific warning
  const isAvailWarning = availWarnings.some(warning => message.includes(warning));
  
  if (isAvailWarning) {
    // Reduce log level for Avail-specific warnings
    if (info.level === 'warn' || info.level === 'warning') {
      info.level = 'debug';
      info.message = `[AVAIL-COMPAT] ${message}`;
    }
  }
  
  return info;
});

// Create transports array
const transports: winston.transport[] = [];

// Console transport (enabled in development and test)
if (config.server.isDev || config.server.isTest) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    }),
  );
}

// File transports
if (config.server.isProd || config.server.isDev) {
  // Application logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      level: config.logging.level,
    }),
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      level: 'error',
    }),
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    polkadotApiFilter(),
    winston.format.json(),
  ),
  transports,
  exitOnError: false,
});

// Create specialized loggers for different components
export const apiLogger = logger.child({ component: 'api' });
export const cacheLogger = logger.child({ component: 'cache' });
export const dbLogger = logger.child({ component: 'database' });
export const rpcLogger = logger.child({ component: 'rpc' });
export const wsLogger = logger.child({ component: 'websocket' });
export const jobLogger = logger.child({ component: 'jobs' });

// Request logging middleware helper
export const logRequest = (req: any, res: any, responseTime?: number) => {
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
  };

  if (res.statusCode >= 400) {
    apiLogger.warn('HTTP Request', logData);
  } else {
    apiLogger.info('HTTP Request', logData);
  }
};

// Error logging helper
export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error('Application Error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
  });
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, context?: Record<string, any>) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...context,
  });
};

// Cache logging helpers
export const logCacheHit = (key: string, ttl?: number) => {
  cacheLogger.debug('Cache Hit', { key, ttl });
};

export const logCacheMiss = (key: string) => {
  cacheLogger.debug('Cache Miss', { key });
};

export const logCacheSet = (key: string, ttl: number) => {
  cacheLogger.debug('Cache Set', { key, ttl });
};

// Database logging helpers
export const logQuery = (query: string, duration: number, rowCount?: number) => {
  dbLogger.debug('Database Query', {
    query: query.replace(/\s+/g, ' ').trim(),
    duration: `${duration}ms`,
    rowCount,
  });
};

// RPC logging helpers
export const logRpcCall = (method: string, duration: number, success: boolean) => {
  rpcLogger.info('RPC Call', {
    method,
    duration: `${duration}ms`,
    success,
  });
};

// Enhanced RPC logging with detailed information
export const logDetailedRpcCall = (
  method: string,
  endpoint: string,
  params: any[],
  duration: number,
  success: boolean,
  responseSize?: number,
  cached?: boolean,
  service?: string,
) => {
  rpcLogger.info('RPC Method Call', {
    service: service || 'rpc',
    method,
    endpoint,
    params: params.length > 0 ? params : undefined,
    duration: `${duration}ms`,
    success,
    responseSize: responseSize ? `${responseSize} bytes` : undefined,
    cached: cached || false,
  });
};

// WebSocket logging helpers
export const logSocketConnection = (socketId: string, event: string) => {
  wsLogger.info('Socket Event', { socketId, event });
};

// Enhanced WebSocket logging
export const logWebSocketConnection = (
  endpoint: string,
  event: string,
  service: string,
  details?: Record<string, any>,
) => {
  wsLogger.info('WebSocket Connection', {
    service,
    endpoint,
    event,
    ...details,
  });
};

export const logWebSocketMessage = (
  endpoint: string,
  method: string,
  service: string,
  messageId?: string,
  responseTime?: number,
  messageSize?: number,
) => {
  wsLogger.info('WebSocket Message', {
    service,
    endpoint,
    method,
    messageId,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
    messageSize: messageSize ? `${messageSize} bytes` : undefined,
  });
};

// Service operation logging
export const logServiceOperation = (
  service: string,
  operation: string,
  duration: number,
  success: boolean,
  details?: Record<string, any>,
) => {
  rpcLogger.info('Service Operation', {
    service,
    operation,
    duration: `${duration}ms`,
    success,
    ...details,
  });
};

// Service fallback logging
export const logServiceFallback = (
  operation: string,
  failedService: string,
  fallbackService: string,
  reason?: string,
) => {
  rpcLogger.warn('Service Fallback', {
    operation,
    failedService,
    fallbackService,
    reason,
  });
};

// Job logging helpers
export const logJobStart = (jobName: string, jobId: string) => {
  jobLogger.info('Job Started', { jobName, jobId });
};

export const logJobComplete = (jobName: string, jobId: string, duration: number) => {
  jobLogger.info('Job Completed', { jobName, jobId, duration: `${duration}ms` });
};

export const logJobFailed = (jobName: string, jobId: string, error: Error) => {
  jobLogger.error('Job Failed', {
    jobName,
    jobId,
    error: {
      name: error.name,
      message: error.message,
    },
  });
};

export default logger; 