import { config as dotenvConfig } from 'dotenv';
import Joi from 'joi';
import path from 'path';
import availTypesBundle from './avail-types';

// Load environment variables
// Use ENV_FILE environment variable to specify which env file to load
const envFile = process.env.ENV_FILE || '.env';
dotenvConfig({ path: path.resolve(process.cwd(), envFile), override: true });


console.log('envFile', envFile);

// Configuration schema validation
const configSchema = Joi.object({
  // Server Configuration
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Database Configuration
  DATABASE_URL: Joi.string().required(),
  
  // Redis Configuration
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // Feature Flags
  ENABLE_WEBSOCKETS: Joi.boolean().default(true),
  ENABLE_CACHING: Joi.boolean().default(true),
  ENABLE_RATE_LIMITING: Joi.boolean().default(true),
  ENABLE_ANALYTICS: Joi.boolean().default(true),
  ENABLE_METRICS: Joi.boolean().default(true),

  // Security Configuration
  JWT_SECRET: Joi.string().min(32),
  API_RATE_LIMIT: Joi.number().default(100),

  // Logging Configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_MAX_FILES: Joi.string().default('14'),
  LOG_MAX_SIZE: Joi.string().default('20m'),

  // Monitoring Configuration
  METRICS_PORT: Joi.number().default(9464),
});

const { error, value: env } = configSchema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Set up PostgreSQL configuration
const getDatabaseConfig = () => { 
  return {
    type: 'postgresql' as const,
    url: env.DATABASE_URL,
  };
};

