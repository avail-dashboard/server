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

  // Database Configuration
  DATABASE_URL: Joi.string().required(),
  DATABASE_TYPE: Joi.string().valid('postgresql').default('postgresql'),
  
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // Blockchain Data Sources
  AVAIL_RPC_ENDPOINT: Joi.string().default('wss://mainnet-rpc.avail.so/ws'),
  
  // NEW: Additional Avail API Endpoints
  AVAIL_LIGHT_CLIENT_HTTP: Joi.string(),
  AVAIL_LIGHT_CLIENT_WS: Joi.string(),
  AVAIL_BRIDGE_API: Joi.string(),
  AVAIL_NEXUS_API: Joi.string(),
  AVAIL_TURBO_DA_API: Joi.string(),

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

// Set up PostgreSQL configuration
const getDatabaseConfig = () => {
  const isProd = env.NODE_ENV === 'production';
  
  return {
    type: 'postgresql' as const,
    url: env.DATABASE_URL,
    ssl: isProd ? { rejectUnauthorized: false } : false,
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

  // Blockchain Data Sources
  dataSources: {
    rpc: {
      endpoints: [
        // Official Avail endpoints
        'wss://mainnet.avail-rpc.com/',
        'https://mainnet-rpc.avail.so/rpc',
        // Third-party provider endpoints for redundancy
        'https://rpc.ankr.com/avail',
        'https://avail-mainnet.public.blastapi.io/',
        'wss://avail-mainnet.public.blastapi.io/',
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
    
    // NEW: Additional Avail APIs
    lightClient: {
      httpEndpoint: 'https://mainnet-rpc.avail.so',
      wsEndpoint: 'wss://mainnet.avail-rpc.com/ws',
      appId: 0,
      timeout: 30000,
    },
    
    bridge: {
      apiEndpoint: 'https://bridge-api.avail.so',
      ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      contracts: {
        mainnet: {
          vectorX: '0x02993cdC11213985b9B13224f3aF289F03bf298d',
          bridge: '0x054fd961708d8e2b9c10a63f6157c74458889f0a',
        },
        testnet: {
          vectorX: '0xe542db219a7e2b29c7aeaeace242c9a2cd528f96',
          bridge: '0x967F7DdC4ec508462231849AE81eeaa68Ad01389',
        },
      },
      timeout: 30000,
    },
    
    nexus: {
      apiEndpoint: process.env.AVAIL_NEXUS_API_URL || 'https://api.nexus.avail.so',
      timeout: 30000,
    },
    
    turboDA: {
      apiEndpoint: process.env.TURBO_DA_API_URL || 'https://api.turbo.avail.so',
      timeout: 30000,
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
      host: env.REDIS_URL.includes('://') ? 
        (env.REDIS_URL.includes('@') ? env.REDIS_URL.split('@')[1]?.split(':')[0] : 'localhost') : 
        'localhost',
      port: env.REDIS_URL.includes('://') ? 
        parseInt((env.REDIS_URL.includes('@') ? 
          env.REDIS_URL.split('@')[1]?.split(':')[1] : 
          env.REDIS_URL.split(':').pop()) || '6379') : 
        6379,
      db: env.REDIS_QUEUE_DB,
      password: env.REDIS_URL.includes('://') && env.REDIS_URL.includes(':') ? 
        (env.REDIS_URL.match(/:([^:@]+)@/) ? env.REDIS_URL.match(/:([^:@]+)@/)[1] : undefined) :
        undefined,
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