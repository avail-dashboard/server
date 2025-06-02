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

// Mock database service
const mockDatabase = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  transaction: jest.fn().mockImplementation(async (callback) => {
    return await callback({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    });
  }),
  getHealth: jest.fn().mockResolvedValue({ connected: true, latency: 5, type: 'postgresql' }),
  findOne: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue(0),
  count: jest.fn().mockResolvedValue(0),
  paginate: jest.fn().mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
};

jest.mock('../src/utils/database', () => ({
  db: mockDatabase,
  default: mockDatabase,
  createTables: jest.fn().mockResolvedValue(undefined),
}));

// Create comprehensive mock data generators
const createMockBlock = (blockNumber: number) => ({
  number: blockNumber.toString(),
  hash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
  parentHash: `0x${(blockNumber - 1).toString(16).padStart(64, '0')}`,
  stateRoot: `0x${'a'.repeat(64)}`,
  timestamp: (Date.now() - ((1000 - blockNumber) * 12000)).toString(),
  extrinsicsCount: 3 + (blockNumber % 5),
  extrinsicsRoot: `0x${'b'.repeat(64)}`,
  authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  size: 1024 + (blockNumber * 10),
  weight: '1000000',
  spec: 1000,
  finalized: true,
});

const createMockExtrinsic = (index: number, blockNumber: bigint | string) => ({
  id: index + 1,
  hash: `0x${index.toString(16).padStart(64, '0')}`,
  blockNumber: typeof blockNumber === 'bigint' ? blockNumber.toString() : blockNumber,
  extrinsicIndex: index,
  module: ['system', 'balances', 'staking'][index % 3],
  call: ['transfer', 'bond', 'nominate'][index % 3],
  success: true,
  timestamp: (Date.now() - (index * 1000)).toString(),
  signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  fee: '1000000',
  tip: '0',
  signature: `0x${'c'.repeat(128)}`,
  args: {},
  events: [],
  isSigned: true,
  isUserTransaction: true,
});

// Mock blockchain service with proper implementations - MOVED TO TOP
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
        const blockNumber = (1000 - Math.floor(i / 3)).toString();
        extrinsics.push(createMockExtrinsic(i, blockNumber));
      }
      
      return { extrinsics, total: 100 };
    }),
    
    getExtrinsicByHash: jest.fn().mockImplementation(async (_hash) => {
      return createMockExtrinsic(0, '1000');
    }),
    
    getExtrinsicsByBlock: jest.fn().mockImplementation(async (blockNumber) => {
      const extrinsics: any[] = [];
      for (let i = 0; i < 3; i++) {
        extrinsics.push(createMockExtrinsic(i, typeof blockNumber === 'bigint' ? blockNumber.toString() : blockNumber.toString()));
      }
      return extrinsics;
    }),
    
    getAccountDetails: jest.fn().mockResolvedValue(null),
    
    getChainStats: jest.fn().mockResolvedValue({
      blockHeight: '1000',
      blockTime: 12,
      totalIssuance: '1000000000000000000',
      activeValidators: 100,
      nominators: 500,
      minimumStake: '1000000000000',
      averageStake: '5000000000000',
      inflation: 7.5,
      stakingRatio: 0.6,
      lastUpdateTime: Date.now().toString(),
    }),
    
    getDataSubmissionStats: jest.fn().mockResolvedValue({
      totalSubmissions: 50,
      totalDataSize: 2500000,
      uniqueApps: 8,
      uniqueSubmitters: 25,
      averageSize: 50000,
      submissionsToday: 12,
      dataSizeToday: 600000,
      lastSubmission: {
        timestamp: (Date.now() - 300000).toString(),
        appId: 25,
        size: 45000,
      },
    }),
    
    getDataSubmissions: jest.fn().mockImplementation(async (query = {}) => {
      const { limit = 10, page = 1 } = query;
      const submissions: any[] = [];
      
      const startIndex = (page - 1) * limit;
      for (let i = 0; i < Math.min(limit, 5); i++) {
        const submissionIndex = startIndex + i;
        submissions.push({
          extrinsicId: `1000-${submissionIndex}`,
          blockNumber: (1000 + submissionIndex).toString(),
          extrinsicIndex: submissionIndex % 5,
          appId: [1, 2, 3, 4, 5][submissionIndex % 5],
          size: 1024 + (submissionIndex * 100),
          dataHash: `0x${submissionIndex.toString(16).padStart(64, '0')}`,
          submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          timestamp: (Date.now() - (submissionIndex * 60000)).toString(),
          success: true,
          data: `Sample data ${submissionIndex}`,
        });
      }
      
      return { submissions, total: 50 };
    }),
    
    getValidatorDetails: jest.fn().mockResolvedValue(null),
    
    getStakingOverview: jest.fn().mockResolvedValue({
      total_staked: '25000000000000',
      active_validators: 2,
      total_nominators: 500,
      current_era: 0,
      inflation_rate: 7.5,
      average_commission: 4,
      nomination_pools: [],
    }),
    
    getHealth: jest.fn().mockResolvedValue({ rpc: true, details: { connected: true } }),
    getValidators: jest.fn().mockResolvedValue([
      {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        identity: {
          display: 'Validator One',
        },
        commission: '5%',
        selfStake: '1000000000000',
        totalStake: '10000000000000',
        active: true,
        nominators: 50,
      },
      {
        address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        identity: {
          display: 'Validator Two',
        },
        commission: '3%',
        selfStake: '2000000000000',
        totalStake: '15000000000000',
        active: true,
        nominators: 75,
      },
    ]),
  };

  return {
    __esModule: true,
    default: mockService,
  };
});

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

