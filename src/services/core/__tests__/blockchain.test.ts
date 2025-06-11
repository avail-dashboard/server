import { BlockchainService } from '../blockchain';

// Mock the logger to avoid console output during tests
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logError: jest.fn(),
}));

// Mock Polkadot API
jest.mock('@polkadot/api', () => ({
  ApiPromise: {
    create: jest.fn().mockResolvedValue({
      isReady: Promise.resolve(),
      rpc: {
        system: {
          chain: jest.fn().mockResolvedValue('Avail'),
          name: jest.fn().mockResolvedValue('Avail Node'),
          version: jest.fn().mockResolvedValue('1.0.0'),
        },
        chain: {
          getFinalizedHead: jest.fn().mockResolvedValue('0x123'),
          getBlock: jest.fn().mockResolvedValue({
            block: {
              header: {
                hash: '0x123',
                number: { toNumber: () => 1000 },
                parentHash: '0x456',
                stateRoot: '0x789',
                extrinsicsRoot: '0xabc',
              },
            },
          }),
          subscribeNewHeads: jest.fn().mockResolvedValue(() => {}),
          subscribeFinalizedHeads: jest.fn().mockResolvedValue(() => {}),
        },
        state: {
          getRuntimeVersion: jest.fn().mockResolvedValue({
            specName: { toString: () => 'avail' },
            specVersion: { toNumber: () => 1 },
            implName: { toString: () => 'avail-node' },
            implVersion: { toNumber: () => 1 },
          }),
        },
      },
      query: {
        system: {
          events: {
            at: jest.fn().mockResolvedValue([]),
          },
        },
      },
      registry: {
        chainSS58: 42,
        chainDecimals: [18],
        chainTokens: ['AVAIL'],
      },
      disconnect: jest.fn().mockResolvedValue(undefined),
    }),
  },
  WsProvider: jest.fn().mockImplementation((url) => ({ url })),
  HttpProvider: jest.fn().mockImplementation((url) => ({ url })),
}));

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;

  beforeEach(() => {
    blockchainService = new BlockchainService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (blockchainService.isHealthy()) {
      await blockchainService.stop();
    }
  });

  describe('Initialization', () => {
    it('should create a new instance', () => {
      expect(blockchainService).toBeInstanceOf(BlockchainService);
    });

    it('should not be healthy initially', () => {
      expect(blockchainService.isHealthy()).toBe(false);
    });
  });

  describe('Service Lifecycle', () => {
    it('should start successfully', async () => {
      await blockchainService.start();
      expect(blockchainService.isHealthy()).toBe(true);
    });

    it('should stop successfully', async () => {
      await blockchainService.start();
      await blockchainService.stop();
      expect(blockchainService.isHealthy()).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should return unhealthy when not started', async () => {
      const health = await blockchainService.getHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('No active connection');
    });

    it('should return healthy when running', async () => {
      await blockchainService.start();
      
      const health = await blockchainService.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.details?.connection).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    it('should track connections', async () => {
      await blockchainService.start();
      
      const connections = blockchainService.getConnections();
      expect(connections.length).toBeGreaterThan(0);
      expect(connections[0]).toHaveProperty('url');
      expect(connections[0]).toHaveProperty('provider');
    });

    it('should track circuit breaker states', async () => {
      await blockchainService.start();
      
      const states = blockchainService.getCircuitBreakerStates();
      expect(states.length).toBeGreaterThan(0);
      expect(states[0]).toHaveProperty('url');
      expect(states[0]).toHaveProperty('state');
    });

    it('should track connection metrics', async () => {
      await blockchainService.start();
      
      const metrics = blockchainService.getConnectionMetrics();
      expect(metrics).toHaveProperty('totalConnections');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('failedConnections');
    });
  });
}); 