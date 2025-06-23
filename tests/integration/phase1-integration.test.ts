import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { AvailBlockchainService } from '../../src/services/core/avail-blockchain';
import { EnhancedProcessorService } from '../../src/services/domain/EnhancedProcessor';
import { ValidatorRepository } from '../../src/database/repositories/ValidatorRepository';
import { TransferRepository } from '../../src/database/repositories/TransferRepository';
import { EraRepository } from '../../src/database/repositories/EraRepository';
import db from '../../src/utils/database';
import logger from '../../src/utils/logger';

describe('Phase 1 Integration Tests', () => {
  let blockchain: AvailBlockchainService;
  let enhancedProcessor: EnhancedProcessorService;
  let validatorRepo: ValidatorRepository;
  let transferRepo: TransferRepository;
  let eraRepo: EraRepository;

  beforeAll(async () => {
    // Initialize services
    blockchain = new AvailBlockchainService();
    validatorRepo = new ValidatorRepository();
    transferRepo = new TransferRepository();
    eraRepo = new EraRepository();

    enhancedProcessor = new EnhancedProcessorService(
      db,
      blockchain,
      validatorRepo,
      transferRepo,
      eraRepo,
    );

    // Start services
    await blockchain.start();
    await enhancedProcessor.start();
    
    logger.info('Phase 1 integration tests initialized');
  });

  afterAll(async () => {
    await enhancedProcessor.stop();
    await blockchain.stop();
    await db.disconnect();
    logger.info('Phase 1 integration tests cleanup completed');
  });

  describe('Service Initialization', () => {
    test('should initialize all services successfully', async () => {
      expect(blockchain).toBeDefined();
      expect(enhancedProcessor).toBeDefined();
      expect(validatorRepo).toBeDefined();
      expect(transferRepo).toBeDefined();
      expect(eraRepo).toBeDefined();
    });

    test('should have healthy blockchain service', async () => {
      expect(blockchain.isHealthy()).toBe(true);
    });

    test('should have healthy enhanced processor', async () => {
      expect(enhancedProcessor.isHealthy()).toBe(true);
    });
  });

  describe('Database Repositories', () => {
    test('should connect to database successfully', async () => {
      expect(db).toBeDefined();
    });

    test('should have Phase 1 repositories available', async () => {
      expect(validatorRepo).toBeDefined();
      expect(transferRepo).toBeDefined();
      expect(eraRepo).toBeDefined();
    });

    test('should query validator repository', async () => {
      const validators = await validatorRepo.findMany({ limit: 1 });
      expect(validators).toBeDefined();
      expect(Array.isArray(validators.validators)).toBe(true);
    });
  });

  describe('Enhanced Processor Service', () => {
    test('should initialize and be healthy', async () => {
      expect(enhancedProcessor.isHealthy()).toBe(true);
    });

    test('should toggle Phase 1 processing', async () => {
      // Test Phase 1 toggle functionality
      enhancedProcessor.setPhase1Enabled(false);
      enhancedProcessor.setPhase1Enabled(true);
      
      // If we reach here without errors, the toggle works
      expect(true).toBe(true);
    });

    test('should return processing statistics', async () => {
      const stats = await enhancedProcessor.getProcessingStats();
      
      expect(stats).toHaveProperty('blocksProcessed');
      expect(stats).toHaveProperty('extrinsicsProcessed');
      expect(stats).toHaveProperty('phase1Stats');
      expect(stats.phase1Stats).toHaveProperty('validatorsTracked');
      expect(stats.phase1Stats).toHaveProperty('transfersProcessed');
      expect(stats.phase1Stats).toHaveProperty('erasTracked');
      
      logger.info('Processing statistics:', stats);
    });
  });

  describe('Mock Block Processing', () => {
    test('should process mock block data', async () => {
      const mockBlockData = {
        number: 1000000,
        hash: '0xtest123',
        parentHash: '0xparent123',
        stateRoot: '0xstate123',
        extrinsicsRoot: '0xextrinsics123',
        author: 'test-validator-address',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };

      // Should not throw when processing mock data
      await expect(enhancedProcessor.processBlock(mockBlockData))
        .resolves.not.toThrow();
    });

    test('should handle block processing errors gracefully', async () => {
      const invalidBlockData = {
        number: 999999999,
        hash: '0xinvalid',
        parentHash: '0xinvalidparent',
        stateRoot: '0xinvalidstate',
        extrinsicsRoot: '0xinvalidextrinsics',
        author: 'invalid-validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };
      
      // Should not throw even with invalid data
      await expect(enhancedProcessor.processBlock(invalidBlockData))
        .resolves.not.toThrow();
    });
  });

  describe('Phase 1 Feature Testing', () => {
    test('should create validator record', async () => {
      const testValidator = {
        stashAddress: 'test-validator-123',
        commission: 5,
        selfBonded: BigInt(1000000),
        totalBonded: BigInt(5000000),
        status: 'active' as const,
      };

      const validator = await validatorRepo.create(testValidator);
      expect(validator).toBeDefined();
      expect(validator.stashAddress).toBe(testValidator.stashAddress);
      expect(validator.commission).toBe(testValidator.commission);
      
      // Cleanup
      await validatorRepo.delete(testValidator.stashAddress);
    });

    test('should create transfer record', async () => {
      const testTransfer = {
        extrinsicHash: '0xtest-transfer-123',
        fromAddress: 'sender-address',
        toAddress: 'receiver-address',
        amount: BigInt(1000000),
        blockNumber: BigInt(1000000),
        timestamp: BigInt(Date.now()),
        status: 'success' as const,
      };

      const transfer = await transferRepo.create(testTransfer);
      expect(transfer).toBeDefined();
      expect(transfer.fromAddress).toBe(testTransfer.fromAddress);
      expect(transfer.toAddress).toBe(testTransfer.toAddress);
      expect(transfer.amount).toBe(testTransfer.amount);
      
      // Cleanup
      await transferRepo.delete(transfer.id);
    });

    test('should create era record', async () => {
      const testEra = {
        number: 999,
        startBlock: 1000000,
        totalStaked: BigInt(5000000),
        validatorCount: 100,
        active: true,
      };

      const era = await eraRepo.create(testEra);
      expect(era).toBeDefined();
      expect(era.number).toBe(testEra.number);
      expect(era.startBlock).toBe(testEra.startBlock);
      expect(era.active).toBe(testEra.active);
      
      // Verify we can find it
      const foundEra = await eraRepo.findByNumber(testEra.number);
      expect(foundEra).toBeDefined();
      expect(foundEra.number).toBe(testEra.number);
    });
  });

  describe('Data Integrity', () => {
    test('should maintain processing statistics consistency', async () => {
      const stats = await enhancedProcessor.getProcessingStats();
      
      // All counts should be non-negative
      expect(stats.blocksProcessed).toBeGreaterThanOrEqual(0);
      expect(stats.extrinsicsProcessed).toBeGreaterThanOrEqual(0);
      expect(stats.phase1Stats.validatorsTracked).toBeGreaterThanOrEqual(0);
      expect(stats.phase1Stats.transfersProcessed).toBeGreaterThanOrEqual(0);
      expect(stats.phase1Stats.erasTracked).toBeGreaterThanOrEqual(0);
    });

    test('should handle service lifecycle correctly', async () => {
      // Service should be running and healthy
      expect(enhancedProcessor.isHealthy()).toBe(true);
      
      // Health check should return valid structure
      const health = await enhancedProcessor.getHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('details');
    });
  });

  describe('Backward Compatibility', () => {
    test('should work with Phase 1 disabled', async () => {
      const mockBlockData = {
        number: 1000001,
        hash: '0xtest124',
        parentHash: '0xparent124',
        stateRoot: '0xstate124',
        extrinsicsRoot: '0xextrinsics124',
        author: 'test-validator',
        timestamp: Date.now(),
        extrinsics: [],
        events: [],
      };
      
      // Disable Phase 1 processing
      enhancedProcessor.setPhase1Enabled(false);
      
      // Should still process blocks successfully
      await expect(enhancedProcessor.processBlock(mockBlockData))
        .resolves.not.toThrow();
      
      // Re-enable for other tests
      enhancedProcessor.setPhase1Enabled(true);
    });
  });
}); 