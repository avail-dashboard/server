import { TransferIndexer, createTransferIndexer } from '../TransferIndexer';
import { TransferRepository } from '../../../../database/repositories/TransferRepository';

// Mock dependencies
jest.mock('../../../../database/repositories/TransferRepository');

describe('TransferIndexer', () => {
  let transferIndexer: TransferIndexer;
  let mockTransferRepository: jest.Mocked<TransferRepository>;
  let mockQueueService: jest.Mocked<any>;

  const mockBlockData = {
    number: 1000,
    hash: '0x1234567890abcdef',
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
        fee: '100000000',
        success: true
      }
    ],
    events: [
      {
        section: 'balances',
        method: 'Transfer',
        data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
        phase: { applyExtrinsic: 0 }
      }
    ]
  };

  const mockTransferData = {
    id: '0x1234567890abcdef-event-0',
    blockNumber: 1000,
    blockHash: '0x1234567890abcdef',
    extrinsicIndex: 0,
    eventIndex: 0,
    fromAddress: '5D5ZbGH...',
    toAddress: '5E5FgT...',
    amount: '1000000000000',
    fee: '100000000',
    success: true,
    timestamp: new Date(),
    txHash: '0xextrinsic1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockTransferRepository = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    mockQueueService = {
      addJob: jest.fn(),
    };

    transferIndexer = createTransferIndexer(mockTransferRepository, mockQueueService);
  });

  describe('indexTransfersForBlock', () => {
    it('should successfully extract and index transfers from block events', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      const result = await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(1);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].fromAddress).toBe('5D5ZbGH...');
      expect(result.transfers[0].toAddress).toBe('5E5FgT...');
      expect(result.transfers[0].amount).toBe('1000000000000');
      expect(mockTransferRepository.create).toHaveBeenCalled();
    });

    it('should handle blocks with no transfer events', async () => {
      // Arrange
      const blockWithNoTransfers = {
        ...mockBlockData,
        events: [
          {
            section: 'system',
            method: 'ExtrinsicSuccess',
            data: [],
          }
        ]
      };

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithNoTransfers);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(0);
      expect(result.transfers).toHaveLength(0);
      expect(mockTransferRepository.create).not.toHaveBeenCalled();
    });

    it('should handle multiple transfer events in a single block', async () => {
      // Arrange
      const blockWithMultipleTransfers = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
            phase: { applyExtrinsic: 0 }
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5E5FgT...', '5F6HjK...', '500000000000'],
            phase: { applyExtrinsic: 1 }
          }
        ]
      };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithMultipleTransfers);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(2);
      expect(result.transfers).toHaveLength(2);
      expect(mockTransferRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should generate unique transfer IDs for each event', async () => {
      // Arrange
      const blockWithMultipleTransfers = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
            phase: { applyExtrinsic: 0 }
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5E5FgT...', '5F6HjK...', '500000000000'],
            phase: { applyExtrinsic: 1 }
          }
        ]
      };
      mockTransferRepository.findById.mockResolvedValue(null);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithMultipleTransfers);

      // Assert
      expect(result.transfers[0].id).toBe('0x1234567890abcdef-event-0');
      expect(result.transfers[1].id).toBe('0x1234567890abcdef-event-1');
      expect(result.transfers[0].id).not.toBe(result.transfers[1].id);
    });

    it('should handle malformed transfer events gracefully', async () => {
      // Arrange
      const blockWithMalformedEvents = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...'], // Missing to address and amount
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: null, // Null data
          }
        ]
      };

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithMalformedEvents);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(0);
      expect(result.transfers).toHaveLength(0);
    });

    it('should queue cross-domain account indexing jobs for transfer participants', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      const result = await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(result.success).toBe(true);
      
      // Verify account indexing jobs were queued for both from and to addresses
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5E5FgT...' 
      });
      
      // Should queue exactly 2 jobs (from + to addresses)
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate account addresses when queuing jobs', async () => {
      // Arrange - block where same account appears multiple times
      const blockWithDuplicateAccounts = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
            phase: { applyExtrinsic: 0 }
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5E5FgT...', '5D5ZbGH...', '500000000000'], // Reverse transfer
            phase: { applyExtrinsic: 1 }
          }
        ]
      };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithDuplicateAccounts);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(2);
      
      // Should only queue 2 unique account jobs despite 4 account references
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(2);
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5E5FgT...' 
      });
    });

    it('should handle queue service errors gracefully', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockRejectedValue(new Error('Queue service unavailable'));

      // Act
      const result = await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(result.success).toBe(true); // Transfer indexing should succeed despite queue errors
      expect(result.transfersProcessed).toBe(1);
      expect(mockTransferRepository.create).toHaveBeenCalled();
    });

    it('should handle missing queue service gracefully', async () => {
      // Arrange
      const transferIndexerWithoutQueue = createTransferIndexer(mockTransferRepository);
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexerWithoutQueue.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(1);
      // Should not throw error even without queue service
    });

    it('should handle repository errors and return failure', async () => {
      // Arrange
      mockTransferRepository.findById.mockRejectedValue(new Error('Database connection failed'));

      // Act
      const result = await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(result.transfersProcessed).toBe(0);
    });
  });

  describe('indexTransfer', () => {
    it('should successfully index a new transfer', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfer(mockTransferData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(1);
      expect(result.transfers).toHaveLength(1);
      expect(mockTransferRepository.create).toHaveBeenCalledWith({
        id: mockTransferData.id,
        extrinsicHash: mockTransferData.txHash,
        blockNumber: mockTransferData.blockNumber,
        extrinsicIndex: mockTransferData.extrinsicIndex,
        fromAddress: mockTransferData.fromAddress,
        toAddress: mockTransferData.toAddress,
        amount: BigInt(mockTransferData.amount),
        tokenType: 'AVAIL',
        fees: BigInt(mockTransferData.fee || '0'),
        status: 'success',
        timestamp: mockTransferData.timestamp,
      });
    });

    it('should skip indexing for existing transfers', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfer(mockTransferData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(1);
      expect(mockTransferRepository.create).not.toHaveBeenCalled();
    });

    it('should handle failed transfers correctly', async () => {
      // Arrange
      const failedTransferData = { ...mockTransferData, success: false };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfer(failedTransferData);

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransferRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed'
        })
      );
    });

    it('should handle transfers without fees', async () => {
      // Arrange
      const transferWithoutFee = { ...mockTransferData, fee: undefined };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfer(transferWithoutFee);

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransferRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fees: BigInt('0')
        })
      );
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      mockTransferRepository.findById.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await transferIndexer.indexTransfer(mockTransferData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(result.transfersProcessed).toBe(0);
    });
  });

  describe('Cross-Domain Job Queuing', () => {
    it('should only queue INDEX_ACCOUNT jobs', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await transferIndexer.indexTransfersForBlock(mockBlockData);

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
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5D5ZbGH...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5E5FgT...' 
      });
    });
  });

  describe('Transfer Extraction', () => {
    it('should extract transfer data with correct event indexing', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(mockBlockData);

      // Assert
      const transfer = result.transfers[0];
      expect(transfer.id).toBe('0x1234567890abcdef-event-0');
      expect(transfer.extrinsicIndex).toBe(0);
      expect(transfer.eventIndex).toBe(0);
      expect(transfer.txHash).toBe('0xextrinsic1');
      expect(transfer.fee).toBe('100000000');
    });

    it('should handle events without associated extrinsics', async () => {
      // Arrange
      const blockWithStandaloneEvent = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
            // No phase information
          }
        ]
      };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithStandaloneEvent);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfers[0].extrinsicIndex).toBe(0);
      expect(result.transfers[0].txHash).toBeUndefined();
      expect(result.transfers[0].fee).toBeUndefined();
    });

    it('should set correct timestamps from block data', async () => {
      // Arrange
      const specificTimestamp = '2024-01-01T12:00:00.000Z';
      const blockWithTimestamp = {
        ...mockBlockData,
        timestamp: specificTimestamp
      };
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithTimestamp);

      // Assert
      expect(result.transfers[0].timestamp).toEqual(new Date(specificTimestamp));
    });
  });

  describe('Architecture Validation', () => {
    it('should operate independently without orchestrator', () => {
      // Verify TransferIndexer only depends on repository and optional queue service
      const indexer = createTransferIndexer(mockTransferRepository, mockQueueService);
      
      expect(indexer).toBeDefined();
      expect(indexer.indexTransfersForBlock).toBeDefined();
      expect(indexer.indexTransfer).toBeDefined();
    });

    it('should not have direct dependencies on other domain services', () => {
      // This test validates architectural independence
      const indexerFile = require.resolve('../TransferIndexer');
      const fs = require('fs');
      const content = fs.readFileSync(indexerFile, 'utf8');
      
      // Should not import other domain services directly
      expect(content).not.toMatch(/from.*\/block\//);
      expect(content).not.toMatch(/from.*\/validator\//);
      expect(content).not.toMatch(/from.*\/account\/.*(?<!IndexingResult)/); // Allow result types but not services
      expect(content).not.toMatch(/from.*\/dataSubmission\//);
    });

    it('should communicate only through queue service for cross-domain dependencies', () => {
      // Verify that TransferIndexer uses queue service as the only communication mechanism
      const indexer = createTransferIndexer(mockTransferRepository, mockQueueService);
      
      // Check that constructor only accepts repository and queue service
      expect(indexer).toBeInstanceOf(TransferIndexer);
      
      // Verify no direct service dependencies in constructor
      const constructorString = TransferIndexer.toString();
      expect(constructorString).not.toMatch(/AccountIndexer|ValidatorIndexer|BlockIndexer/);
    });
  });

  describe('Error Isolation', () => {
    it('should continue processing other transfers if one fails', async () => {
      // Arrange
      const blockWithMultipleTransfers = {
        ...mockBlockData,
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5D5ZbGH...', '5E5FgT...', '1000000000000'],
            phase: { applyExtrinsic: 0 }
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: ['5E5FgT...', '5F6HjK...', '500000000000'],
            phase: { applyExtrinsic: 1 }
          }
        ]
      };
      
      // Mock repository to fail on first transfer but succeed on second
      mockTransferRepository.findById
        .mockResolvedValueOnce(null) // First call succeeds
        .mockResolvedValueOnce(null); // Second call succeeds
      mockTransferRepository.create
        .mockRejectedValueOnce(new Error('Database error on first transfer'))
        .mockResolvedValueOnce({} as any);

      // Act
      const result = await transferIndexer.indexTransfersForBlock(blockWithMultipleTransfers);

      // Assert
      expect(result.success).toBe(true);
      expect(result.transfersProcessed).toBe(1); // Only one succeeded
    });

    it('should handle complete indexing failure gracefully', async () => {
      // Arrange
      const corruptedBlockData = {
        ...mockBlockData,
        events: null // This will cause extraction to fail
      };

      // Act
      const result = await transferIndexer.indexTransfersForBlock(corruptedBlockData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.transfersProcessed).toBe(0);
      expect(result.transfers).toHaveLength(0);
    });
  });
});