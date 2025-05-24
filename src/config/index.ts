import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // Blockchain Data Sources
  AVAIL_RPC_ENDPOINT: Joi.string().default('wss://mainnet-rpc.avail.so/ws'),
  SUBSCAN_API_KEY: Joi.string(),
  SUBSCAN_BASE_URL: Joi.string().default('https://avail.api.subscan.io'),
  SUBQUERY_ENDPOINT: Joi.string(),

  // External APIs
  COINGECKO_API_KEY: Joi.string(),

  // Feature Flags
  ENABLE_WEBSOCKETS: Joi.boolean().default(true),
  ENABLE_CACHING: Joi.boolean().default(true),
  ENABLE_RATE_LIMITING: Joi.boolean().default(true),
  ENABLE_ANALYTICS: Joi.boolean().default(true),

  // Security
  JWT_SECRET: Joi.string().min(32),
  API_RATE_LIMIT: Joi.number().default(100),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_MAX_FILES: Joi.string().default('14'),
  LOG_MAX_SIZE: Joi.string().default('20m'),

  // Bull Queue
  REDIS_QUEUE_DB: Joi.number().default(1),

  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9464),
});

const { error, value: env } = configSchema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

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
  database: {
    url: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // Redis Configuration
  redis: {
    url: env.REDIS_URL,
    queueDb: env.REDIS_QUEUE_DB,
  },

  // Blockchain Data Sources
  dataSources: {
    subscan: {
      baseURL: env.SUBSCAN_BASE_URL,
      apiKey: env.SUBSCAN_API_KEY,
      rateLimitPerMinute: 100,
    },
    rpc: {
      endpoint: env.AVAIL_RPC_ENDPOINT,
      reconnectAttempts: 5,
      timeout: 30000,
    },
    subquery: {
      endpoint: env.SUBQUERY_ENDPOINT,
      timeout: 10000,
    },
  },

  // External APIs
  external: {
    coingecko: {
      apiKey: env.COINGECKO_API_KEY,
      baseURL: 'https://api.coingecko.com/api/v3',
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

  // Security Configuration
  security: {
    jwtSecret: env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    apiRateLimit: env.API_RATE_LIMIT,
  },

  // Cache TTL Configuration (in seconds)
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

  // Bull Queue Configuration
  queue: {
    redis: {
      host: env.REDIS_URL.includes('://') ? env.REDIS_URL.split('@')[1]?.split(':')[0] || 'localhost' : 'localhost',
      port: env.REDIS_URL.includes('://') ? parseInt(env.REDIS_URL.split(':').pop() || '6379') : 6379,
      db: env.REDIS_QUEUE_DB,
    },
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  },

  // Job Schedules (cron patterns)
  jobs: {
    syncLatestBlocks: '*/6 * * * * *', // Every 6 seconds
    syncChainStats: '*/30 * * * * *', // Every 30 seconds
    syncValidators: '*/5 * * * *', // Every 5 minutes
    syncTokenPrice: '0 * * * * *', // Every minute
    cleanupOldCache: '0 0 * * * *', // Every hour
    cleanupOldLogs: '0 0 0 * * *', // Every day
    calculateDailyStats: '0 0 0 * * *', // Every day at midnight
    updateSearchIndex: '*/10 * * * *', // Every 10 minutes
  },

  // API Configuration
  api: {
    prefix: '/api/v1',
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

  // Performance Targets
  performance: {
    responseTime: {
      cached: 50, // ms
      fresh: 500, // ms
      search: 200, // ms
      websocket: 100, // ms
    },
    cache: {
      hitRate: {
        blocks: 0.8,
        chainStats: 0.9,
        accounts: 0.7,
      },
    },
  },
};

export default config; 