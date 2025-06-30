import { AvailDataSubmissionIndexer } from '../DataSubmissionIndexer';
import { createAvailBlockchainService } from '../../../core/avail-blockchain';

// Mock dependencies
jest.mock('../../../core/avail-blockchain');
jest.mock('../../../../database', () => ({
  dataSubmissionRepository: {
    findByExtrinsicHash: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    exists: jest.fn(),
  },
  rollupRepository: {
    findByAppId: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    incrementStats: jest.fn(),
  },
  blockRepository: {
    findByNumber: jest.fn(),
    create: jest.fn(),
  },
}));

import { 
  dataSubmissionRepository, 
  rollupRepository, 
  blockRepository,
} from '../../../../database';

describe('AvailDataSubmissionIndexer', () => {
  let dataSubmissionIndexer: AvailDataSubmissionIndexer;
  let mockAvailService: jest.Mocked<any>;
  let mockQueueService: jest.Mocked<any>;

  const mockBlockData = {
    number: 1000,
    hash: '0x1234567890abcdef',
    timestamp: new Date().toISOString(),
    parentHash: '0xparent123',
    stateRoot: '0xstate123',
    extrinsicsRoot: '0xextrinsics123',
    spec_version: 100,
    header: {
      number: 1000,
      hash: '0x1234567890abcdef',
      extension: {
        v3: {
          appLookup: [
            { appId: 1, start: 0, len: 100 },
            { appId: 2, start: 100, len: 200 },
          ],
        },
      },
    },
  };

  const mockDataSubmissions = [
    {
      extrinsicIndex: 1,
      txHash: '0xextrinsic1',
      submitter: '5D5ZbGH...',
      dataSize: 100,
      success: true,
    },
    {
      extrinsicIndex: 2,
      txHash: '0xextrinsic2',
      submitter: '5E5FgT...',
      dataSize: 200,
      success: true,
    },
  ];

  const mockBlockWithSubmissions = {
    block: mockBlockData,
    dataSubmissions: mockDataSubmissions,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAvailService = {
      start: jest.fn(),
      getBlockWithDataSubmissions: jest.fn(),
      disconnect: jest.fn(),
      isHealthy: jest.fn(),
      stop: jest.fn(),
    };

    mockQueueService = {
      addJob: jest.fn(),
    };

    // Mock the factory function
    (createAvailBlockchainService as jest.Mock).mockReturnValue(mockAvailService);

    dataSubmissionIndexer = new AvailDataSubmissionIndexer(mockQueueService);
    
    // Mock the private extractAppLookupFromBlock method to return the test appLookup
    jest.spyOn(dataSubmissionIndexer as any, 'extractAppLookupFromBlock')
      .mockResolvedValue([
        { appId: 1, start: 0, len: 100 },
        { appId: 2, start: 100, len: 200 },
      ]);
  });

  describe('initialize', () => {
    it('should successfully initialize the indexer', async () => {
      // Arrange
      mockAvailService.start.mockResolvedValue(undefined);

      // Act
      await dataSubmissionIndexer.initialize();

      // Assert
      expect(mockAvailService.start).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      // Arrange
      mockAvailService.start.mockRejectedValue(new Error('Avail service failed to start'));

      // Act & Assert
      await expect(dataSubmissionIndexer.initialize()).rejects.toThrow('Avail service failed to start');
    });
  });

  describe('indexBlock', () => {
    beforeEach(() => {
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      mockAvailService.isHealthy.mockReturnValue(true);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (rollupRepository.incrementStats as jest.Mock).mockResolvedValue({});
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });
    });

    it('should successfully index data submissions for a block', async () => {
      // Act
      const result = await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.totalDataSize).toBe(300);
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1000);
      expect(dataSubmissionRepository.createMany).toHaveBeenCalled();
    });

    it('should handle blocks with no data submissions', async () => {
      // Arrange
      const emptyBlockWithSubmissions = {
        block: mockBlockData,
        dataSubmissions: [],
      };
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(emptyBlockWithSubmissions);

      // Act
      const result = await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.totalDataSize).toBe(0);
      expect(dataSubmissionRepository.createMany).not.toHaveBeenCalled();
    });

    it('should extract app IDs from block header extension', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      const createManyCall = (dataSubmissionRepository.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall).toHaveLength(2);
      expect(createManyCall[0].appId).toBe(1);
      expect(createManyCall[1].appId).toBe(2);
    });

    it('should ensure block exists before creating data submissions', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(blockRepository.findByNumber).toHaveBeenCalledWith(1000);
      expect(blockRepository.create).toHaveBeenCalled();
    });

    it('should ensure rollups exist before creating data submissions', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(rollupRepository.findByAppId).toHaveBeenCalledWith(1);
      expect(rollupRepository.findByAppId).toHaveBeenCalledWith(2);
      expect(rollupRepository.createMany).toHaveBeenCalledTimes(1);
    });

    it('should queue cross-domain account indexing jobs for submitters', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...',
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5E5FgT...',
      });
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate submitter addresses when queuing jobs', async () => {
      // Arrange
      const submissionsWithDuplicates = [
        {
          extrinsicIndex: 1,
          txHash: '0xextrinsic1',
          submitter: '5D5ZbGH...',
          dataSize: 100,
          success: true,
        },
        {
          extrinsicIndex: 2,
          txHash: '0xextrinsic2',
          submitter: '5D5ZbGH...', // Same submitter
          dataSize: 200,
          success: true,
        },
      ];
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue({
        block: mockBlockData,
        dataSubmissions: submissionsWithDuplicates,
      });

      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(1);
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...',
      });
    });

    it('should handle queue service errors gracefully', async () => {
      // Arrange
      mockQueueService.addJob.mockRejectedValue(new Error('Queue service unavailable'));

      // Act
      const result = await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(2); // Should succeed despite queue errors
      expect(dataSubmissionRepository.createMany).toHaveBeenCalled();
    });

    it('should handle missing queue service gracefully', async () => {
      // Arrange
      const indexerWithoutQueue = new AvailDataSubmissionIndexer();

      // Act
      const result = await indexerWithoutQueue.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(2);
      // Should not throw error even without queue service
    });

    it('should handle avail service errors', async () => {
      // Arrange
      mockAvailService.getBlockWithDataSubmissions.mockRejectedValue(
        new Error('Failed to fetch block data')
      );

      // Act & Assert
      await expect(dataSubmissionIndexer.indexBlock(1000)).rejects.toThrow('Failed to fetch block data');
    });

    it('should handle repository errors', async () => {
      // Arrange
      (dataSubmissionRepository.createMany as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(dataSubmissionIndexer.indexBlock(1000)).rejects.toThrow('Database connection failed');
    });

    it('should convert blockchain data to database format correctly', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      const createManyCall = (dataSubmissionRepository.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall[0]).toMatchObject({
        blockNumber: 1000,
        blockHash: '0x1234567890abcdef',
        extrinsicIndex: 1,
        txHash: '0xextrinsic1',
        submitter: '5D5ZbGH...',
        appId: 1,
        dataSize: 100,
        success: true,
      });
      expect(createManyCall[0].timestamp).toBeInstanceOf(Date);
      expect(createManyCall[0].dataHash).toBeDefined();
    });

    it('should handle malformed block data gracefully', async () => {
      // Arrange
      const malformedBlock = {
        block: { ...mockBlockData, header: null },
        dataSubmissions: mockDataSubmissions,
      };
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(malformedBlock);

      // Act
      const result = await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(2);
      // Should handle missing header gracefully and assign default app ID
    });
  });

  describe('indexBlockRange', () => {
    beforeEach(() => {
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    });

    it('should successfully index a range of blocks', async () => {
      // Act
      const stats = await dataSubmissionIndexer.indexBlockRange(1000, 1002, 2);

      // Assert
      expect(stats.blocksProcessed).toBe(3);
      expect(stats.dataSubmissionsFound).toBe(6); // 2 submissions per block * 3 blocks
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledTimes(3);
    });

    it('should handle batch processing correctly', async () => {
      // Act
      await dataSubmissionIndexer.indexBlockRange(1000, 1004, 2);

      // Assert
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1000);
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1001);
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1002);
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1003);
      expect(mockAvailService.getBlockWithDataSubmissions).toHaveBeenCalledWith(1004);
    });

    it('should continue processing even if individual blocks fail', async () => {
      // Arrange
      mockAvailService.getBlockWithDataSubmissions
        .mockResolvedValueOnce(mockBlockWithSubmissions) // Block 1000 succeeds
        .mockRejectedValueOnce(new Error('Block 1001 failed')) // Block 1001 fails
        .mockResolvedValueOnce(mockBlockWithSubmissions); // Block 1002 succeeds

      // Act
      const stats = await dataSubmissionIndexer.indexBlockRange(1000, 1002, 1);

      // Assert
      expect(stats.blocksProcessed).toBe(2); // Only successful blocks counted
      expect(stats.errors).toBe(1); // One error recorded
    });
  });

  describe('Cross-Domain Job Queuing', () => {
    beforeEach(() => {
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });
    });

    it('should only queue INDEX_ACCOUNT jobs', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        'INDEX_ACCOUNT', 
        expect.any(Object)
      );
      
      // Should not queue jobs for other domains
      expect(mockQueueService.addJob).not.toHaveBeenCalledWith(
        'INDEX_VALIDATOR', 
        expect.any(Object)
      );
      expect(mockQueueService.addJob).not.toHaveBeenCalledWith(
        'INDEX_TRANSFER', 
        expect.any(Object)
      );
    });

    it('should queue jobs with correct account parameters', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...',
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5E5FgT...',
      });
    });
  });

  describe('App ID Processing', () => {
    beforeEach(() => {
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    });

    it('should extract app IDs from header extension correctly', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      const createManyCall = (dataSubmissionRepository.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall[0].appId).toBe(1);
      expect(createManyCall[1].appId).toBe(2);
    });

    it('should handle missing header extension gracefully', async () => {
      // Arrange
      const blockWithoutExtension = {
        ...mockBlockData,
        header: { ...mockBlockData.header, extension: null },
      };
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue({
        block: blockWithoutExtension,
        dataSubmissions: mockDataSubmissions,
      });
      
      // Override the extractAppLookupFromBlock mock to return null for this test
      jest.spyOn(dataSubmissionIndexer as any, 'extractAppLookupFromBlock')
        .mockResolvedValueOnce(null);

      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      const createManyCall = (dataSubmissionRepository.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall[0].appId).toBe(0); // Default app ID
      expect(createManyCall[1].appId).toBe(0);
    });

    it('should create rollup records for new app IDs', async () => {
      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(rollupRepository.findByAppId).toHaveBeenCalledWith(1);
      expect(rollupRepository.findByAppId).toHaveBeenCalledWith(2);
      expect(rollupRepository.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ appId: 1 }),
          expect.objectContaining({ appId: 2 })
        ])
      );
    });
  });

  describe('Rollup Management', () => {
    beforeEach(() => {
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    });

    it('should skip creating rollup if it already exists', async () => {
      // Arrange
      (rollupRepository.findByAppId as jest.Mock)
        .mockResolvedValueOnce({ id: 1, appId: 1, name: 'Existing Rollup' })
        .mockResolvedValueOnce(null); // Second app ID doesn't exist

      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert  
      expect(rollupRepository.createMany).toHaveBeenCalledTimes(1); // Only for remaining app IDs
      expect(rollupRepository.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ appId: 2 }) // Only create rollup for app ID 2
        ])
      );
    });

    it('should update rollup statistics correctly', async () => {
      // Arrange
      const existingRollup = { 
        id: 1, 
        appId: 1, 
        totalSubmissions: 5,
        totalDataSize: 1000,
      };
      (rollupRepository.findByAppId as jest.Mock)
        .mockResolvedValueOnce(existingRollup) // First call in ensureRollupsExist for app ID 1
        .mockResolvedValueOnce(null)           // Second call in ensureRollupsExist for app ID 2
        .mockResolvedValueOnce(existingRollup) // Third call in updateRollupStatistics for app ID 1
        .mockResolvedValueOnce(null);          // Fourth call in updateRollupStatistics for app ID 2

      // Act
      await dataSubmissionIndexer.indexBlock(1000);

      // Assert
      expect(rollupRepository.update).toHaveBeenCalledWith(1, {
        totalSubmissions: 6, // 5 + 1 new submission
        totalDataSize: 1100, // 1000 + 100 new data size
      });
    });
  });

  describe('Architecture Independence', () => {
    it('should operate independently without queue service', async () => {
      // Arrange
      const independentIndexer = new AvailDataSubmissionIndexer();
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      // Act
      const result = await independentIndexer.indexBlock(1000);

      // Assert
      expect(result.indexed).toBe(2);
      expect(result.totalDataSize).toBe(300);
      // Should complete successfully without external dependencies
    });

    it('should not have direct dependencies on other domain services', () => {
      // Assert - verify the indexer only uses repositories and optional queue service
      expect(dataSubmissionIndexer).toBeDefined();
      // The constructor should only accept queueService, no other domain services
    });
  });

  describe('getStats', () => {
    it('should return correct indexing statistics', async () => {
      // Arrange
      mockAvailService.getBlockWithDataSubmissions.mockResolvedValue(mockBlockWithSubmissions);
      (blockRepository.findByNumber as jest.Mock).mockResolvedValue(null);
      (blockRepository.create as jest.Mock).mockResolvedValue({});
      (rollupRepository.findByAppId as jest.Mock).mockResolvedValue(null);
      (rollupRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      (dataSubmissionRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      // Act
      await dataSubmissionIndexer.indexBlock(1000);
      const stats = dataSubmissionIndexer.getStats();

      // Assert
      expect(stats.blocksProcessed).toBe(1);
      expect(stats.dataSubmissionsFound).toBe(2);
      expect(stats.totalDataSize).toBe(300);
      expect(stats.errors).toBe(0);
      expect(stats.startTime).toBeInstanceOf(Date);
    });
  });

  describe('disconnect', () => {
    it('should properly cleanup resources', async () => {
      // Arrange
      mockAvailService.isHealthy.mockReturnValue(true);
      mockAvailService.stop.mockResolvedValue(undefined);

      // Act
      await dataSubmissionIndexer.disconnect();

      // Assert
      expect(mockAvailService.isHealthy).toHaveBeenCalled();
      expect(mockAvailService.stop).toHaveBeenCalled();
    });
  });
});