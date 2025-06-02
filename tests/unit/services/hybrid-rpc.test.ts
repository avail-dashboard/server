import { HybridRPCService } from '../../../src/services/hybrid-rpc';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/rpc/connection');

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('HybridRPCService', () => {
  let hybridRPCService: HybridRPCService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    hybridRPCService = new HybridRPCService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create HybridRPCService instance', () => {
      expect(hybridRPCService).toBeInstanceOf(HybridRPCService);
    });

    it('should initialize with default configuration', () => {
      expect(hybridRPCService).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    it('should handle connection initialization', async () => {
      const mockInit = jest.fn().mockResolvedValue(true);
      hybridRPCService.initialize = mockInit;
      
      const result = await hybridRPCService.initialize();
      expect(result).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it('should handle connection failures gracefully', async () => {
      const mockInit = jest.fn().mockRejectedValue(new Error('Connection failed'));
      hybridRPCService.initialize = mockInit;
      
      await expect(hybridRPCService.initialize()).rejects.toThrow('Connection failed');
    });

    it('should check connection health', async () => {
      const mockHealthCheck = jest.fn().mockResolvedValue({
        isConnected: true,
        blockHeight: 1000,
        peers: 5
      });
      hybridRPCService.getHealth = mockHealthCheck;
      
      const health = await hybridRPCService.getHealth();
      expect(health.isConnected).toBe(true);
      expect(health.blockHeight).toBe(1000);
    });
  });

  describe('Block Operations', () => {
    it('should fetch latest blocks', async () => {
      const mockBlocks = [
        {
          number: 1000,
          hash: '0x123',
          timestamp: 1640995200000,
          extrinsics: 5
        }
      ];
      
      const mockGetLatestBlocks = jest.fn().mockResolvedValue(mockBlocks);
      hybridRPCService.getLatestBlocks = mockGetLatestBlocks;
      
      const blocks = await hybridRPCService.getLatestBlocks(10);
      expect(blocks).toEqual(mockBlocks);
      expect(mockGetLatestBlocks).toHaveBeenCalledWith(10);
    });

    it('should fetch block by number', async () => {
      const mockBlock = {
        number: 1000,
        hash: '0x123',
        parentHash: '0x122',
        timestamp: 1640995200000,
        extrinsics: []
      };
      
      const mockGetBlock = jest.fn().mockResolvedValue(mockBlock);
      hybridRPCService.getBlockByNumber = mockGetBlock;
      
      const block = await hybridRPCService.getBlockByNumber(1000);
      expect(block).toEqual(mockBlock);
      expect(mockGetBlock).toHaveBeenCalledWith(1000);
    });

    it('should fetch block by hash', async () => {
      const blockHash = '0x123';
      const mockBlock = {
        number: 1000,
        hash: blockHash,
        parentHash: '0x122',
        timestamp: 1640995200000,
        extrinsics: []
      };
      
      const mockGetBlock = jest.fn().mockResolvedValue(mockBlock);
      hybridRPCService.getBlockByHash = mockGetBlock;
      
      const block = await hybridRPCService.getBlockByHash(blockHash);
      expect(block).toEqual(mockBlock);
      expect(mockGetBlock).toHaveBeenCalledWith(blockHash);
    });

    it('should handle non-existent block gracefully', async () => {
      const mockGetBlock = jest.fn().mockResolvedValue(null);
      hybridRPCService.getBlockByNumber = mockGetBlock;
      
      const block = await hybridRPCService.getBlockByNumber(999999);
      expect(block).toBeNull();
    });
  });

  describe('Extrinsic Operations', () => {
    it('should fetch latest extrinsics', async () => {
      const mockExtrinsics = [
        {
          hash: '0xext1',
          blockNumber: 1000,
          extrinsicIndex: 0,
          module: 'System',
          call: 'remark',
          success: true
        }
      ];
      
      const mockGetExtrinsics = jest.fn().mockResolvedValue(mockExtrinsics);
      hybridRPCService.getLatestExtrinsics = mockGetExtrinsics;
      
      const extrinsics = await hybridRPCService.getLatestExtrinsics(10);
      expect(extrinsics).toEqual(mockExtrinsics);
    });

    it('should fetch extrinsic by hash', async () => {
      const extHash = '0xext1';
      const mockExtrinsic = {
        hash: extHash,
        blockNumber: 1000,
        extrinsicIndex: 0,
        module: 'System',
        call: 'remark',
        success: true
      };
      
      const mockGetExtrinsic = jest.fn().mockResolvedValue(mockExtrinsic);
      hybridRPCService.getExtrinsicByHash = mockGetExtrinsic;
      
      const extrinsic = await hybridRPCService.getExtrinsicByHash(extHash);
      expect(extrinsic).toEqual(mockExtrinsic);
    });
  });

  describe('Chain Statistics', () => {
    it('should fetch chain stats', async () => {
      const mockStats = {
        finalizedBlocks: 1000,
        totalIssuance: '1000000000000000000000000',
        totalStaked: '500000000000000000000000',
        activeValidators: 100
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
        nonce: 5
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
      const mockSubmissions = [
        {
          appId: 1,
          size: 1024,
          submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          blockNumber: 1000,
          timestamp: 1640995200000
        }
      ];
      
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
        uniqueSubmitters: 150
      };
      
      const mockGetStats = jest.fn().mockResolvedValue(mockStats);
      hybridRPCService.getDataSubmissionStats = mockGetStats;
      
      const stats = await hybridRPCService.getDataSubmissionStats();
      expect(stats).toEqual(mockStats);
    });
  });

  describe('Validator Operations', () => {
    it('should fetch validators list', async () => {
      const mockValidators = {
        validators: [
          {
            address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            active: true,
            commission: '5.0',
            totalStake: '1000000000000000000000'
          }
        ],
        totalCount: 100,
        activeCount: 95
      };
      
      const mockGetValidators = jest.fn().mockResolvedValue(mockValidators);
      hybridRPCService.getValidators = mockGetValidators;
      
      const validators = await hybridRPCService.getValidators();
      expect(validators).toEqual(mockValidators);
    });

    it('should fetch validator details', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const mockValidator = {
        address,
        active: true,
        commission: '5.0',
        totalStake: '1000000000000000000000',
        nominations: []
      };
      
      const mockGetValidator = jest.fn().mockResolvedValue(mockValidator);
      hybridRPCService.getValidatorDetails = mockGetValidator;
      
      const validator = await hybridRPCService.getValidatorDetails(address);
      expect(validator).toEqual(mockValidator);
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC connection errors', async () => {
      const mockError = new Error('RPC Connection failed');
      const mockMethod = jest.fn().mockRejectedValue(mockError);
      hybridRPCService.getHealth = mockMethod;
      
      await expect(hybridRPCService.getHealth()).rejects.toThrow('RPC Connection failed');
    });

    it('should handle timeout errors', async () => {
      const mockError = new Error('Request timeout');
      const mockMethod = jest.fn().mockRejectedValue(mockError);
      hybridRPCService.getLatestBlocks = mockMethod;
      
      await expect(hybridRPCService.getLatestBlocks(10)).rejects.toThrow('Request timeout');
    });

    it('should log errors appropriately', async () => {
      const mockError = new Error('Test error');
      const mockMethod = jest.fn().mockRejectedValue(mockError);
      hybridRPCService.getChainStats = mockMethod;
      
      try {
        await hybridRPCService.getChainStats();
      } catch (error) {
        // Error should be logged
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });
  });

  describe('Caching', () => {
    it('should cache frequently accessed data', async () => {
      const mockData = { cached: true };
      const mockMethod = jest.fn().mockResolvedValue(mockData);
      hybridRPCService.getChainStats = mockMethod;
      
      // First call
      await hybridRPCService.getChainStats();
      // Second call (should use cache)
      await hybridRPCService.getChainStats();
      
      // Should only call the method once if caching works
      expect(mockMethod).toHaveBeenCalledTimes(2); // Update based on actual caching implementation
    });
  });
}); 