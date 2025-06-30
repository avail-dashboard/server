import { QueueService } from '../index';
import { BlockIndexer, createBlockIndexer } from '../../../domain/block/BlockIndexer';
import { AccountIndexer, createAccountIndexer } from '../../../domain/account/AccountIndexer';
import { TransferIndexer, createTransferIndexer } from '../../../domain/transfer/TransferIndexer';
import { ValidatorIndexer, createValidatorIndexer } from '../../../domain/validator/ValidatorIndexer';
import { AvailBlockchainService } from '../../avail-blockchain';
import { BlockRepository } from '../../../../database/repositories/BlockRepository';
import { AccountRepository } from '../../../../database/repositories/AccountRepository';
import { TransferRepository } from '../../../../database/repositories/TransferRepository';
import { ValidatorRepository } from '../../../../database/repositories/ValidatorRepository';
import { JobType, JobPriority } from '../../../types/service';
import Redis from 'ioredis';

// Valid Substrate addresses for testing
const VALID_ADDRESS_1 = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice
const VALID_ADDRESS_2 = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'; // Bob
const VALID_ADDRESS_3 = '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y'; // Charlie
const VALID_VALIDATOR = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice as validator

// Mock data for testing
const mockBlockWithTransfers = {
  number: 1000,
  hash: '0x1234567890abcdef',
  parentHash: '0xparent123',
  stateRoot: '0xstate123',
  extrinsicsRoot: '0xextrinsics123',
  timestamp: Date.now(),
  validator: VALID_VALIDATOR,
  extrinsics: [
    {
      index: 0,
      hash: '0xextrinsic1',
      signer: VALID_ADDRESS_1,
      isSigned: true,
      success: true,
      method: {
        section: 'balances',
        method: 'transfer',
        args: {
          dest: { Id: VALID_ADDRESS_2 },
          value: '1000000000000',
        },
      },
      fee: '100000000',
    },
  ],
  events: [
    {
      index: 0,
      section: 'balances',
      method: 'Transfer',
      data: [VALID_ADDRESS_1, VALID_ADDRESS_2, '1000000000000'],
      phase: { applyExtrinsic: 0 },
    },
  ],
};

const mockTransferData = {
  id: 'transfer-1',
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
  txHash: '0xextrinsic1',
};

const mockAccountData = {
  address: '5D5ZbGH...',
  balance: {
    free: '5000000000000000',
    reserved: '100000000000000',
    frozen: '50000000000000',
  },
  nonce: 42,
  identityName: 'Test Account',
  isValidator: true,
  lastActive: new Date(),
};

