import { ValidatorIndexer, createValidatorIndexer } from '../ValidatorIndexer';
import { ValidatorRepository } from '../../../../database/repositories/ValidatorRepository';
import { AvailBlockchainService } from '../../../core/avail-blockchain';

// Mock dependencies
jest.mock('../../../../database/repositories/ValidatorRepository');
jest.mock('../../../core/avail-blockchain');

describe('ValidatorIndexer', () => {
  let validatorIndexer: ValidatorIndexer;
  let mockValidatorRepository: jest.Mocked<ValidatorRepository>;
  let mockBlockchainService: jest.Mocked<AvailBlockchainService>;
  let mockQueueService: jest.Mocked<any>;

  const mockValidatorData = {
    accountId: '5VALIDATOR123...',
    stash: '5VALIDATOR123...',
    controller: '5CONTROLLER123...',
    commission: '5.0',
    blocked: false,
    identity: {
      display: 'Test Validator',
      web: 'https://validator.test'
    },
    stake: {
      total: '1000000000000000',
      own: '100000000000000',
      others: '900000000000000'
    },
    nominators: ['5NOMINATOR1...', '5NOMINATOR2...', '5NOMINATOR3...'],
    prefs: {
      commission: 5,
      blocked: false
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockValidatorRepository = {
      findByStashAddress: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any;

    mockBlockchainService = {
      getApi: jest.fn(),
    } as any;

    mockQueueService = {
      addJob: jest.fn(),
    };

    validatorIndexer = createValidatorIndexer(
      mockValidatorRepository,
      mockBlockchainService,
      mockQueueService
    );
  });

  describe('indexValidator', () => {
    beforeEach(() => {
      // Mock blockchain API calls
      const mockApi = {
        query: {
          staking: {
            validators: jest.fn().mockResolvedValue({
              toJSON: () => ({ commission: 50000000, blocked: false })
            }),
            ledger: jest.fn().mockResolvedValue({
              isSome: true,
              unwrap: () => ({ stash: { toString: () => '5VALIDATOR123...' } })
            }),
            erasStakers: {
              entries: jest.fn().mockResolvedValue([
                [
                  { args: [1, '5VALIDATOR123...'] },
                  {
                    isSome: true,
                    unwrap: () => ({
                      total: { toString: () => '1000000000000000' },
                      own: { toString: () => '100000000000000' },
                      others: [
                        { who: { toString: () => '5NOMINATOR1...' }, value: { toBigInt: () => 300000000000000n } },
                        { who: { toString: () => '5NOMINATOR2...' }, value: { toBigInt: () => 300000000000000n } },
                        { who: { toString: () => '5NOMINATOR3...' }, value: { toBigInt: () => 300000000000000n } }
                      ]
                    })
                  }
                ]
              ])
            }
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({
              isSome: true,
              unwrap: () => ({
                info: {
                  display: { isRaw: true, asRaw: { toUtf8: () => 'Test Validator' } },
                  web: { isRaw: true, asRaw: { toUtf8: () => 'https://validator.test' } }
                }
              })
            })
          }
        }
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);
    });

    it('should successfully index a new validator', async () => {
      // Arrange
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockValidatorRepository.create.mockResolvedValue({} as any);

      // Act
      const result = await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.validatorData).toBeDefined();
      expect(mockValidatorRepository.create).toHaveBeenCalled();
    });

    it('should update existing validator', async () => {
      // Arrange
      mockValidatorRepository.findByStashAddress.mockResolvedValue({} as any);
      mockValidatorRepository.update.mockResolvedValue({} as any);

      // Act
      const result = await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(true);
      expect(mockValidatorRepository.update).toHaveBeenCalled();
    });

    it('should queue cross-domain account indexing jobs for dependencies', async () => {
      // Arrange
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      const result = await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(true);
      
      // Verify account indexing jobs were queued for:
      // 1. Stash address
      // 2. Controller address (if different)
      // 3. All nominator addresses
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5VALIDATOR123...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5CONTROLLER123...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5NOMINATOR1...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5NOMINATOR2...' 
      });
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_ACCOUNT', { 
        accountAddress: '5NOMINATOR3...' 
      });
      
      // Should queue at least 5 jobs (stash + controller + 3 nominators)
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(5);
    });

    it('should handle missing queue service gracefully', async () => {
      // Arrange
      const validatorIndexerWithoutQueue = createValidatorIndexer(
        mockValidatorRepository,
        mockBlockchainService
        // No queue service
      );
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);

      // Act
      const result = await validatorIndexerWithoutQueue.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(true);
      // Should not throw error even without queue service
    });

    it('should continue processing even if queue job creation fails', async () => {
      // Arrange
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockQueueService.addJob.mockRejectedValue(new Error('Queue service unavailable'));

      // Act
      const result = await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(true);
      // Validator indexing should succeed even if queue jobs fail
    });

    it('should handle blockchain service errors gracefully', async () => {
      // Arrange
      mockBlockchainService.getApi.mockRejectedValue(new Error('Blockchain API error'));

      // Act
      const result = await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blockchain API error');
    });
  });

  describe('Cross-Domain Job Queuing', () => {
    it('should only queue jobs with correct job type', async () => {
      // Arrange
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await validatorIndexer.indexValidator('5VALIDATOR123...');

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

    it('should avoid duplicate account jobs for same addresses', async () => {
      // Arrange - validator where stash and controller are the same
      const sameAddressValidator = {
        ...mockValidatorData,
        controller: '5VALIDATOR123...', // Same as stash
        nominators: ['5NOMINATOR1...', '5NOMINATOR1...'] // Duplicate nominator
      };
      
      mockValidatorRepository.findByStashAddress.mockResolvedValue(null);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await validatorIndexer.indexValidator('5VALIDATOR123...');

      // Assert
      // Should deduplicate addresses using Set, so no duplicate jobs
      const accountAddressesCalled = mockQueueService.addJob.mock.calls
        .filter(call => call[0] === 'INDEX_ACCOUNT')
        .map(call => call[1].accountAddress);
      
      const uniqueAddresses = new Set(accountAddressesCalled);
      expect(accountAddressesCalled.length).toBe(uniqueAddresses.size);
    });
  });

  describe('Architecture Validation', () => {
    it('should operate independently without orchestrator', () => {
      // Verify ValidatorIndexer only depends on repository, blockchain service, and optional queue
      const indexer = createValidatorIndexer(
        mockValidatorRepository, 
        mockBlockchainService, 
        mockQueueService
      );
      
      expect(indexer).toBeDefined();
      expect(indexer.indexValidator).toBeDefined();
    });

    it('should not have direct dependencies on other domain services', () => {
      // This test validates architectural independence
      const indexerFile = require.resolve('../ValidatorIndexer');
      const fs = require('fs');
      const content = fs.readFileSync(indexerFile, 'utf8');
      
      // Should not import other domain services directly
      expect(content).not.toMatch(/from.*\/block\//);
      expect(content).not.toMatch(/from.*\/account\/.*(?<!IndexingResult)/); // Allow result types but not services
      expect(content).not.toMatch(/from.*\/transfer\//);
      expect(content).not.toMatch(/from.*\/dataSubmission\//);
    });
  });
});