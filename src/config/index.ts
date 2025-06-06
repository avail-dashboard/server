import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Server Configuration
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Database Configuration
  DATABASE_URL: Joi.string().required(),
  DATABASE_TYPE: Joi.string().valid('postgresql').default('postgresql'),
  
  // Redis Configuration
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_QUEUE_DB: Joi.number().default(1),

  // Avail Blockchain Configuration
  AVAIL_RPC_ENDPOINT: Joi.string().default('wss://mainnet-rpc.avail.so/ws'),
  AVAIL_ENABLE_DIRECT_WS: Joi.boolean().default(true),
  AVAIL_DIRECT_WS_ENDPOINT: Joi.string().default('wss://mainnet-rpc.avail.so/ws'),
  AVAIL_LIGHT_CLIENT_HTTP: Joi.string().default('https://mainnet-rpc.avail.so'),
  AVAIL_LIGHT_CLIENT_WS: Joi.string().default('wss://mainnet-rpc.avail.so/ws'),
  AVAIL_BRIDGE_API: Joi.string().default('https://bridge-api.avail.so'),
  AVAIL_NEXUS_API: Joi.string().default('https://api.nexus.avail.so'),
  AVAIL_TURBO_DA_API: Joi.string().default('https://api.turbo.avail.so'),
  AVAIL_SUPPRESS_WARNINGS: Joi.boolean().default(true),
  AVAIL_POLKADOT_API_LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('warn'),

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

  // External API Configuration
  ETHEREUM_RPC_URL: Joi.string().default('https://eth.llamarpc.com'),
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

  // Avail Blockchain Data Sources
  avail: {
    // RPC Configuration
    rpc: {
      endpoints: [
        'wss://mainnet-rpc.avail.so/ws',
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
    
    // Direct WebSocket Connection (Primary)
    directWS: {
      enabled: env.AVAIL_ENABLE_DIRECT_WS,
      endpoint: env.AVAIL_DIRECT_WS_ENDPOINT,
      reconnectAttempts: 10,
      reconnectDelay: 5000,
      requestTimeout: 30000,
      pingInterval: 30000,
      priority: 1, // Highest priority
    },
    
    // Light Client Configuration
    lightClient: {
      httpEndpoint: env.AVAIL_LIGHT_CLIENT_HTTP,
      wsEndpoint: env.AVAIL_LIGHT_CLIENT_WS,
      appId: 0,
      timeout: 30000,
    },
    
    // Bridge Configuration
    bridge: {
      apiEndpoint: env.AVAIL_BRIDGE_API,
      ethereumRpcUrl: env.ETHEREUM_RPC_URL,
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
    
    // Nexus Configuration
    nexus: {
      apiEndpoint: env.AVAIL_NEXUS_API,
      timeout: 30000,
    },
    
    // Turbo DA Configuration
    turboDA: {
      apiEndpoint: env.AVAIL_TURBO_DA_API,
      timeout: 30000,
    },

    // Avail-specific Settings
    suppressWarnings: env.AVAIL_SUPPRESS_WARNINGS,
    polkadotApiLogLevel: env.AVAIL_POLKADOT_API_LOG_LEVEL,
    compatibilityMode: true,
    knownExtensions: ['CheckAppId'],
    knownRuntimeApis: ['KateApi'],
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