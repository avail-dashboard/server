import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config';
import { getCorrelationMetadata } from './correlationId';

// Custom format to add correlation ID to all logs
const addCorrelationId = winston.format((info) => {
  const correlationMetadata = getCorrelationMetadata();
  return { ...info, ...correlationMetadata };
});

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  addCorrelationId(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, correlationId, ...meta }) => {
    let log = `${timestamp}`;
    
    if (correlationId) {
      log += ` [${correlationId}]`;
    }
    
    log += ` [${level.toUpperCase()}]: ${message}`;
    
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
  addCorrelationId(),
  winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    let log = `${timestamp}`;
    
    if (correlationId) {
      log += ` [${correlationId}]`;
    }
    
    log += ` ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2)}`;
    }
    
    return log;
  }),
);

// Add a custom filter for Avail SDK warnings
const availSdkFilter = winston.format((info) => {
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
    addCorrelationId(),
    availSdkFilter(),
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

// ===========================================
// GENERAL LOGGING HELPERS
// ===========================================

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

// ===========================================
// CACHE LOGGING HELPERS
// ===========================================

export const logCacheHit = (key: string, ttl?: number) => {
  cacheLogger.debug('Cache Hit', { key, ttl });
};

export const logCacheMiss = (key: string) => {
  cacheLogger.debug('Cache Miss', { key });
};

export const logCacheSet = (key: string, ttl: number) => {
  cacheLogger.debug('Cache Set', { key, ttl });
};

// ===========================================
// DATABASE LOGGING HELPERS
// ===========================================

export const logQuery = (query: string, duration: number, rowCount?: number) => {
  dbLogger.debug('Database Query', {
    query: query.replace(/\s+/g, ' ').trim(),
    duration: `${duration}ms`,
    rowCount,
  });
};

// ===========================================
// RPC LOGGING HELPERS
// ===========================================

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

// ===========================================
// WEBSOCKET LOGGING HELPERS
// ===========================================

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

// ===========================================
// SERVICE OPERATION LOGGING
// ===========================================

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

// ===========================================
// AVAIL-SPECIFIC LOGGING FUNCTIONS
// ===========================================

// HTTP Request/Response logging for Avail services
export const logAvailHttpRequest = (
  service: string,
  method: string,
  endpoint: string,
  params?: any,
  headers?: Record<string, string>,
) => {
  rpcLogger.info('Avail HTTP Request', {
    service,
    method,
    endpoint,
    params: params ? JSON.stringify(params).substring(0, 500) : undefined,
    headers: headers ? Object.keys(headers) : undefined,
    timestamp: new Date().toISOString(),
  });
};

export const logAvailHttpResponse = (
  service: string,
  method: string,
  endpoint: string,
  statusCode: number,
  duration: number,
  responseSize?: number,
  success: boolean = true,
  error?: string,
) => {
  const logLevel = success ? 'info' : 'error';
  rpcLogger[logLevel]('Avail HTTP Response', {
    service,
    method,
    endpoint,
    statusCode,
    duration: `${duration}ms`,
    responseSize: responseSize ? `${responseSize} bytes` : undefined,
    success,
    error,
    timestamp: new Date().toISOString(),
  });
};

// WebSocket message logging for Avail services
export const logAvailWebSocketSend = (
  service: string,
  endpoint: string,
  method: string,
  messageId: string | number,
  params?: any,
  messageSize?: number,
) => {
  wsLogger.info('Avail WebSocket Send', {
    service,
    endpoint,
    method,
    messageId,
    params: params ? JSON.stringify(params).substring(0, 300) : undefined,
    messageSize: messageSize ? `${messageSize} bytes` : undefined,
    direction: 'outgoing',
    timestamp: new Date().toISOString(),
  });
};

export const logAvailWebSocketReceive = (
  service: string,
  endpoint: string,
  method: string,
  messageId: string | number,
  duration: number,
  messageSize?: number,
  success: boolean = true,
  error?: string,
) => {
  const logLevel = success ? 'info' : 'error';
  wsLogger[logLevel]('Avail WebSocket Receive', {
    service,
    endpoint,
    method,
    messageId,
    duration: `${duration}ms`,
    messageSize: messageSize ? `${messageSize} bytes` : undefined,
    direction: 'incoming',
    success,
    error,
    timestamp: new Date().toISOString(),
  });
};

// Connection state logging
export const logAvailConnectionState = (
  service: string,
  endpoint: string,
  state: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting',
  details?: Record<string, any>,
) => {
  const logLevel = state === 'error' ? 'error' : state === 'disconnected' ? 'warn' : 'info';
  rpcLogger[logLevel]('Avail Connection State', {
    service,
    endpoint,
    state,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Performance and metrics logging
export const logAvailPerformanceMetric = (
  service: string,
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, any>,
) => {
  rpcLogger.info('Avail Performance Metric', {
    service,
    operation,
    duration: `${duration}ms`,
    success,
    ...metadata,
    timestamp: new Date().toISOString(),
  });
};

// Service health and status logging
export const logAvailServiceHealth = (
  service: string,
  healthy: boolean,
  details: Record<string, any>,
) => {
  const logLevel = healthy ? 'info' : 'warn';
  rpcLogger[logLevel]('Avail Service Health', {
    service,
    healthy,
    details,
    timestamp: new Date().toISOString(),
  });
};

// Data submission logging
export const logAvailDataSubmission = (
  service: string,
  appId: number,
  dataSize: number,
  txHash?: string,
  blockHash?: string,
  success: boolean = true,
  error?: string,
) => {
  const logLevel = success ? 'info' : 'error';
  rpcLogger[logLevel]('Avail Data Submission', {
    service,
    appId,
    dataSize: `${dataSize} bytes`,
    txHash,
    blockHash,
    success,
    error,
    timestamp: new Date().toISOString(),
  });
};

export default logger; 