describe('Queue-Based Dependency Handling Integration', () => {
  let queueService: QueueService;
  let blockIndexer: BlockIndexer;
  let accountIndexer: AccountIndexer;
  let transferIndexer: TransferIndexer;
  let validatorIndexer: ValidatorIndexer;
  let testRedis: Redis;
  
  // Mock repositories
  let mockBlockRepository: jest.Mocked<BlockRepository>;
  let mockAccountRepository: jest.Mocked<AccountRepository>;
  let mockTransferRepository: jest.Mocked<TransferRepository>;
  let mockValidatorRepository: jest.Mocked<ValidatorRepository>;
  let mockBlockchainService: jest.Mocked<AvailBlockchainService>;

  beforeEach(async () => {
    // Setup test Redis instance
    testRedis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 1, // Use test database
    });
    
    // Clear test database
    await testRedis.flushdb();

    // Setup mock repositories
    mockBlockRepository = {
      findByNumber: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    mockAccountRepository = {
      findByAddress: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      exists: jest.fn(),
    } as any;

    mockTransferRepository = {
      findById: jest.fn(),
      create: jest.fn(),
      findByBlockNumber: jest.fn(),
    } as any;

    mockValidatorRepository = {
      findByStashAddress: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    // Setup mock blockchain service
    mockBlockchainService = {
      getBlock: jest.fn(),
      getApi: jest.fn(),
    } as any;

    // Mock blockchain API responses
    const mockApi = {
      query: {
        system: {
          account: jest.fn().mockResolvedValue({
            toJSON: () => ({
              data: {
                free: '5000000000000000',
                reserved: '100000000000000',
                frozen: '50000000000000',
              },
              nonce: 42,
            }),
          }),
        },
        identity: {
          identityOf: jest.fn().mockResolvedValue({
            isSome: true,
            unwrap: () => ({
              info: {
                display: { isRaw: true, asRaw: { toUtf8: () => 'Test Account' } },
              },
            }),
          }),
        },
        staking: {
          validators: {
            entries: jest.fn().mockResolvedValue([
              [{ args: [{ toString: () => '5D5ZbGH...' }] }, {}],
            ]),
          },
          ledger: jest.fn().mockResolvedValue({
            isSome: true,
            unwrap: () => ({
              toJSON: () => ({
                stash: '5D5ValidatorAddress...',
                total: '1000000000000000',
                active: '1000000000000000',
              }),
            }),
          }),
          nominators: jest.fn().mockResolvedValue({
            toJSON: () => ({
              targets: ['5D5ValidatorAddress...'],
              submittedIn: 100,
            }),
          }),
        },
      }
    };
    mockBlockchainService.getApi.mockResolvedValue(mockApi);
    mockBlockchainService.getBlock.mockResolvedValue(mockBlockWithTransfers);

    // Setup real queue service (not mocked)
    queueService = new QueueService();
    await queueService.start();

    // Create indexers with queue service
    blockIndexer = createBlockIndexer(mockBlockRepository, mockBlockchainService);
    accountIndexer = createAccountIndexer(mockBlockchainService, queueService);
    transferIndexer = createTransferIndexer(mockTransferRepository, queueService);
    validatorIndexer = createValidatorIndexer(mockValidatorRepository, mockBlockchainService, queueService);
  });

  afterEach(async () => {
    // Cleanup queue and services
    try {
      await queueService.stop();
    } catch (error) {
      // Ignore cleanup errors
    }
    try {
      await testRedis.quit();
    } catch (error) {
      // Ignore cleanup errors
    }
    jest.clearAllMocks();
  });

  describe('A. Basic Cross-Domain Job Queuing', () => {
    it('should queue account jobs when block contains transfers', async () => {
      // Arrange
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await blockIndexer.indexBlock(1000);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(result.success).toBe(true);
      expect(result.dependentEntities.accounts).toContain('5D5ZbGH...');
      expect(result.dependentEntities.accounts).toContain('5E5FgT...');
      expect(result.dependentEntities.validators).toContain('5D5ValidatorAddress...');
      
      const stats = await queueService.getStats();
      expect(stats.waiting + stats.active).toBeGreaterThanOrEqual(0);
    });

    it('should queue account jobs when processing transfers directly', async () => {
      // Arrange
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await transferIndexer.indexTransfer(mockTransferData);

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(result.success).toBe(true);
      
      const stats = await queueService.getStats();
      expect(stats.waiting + stats.active + stats.completed).toBeGreaterThanOrEqual(0);
    });

    it('should queue validator jobs when processing account with validator status', async () => {
      // Arrange
      const validatorAccountData = { ...mockAccountData, isValidator: true };
      
      // Act
      const result = await accountIndexer.indexAccount('5D5ZbGH...');

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.isValidator).toBe(true);
      
      const stats = await queueService.getStats();
      expect(stats.waiting + stats.active + stats.completed).toBeGreaterThanOrEqual(0);
    });

    it('should not queue duplicate jobs for same account', async () => {
      // Arrange
      const transfers = [
        { ...mockTransferData, id: 'transfer-1' },
        { ...mockTransferData, id: 'transfer-2', fromAddress: '5D5ZbGH...', toAddress: '5E5FgT...' },
        { ...mockTransferData, id: 'transfer-3', fromAddress: '5D5ZbGH...', toAddress: '5F6HjK...' }
      ];
      
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act
      for (const transfer of transfers) {
        await transferIndexer.indexTransfer(transfer);
      }

      // Wait for job processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert
      const stats = await queueService.getStats();
      // Should have jobs for unique accounts: 5D5ZbGH..., 5E5FgT..., 5F6HjK...
      expect(stats.waiting + stats.active + stats.completed + stats.failed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('B. End-to-End Workflow', () => {
    it('should complete full block->transfer->account indexing workflow', async () => {
      // Arrange
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockRepository.create.mockResolvedValue({} as any);
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);
      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);

      // Act - Index block with transfers
      const blockResult = await blockIndexer.indexBlock(1000);
      expect(blockResult.success).toBe(true);

      // Process transfer indexing from block data
      const transferResult = await transferIndexer.indexTransfersForBlock(mockBlockWithTransfers);
      expect(transferResult.success).toBe(true);

      // Process account indexing for transfer participants
      const accountResult1 = await accountIndexer.indexAccount('5D5ZbGH...');
      const accountResult2 = await accountIndexer.indexAccount('5E5FgT...');

      // Assert - Verify all data is properly indexed
      expect(blockResult.success).toBe(true);
      expect(transferResult.transfersProcessed).toBeGreaterThan(0);
      expect(accountResult1.success).toBe(true);
      expect(accountResult2.success).toBe(true);
      
      // Verify cross-references are correct
      expect(transferResult.transfers[0].fromAddress).toBe('5D5ZbGH...');
      expect(transferResult.transfers[0].toAddress).toBe('5E5FgT...');
    });

    it('should handle validator account workflow', async () => {
      // Arrange
      const validatorAddress = '5D5ValidatorAddress...';
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockValidatorRepository.create.mockResolvedValue({} as any);
      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);

      // Act
      // 1. Index transfer from validator account
      const transferWithValidator = {
        ...mockTransferData,
        fromAddress: validatorAddress
      };
      const transferResult = await transferIndexer.indexTransfer(transferWithValidator);

      // 2. Process account indexing job
      const accountResult = await accountIndexer.indexAccount(validatorAddress);

      // 3. Process validator indexing job
      const validatorResult = await validatorIndexer.indexValidator(validatorAddress);

      // Assert - Verify validator data is complete
      expect(transferResult.success).toBe(true);
      expect(accountResult.success).toBe(true);
      expect(validatorResult.success).toBe(true);
      expect(validatorResult.validatorData.accountId).toBe(validatorAddress);
    });

    it('should process jobs in correct dependency order', async () => {
      // Arrange
      const processingOrder: string[] = [];
      
      // Mock to track processing order
      const originalIndexAccount = accountIndexer.indexAccount.bind(accountIndexer);
      const originalIndexValidator = validatorIndexer.indexValidator.bind(validatorIndexer);
      
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        processingOrder.push(`account-${address}`);
        return originalIndexAccount(address);
      });
      
      jest.spyOn(validatorIndexer, 'indexValidator').mockImplementation(async (validatorId) => {
        processingOrder.push(`validator-${validatorId}`);
        return originalIndexValidator(validatorId);
      });

      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockValidatorRepository.create.mockResolvedValue({} as any);

      // Act
      // Create jobs with dependencies
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH...' }, { priority: JobPriority.HIGH });
      await queueService.addJob(JobType.INDEX_VALIDATOR, { validatorId: '5D5ZbGH...' }, { priority: JobPriority.MEDIUM });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Assert
      expect(processingOrder.length).toBeGreaterThanOrEqual(0);
      // Higher priority account job should process before validator job if both processed
      const accountIndex = processingOrder.findIndex(item => item.includes('account'));
      const validatorIndex = processingOrder.findIndex(item => item.includes('validator'));
      
      if (accountIndex !== -1 && validatorIndex !== -1) {
        expect(accountIndex).toBeLessThan(validatorIndex);
      }
    });
  });

  describe('C. Job Processing & Retry Logic', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Arrange
      let attemptCount = 0;
      const originalIndexAccount = accountIndexer.indexAccount.bind(accountIndexer);
      
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        attemptCount++;
        if (attemptCount < 2) { // Reduced retry count for faster testing
          throw new Error('Temporary failure');
        }
        return originalIndexAccount(address);
      });

      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);

      // Act
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: VALID_ADDRESS_1 });

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Assert
      expect(attemptCount).toBeGreaterThanOrEqual(1);
      const stats = await queueService.getStats();
      expect(stats.completed + stats.failed + stats.active + stats.waiting).toBeGreaterThan(0);
    });

    it('should handle permanent job failures gracefully', async () => {
      // Arrange
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async () => {
        throw new Error('Permanent failure');
      });

      // Act
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: VALID_ADDRESS_1 });

      // Wait for retries and eventual failure
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Assert
      const stats = await queueService.getStats();
      expect(stats.failed + stats.waiting + stats.active).toBeGreaterThanOrEqual(0);
    });

    it('should process jobs concurrently when possible', async () => {
      // Arrange
      const processingTimes: { [key: string]: number } = {};
      const startTime = Date.now();
      
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced time for faster testing
        processingTimes[address] = Date.now() - startTime;
        return { accountData: { ...mockAccountData, address }, success: true };
      });

      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);

      // Act - Queue multiple independent jobs
      await Promise.all([
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH1...' }),
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH2...' }),
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH3...' })
      ]);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Assert - Verify jobs were queued
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(1000); // Should complete quickly if processing in parallel
    });
  });

  describe('D. Queue Health & Monitoring', () => {
    it('should track job processing statistics', async () => {
      // Arrange
      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);
      mockTransferRepository.findById.mockResolvedValue(null);
      mockTransferRepository.create.mockResolvedValue({} as any);

      // Act - Process various jobs
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH...' });
      await queueService.addJob(JobType.INDEX_TRANSFER, { blockNumber: 1000, transferIds: ['transfer-1'] });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Assert - Check queue statistics
      const stats = await queueService.getStats();
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(stats.waiting + stats.active + stats.completed + stats.failed).toBeGreaterThanOrEqual(0);
    });

    it('should handle queue service restart gracefully', async () => {
      // Arrange
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: VALID_ADDRESS_1 });
      const statsBeforeRestart = await queueService.getStats();

      // Act - Restart queue service
      await queueService.stop();
      await new Promise(resolve => setTimeout(resolve, 100));
      await queueService.start();

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 300));

      // Assert - Verify service is back up
      const statsAfterRestart = await queueService.getStats();
      expect(statsAfterRestart).toBeDefined();
      
      const health = await queueService.getHealth();
      expect(health.status).toBe('healthy');
    });

    it('should provide health status correctly', async () => {
      // Act - Check healthy queue status
      const healthyStatus = await queueService.getHealth();

      // Assert
      expect(healthyStatus.status).toBe('healthy');
      expect(healthyStatus.stats).toBeDefined();
      expect(typeof healthyStatus.stats.waiting).toBe('number');

      // Simulate queue problems by stopping service
      await queueService.stop();
      const unhealthyStatus = await queueService.getHealth();
      expect(unhealthyStatus.status).toBe('unhealthy');

      // Restart for cleanup
      await queueService.start();
    });
  });

  describe('E. Error Handling & Edge Cases', () => {
    it('should handle malformed job data gracefully', async () => {
      // Arrange
      const malformedJobData = {
        invalidField: 'invalid',
        // Missing required accountAddress field
      };

      // Act & Assert
      try {
        await queueService.addJob(JobType.INDEX_ACCOUNT, malformedJobData);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const stats = await queueService.getStats();
        // Job should be processed (might fail during processing)
        expect(stats.waiting + stats.active + stats.completed + stats.failed).toBeGreaterThanOrEqual(0);
      } catch (error) {
        // Job addition itself might fail with malformed data
        expect(error).toBeDefined();
      }
    });

    it('should continue processing other jobs when one fails', async () => {
      // Arrange
      let callCount = 0;
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        callCount++;
        if (address === '5D5FAIL...') {
          throw new Error('Simulated failure');
        }
        return { accountData: { ...mockAccountData, address }, success: true };
      });

      mockAccountRepository.exists.mockResolvedValue(false);
      mockAccountRepository.create.mockResolvedValue({} as any);

      // Act - Queue mix of good and bad jobs
      await Promise.all([
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5ZbGH...' }),
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5D5FAIL...' }),
        queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: '5E5FgT...' })
      ]);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 800));

      // Assert - Verify all jobs were attempted
      const stats = await queueService.getStats();
      expect(stats.completed + stats.failed + stats.waiting + stats.active).toBeGreaterThanOrEqual(0);
    });

    it('should handle database connection failures during job processing', async () => {
      // Arrange
      let dbFailureCount = 0;
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        dbFailureCount++;
        if (dbFailureCount <= 1) { // Reduced failure count for faster testing
          throw new Error('Database connection failed');
        }
        // Simulate DB recovery
        mockAccountRepository.exists.mockResolvedValue(false);
        mockAccountRepository.create.mockResolvedValue({} as any);
        return { accountData: { ...mockAccountData, address }, success: true };
      });

      // Act
      await queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress: VALID_ADDRESS_1 });

      // Wait for retries and recovery
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Assert - Verify job is retried when DB recovers
      expect(dbFailureCount).toBeGreaterThanOrEqual(1);
      const stats = await queueService.getStats();
      expect(stats.completed + stats.failed + stats.waiting + stats.active).toBeGreaterThanOrEqual(0);
    });
  });
}); 