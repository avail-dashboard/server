import { BlockIndexer, createBlockIndexer } from '../BlockIndexer';
import { BlockRepository } from '../../../../database/repositories/BlockRepository';
import { AvailBlockchainService } from '../../../core/avail-blockchain';

// Mock dependencies
jest.mock('../../../../database/repositories/BlockRepository');
jest.mock('../../../core/avail-blockchain');

describe('BlockIndexer', () => {
  let blockIndexer: BlockIndexer;
  let mockBlockRepository: jest.Mocked<BlockRepository>;
  let mockBlockchainService: jest.Mocked<AvailBlockchainService>;

  const mockBlockData = {
    number: 1000,
    hash: '0x1234567890abcdef',
    parentHash: '0x0987654321fedcba',
    stateRoot: '0xabcdef1234567890',
    extrinsicsRoot: '0xfedcba0987654321',
    timestamp: new Date().toISOString(),
    extrinsics: [
      {
        index: 0,
        hash: '0xextrinsic1',
        signer: '5D5ZbGH...',
        method: {
          section: 'balances',
          method: 'transfer',
          args: { dest: '5E5FgT...', value: '1000000000000' }
        },
        success: true
      }
    ],
    events: [
      {
        section: 'balances',
        method: 'Transfer',
        data: ['5D5ZbGH...', '5E5FgT...', '1000000000000']
      }
    ],
    validator: '5VALIDATOR...'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBlockRepository = {
      findByNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    mockBlockchainService = {
      getBlock: jest.fn(),
    } as any;

    blockIndexer = createBlockIndexer(mockBlockRepository, mockBlockchainService);
  });

  describe('indexBlock', () => {
    it('should successfully index a new block', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockResolvedValue(mockBlockData);
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Assert
      expect(result.success).toBe(true);
      expect(result.blockData).toBeDefined();
      expect(mockBlockchainService.getBlock).toHaveBeenCalledWith(1000);
      expect(mockBlockRepository.create).toHaveBeenCalled();
    });

    it('should update existing block', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockResolvedValue(mockBlockData);
      mockBlockRepository.findByNumber.mockResolvedValue({} as any);
      mockBlockRepository.update.mockResolvedValue({} as any);

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Assert
      expect(result.success).toBe(true);
      expect(mockBlockRepository.update).toHaveBeenCalled();
    });

    it('should extract dependent entities correctly', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockResolvedValue(mockBlockData);
      mockBlockRepository.findByNumber.mockResolvedValue(null);

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Assert
      expect(result.dependentEntities).toBeDefined();
      expect(result.dependentEntities.validators).toContain('5VALIDATOR...');
      expect(result.dependentEntities.accounts).toContain('5D5ZbGH...');
      expect(result.dependentEntities.accounts).toContain('5E5FgT...');
      expect(result.dependentEntities.transfers).toHaveLength(1);
    });

    it('should handle blockchain service errors gracefully', async () => {
      // Arrange
      const blockchainError = new Error('Blockchain connection failed');
      mockBlockchainService.getBlock.mockRejectedValue(blockchainError);

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blockchain connection failed');
      expect(mockBlockRepository.create).not.toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockResolvedValue(mockBlockData);
      mockBlockRepository.findByNumber.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('indexBlockRange', () => {
    it('should index multiple blocks successfully', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockImplementation((blockNumber) => 
        Promise.resolve({ ...mockBlockData, number: blockNumber })
      );
      mockBlockRepository.findByNumber.mockResolvedValue(null);

      // Act
      const results = await blockIndexer.indexBlockRange(1000, 1002);

      // Assert
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockBlockchainService.getBlock).toHaveBeenCalledTimes(3);
    });

    it('should continue processing even if some blocks fail', async () => {
      // Arrange
      mockBlockchainService.getBlock.mockImplementation((blockNumber) => {
        if (blockNumber === 1001) {
          throw new Error('Block 1001 failed');
        }
        return Promise.resolve({ ...mockBlockData, number: blockNumber });
      });
      mockBlockRepository.findByNumber.mockResolvedValue(null);

      // Act
      const results = await blockIndexer.indexBlockRange(1000, 1002);

      // Assert
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('Architecture Validation', () => {
    it('should operate independently without external dependencies', () => {
      // Verify BlockIndexer only depends on repository and blockchain service
      const indexer = createBlockIndexer(mockBlockRepository, mockBlockchainService);
      
      expect(indexer).toBeDefined();
      expect(indexer.indexBlock).toBeDefined();
      expect(indexer.indexBlockRange).toBeDefined();
    });

    it('should not have direct dependencies on other domain services', () => {
      // This test validates architectural independence
      // BlockIndexer should not directly import or depend on other domain services
      const indexerFile = require.resolve('../BlockIndexer');
      const fs = require('fs');
      const content = fs.readFileSync(indexerFile, 'utf8');
      
      // Should not import other domain services
      expect(content).not.toMatch(/from.*\/account\//);
      expect(content).not.toMatch(/from.*\/validator\//);
      expect(content).not.toMatch(/from.*\/transfer\//);
      expect(content).not.toMatch(/from.*\/dataSubmission\//);
    });
  });
});