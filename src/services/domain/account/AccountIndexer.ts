import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';

/**
 * AccountIndexer - Fetches account data from blockchain and stores it
 * 
 * Responsibilities:
 * - Fetch account balances and nonce information
 * - Store account data in database
 * - Handle account creation and updates
 * - Return indexing results with success/error status
 */

export interface IAccountIndexer {
  indexAccount(accountAddress: string): Promise<AccountIndexingResult>;
  indexAccountsBatch(addresses: string[]): Promise<AccountIndexingResult[]>;
}

export interface AccountIndexingResult {
  accountData: AccountData;
  success: boolean;
  error?: string;
}

export interface AccountData {
  address: string;
  balance: {
    free: string;
    reserved: string;
    frozen: string;
  };
  nonce: number;
  identityName?: string;
  isValidator?: boolean;
  lastActive?: Date;
}

export class AccountIndexer implements IAccountIndexer {
  private blockchain: AvailBlockchainService;
  private queueService?: any;

  constructor(blockchain: AvailBlockchainService, queueService?: any) {
    this.blockchain = blockchain;
    this.queueService = queueService;
  }

  /**
   * Index a single account by fetching from blockchain
   */
  async indexAccount(accountAddress: string): Promise<AccountIndexingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Indexing account from blockchain', {
        component: 'account-indexer',
        action: 'indexAccount',
        accountAddress,
      });

      // Fetch account data from blockchain
      const accountInfo = await this.fetchAccountFromBlockchain(accountAddress);
      
      if (!accountInfo) {
        return {
          accountData: {} as AccountData,
          success: false,
          error: `Account ${accountAddress} not found on blockchain`,
        };
      }

      const duration = Date.now() - startTime;
      
      logger.info('Account indexed successfully', {
        component: 'account-indexer',
        action: 'indexAccount',
        accountAddress,
        balance: accountInfo.balance.free,
        nonce: accountInfo.nonce,
        isValidator: accountInfo.isValidator,
        duration,
      });

      // Queue cross-domain validator indexing job if account is a validator
      await this.queueValidatorDependencies(accountInfo);

      return {
        accountData: accountInfo,
        success: true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'account-indexer',
        action: 'indexAccount',
        accountAddress,
        duration,
      });

      return {
        accountData: {} as AccountData,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index multiple accounts in batch
   */
  async indexAccountsBatch(addresses: string[]): Promise<AccountIndexingResult[]> {
    logger.info('Indexing accounts batch', {
      component: 'account-indexer',
      action: 'indexAccountsBatch',
      accountCount: addresses.length,
    });

    const results: AccountIndexingResult[] = [];
    
    // Process accounts in parallel with controlled concurrency
    const batchSize = 10; // Process 10 accounts at a time
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const batchPromises = batch.map(address => this.indexAccount(address));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    logger.info('Account batch indexing completed', {
      component: 'account-indexer',
      totalAccounts: results.length,
      successCount,
      failureCount: results.length - successCount,
    });

    return results;
  }

  /**
   * Queue validator indexing job if account is a validator
   */
  private async queueValidatorDependencies(accountData: AccountData): Promise<void> {
    if (!this.queueService) {
      logger.debug('Queue service not available, skipping cross-domain job queuing', {
        component: 'account-indexer',
        accountAddress: accountData.address,
      });
      return;
    }

    try {
      // Only queue validator indexing if account is identified as a validator
      if (accountData.isValidator) {
        await this.queueService.addJob('INDEX_VALIDATOR', { validatorId: accountData.address });
        
        logger.info('Cross-domain validator job queued from account indexing', {
          component: 'account-indexer',
          accountAddress: accountData.address,
          triggeredJob: 'INDEX_VALIDATOR',
        });
      }

    } catch (error) {
      logger.error('Failed to queue cross-domain validator dependency', {
        component: 'account-indexer',
        accountAddress: accountData.address,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Fetch account information from blockchain
   */
  private async fetchAccountFromBlockchain(accountAddress: string): Promise<AccountData | null> {
    try {
      const api = await this.blockchain.getApi();
      
      // Fetch account info using Substrate API
      const [
        accountInfo,
        identity,
      ] = await Promise.all([
        api.query.system.account(accountAddress),
        api.query.identity.identityOf(accountAddress),
      ]);

      // Parse account info
      const accountData = accountInfo.toJSON() as any;
      
      // Parse identity information
      let identityName = undefined;
      if (identity.isSome) {
        const identityData = identity.unwrap().info;
        if (identityData.display?.isRaw) {
          identityName = identityData.display.asRaw.toUtf8();
        }
      }

      // Check if account is a validator
      const validators = await api.query.staking.validators.entries();
      const isValidator = validators.some(([key]: [any, any]) => key.args[0].toString() === accountAddress);

      return {
        address: accountAddress,
        balance: {
          free: accountData.data.free?.toString() || '0',
          reserved: accountData.data.reserved?.toString() || '0',
          frozen: accountData.data.frozen?.toString() || '0',
        },
        nonce: accountData.nonce || 0,
        identityName,
        isValidator,
        lastActive: new Date(),
      };

    } catch (error) {
      logger.warn('Failed to fetch account from blockchain', {
        component: 'account-indexer',
        accountAddress,
        error: (error as Error).message,
      });
      return null;
    }
  }
}

/**
 * Factory function to create AccountIndexer instance
 */
export const createAccountIndexer = (
  blockchain: AvailBlockchainService,
  queueService?: any,
): AccountIndexer => {
  return new AccountIndexer(blockchain, queueService);
}; 