// Mock analytics service
jest.mock('../src/services/analytics', () => ({
  __esModule: true,
  default: {
    getNetworkAnalytics: jest.fn().mockResolvedValue({
      current_stats: {
        block_height: 1000,
        total_extrinsics: 5000,
        active_validators: 100,
        total_accounts: 1500,
      },
      historical_data: {
        blocks_per_day: [100, 105, 98, 102],
        extrinsics_per_day: [500, 520, 480, 510],
      },
      data_throughput: {
        current_tps: 2.5,
        peak_tps: 10.0,
        average_tps: 3.2,
      },
    }),
    
    getGasAnalytics: jest.fn().mockResolvedValue({
      current_gas_price: '1000000',
      gas_price_trend: [950000, 980000, 1000000, 1020000],
      gas_efficiency: 0.85,
      cost_per_transaction: '0.001',
    }),
    
    getRollupAnalytics: jest.fn().mockResolvedValue({
      total_rollups: 25,
      active_rollups_24h: 18,
      rollup_leaderboard: [
        { app_id: 1, name: 'Rollup A', submissions: 150, data_size: 75000 },
        { app_id: 2, name: 'Rollup B', submissions: 120, data_size: 60000 },
      ],
    }),
    
    getRollupAnalyticsById: jest.fn().mockImplementation(async (appId) => ({
      app_id: appId,
      statistics: {
        total_submissions: 150,
        total_data_size: 75000,
        average_submission_size: 500,
      },
      analytics: {
        submissions_per_day: [10, 12, 8, 15],
        data_size_per_day: [5000, 6000, 4000, 7500],
      },
      performance_metrics: {
        success_rate: 0.98,
        average_confirmation_time: 12.5,
      },
    })),
    
    getDataThroughputAnalytics: jest.fn().mockResolvedValue({
      current_metrics: {
        throughput_mbps: 2.5,
        utilization_percentage: 65,
      },
      historical_throughput: [2.1, 2.3, 2.5, 2.7],
      peak_usage: {
        timestamp: Date.now() - 86400000,
        throughput_mbps: 8.5,
      },
      predictions: {
        next_hour: 2.8,
        next_day: 3.2,
      },
    }),
    
    getValidatorAnalytics: jest.fn().mockResolvedValue({
      performance_distribution: [
        { range: '90-100%', count: 80 },
        { range: '80-90%', count: 15 },
        { range: '70-80%', count: 5 },
      ],
      commission_analysis: {
        average: 4.2,
        median: 4.0,
        distribution: [
          { range: '0-2%', count: 10 },
          { range: '2-5%', count: 70 },
          { range: '5-10%', count: 20 },
        ],
      },
      staking_trends: {
        total_staked_trend: [95000000, 96000000, 97000000],
        validator_count_trend: [98, 99, 100],
      },
    }),
  },
}));

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  createMockBlock: (overrides = {}) => ({
    number: '1000',
    hash: '0x1234567890abcdef',
    parentHash: '0x0987654321fedcba',
    stateRoot: '0xabcdef1234567890',
    timestamp: Date.now().toString(),
    extrinsicsCount: 5,
    ...overrides,
  }),
  
  createMockExtrinsic: (overrides = {}) => ({
    id: 1,
    hash: '0xabcdef1234567890',
    blockNumber: '1000',
    extrinsicIndex: 0,
    module: 'system',
    call: 'transfer',
    success: true,
    timestamp: Date.now().toString(),
    signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    fee: '1000000',
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