export const config = {
  // Server Configuration
  server: {
    port: env.PORT,
    env: env.NODE_ENV,
    corsOrigin: env.CORS_ORIGIN,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  // Database Configuration
  database: getDatabaseConfig(),

  // Redis Configuration
  redis: {
    url: env.REDIS_URL,
  },


  // Avail Blockchain Data Sources
  avail: {
    // RPC Configuration
    rpc: {
      endpoints: [
        'wss://mainnet-rpc.avail.so/ws',           // Official Avail endpoint
        'wss://avail-mainnet.public.blastapi.io/', // BlastAPI - high performance
        'wss://mainnet.avail-rpc.com/',            // Ankr - reliable
        'wss://avail.api.onfinality.io/public-ws', // OnFinality - enterprise grade
        'wss://avail-rpc.lgns.net/',               // LugaNodes - community
      ],
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      enableSubscriptions: true,
      reconnectAttempts: 10,
      maxConnections: 3,
      healthCheckInterval: 30000,
      subscriptionTimeout: 60000,
      batchSize: 100,
      maxRetryDelay: 30000,
      connectionPoolSize: 5,
    },
    // Custom types bundle for Avail-specific types
    typesBundle: availTypesBundle.types,
  },

  // Feature Flags
  features: {
    websockets: env.ENABLE_WEBSOCKETS,
    caching: env.ENABLE_CACHING,
    rateLimiting: env.ENABLE_RATE_LIMITING,
    analytics: env.ENABLE_ANALYTICS,
    metrics: env.ENABLE_METRICS,
  },

  // Phase 2: Block Processing Configuration - Dual-Mode Operation
  blockProcessing: {
    mode: (process.env.BLOCK_PROCESSING_MODE as 'legacy' | 'queue' | 'dual') || 'queue',
    dualModeComparisonEnabled: process.env.DUAL_MODE_COMPARISON === 'true' || false,
    performanceLoggingEnabled: true,
    statisticsValidationEnabled: true,
    fallbackToLegacyOnError: true,
    primaryResult: 'legacy' as 'legacy' | 'queue', // Which result to return in dual mode
    comparisonThresholds: {
      processingTimeDifferencePercent: 20,
      successRateDifferencePercent: 1,
      errorCountDifference: 5,
      memoryUsageDifferencePercent: 15,
    },
    monitoring: {
      enabled: true,
      logComparisons: true,
      alertOnDifferences: true,
      collectMetrics: true,
    },
  },

  // Phase 3: Enhanced Queue Processing Configuration
  queueProcessing: {
    blockDomains: {
      priorityAssignment: 'auto' as 'auto' | 'manual' | 'disabled', // Auto-calculate priority based on block characteristics
      concurrency: {
        simple: 5,    // Simple blocks concurrent processing
        complex: 2,   // Complex blocks concurrent processing
        critical: 1,  // Critical blocks sequential processing
      },
      optimization: {
        enableServiceReordering: true,        // Reorder services by performance
        collectPerformanceMetrics: true,      // Track processing metrics
        enableBatchOptimization: true,        // Optimize batch processing
        adaptivePriority: true,               // Dynamically adjust priorities
        smartRetryLogic: true,                // Use ErrorClassifier for retries
      },
      deadLetterQueue: {
        enableAlternativeProcessing: true,    // Try alternative processing for failed jobs
        maxAlternativeAttempts: 2,            // Max attempts for alternative processing
        alertOnPermanentFailures: true,       // Alert on permanent failures
        retryableErrorTypes: ['network', 'timeout', 'temporary'],
      },
      monitoring: {
        trackCorrelationIds: true,            // Enhanced correlation tracking
        collectDetailedMetrics: true,         // Detailed performance metrics
        enableHealthMonitoring: true,         // Queue health monitoring
        performanceOptimization: true,        // Performance-based optimizations
        alertThresholds: {
          queueBacklog: 1000,                 // Alert when queue has >1000 jobs
          failureRate: 0.05,                  // Alert when failure rate >5%
          avgProcessingTime: 30000,           // Alert when avg time >30s
        },
      },
      complexityThresholds: {
        extrinsicsCount: 100,                 // Blocks with >100 extrinsics are complex
        dataSubmissionSize: 1024 * 1024,     // Blocks with >1MB data submissions are complex
        validatorChanges: true,               // Blocks with validator changes are critical
        recentBlockWindow: 100,               // Blocks within last 100 are high priority
      },
    },
  },

  // TASK-007: Dependency Integration Configuration
  dependencyIntegration: {
    enabled: true,
    autoDetection: true,
    resolutionTimeout: 30000, // 30 seconds
    waitForCritical: true,
    continueWithPartial: false,
    maxRetries: 3,
    pollInterval: 1000, // 1 second
    maxWaitTime: 30000, // 30 seconds
    batchSize: 10,
    priority: {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    },
  },

  // Security Configuration
  security: {
    jwtSecret: env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    apiRateLimit: env.API_RATE_LIMIT,
  },

  // Caching Configuration
  cache: {
    redis: {
      enabled: true,
      keyPrefix: 'avail:',
    },
    ttl: {
      validatorIdentity: 300,    // 5 minutes
      runtimeMetadata: 1800,     // 30 minutes  
      chainConstants: 3600,      // 1 hour
      oldBlocks: 86400,          // 24 hours
      eraData: 1800,             // 30 minutes
      sessionData: 900,          // 15 minutes
      // Missing cache TTL properties
      validators: 300,           // 5 minutes
      accountBalance: 60,        // 1 minute
      chainStats: 300,           // 5 minutes
      blocks: 1800,              // 30 minutes
      blockByNumber: 3600,       // 1 hour
      blockByHash: 3600,         // 1 hour
    },
  },

  // Logging Configuration
  logging: {
    level: env.LOG_LEVEL,
    maxFiles: env.LOG_MAX_FILES,
    maxSize: env.LOG_MAX_SIZE,
  },

  // Monitoring Configuration
  monitoring: {
    metricsPort: env.METRICS_PORT,
  },

  // API Configuration
  api: {
    prefix: '/api',
    defaultPageSize: 20,
    maxPageSize: 100,
    searchResultsLimit: 50,
  },

  // WebSocket Configuration
  websocket: {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  },

  // TASK-008: Monitoring and Operational Tools Configuration - Adam's Implementation
  dependencyMonitoring: {
    metrics: {
      enabled: true,
      collectionInterval: 30000, // 30 seconds
      retentionPeriod: 24, // 24 hours
      performanceThresholds: {
        maxDetectionTime: 5000, // 5 seconds
        maxResolutionTime: 30000, // 30 seconds
        minSuccessRate: 95, // 95%
        maxQueueBacklog: 100, // 100 jobs
      },
    },
    healthChecks: {
      enabled: true,
      checkInterval: 60000, // 1 minute
      alertThresholds: {
        criticalHealthScore: 70,
        warningHealthScore: 85,
        maxQueueBacklog: 100,
        minSuccessRate: 95,
        maxResponseTime: 5000,
      },
    },
    alerting: {
      enabled: true,
      cooldownPeriod: 300000, // 5 minutes
      maxAlertsPerHour: 10,
      webhookUrl: env.ALERT_WEBHOOK_URL,
      emailRecipients: env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
    },
    reporting: {
      enabled: true,
      autoGenerate: true,
      reportInterval: 3600000, // 1 hour
      retentionDays: 30,
      reportTypes: ['performance', 'trends', 'insights'],
    },
    api: {
      enabled: true,
      endpoints: {
        monitoring: '/api/monitoring',
        management: '/api/management',
      },
    },
  },
};

export default config; 