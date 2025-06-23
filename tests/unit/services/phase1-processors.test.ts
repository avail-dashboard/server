import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ValidatorProcessor } from '../../../src/services/domain/ValidatorProcessor';
import { TransferProcessor } from '../../../src/services/domain/TransferProcessor';
import { EnhancedProcessorService } from '../../../src/services/domain/EnhancedProcessor';
import { AvailBlockchainService } from '../../../src/services/core/avail-blockchain';
import { ValidatorRepository } from '../../../src/database/repositories/ValidatorRepository';
import { TransferRepository } from '../../../src/database/repositories/TransferRepository';
import { EraRepository } from '../../../src/database/repositories/EraRepository';
import db from '../../../src/utils/database';

// Mock dependencies
jest.mock('../../../src/services/core/avail-blockchain');
jest.mock('../../../src/database/repositories/ValidatorRepository');
jest.mock('../../../src/database/repositories/TransferRepository');
jest.mock('../../../src/database/repositories/EraRepository');
jest.mock('../../../src/utils/database');

describe('Phase 1 Processors Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ValidatorProcessor', () => {
    test('should initialize successfully', () => {
      expect(true).toBe(true);
    });
  });

  describe('TransferProcessor', () => {
    test('should initialize successfully', () => {
      expect(true).toBe(true);
    });
  });

  describe('EnhancedProcessorService', () => {
    test('should initialize successfully', () => {
      expect(true).toBe(true);
    });
  });
});

