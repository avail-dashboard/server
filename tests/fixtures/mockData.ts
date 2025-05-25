import { Block, Extrinsic, Account, ChainStats, Validator } from '../../src/types';

export const mockBlocks: Block[] = [
  {
    number: BigInt(1000),
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    parentHash: '0x0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba',
    stateRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    timestamp: BigInt(Date.now()),
    extrinsicsCount: 5,
    extrinsicsRoot: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
    authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    size: 1024,
    weight: '1000000',
    spec: 1001,
    finalized: true,
  },
  {
    number: BigInt(999),
    hash: '0x2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef1',
    parentHash: '0x1987654321fedcba1987654321fedcba1987654321fedcba1987654321fedcba',
    stateRoot: '0xbcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901',
    timestamp: BigInt(Date.now() - 12000),
    extrinsicsCount: 3,
    extrinsicsRoot: '0xedcba09876543210edcba09876543210edcba09876543210edcba09876543210',
    authorId: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    size: 768,
    weight: '750000',
    spec: 1001,
    finalized: true,
  },
];

export const mockExtrinsics: Extrinsic[] = [
  {
    id: 1,
    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    blockNumber: BigInt(1000),
    extrinsicIndex: 0,
    module: 'system',
    call: 'transfer',
    success: true,
    timestamp: BigInt(Date.now()),
    signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    fee: BigInt(1000000),
    tip: BigInt(0),
    signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    args: {
      dest: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
    },
    events: [
      {
        eventIndex: 0,
        module: 'system',
        event: 'Transfer',
        phase: 'ApplyExtrinsic',
        data: {
          from: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          to: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          amount: '1000000000000',
        },
      },
    ],
  },
  {
    id: 2,
    hash: '0xbcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901',
    blockNumber: BigInt(1000),
    extrinsicIndex: 1,
    module: 'balances',
    call: 'transfer_keep_alive',
    success: true,
    timestamp: BigInt(Date.now()),
    signer: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    fee: BigInt(1500000),
    tip: BigInt(100000),
    signature: '0x2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef1',
    args: {
      dest: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      value: '500000000000',
    },
    events: [
      {
        eventIndex: 0,
        module: 'balances',
        event: 'Transfer',
        phase: 'ApplyExtrinsic',
        data: {
          from: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          to: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          amount: '500000000000',
        },
      },
    ],
  },
];

export const mockAccounts: Account[] = [
  {
    address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    balance: BigInt('10000000000000'),
    nonce: 5,
    lastUpdated: new Date(),
    accountInfo: {
      free: BigInt('10000000000000'),
      reserved: BigInt('0'),
      frozen: BigInt('0'),
      flags: BigInt('0'),
    },
  },
  {
    address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    balance: BigInt('5000000000000'),
    nonce: 2,
    lastUpdated: new Date(),
    accountInfo: {
      free: BigInt('5000000000000'),
      reserved: BigInt('1000000000000'),
      frozen: BigInt('0'),
      flags: BigInt('0'),
    },
  },
];

export const mockChainStats: ChainStats = {
  blockHeight: BigInt(1000),
  blockTime: 12,
  totalIssuance: BigInt('1000000000000000000'),
  activeValidators: 100,
  nominators: 500,
  minimumStake: BigInt('1000000000000'),
  averageStake: BigInt('10000000000000'),
  inflation: 7.5,
  stakingRatio: 0.6,
  lastUpdateTime: BigInt(Date.now()),
};

export const mockValidators: Validator[] = [
  {
    address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    identity: {
      display: 'Validator One',
      email: 'validator1@example.com',
      web: 'https://validator1.com',
      twitter: '@validator1',
    },
    commission: '5%',
    selfStake: BigInt('1000000000000'),
    totalStake: BigInt('10000000000000'),
    active: true,
    nominators: 50,
    ownStake: BigInt('1000000000000'),
    othersStake: BigInt('9000000000000'),
    prefs: {
      commission: '5%',
      blocked: false,
    },
  },
  {
    address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    identity: {
      display: 'Validator Two',
      email: 'validator2@example.com',
      web: 'https://validator2.com',
    },
    commission: '3%',
    selfStake: BigInt('2000000000000'),
    totalStake: BigInt('15000000000000'),
    active: true,
    nominators: 75,
    ownStake: BigInt('2000000000000'),
    othersStake: BigInt('13000000000000'),
    prefs: {
      commission: '3%',
      blocked: false,
    },
  },
];

export const mockAPIResponses = {
  blocks: {
    success: true,
    data: mockBlocks,
    meta: {
      page: 1,
      limit: 10,
      total: 1000,
      source: 'database' as const,
    },
  },
  
  block: {
    success: true,
    data: mockBlocks[0],
    meta: {
      source: 'database' as const,
    },
  },
  
  extrinsics: {
    success: true,
    data: mockExtrinsics,
    meta: {
      page: 1,
      limit: 10,
      total: 500,
      source: 'database' as const,
    },
  },
  
  chainStats: {
    success: true,
    data: mockChainStats,
    meta: {
      source: 'rpc' as const,
    },
  },
  
  validators: {
    success: true,
    data: mockValidators,
    meta: {
      source: 'rpc' as const,
    },
  },
  
  error: {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An error occurred',
    },
  },
  
  notFound: {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  },
  
  validationError: {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input parameters',
    },
  },
}; 