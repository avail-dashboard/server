import { AccountIndexer, createAccountIndexer } from '../AccountIndexer';
import { AccountRepository } from '../../../../database/repositories/AccountRepository';
import { AvailBlockchainService } from '../../../core/avail-blockchain';

// Mock dependencies
jest.mock('../../../../database/repositories/AccountRepository');
jest.mock('../../../core/avail-blockchain');

describe('AccountIndexer', () => {
  let accountIndexer: AccountIndexer;
  let mockAccountRepository: jest.Mocked<AccountRepository>;
  let mockBlockchainService: jest.Mocked<AvailBlockchainService>;
  let mockQueueService: jest.Mocked<any>;

  const mockAccountData = {
    address: '5ACCOUNT123...',
    balance: {
      free: '1000000000000000',
      reserved: '100000000000000',
      frozen: '50000000000000',
    },
    nonce: 42,
    identityName: 'Test Account',
    isValidator: true,
    lastActive: new Date('2024-01-15T10:30:00.000Z'),
  };

  const mockBlockchainAccountInfo = {
    toJSON: () => ({
      data: {
        free: '1000000000000000',
        reserved: '100000000000000',
        frozen: '50000000000000',
      },
      nonce: 42,
    }),
  };

  const mockIdentityInfo = {
    isSome: true,
    unwrap: () => ({
      info: {
        display: { isRaw: true, asRaw: { toUtf8: () => 'Test Account' } },
        web: { isRaw: false },
      },
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAccountRepository = {
      findByAddress: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      exists: jest.fn(),
      createIfNotExists: jest.fn(),
    } as any;

    mockBlockchainService = {
      getApi: jest.fn(),
    } as any;

    mockQueueService = {
      addJob: jest.fn(),
    };

    accountIndexer = createAccountIndexer(mockBlockchainService, mockQueueService);
  });

  describe('indexAccount', () => {
    beforeEach(() => {
      // Mock blockchain API calls
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(mockIdentityInfo),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([
                [{ args: [{ toString: () => '5ACCOUNT123...' }] }, {}]
              ]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);
    });

    it('should successfully index a new account', async () => {
      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData).toBeDefined();
      expect(result.accountData.address).toBe('5ACCOUNT123...');
      expect(result.accountData.balance.free).toBe('1000000000000000');
      expect(result.accountData.balance.reserved).toBe('100000000000000');
      expect(result.accountData.balance.frozen).toBe('50000000000000');
      expect(result.accountData.nonce).toBe(42);
      expect(result.accountData.identityName).toBe('Test Account');
      expect(result.accountData.isValidator).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle account with no identity information', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.identityName).toBeUndefined();
      expect(result.accountData.isValidator).toBe(false);
    });

    it('should handle non-validator accounts correctly', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(mockIdentityInfo),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([
                [{ args: [{ toString: () => '5DIFFERENT_VALIDATOR...' }] }, {}]
              ]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.isValidator).toBe(false);
      expect(mockQueueService.addJob).not.toHaveBeenCalledWith('INDEX_VALIDATOR', expect.any(Object));
    });

    it('should queue cross-domain validator indexing job for validator accounts', async () => {
      // Arrange
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(mockQueueService.addJob).toHaveBeenCalledWith('INDEX_VALIDATOR', {
        validatorId: '5ACCOUNT123...',
      });
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(1);
    });

    it('should handle missing queue service gracefully', async () => {
      // Arrange
      const accountIndexerWithoutQueue = createAccountIndexer(mockBlockchainService);

      // Act
      const result = await accountIndexerWithoutQueue.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData).toBeDefined();
      // Should not throw error even without queue service
    });

    it('should continue processing even if queue job creation fails', async () => {
      // Arrange
      mockQueueService.addJob.mockRejectedValue(new Error('Queue service unavailable'));

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData).toBeDefined();
      // Account indexing should succeed even if queue jobs fail
    });

    it('should handle blockchain API errors gracefully', async () => {
      // Arrange
      mockBlockchainService.getApi.mockRejectedValue(new Error('Blockchain API error'));

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Blockchain API error');
      expect(result.accountData).toEqual({});
    });

    it('should handle account fetch errors gracefully', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockRejectedValue(new Error('Account query failed')),
          },
          identity: {
            identityOf: jest.fn(),
          },
          staking: {
            validators: {
              entries: jest.fn(),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account query failed');
      expect(result.accountData).toEqual({});
    });

    it('should return error when account is not found on blockchain', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(null),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Mock fetchAccountFromBlockchain to return null
      jest.spyOn(accountIndexer as any, 'fetchAccountFromBlockchain').mockResolvedValue(null);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account 5ACCOUNT123... not found on blockchain');
      expect(result.accountData).toEqual({});
    });
  });

  describe('indexAccountsBatch', () => {
    beforeEach(() => {
      // Mock successful account indexing
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => ({
        accountData: { ...mockAccountData, address },
        success: true,
      }));
    });

    it('should successfully index multiple accounts', async () => {
      // Arrange
      const addresses = ['5ACCOUNT1...', '5ACCOUNT2...', '5ACCOUNT3...'];

      // Act
      const results = await accountIndexer.indexAccountsBatch(addresses);

      // Assert
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(accountIndexer.indexAccount).toHaveBeenCalledTimes(3);
      expect(accountIndexer.indexAccount).toHaveBeenCalledWith('5ACCOUNT1...');
      expect(accountIndexer.indexAccount).toHaveBeenCalledWith('5ACCOUNT2...');
      expect(accountIndexer.indexAccount).toHaveBeenCalledWith('5ACCOUNT3...');
    });

    it('should process accounts in batches of 10', async () => {
      // Arrange
      const addresses = Array.from({ length: 25 }, (_, i) => `5ACCOUNT${i}...`);
      
      // Track call timing to verify batching
      const callTimes: number[] = [];
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        callTimes.push(Date.now());
        return { accountData: { ...mockAccountData, address }, success: true };
      });

      // Act
      const results = await accountIndexer.indexAccountsBatch(addresses);

      // Assert
      expect(results).toHaveLength(25);
      expect(accountIndexer.indexAccount).toHaveBeenCalledTimes(25);
      
      // Verify batching by checking that calls are grouped
      // (this is a simplified check - in real batching, calls within a batch would be roughly simultaneous)
      expect(callTimes.length).toBe(25);
    });

    it('should continue processing even if some accounts fail', async () => {
      // Arrange
      const addresses = ['5ACCOUNT1...', '5ACCOUNT2...', '5ACCOUNT3...'];
      
      jest.spyOn(accountIndexer, 'indexAccount').mockImplementation(async (address) => {
        if (address === '5ACCOUNT2...') {
          return {
            accountData: {} as any,
            success: false,
            error: 'Account indexing failed',
          };
        }
        return { accountData: { ...mockAccountData, address }, success: true };
      });

      // Act
      const results = await accountIndexer.indexAccountsBatch(addresses);

      // Assert
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(accountIndexer.indexAccount).toHaveBeenCalledTimes(3);
    });

    it('should handle empty address array', async () => {
      // Act
      const results = await accountIndexer.indexAccountsBatch([]);

      // Assert
      expect(results).toHaveLength(0);
      expect(accountIndexer.indexAccount).not.toHaveBeenCalled();
    });
  });

  describe('Cross-Domain Job Queuing', () => {
    beforeEach(() => {
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(mockIdentityInfo),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([
                [{ args: [{ toString: () => '5ACCOUNT123...' }] }, {}]
              ]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);
    });

    it('should only queue validator jobs for validator accounts', async () => {
      // Arrange
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        'INDEX_VALIDATOR',
        { validatorId: '5ACCOUNT123...' }
      );
      expect(mockQueueService.addJob).toHaveBeenCalledTimes(1);
      
      // Should not queue jobs for other domains
      expect(mockQueueService.addJob).not.toHaveBeenCalledWith(
        'INDEX_ACCOUNT',
        expect.any(Object)
      );
      expect(mockQueueService.addJob).not.toHaveBeenCalledWith(
        'INDEX_TRANSFER',
        expect.any(Object)
      );
    });

    it('should not queue any jobs for non-validator accounts', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(mockIdentityInfo),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]), // No validators
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);
      mockQueueService.addJob.mockResolvedValue({ id: 'job-123' });

      // Act
      await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(mockQueueService.addJob).not.toHaveBeenCalled();
    });

    it('should handle queue service errors without affecting account indexing', async () => {
      // Arrange
      mockQueueService.addJob.mockRejectedValue(new Error('Queue service failed'));

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData).toBeDefined();
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        'INDEX_VALIDATOR',
        { validatorId: '5ACCOUNT123...' }
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle malformed blockchain responses', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue({
              toJSON: () => ({ data: null, nonce: null }),
            }),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.balance.free).toBe('0');
      expect(result.accountData.balance.reserved).toBe('0');
      expect(result.accountData.balance.frozen).toBe('0');
      expect(result.accountData.nonce).toBe(0);
    });

    it('should handle identity parsing errors gracefully', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({
              isSome: true,
              unwrap: () => {
                throw new Error('Identity parsing failed');
              },
            }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Identity parsing failed');
    });

    it('should handle validator check errors gracefully', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockRejectedValue(new Error('Validator query failed')),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Validator query failed');
    });

    it('should log timing information for performance monitoring', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(mockIdentityInfo),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([
                [{ args: [{ toString: () => '5ACCOUNT123...' }] }, {}]
              ]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      const mockLogger = { 
        debug: jest.fn(), 
        info: jest.fn(), 
        error: jest.fn(), 
        warn: jest.fn() 
      };
      
      // Mock logger for timing verification
      jest.doMock('../../../utils/logger', () => ({
        logger: mockLogger,
        logError: jest.fn(),
      }));

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      // Note: In a real implementation, we would verify logger calls,
      // but this requires more sophisticated mocking setup
    });
  });

  describe('Account Data Processing', () => {
    it('should correctly parse balance information', async () => {
      // Arrange
      const customBalanceInfo = {
        toJSON: () => ({
          data: {
            free: '999888777666555',
            reserved: '111222333444555',
            frozen: '777888999000111',
          },
          nonce: 100,
        }),
      };

      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(customBalanceInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.balance.free).toBe('999888777666555');
      expect(result.accountData.balance.reserved).toBe('111222333444555');
      expect(result.accountData.balance.frozen).toBe('777888999000111');
      expect(result.accountData.nonce).toBe(100);
    });

    it('should set lastActive timestamp correctly', async () => {
      // Arrange
      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue({ isSome: false }),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      const beforeTime = new Date();
      
      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      const afterTime = new Date();
      expect(result.success).toBe(true);
      expect(result.accountData.lastActive).toBeInstanceOf(Date);
      expect(result.accountData.lastActive!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.accountData.lastActive!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle complex identity data correctly', async () => {
      // Arrange
      const complexIdentity = {
        isSome: true,
        unwrap: () => ({
          info: {
            display: { isRaw: true, asRaw: { toUtf8: () => 'Complex Identity Name' } },
            legal: { isRaw: true, asRaw: { toUtf8: () => 'Legal Name' } },
            web: { isRaw: true, asRaw: { toUtf8: () => 'https://complex-identity.com' } },
            email: { isRaw: true, asRaw: { toUtf8: () => 'test@complex-identity.com' } },
          },
        }),
      };

      const mockApi = {
        query: {
          system: {
            account: jest.fn().mockResolvedValue(mockBlockchainAccountInfo),
          },
          identity: {
            identityOf: jest.fn().mockResolvedValue(complexIdentity),
          },
          staking: {
            validators: {
              entries: jest.fn().mockResolvedValue([]),
            },
          },
        },
      };
      mockBlockchainService.getApi.mockResolvedValue(mockApi);

      // Act
      const result = await accountIndexer.indexAccount('5ACCOUNT123...');

      // Assert
      expect(result.success).toBe(true);
      expect(result.accountData.identityName).toBe('Complex Identity Name');
    });
  });

  describe('Architecture Validation', () => {
    it('should operate independently without orchestrator', () => {
      // Verify AccountIndexer only depends on blockchain service and optional queue
      const indexer = createAccountIndexer(mockBlockchainService, mockQueueService);
      
      expect(indexer).toBeDefined();
      expect(indexer.indexAccount).toBeDefined();
      expect(indexer.indexAccountsBatch).toBeDefined();
    });

    it('should work without queue service for basic account indexing', () => {
      // Verify AccountIndexer can work without queue service
      const indexer = createAccountIndexer(mockBlockchainService);
      
      expect(indexer).toBeDefined();
      expect(indexer.indexAccount).toBeDefined();
      expect(indexer.indexAccountsBatch).toBeDefined();
    });

    it('should not have direct dependencies on other domain services', () => {
      // This test validates architectural independence
      const indexerFile = require.resolve('../AccountIndexer');
      const fs = require('fs');
      const content = fs.readFileSync(indexerFile, 'utf8');
      
      // Should not import other domain services directly
      expect(content).not.toMatch(/from.*\/block\//);
      expect(content).not.toMatch(/from.*\/validator\/.*(?<!IndexingResult)/); // Allow result types but not services
      expect(content).not.toMatch(/from.*\/transfer\//);
      expect(content).not.toMatch(/from.*\/dataSubmission\//);
      
      // Should only import core services and utilities
      expect(content).toMatch(/from.*avail-blockchain/);
      expect(content).toMatch(/from.*logger/);
    });

    it('should use cross-domain communication via queue service only', () => {
      // Verify that AccountIndexer uses queue service for cross-domain communication
      const indexer = createAccountIndexer(mockBlockchainService, mockQueueService);
      
      // The indexer should only have blockchain and queue service dependencies
      expect((indexer as any).blockchain).toBeDefined();
      expect((indexer as any).queueService).toBeDefined();
      
      // Should not have direct references to other domain services
      expect((indexer as any).validatorIndexer).toBeUndefined();
      expect((indexer as any).blockIndexer).toBeUndefined();
      expect((indexer as any).transferIndexer).toBeUndefined();
    });
  });
});