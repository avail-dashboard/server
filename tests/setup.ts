import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_TYPE = 'postgresql';
process.env.DATABASE_URL = 'postgresql://avail_user:ni_vineet_21@pg.avail.naxatar.com:5432/avail_explorer_test';
process.env.ENABLE_CACHING = 'false';
process.env.ENABLE_WEBSOCKETS = 'false';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.LOG_LEVEL = 'error';

// Mock external services
const mockCache = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(false),
  expire: jest.fn().mockResolvedValue(true),
  incr: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  flushPattern: jest.fn().mockResolvedValue(0),
  getHealth: jest.fn().mockResolvedValue({ connected: true, ping: 1 }),
};

jest.mock('../src/utils/cache', () => ({
  cache: mockCache,
  default: mockCache,
  CacheKeys: {
    latestBlocks: () => 'blocks:latest',
    blockByNumber: (number: bigint) => `blocks:number:${number}`,
    blockByHash: (hash: string) => `blocks:hash:${hash}`,
    chainStats: () => 'chain:stats',
    validatorsList: () => 'validators:list',
  },
  cacheWrapper: jest.fn().mockImplementation(async (key, fetchFunction) => {
    const data = await fetchFunction();
    return { data, cached: false };
  }),
}));

// Create comprehensive mock data generators
const createMockBlock = (blockNumber: number) => ({
  number: BigInt(blockNumber),
  hash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
  parentHash: `0x${(blockNumber - 1).toString(16).padStart(64, '0')}`,
  stateRoot: `0x${'a'.repeat(64)}`,
  timestamp: BigInt(Date.now() - ((1000 - blockNumber) * 12000)),
  extrinsicsCount: 3 + (blockNumber % 5),
  extrinsicsRoot: `0x${'b'.repeat(64)}`,
  authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  size: 1024 + (blockNumber * 10),
  weight: '1000000',
  spec: 1000,
  finalized: true,
});

const createMockExtrinsic = (index: number, blockNumber: bigint) => ({
  id: index + 1,
  hash: `0x${index.toString(16).padStart(64, '0')}`,
  blockNumber,
  extrinsicIndex: index,
  module: ['system', 'balances', 'staking'][index % 3],
  call: ['transfer', 'bond', 'nominate'][index % 3],
  success: true,
  timestamp: BigInt(Date.now() - (index * 1000)),
  signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  fee: BigInt(1000000),
  tip: BigInt(0),
  signature: `0x${'c'.repeat(128)}`,
  args: {},
  events: [],
  isSigned: true,
  isUserTransaction: true,
});

// Mock blockchain service with proper implementations
jest.mock('../src/services/blockchain', () => {
  const mockService = {
    getLatestBlocks: jest.fn().mockImplementation(async (query = {}) => {
      const { limit = 20, page = 1 } = query;
      const blocks: any[] = [];
      
      const startBlock = 1000 - ((page - 1) * limit);
      for (let i = 0; i < Math.min(limit, 10); i++) {
        blocks.push(createMockBlock(startBlock - i));
      }
      
      return { blocks, total: 1000 };
    }),
    
    getBlockByNumber: jest.fn().mockImplementation(async (number) => {
      const blockNum = typeof number === 'bigint' ? Number(number) : number;
      return createMockBlock(blockNum);
    }),
    
    getBlockByHash: jest.fn().mockImplementation(async (hash) => {
      const blockNum = parseInt(hash.slice(-8), 16) || 1000;
      return createMockBlock(blockNum);
    }),
    
    getLatestExtrinsics: jest.fn().mockImplementation(async (query = {}) => {
      const { limit = 20 } = query;
      const extrinsics: any[] = [];
      
      for (let i = 0; i < Math.min(limit, 10); i++) {
        const blockNumber = BigInt(1000 - Math.floor(i / 3));
        extrinsics.push(createMockExtrinsic(i, blockNumber));
      }
      
      return { extrinsics, total: 100 };
    }),
    
    getExtrinsicByHash: jest.fn().mockImplementation(async (_hash) => {
      return createMockExtrinsic(0, BigInt(1000));
    }),
    
    getExtrinsicsByBlock: jest.fn().mockImplementation(async (blockNumber) => {
      const extrinsics: any[] = [];
      for (let i = 0; i < 3; i++) {
        extrinsics.push(createMockExtrinsic(i, typeof blockNumber === 'bigint' ? blockNumber : BigInt(blockNumber)));
      }
      return extrinsics;
    }),
    
    getAccountDetails: jest.fn().mockResolvedValue(null),
    
    getChainStats: jest.fn().mockResolvedValue({
      blockHeight: BigInt(1000),
      blockTime: 12,
      totalIssuance: BigInt('1000000000000000000'),
      activeValidators: 100,
      nominators: 500,
      minimumStake: BigInt('1000000000000'),
      averageStake: BigInt('5000000000000'),
      inflation: 7.5,
      stakingRatio: 0.6,
      lastUpdateTime: BigInt(Date.now()),
    }),
    
    getHealth: jest.fn().mockResolvedValue({ rpc: true, details: { connected: true } }),
    getValidators: jest.fn().mockResolvedValue([]),
  };

  return {
    __esModule: true,
    default: mockService,
  };
});

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
  // eslint-disable-next-line no-var
  var testUtils: {
    createMockBlock: (overrides?: any) => any;
    createMockExtrinsic: (overrides?: any) => any;
    createMockAPIResponse: (data: any, meta?: any) => any;
  };
} 