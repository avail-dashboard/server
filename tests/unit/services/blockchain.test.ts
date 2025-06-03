import blockchainService from '../../../src/services/blockchain';
import { logError } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/rpc', () => ({
  __esModule: true,
  default: {
    getLatestBlocks: jest.fn(),
    getBlockByNumber: jest.fn(),
    getBlockByHash: jest.fn(),
    getExtrinsicsByBlock: jest.fn(),
    getLatestExtrinsics: jest.fn(),
    getChainStats: jest.fn(),
    getValidators: jest.fn(),
    getAccountDetails: jest.fn(),
    getDataSubmissions: jest.fn(),
    getHealth: jest.fn(),
  },
}));
jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    server: {
      isDev: true,
      isTest: true,
      isProd: false,
    },
    logging: {
      level: 'info',
    },
    features: {
      blockchain: true,
    },
  },
}));

const mockedLogError = logError as jest.MockedFunction<typeof logError>;

describe('Blockchain Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Structure', () => {
    it('should be defined', () => {
      expect(blockchainService).toBeDefined();
    });

    it('should have required methods', () => {
      expect(typeof blockchainService.getLatestBlocks).toBe('function');
      expect(typeof blockchainService.getBlockByNumber).toBe('function');
      expect(typeof blockchainService.getBlockByHash).toBe('function');
      expect(typeof blockchainService.getExtrinsicsByBlock).toBe('function');
      expect(typeof blockchainService.getLatestExtrinsics).toBe('function');
      expect(typeof blockchainService.getChainStats).toBe('function');
      expect(typeof blockchainService.getValidators).toBe('function');
      expect(typeof blockchainService.getAccountDetails).toBe('function');
      expect(typeof blockchainService.getDataSubmissions).toBe('function');
    });
  });

  describe('Block Operations', () => {
    it('should get latest blocks', async () => {
      const mockBlocks = {
        blocks: [
          {
            number: BigInt(1000),
            hash: '0x123',
            timestamp: BigInt(1640995200000),
            extrinsicsCount: 5,
          },
        ],
        total: 1000,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getLatestBlocks.mockResolvedValue(mockBlocks);

      const result = await blockchainService.getLatestBlocks({ limit: 10 });
      expect(result).toEqual(mockBlocks);
      expect(mockRpcService.getLatestBlocks).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should get block by number', async () => {
      const mockBlock = {
        number: BigInt(1000),
        hash: '0x123',
        timestamp: BigInt(1640995200000),
        extrinsicsCount: 5,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getBlockByNumber.mockResolvedValue(mockBlock);

      const result = await blockchainService.getBlockByNumber(BigInt(1000));
      expect(result).toEqual(mockBlock);
      expect(mockRpcService.getBlockByNumber).toHaveBeenCalledWith(BigInt(1000));
    });

    it('should get block by hash', async () => {
      const mockBlock = {
        number: BigInt(1000),
        hash: '0x123',
        timestamp: BigInt(1640995200000),
        extrinsicsCount: 5,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getBlockByHash.mockResolvedValue(mockBlock);

      const result = await blockchainService.getBlockByHash('0x123');
      expect(result).toEqual(mockBlock);
      expect(mockRpcService.getBlockByHash).toHaveBeenCalledWith('0x123');
    });

    it('should handle block fetch errors', async () => {
      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getBlockByNumber.mockRejectedValue(new Error('RPC Error'));

      await expect(blockchainService.getBlockByNumber(BigInt(1000))).rejects.toThrow('RPC Error');
      expect(mockedLogError).toHaveBeenCalled();
    });
  });

  describe('Extrinsic Operations', () => {
    it('should get latest extrinsics', async () => {
      const mockExtrinsics = {
        extrinsics: [
          {
            hash: '0xext1',
            blockNumber: BigInt(1000),
            extrinsicIndex: 0,
            module: 'System',
            call: 'remark',
            success: true,
          },
        ],
        total: 100,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getLatestExtrinsics.mockResolvedValue(mockExtrinsics);

      const result = await blockchainService.getLatestExtrinsics({ limit: 10 });
      expect(result).toEqual(mockExtrinsics);
      expect(mockRpcService.getLatestExtrinsics).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should get extrinsics by block', async () => {
      const mockExtrinsics = [
        {
          hash: '0xext1',
          blockNumber: BigInt(1000),
          extrinsicIndex: 0,
          module: 'System',
          call: 'remark',
          success: true,
        },
      ];

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getExtrinsicsByBlock.mockResolvedValue(mockExtrinsics);

      const result = await blockchainService.getExtrinsicsByBlock(BigInt(1000));
      expect(result).toEqual(mockExtrinsics);
      expect(mockRpcService.getExtrinsicsByBlock).toHaveBeenCalledWith(BigInt(1000));
    });
  });

  describe('Chain Statistics', () => {
    it('should get chain stats', async () => {
      const mockStats = {
        blockHeight: BigInt(1000),
        blockTime: 6,
        totalIssuance: BigInt('1000000000000000000000'),
        activeValidators: 100,
        inflation: 0.1,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getChainStats.mockResolvedValue(mockStats);

      const result = await blockchainService.getChainStats();
      expect(result).toEqual(mockStats);
      expect(mockRpcService.getChainStats).toHaveBeenCalled();
    });

    it('should handle chain stats errors', async () => {
      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getChainStats.mockRejectedValue(new Error('Stats Error'));

      await expect(blockchainService.getChainStats()).rejects.toThrow('Stats Error');
      expect(mockedLogError).toHaveBeenCalled();
    });
  });

  describe('Validator Operations', () => {
    it('should get validators', async () => {
      const mockValidators = [
        {
          address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          commission: '10%',
          totalStake: BigInt('1000000000000000000'),
          active: true,
        },
      ];

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getValidators.mockResolvedValue(mockValidators);

      const result = await blockchainService.getValidators();
      expect(result).toEqual(mockValidators);
      expect(mockRpcService.getValidators).toHaveBeenCalled();
    });
  });

  describe('Account Operations', () => {
    it('should get account details', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const mockAccount = {
        address,
        balance: BigInt('1000000000000000000'),
        nonce: 5,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getAccountDetails.mockResolvedValue(mockAccount);

      const result = await blockchainService.getAccountDetails(address);
      expect(result).toEqual(mockAccount);
      expect(mockRpcService.getAccountDetails).toHaveBeenCalledWith(address);
    });
  });

  describe('Data Submission Operations', () => {
    it('should get data submissions', async () => {
      const mockSubmissions = {
        submissions: [
          {
            appId: 1,
            size: 1024,
            submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            blockNumber: BigInt(1000),
            timestamp: BigInt(1640995200000),
          },
        ],
        total: 100,
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getDataSubmissions.mockResolvedValue(mockSubmissions);

      const result = await blockchainService.getDataSubmissions();
      expect(result).toEqual(mockSubmissions);
      expect(mockRpcService.getDataSubmissions).toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should check health', async () => {
      const mockHealth = {
        healthy: true,
        details: 'All systems operational',
      };

      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getHealth.mockResolvedValue(mockHealth);

      const result = await blockchainService.getHealth();
      expect(result).toEqual(mockHealth);
      expect(mockRpcService.getHealth).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC service errors gracefully', async () => {
      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getLatestBlocks.mockRejectedValue(new Error('Connection failed'));

      await expect(blockchainService.getLatestBlocks()).rejects.toThrow('Connection failed');
      expect(mockedLogError).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      const mockRpcService = require('../../../src/services/rpc').default;
      mockRpcService.getChainStats.mockRejectedValue(new Error('Request timeout'));

      await expect(blockchainService.getChainStats()).rejects.toThrow('Request timeout');
    });
  });
}); 