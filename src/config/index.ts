import { config as dotenvConfig } from 'dotenv';
import Joi from 'joi';
import path from 'path';
import { JobType } from '../services/types/service';

// Load environment variables
// Use ENV_FILE environment variable to specify which env file to load
const envFile = process.env.ENV_FILE || '.env';
dotenvConfig({ path: path.resolve(process.cwd(), envFile) });
// Always load .env as fallback without overriding existing vars
if (envFile !== '.env') {
  dotenvConfig();
}

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
  REDIS_QUEUE_DB: Joi.number().default(1),

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
    queueDb: env.REDIS_QUEUE_DB,
  },

  // Queue Service Configuration
  queue: {
    concurrency: 5,
    jobTimeout: 30000, // 30 seconds
    retentionDays: 7,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
    // Retry strategies for different job types
    retryStrategies: {
      [JobType.BLOCK_INDEXING]: {
        baseDelay: 5000,
        maxDelay: 60000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
      [JobType.EXTRINSIC_PROCESSING]: {
        baseDelay: 2000,
        maxDelay: 30000,
        exponentialFactor: 1.5,
        jitterEnabled: true,
      },
      [JobType.ANALYTICS_CALCULATION]: {
        baseDelay: 3000,
        maxDelay: 45000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
      [JobType.DATA_SYNC]: {
        baseDelay: 1000,
        maxDelay: 15000,
        exponentialFactor: 1.8,
        jitterEnabled: true,
      },
      [JobType.ROLLUP_STATISTICS]: {
        baseDelay: 2500,
        maxDelay: 40000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
      [JobType.HEALTH_CHECK]: {
        baseDelay: 1000,
        maxDelay: 10000,
        exponentialFactor: 1.5,
        jitterEnabled: false,
      },
      // Phase 2: Dependency Management Job Retry Strategies - Simplified for TASK-010
      [JobType.DEPENDENCY_DETECTION]: {
        baseDelay: 2000,
        maxDelay: 20000,
        exponentialFactor: 1.8,
        jitterEnabled: true,
      },
      [JobType.DEPENDENCY_RESOLUTION]: {
        baseDelay: 3000,
        maxDelay: 30000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
      [JobType.DEPENDENCY_BATCH_RESOLUTION]: {
        baseDelay: 5000,
        maxDelay: 60000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
    },
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
  },

  // Feature Flags
  features: {
    websockets: env.ENABLE_WEBSOCKETS,
    caching: env.ENABLE_CACHING,
    rateLimiting: env.ENABLE_RATE_LIMITING,
    analytics: env.ENABLE_ANALYTICS,
    metrics: env.ENABLE_METRICS,
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
    ttl: {
      blocks: 5, // Latest blocks - 5 seconds
      blockByNumber: 3600, // Block by number - 1 hour
      blockByHash: 3600, // Block by hash - 1 hour
      chainStats: 30, // Chain stats - 30 seconds
      accountBalance: 30, // Account balance - 30 seconds
      validators: 300, // Validators list - 5 minutes
      tokenPrice: 60, // Token price - 1 minute
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

  // Phase 2: Dependency Management Configuration - John's Implementation
  dependencyManagement: {
    detection: {
      enabled: true,
      scanDepth: 3,
      batchSize: 100,
      priority: {
        blocks: 10,
        accounts: 7,
        rollups: 5,
      },
    },
    resolution: {
      maxConcurrentResolutions: 5,
      retryAttempts: 3,
      backoffStrategy: {
        baseDelay: 2000,
        maxDelay: 30000,
        exponentialFactor: 2,
        jitterEnabled: true,
      },
      batchTimeout: 60000, // 1 minute
    },
    performance: {
      cacheEnabled: true,
      cacheTtl: 300000, // 5 minutes
      maxMemoryUsage: '512MB',
      metricsEnabled: true,
    },
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