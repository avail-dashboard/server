import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_TYPE = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.ENABLE_CACHING = 'false';
process.env.ENABLE_WEBSOCKETS = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.LOG_LEVEL = 'error';

// Mock external services
jest.mock('../src/utils/cache', () => ({
  cache: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
    expire: jest.fn().mockResolvedValue(true),
  },
}));

// Mock blockchain service
jest.mock('../src/services/blockchain', () => ({
  default: {
    connectRPC: jest.fn().mockResolvedValue(undefined),
    disconnectRPC: jest.fn().mockResolvedValue(undefined),
    getLatestBlocks: jest.fn().mockResolvedValue({ blocks: [], total: 0 }),
    getChainStats: jest.fn().mockResolvedValue({ blockHeight: BigInt(1000), blockTime: 12 }),
    getHealth: jest.fn().mockResolvedValue({ rpc: true, subscan: true, subquery: true }),
    getValidators: jest.fn().mockResolvedValue([]),
  },
}));

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  createMockBlock: (overrides = {}) => ({
    number: BigInt(1000),
    hash: '0x1234567890abcdef',
    parentHash: '0x0987654321fedcba',
    stateRoot: '0xabcdef1234567890',
    timestamp: BigInt(Date.now()),
    extrinsicsCount: 5,
    ...overrides,
  }),
  
  createMockExtrinsic: (overrides = {}) => ({
    id: 1,
    hash: '0xabcdef1234567890',
    blockNumber: BigInt(1000),
    extrinsicIndex: 0,
    module: 'system',
    call: 'transfer',
    success: true,
    timestamp: BigInt(Date.now()),
    signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    fee: BigInt(1000000),
    ...overrides,
  }),
  
  createMockAPIResponse: (data: any, meta = {}) => ({
    success: true,
    data,
    meta: {
      source: 'database',
      ...meta,
    },
  }),
};

// Declare global types for TypeScript
declare global {
  var testUtils: {
    createMockBlock: (overrides?: any) => any;
    createMockExtrinsic: (overrides?: any) => any;
    createMockAPIResponse: (data: any, meta?: any) => any;
  };
} 