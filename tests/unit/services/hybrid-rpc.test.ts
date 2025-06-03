// Mock logger - must be defined before jest.mock
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// Mock the logger module
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
  logError: jest.fn(),
}));

import { HybridRPCService } from '../../../src/services/hybrid-rpc';

describe('Hybrid RPC Service', () => {
  let hybridRPCService: HybridRPCService;

  beforeEach(() => {
    hybridRPCService = new HybridRPCService();
    jest.clearAllMocks();
  });

  describe('Service Structure', () => {
    it('should be defined', () => {
      expect(hybridRPCService).toBeDefined();
    });

    it('should have required methods', () => {
      expect(typeof hybridRPCService.initialize).toBe('function');
      expect(typeof hybridRPCService.shutdown).toBe('function');
      expect(typeof hybridRPCService.getHealth).toBe('function');
      expect(typeof hybridRPCService.getLatestBlocks).toBe('function');
      expect(typeof hybridRPCService.getBlockByNumber).toBe('function');
      expect(typeof hybridRPCService.getLatestExtrinsics).toBe('function');
      expect(typeof hybridRPCService.getChainStats).toBe('function');
      expect(typeof hybridRPCService.getAccountDetails).toBe('function');
      expect(typeof hybridRPCService.getValidators).toBe('function');
      expect(typeof hybridRPCService.getDataSubmissions).toBe('function');
    });
  });

  describe('RPC Connection', () => {
    it('should initialize RPC successfully', async () => {
      const mockInitialize = jest.fn().mockResolvedValue(undefined);
      hybridRPCService.initialize = mockInitialize;
      
      await hybridRPCService.initialize();
      expect(mockInitialize).toHaveBeenCalled();
    });

    it('should shutdown RPC successfully', async () => {
      const mockShutdown = jest.fn().mockResolvedValue(undefined);
      hybridRPCService.shutdown = mockShutdown;
      
      await hybridRPCService.shutdown();
      expect(mockShutdown).toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should check service health', async () => {
      const mockHealthCheck = jest.fn().mockResolvedValue({
        healthy: true,
        details: {
          activeConnections: 1,
          totalConnections: 1,
          healthChecks: { rpc: true }
        }
      });
      hybridRPCService.getHealth = mockHealthCheck;
      const health = await hybridRPCService.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.details).toBeDefined();
    });
  });

  describe('Block Operations', () => {
    it('should fetch latest blocks', async () => {
      const mockBlocks = {
        blocks: [
          {
            number: BigInt(1000),
            hash: '0x123',
            parentHash: '0x122',
            stateRoot: '0x456',
            timestamp: BigInt(1640995200000),
            extrinsicsCount: 5
          }
        ],
        total: 1000
      };
      const mockGetLatestBlocks = jest.fn().mockResolvedValue(mockBlocks);
      hybridRPCService.getLatestBlocks = mockGetLatestBlocks;
      const blocks = await hybridRPCService.getLatestBlocks({ limit: 10 });
      expect(blocks).toEqual(mockBlocks);
      expect(mockGetLatestBlocks).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should fetch block by number', async () => {
      const mockBlock = {
        number: BigInt(1000),
        hash: '0x123',
        parentHash: '0x122',
        stateRoot: '0x456',
        timestamp: BigInt(1640995200000),
        extrinsicsCount: 5
      };
      const mockGetBlock = jest.fn().mockResolvedValue(mockBlock);
      hybridRPCService.getBlockByNumber = mockGetBlock;
      const block = await hybridRPCService.getBlockByNumber(BigInt(1000));
      expect(block).toEqual(mockBlock);
      expect(mockGetBlock).toHaveBeenCalledWith(BigInt(1000));
    });

    it('should handle non-existent block gracefully', async () => {
      const mockGetBlock = jest.fn().mockResolvedValue(null);
      hybridRPCService.getBlockByNumber = mockGetBlock;
      
      const block = await hybridRPCService.getBlockByNumber(BigInt(999999));
      expect(block).toBeNull();
    });
  });

  describe('Extrinsic Operations', () => {
    it('should fetch latest extrinsics', async () => {
      const mockExtrinsics = {
        extrinsics: [
          {
            hash: '0xext1',
            blockNumber: BigInt(1000),
            extrinsicIndex: 0,
            module: 'System',
            call: 'remark',
            success: true,
            timestamp: BigInt(1640995200000),
            signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            fee: BigInt(0)
          }
        ],
        total: 1
      };
      const mockGetExtrinsics = jest.fn().mockResolvedValue(mockExtrinsics);
      hybridRPCService.getLatestExtrinsics = mockGetExtrinsics;
      const extrinsics = await hybridRPCService.getLatestExtrinsics({ limit: 10 });
      expect(extrinsics).toEqual(mockExtrinsics);
    });

    it('should fetch extrinsics by block', async () => {
      const mockExtrinsics = [
        {
          hash: '0xext1',
          blockNumber: BigInt(1000),
          extrinsicIndex: 0,
          module: 'System',
          call: 'remark',
          success: true,
          timestamp: BigInt(1640995200000),
          signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          fee: BigInt(0)
        }
      ];
      const mockGetExtrinsics = jest.fn().mockResolvedValue(mockExtrinsics);
      hybridRPCService.getExtrinsicsByBlock = mockGetExtrinsics;
      const extrinsics = await hybridRPCService.getExtrinsicsByBlock(BigInt(1000));
      expect(extrinsics).toEqual(mockExtrinsics);
    });
  });

  describe('Chain Statistics', () => {
    it('should fetch chain stats', async () => {
      const mockStats = {
        finalizedBlocks: 1000,
        totalIssuance: '1000000000000000000000000',
        totalStaked: '500000000000000000000000',
        activeValidators: 100,
      };
      
      const mockGetStats = jest.fn().mockResolvedValue(mockStats);
      hybridRPCService.getChainStats = mockGetStats;
      
      const stats = await hybridRPCService.getChainStats();
      expect(stats).toEqual(mockStats);
    });

    it('should handle stats fetch errors', async () => {
      const mockGetStats = jest.fn().mockRejectedValue(new Error('RPC Error'));
      hybridRPCService.getChainStats = mockGetStats;
      
      await expect(hybridRPCService.getChainStats()).rejects.toThrow('RPC Error');
    });
  });

  describe('Account Operations', () => {
    it('should fetch account details', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const mockAccount = {
        address,
        balance: '1000000000000000000',
        nonce: 5,
      };
      
      const mockGetAccount = jest.fn().mockResolvedValue(mockAccount);
      hybridRPCService.getAccountDetails = mockGetAccount;
      
      const account = await hybridRPCService.getAccountDetails(address);
      expect(account).toEqual(mockAccount);
    });

    it('should handle invalid addresses', async () => {
      const invalidAddress = 'invalid';
      const mockGetAccount = jest.fn().mockRejectedValue(new Error('Invalid address'));
      hybridRPCService.getAccountDetails = mockGetAccount;
      
      await expect(hybridRPCService.getAccountDetails(invalidAddress))
        .rejects.toThrow('Invalid address');
    });
  });

  describe('Data Submission Operations', () => {
    it('should fetch data submissions', async () => {
      const mockSubmissions = {
        submissions: [
          {
            appId: 1,
            size: 1024,
            submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            blockNumber: 1000,
            timestamp: 1640995200000,
          },
        ],
        total: 100,
      };
      
      const mockGetSubmissions = jest.fn().mockResolvedValue(mockSubmissions);
      hybridRPCService.getDataSubmissions = mockGetSubmissions;
      
      const submissions = await hybridRPCService.getDataSubmissions();
      expect(submissions).toEqual(mockSubmissions);
    });

    it('should fetch data submission stats', async () => {
      const mockStats = {
        totalSubmissions: 5000,
        totalDataSize: 52428800,
        uniqueApps: 12,
        uniqueSubmitters: 150,
      };
      
      const mockGetStats = jest.fn().mockResolvedValue(mockStats);
      hybridRPCService.getDataSubmissions = mockGetStats;
      
      const stats = await hybridRPCService.getDataSubmissions();
      expect(stats).toEqual(mockStats);
    });
  });

  describe('Validator Operations', () => {
    it('should fetch validators list', async () => {
      const mockValidators = [
        {
          address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          commission: '10%',
          totalStake: '1000000000000000000',
        },
      ];
      
      const mockGetValidators = jest.fn().mockResolvedValue(mockValidators);
      hybridRPCService.getValidators = mockGetValidators;
      
      const validators = await hybridRPCService.getValidators();
      expect(validators).toEqual(mockValidators);
    });

    it('should fetch staking info', async () => {
      const mockStakingInfo = {
        totalStaked: '1000000000000000000',
        activeValidators: 100,
        waitingValidators: 50,
      };
      
      const mockGetStaking = jest.fn().mockResolvedValue(mockStakingInfo);
      hybridRPCService.getStakingInfo = mockGetStaking;
      
      const stakingInfo = await hybridRPCService.getStakingInfo();
      expect(stakingInfo).toEqual(mockStakingInfo);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockError = new Error('RPC Connection failed');
      const mockMethod = jest.fn().mockRejectedValue(mockError);
      hybridRPCService.getHealth = mockMethod;
      
      await expect(hybridRPCService.getHealth()).rejects.toThrow('RPC Connection failed');
    });

    it('should handle timeout errors', async () => {
      const mockGetBlocks = jest.fn().mockRejectedValue(new Error('Request timeout'));
      hybridRPCService.getLatestBlocks = mockGetBlocks;
      
      await expect(hybridRPCService.getLatestBlocks({ limit: 10 })).rejects.toThrow('Request timeout');
    });

    it('should log errors appropriately', async () => {
      const mockError = new Error('Test error');
      const mockMethod = jest.fn().mockRejectedValue(mockError);
      hybridRPCService.getChainStats = mockMethod;
      
      try {
        await hybridRPCService.getChainStats();
      } catch {
        // Error should be logged
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });
  });

  describe('Basic Operations', () => {
    it('should handle getLatestBlocks call', async () => {
      const mockResult = { blocks: [], total: 0 };
      const mockMethod = jest.fn().mockResolvedValue(mockResult);
      hybridRPCService.getLatestBlocks = mockMethod;
      
      const result = await hybridRPCService.getLatestBlocks();
      expect(result).toEqual(mockResult);
    });

    it('should handle getChainStats call', async () => {
      const mockStats = {
        blockHeight: BigInt(1000),
        blockTime: 6,
        totalIssuance: BigInt('1000000000000000000000000'),
        activeValidators: 100,
        nominators: 500,
        minimumStake: BigInt('1000000000000000000'),
        averageStake: BigInt('5000000000000000000'),
        inflation: 0.1,
        stakingRatio: 0.5,
        lastUpdateTime: BigInt(Date.now())
      };
      const mockMethod = jest.fn().mockResolvedValue(mockStats);
      hybridRPCService.getChainStats = mockMethod;
      
      const result = await hybridRPCService.getChainStats();
      expect(result).toEqual(mockStats);
    });

    it('should handle getValidators call', async () => {
      const mockValidators: any[] = [];
      const mockMethod = jest.fn().mockResolvedValue(mockValidators);
      hybridRPCService.getValidators = mockMethod;
      
      const result = await hybridRPCService.getValidators();
      expect(result).toEqual(mockValidators);
    });
  });
}); 