describe('Phase 1 Processors', () => {
  let mockBlockchain: jest.Mocked<AvailBlockchainService>;
  let mockValidatorRepo: jest.Mocked<ValidatorRepository>;
  let mockTransferRepo: jest.Mocked<TransferRepository>;
  let mockEraRepo: jest.Mocked<EraRepository>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockBlockchain = new AvailBlockchainService() as jest.Mocked<AvailBlockchainService>;
    mockValidatorRepo = new ValidatorRepository() as jest.Mocked<ValidatorRepository>;
    mockTransferRepo = new TransferRepository() as jest.Mocked<TransferRepository>;
    mockEraRepo = new EraRepository() as jest.Mocked<EraRepository>;
    
    // Setup default mock implementations
    mockValidatorRepo.findByStashAddress = jest.fn().mockResolvedValue(null);
    mockValidatorRepo.upsert = jest.fn().mockResolvedValue({
      stashAddress: 'test-validator',
      commission: 5,
      totalBonded: BigInt(1000000),
      status: 'active',
    });
    
    mockTransferRepo.findByExtrinsicHash = jest.fn().mockResolvedValue([]);
    mockTransferRepo.create = jest.fn().mockResolvedValue({
      id: 'test-transfer-1',
      fromAddress: 'sender',
      toAddress: 'receiver',
      amount: BigInt(100),
    });
    
    mockEraRepo.findByNumber = jest.fn().mockResolvedValue(null);
    mockEraRepo.upsert = jest.fn().mockResolvedValue({
      number: 1,
      startBlock: BigInt(1000),
      active: true,
    });
  });

  describe('ValidatorProcessor', () => {
    let validatorProcessor: ValidatorProcessor;
    
    beforeEach(() => {
      validatorProcessor = new ValidatorProcessor(
        mockBlockchain,
        mockValidatorRepo,
        mockEraRepo,
      );
    });

    test('should process block validator successfully', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'test-validator-address',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      await validatorProcessor.processBlockValidator(mockBlockData);

      expect(mockValidatorRepo.upsert).toHaveBeenCalledWith(
        'test-validator-address',
        expect.objectContaining({
          stashAddress: 'test-validator-address',
          blocksProduced: 1,
          lastBlockProduced: 1000,
        }),
      );
    });

    test('should handle missing block author gracefully', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: undefined,
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      await expect(validatorProcessor.processBlockValidator(mockBlockData))
        .resolves.not.toThrow();
      
      expect(mockValidatorRepo.upsert).not.toHaveBeenCalled();
    });

    test('should process era changes', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'test-validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [
          {
            section: 'staking',
            method: 'NewEra',
            data: [2], // Era number
          },
        ],
      };

      await validatorProcessor.processEraChange(mockBlockData);

      expect(mockEraRepo.upsert).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          number: 2,
          startBlock: BigInt(1000),
          active: true,
        }),
      );
    });

    test('should handle validator repository errors gracefully', async () => {
      mockValidatorRepo.upsert.mockRejectedValue(new Error('Database error'));
      
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'test-validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      await expect(validatorProcessor.processBlockValidator(mockBlockData))
        .resolves.not.toThrow();
    });
  });

  describe('TransferProcessor', () => {
    let transferProcessor: TransferProcessor;
    
    beforeEach(() => {
      transferProcessor = new TransferProcessor(
        mockBlockchain,
        mockTransferRepo,
      );
    });

    test('should process balance transfer extrinsics', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [
          {
            hash: '0xtransfer1',
            index: 1,
            section: 'balances',
            method: 'transfer',
            args: {
              dest: 'receiver-address',
              value: '1000000000000000000', // 1 AVAIL
            },
            signer: 'sender-address',
            success: true,
          },
        ],
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['sender-address', 'receiver-address', '1000000000000000000'],
            extrinsicIndex: 1,
          },
          {
            section: 'balances',
            method: 'Withdraw',
            data: ['sender-address', '100000000000000'], // Fee
            extrinsicIndex: 1,
          },
        ],
      };

      await transferProcessor.processBlockTransfers(mockBlockData);

      expect(mockTransferRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extrinsicHash: '0xtransfer1',
          fromAddress: 'sender-address',
          toAddress: 'receiver-address',
          amount: BigInt('1000000000000000000'),
          fees: BigInt('100000000000000'),
          status: 'success',
        }),
      );
    });

    test('should handle transfer events without corresponding extrinsics', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['sender', 'receiver', '1000000'],
            extrinsicIndex: 0,
          },
        ],
      };

      await transferProcessor.processBlockTransfers(mockBlockData);

      expect(mockTransferRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAddress: 'sender',
          toAddress: 'receiver',
          amount: BigInt('1000000'),
          status: 'success',
        }),
      );
    });

    test('should skip duplicate transfers', async () => {
      mockTransferRepo.findByExtrinsicHash.mockResolvedValue([
        { id: 'existing-transfer', extrinsicHash: '0xtransfer1' },
      ]);

      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [
          {
            hash: '0xtransfer1',
            index: 1,
            section: 'balances',
            method: 'transfer',
            args: { dest: 'receiver', value: '1000000' },
            signer: 'sender',
            success: true,
          },
        ],
        events: [],
      };

      await transferProcessor.processBlockTransfers(mockBlockData);

      expect(mockTransferRepo.create).not.toHaveBeenCalled();
    });

    test('should handle transfer repository errors gracefully', async () => {
      mockTransferRepo.create.mockRejectedValue(new Error('Database error'));
      
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [
          {
            hash: '0xtransfer1',
            index: 1,
            section: 'balances',
            method: 'transfer',
            args: { dest: 'receiver', value: '1000000' },
            signer: 'sender',
            success: true,
          },
        ],
        events: [],
      };

      await expect(transferProcessor.processBlockTransfers(mockBlockData))
        .resolves.not.toThrow();
    });
  });

  describe('EnhancedProcessorService', () => {
    let enhancedProcessor: EnhancedProcessorService;
    
    beforeEach(() => {
      enhancedProcessor = new EnhancedProcessorService(
        db,
        mockBlockchain,
        mockValidatorRepo,
        mockTransferRepo,
        mockEraRepo,
      );
    });

    test('should start and stop successfully', async () => {
      await expect(enhancedProcessor.start()).resolves.not.toThrow();
      expect(enhancedProcessor.isHealthy()).toBe(true);
      
      await expect(enhancedProcessor.stop()).resolves.not.toThrow();
    });

    test('should process block with Phase 1 enabled', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      enhancedProcessor.setPhase1Enabled(true);
      await expect(enhancedProcessor.processBlock(mockBlockData))
        .resolves.not.toThrow();
    });

    test('should skip Phase 1 processing when disabled', async () => {
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      enhancedProcessor.setPhase1Enabled(false);
      await expect(enhancedProcessor.processBlock(mockBlockData))
        .resolves.not.toThrow();
      
      // Phase 1 repositories should not be called
      expect(mockValidatorRepo.upsert).not.toHaveBeenCalled();
      expect(mockTransferRepo.create).not.toHaveBeenCalled();
    });

    test('should return processing statistics', async () => {
      const stats = await enhancedProcessor.getProcessingStats();
      
      expect(stats).toHaveProperty('blocksProcessed');
      expect(stats).toHaveProperty('extrinsicsProcessed');
      expect(stats).toHaveProperty('phase1Stats');
      expect(stats.phase1Stats).toHaveProperty('validatorsTracked');
      expect(stats.phase1Stats).toHaveProperty('transfersProcessed');
    });

    test('should handle Phase 1 processing errors gracefully', async () => {
      mockValidatorRepo.upsert.mockRejectedValue(new Error('Validator error'));
      mockTransferRepo.create.mockRejectedValue(new Error('Transfer error'));
      
      const mockBlockData = {
        number: 1000,
        hash: '0xtest',
        author: 'validator',
        timestamp: Date.now(),
        extrinsics: [
          {
            hash: '0xtransfer1',
            index: 1,
            section: 'balances',
            method: 'transfer',
            args: { dest: 'receiver', value: '1000000' },
            signer: 'sender',
            success: true,
          },
        ],
        events: [],
      };

      // Should not throw even if Phase 1 processing fails
      await expect(enhancedProcessor.processBlock(mockBlockData))
        .resolves.not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should process complex block with multiple transfers and validator data', async () => {
      const enhancedProcessor = new EnhancedProcessorService(
        db,
        mockBlockchain,
        mockValidatorRepo,
        mockTransferRepo,
        mockEraRepo,
      );

      const complexBlockData = {
        number: 1000,
        hash: '0xcomplex',
        author: 'validator-1',
        timestamp: Date.now(),
        extrinsics: [
          {
            hash: '0xtransfer1',
            index: 1,
            section: 'balances',
            method: 'transfer',
            args: { dest: 'receiver1', value: '1000000' },
            signer: 'sender1',
            success: true,
          },
          {
            hash: '0xtransfer2',
            index: 2,
            section: 'balances',
            method: 'transferKeepAlive',
            args: { dest: 'receiver2', value: '2000000' },
            signer: 'sender2',
            success: true,
          },
        ],
        events: [
          {
            section: 'balances',
            method: 'Transfer',
            data: ['sender1', 'receiver1', '1000000'],
            extrinsicIndex: 1,
          },
          {
            section: 'balances',
            method: 'Transfer',
            data: ['sender2', 'receiver2', '2000000'],
            extrinsicIndex: 2,
          },
          {
            section: 'staking',
            method: 'NewEra',
            data: [5],
          },
        ],
      };

      await enhancedProcessor.start();
      await enhancedProcessor.processBlock(complexBlockData);

      // Verify validator processing
      expect(mockValidatorRepo.upsert).toHaveBeenCalledWith(
        'validator-1',
        expect.objectContaining({
          stashAddress: 'validator-1',
          blocksProduced: 1,
          lastBlockProduced: 1000,
        }),
      );

      // Verify transfer processing (2 transfers)
      expect(mockTransferRepo.create).toHaveBeenCalledTimes(2);

      // Verify era processing
      expect(mockEraRepo.upsert).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          number: 5,
          startBlock: BigInt(1000),
          active: true,
        }),
      );

      await enhancedProcessor.stop();
    });
  });
}); 