import dotenv from 'dotenv';
import Joi from 'joi';
import path from 'path';

// Load environment variables
// Use ENV_FILE environment variable to specify which env file to load
const envFile = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
// Always load .env as fallback without overriding existing vars
if (envFile !== '.env') {
  dotenv.config();
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
};

export default config; 