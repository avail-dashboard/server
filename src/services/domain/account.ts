import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { TransferRepository, TransferWithRelations } from '../../database/repositories/TransferRepository';
import { ExtrinsicRepository } from '../../database/repositories/ExtrinsicRepository';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { RewardRepository } from '../../database/repositories/RewardRepository';
import { Account, Transfer, Extrinsic, Validator, Reward } from '@prisma/client';
import { BaseService, ServiceHealth } from '../types/service';
import db from '../../utils/database';

// Service interfaces
export interface AccountBalance {
  address: string;
  free: string;
  reserved: string;
  frozen: string;
  total: string;
  transferable: string;
  nonce: number;
}

export interface AccountWithDetails extends Account {
  validator?: Validator;
  transferCount: number;
  extrinsicCount: number;
  totalTransferred: bigint;
  totalReceived: bigint;
}

export interface AccountActivity {
  transfers: TransferWithRelations[];
  extrinsics: Extrinsic[];
  rewards: Reward[];
  totalActivities: number;
}

export interface AccountStats {
  totalTransfers: number;
  totalExtrinsics: number;
  totalRewards: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  totalSent: bigint;
  totalReceived: bigint;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface HistoryOptions extends PaginationOptions {
  type?: 'all' | 'transfers' | 'extrinsics' | 'rewards';
  startDate?: Date;
  endDate?: Date;
}

export interface IAccountService {
  getAccount(address: string): Promise<AccountWithDetails>;
  getAccountBalance(address: string): Promise<AccountBalance>;
  getAccountExtrinsics(address: string, options: PaginationOptions): Promise<{ extrinsics: Extrinsic[]; total: number }>;
  getAccountTransfers(address: string, options: PaginationOptions): Promise<{ transfers: TransferWithRelations[]; total: number }>;
  getAccountHistory(address: string, options: HistoryOptions): Promise<AccountActivity>;
  updateAccountIdentity(address: string): Promise<void>;
  getAccountStatistics(address: string): Promise<AccountStats>;
  discoverSampleAddresses(): Promise<string[]>;
}

/**
 * AccountService - Manages account data and operations
 * 
 * Responsibilities:
 * - Fetch account details and balances
 * - Get account transaction history
 * - Track account activity and statistics
 * - Update account identity information
 * - Provide account discovery for testing
 */
export class AccountService implements BaseService, IAccountService {
  private blockchain: AvailBlockchainService;
  private transferRepository: TransferRepository;
  private extrinsicRepository: ExtrinsicRepository;
  private validatorRepository: ValidatorRepository;
  private rewardRepository: RewardRepository;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    transferRepository: TransferRepository,
    extrinsicRepository: ExtrinsicRepository,
    validatorRepository: ValidatorRepository,
    rewardRepository: RewardRepository,
  ) {
    this.blockchain = blockchain;
    this.transferRepository = transferRepository;
    this.extrinsicRepository = extrinsicRepository;
    this.validatorRepository = validatorRepository;
    this.rewardRepository = rewardRepository;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    logger.info('AccountService: Starting service', { component: 'account-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('AccountService: Stopping service', { component: 'account-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'AccountService',
        version: '1.0.0',
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get account with detailed information
   */
  async getAccount(address: string): Promise<AccountWithDetails> {
    try {
      logger.debug('AccountService: Getting account details', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
      });

      // Get or create account record
      const account = await this.getOrCreateAccount(address);
      
      // Check if account is a validator
      const validator = await this.validatorRepository.findByStashAddress(address) ||
                       await this.validatorRepository.findByControllerAddress(address);

      // Get account statistics
      const [transferCount, extrinsicCount, transferStats] = await Promise.all([
        this.transferRepository.countByAccount(address),
        this.extrinsicRepository.countBySigner(address),
        this.getTransferStatistics(address),
      ]);

      const accountWithDetails: AccountWithDetails = {
        ...account,
        validator: validator || undefined,
        transferCount,
        extrinsicCount,
        totalTransferred: transferStats.totalSent,
        totalReceived: transferStats.totalReceived,
      };

      logger.debug('AccountService: Account details retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        transferCount,
        extrinsicCount,
        isValidator: !!validator,
      });

      return accountWithDetails;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccount',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get account balance from blockchain RPC
   */
  async getAccountBalance(address: string): Promise<AccountBalance> {
    try {
      logger.debug('AccountService: Getting account balance', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
      });

      // Get balance from blockchain
      const api = await this.blockchain.getApi();
      const accountInfo = await api.query.system.account(address);
      const accountData = accountInfo.data;

      const balance: AccountBalance = {
        address,
        free: accountData.free.toString(),
        reserved: accountData.reserved.toString(),
        frozen: accountData.frozen.toString(),
        total: accountData.free.add(accountData.reserved).toString(),
        transferable: accountData.free.sub(accountData.frozen).toString(),
        nonce: accountInfo.nonce.toNumber(),
      };

      // Update account record with latest balance
      await this.updateAccountBalance(address, balance);

      logger.debug('AccountService: Account balance retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        free: balance.free,
        total: balance.total,
      });

      return balance;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccountBalance',
        address: address.substring(0, 10) + '...',
      });
      
      // Return fallback balance from database if RPC fails
      return this.getFallbackBalance(address);
    }
  }

  /**
   * Get account extrinsics
   */
  async getAccountExtrinsics(address: string, options: PaginationOptions = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    try {
      const { page = 1, limit = 20 } = options;

      logger.debug('AccountService: Getting account extrinsics', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.extrinsicRepository.findBySigner(address, { page, limit });

      logger.debug('AccountService: Account extrinsics retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        count: result.extrinsics.length,
        total: result.total,
      });

      return result;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccountExtrinsics',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get account transfers
   */
  async getAccountTransfers(address: string, options: PaginationOptions = {}): Promise<{ transfers: TransferWithRelations[]; total: number }> {
    try {
      const { page = 1, limit = 20 } = options;

      logger.debug('AccountService: Getting account transfers', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.transferRepository.findByAccount(address, { page, limit });

      logger.debug('AccountService: Account transfers retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        count: result.transfers.length,
        total: result.total,
      });

      return result;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccountTransfers',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get account activity history
   */
  async getAccountHistory(address: string, options: HistoryOptions = {}): Promise<AccountActivity> {
    try {
      const { page = 1, limit = 50, type = 'all' } = options;

      logger.debug('AccountService: Getting account history', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        type,
        page,
        limit,
      });

      const [transfersResult, extrinsicsResult, rewardsResult] = await Promise.all([
        type === 'all' || type === 'transfers' 
          ? this.transferRepository.findByAccount(address, { page, limit: Math.floor(limit / 3) })
          : { transfers: [], total: 0 },
        type === 'all' || type === 'extrinsics'
          ? this.extrinsicRepository.findBySigner(address, { page, limit: Math.floor(limit / 3) })
          : { extrinsics: [], total: 0 },
        type === 'all' || type === 'rewards'
          ? this.rewardRepository.findByAccount(address, { page, limit: Math.floor(limit / 3) })
          : { rewards: [], total: 0 },
      ]);

      const activity: AccountActivity = {
        transfers: transfersResult.transfers,
        extrinsics: extrinsicsResult.extrinsics,
        rewards: rewardsResult.rewards,
        totalActivities: transfersResult.total + extrinsicsResult.total + rewardsResult.total,
      };

      logger.debug('AccountService: Account history retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        transfersCount: activity.transfers.length,
        extrinsicsCount: activity.extrinsics.length,
        rewardsCount: activity.rewards.length,
        totalActivities: activity.totalActivities,
      });

      return activity;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccountHistory',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Update account identity information
   */
  async updateAccountIdentity(address: string): Promise<void> {
    try {
      logger.debug('AccountService: Updating account identity', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
      });

      const api = await this.blockchain.getApi();
      const identityInfo = await api.query.identity.identityOf(address);

      if (identityInfo.isSome) {
        const identity = identityInfo.unwrap();
        const identityData = {
          display: identity.info.display.toString(),
          legal: identity.info.legal.toString(),
          web: identity.info.web.toString(),
          riot: identity.info.riot.toString(),
          email: identity.info.email.toString(),
          twitter: identity.info.twitter.toString(),
        };

        // Update account record with identity
        await db.query(
          `UPDATE accounts 
           SET identity_name = $1, identity_info = $2, updated_at = CURRENT_TIMESTAMP
           WHERE address = $3`,
          [identityData.display, JSON.stringify(identityData), address]
        );

        logger.debug('AccountService: Account identity updated', { 
          component: 'account-service', 
          address: address.substring(0, 10) + '...',
          displayName: identityData.display,
        });
      }

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'updateAccountIdentity',
        address: address.substring(0, 10) + '...',
      });
      // Don't throw - identity update shouldn't fail the request
    }
  }

  /**
   * Get account statistics
   */
  async getAccountStatistics(address: string): Promise<AccountStats> {
    try {
      logger.debug('AccountService: Getting account statistics', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
      });

      const [
        transferStats,
        extrinsicCount,
        rewardCount,
        activityDates
      ] = await Promise.all([
        this.getTransferStatistics(address),
        this.extrinsicRepository.countBySigner(address),
        this.rewardRepository.countByAccount(address),
        this.getActivityDates(address),
      ]);

      const stats: AccountStats = {
        totalTransfers: transferStats.count,
        totalExtrinsics: extrinsicCount,
        totalRewards: rewardCount,
        firstActivity: activityDates.first,
        lastActivity: activityDates.last,
        totalSent: transferStats.totalSent,
        totalReceived: transferStats.totalReceived,
      };

      logger.debug('AccountService: Account statistics retrieved', { 
        component: 'account-service', 
        address: address.substring(0, 10) + '...',
        totalTransfers: stats.totalTransfers,
        totalExtrinsics: stats.totalExtrinsics,
        totalRewards: stats.totalRewards,
      });

      return stats;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getAccountStatistics',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Discover sample addresses for testing
   */
  async discoverSampleAddresses(): Promise<string[]> {
    try {
      logger.debug('AccountService: Discovering sample addresses', { component: 'account-service' });

      // Get active validator addresses as samples
      const validators = await this.validatorRepository.findActive();
      const sampleAddresses = validators.slice(0, 10).map(v => v.stashAddress);

      // If no validators, get addresses from recent transfers
      if (sampleAddresses.length === 0) {
        const recentTransfers = await this.transferRepository.findMany({ limit: 10 });
        const addresses = new Set<string>();
        recentTransfers.transfers.forEach(transfer => {
          addresses.add(transfer.fromAddress);
          addresses.add(transfer.toAddress);
        });
        sampleAddresses.push(...Array.from(addresses).slice(0, 10));
      }

      logger.debug('AccountService: Sample addresses discovered', { 
        component: 'account-service',
        count: sampleAddresses.length,
      });

      return sampleAddresses;

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'discoverSampleAddresses',
      });
      return [];
    }
  }

  // Private helper methods

  private async getOrCreateAccount(address: string): Promise<Account> {
    try {
      // Try to get existing account
      const result = await db.query<Account>(
        'SELECT * FROM accounts WHERE address = $1',
        [address]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create new account record
      const newAccount = await db.query<Account>(
        `INSERT INTO accounts (address, last_updated) 
         VALUES ($1, CURRENT_TIMESTAMP) 
         RETURNING *`,
        [address]
      );

      return newAccount.rows[0];

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getOrCreateAccount',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  private async updateAccountBalance(address: string, balance: AccountBalance): Promise<void> {
    try {
      await db.query(
        `UPDATE accounts 
         SET current_balance = $1, nonce = $2, last_updated = CURRENT_TIMESTAMP
         WHERE address = $3`,
        [balance.free, balance.nonce, address]
      );
    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'updateAccountBalance',
        address: address.substring(0, 10) + '...',
      });
    }
  }

  private async getFallbackBalance(address: string): Promise<AccountBalance> {
    try {
      const result = await db.query<Account>(
        'SELECT * FROM accounts WHERE address = $1',
        [address]
      );

      const account = result.rows[0];
      if (account && account.currentBalance) {
        return {
          address,
          free: account.currentBalance.toString(),
          reserved: '0',
          frozen: '0',
          total: account.currentBalance.toString(),
          transferable: account.currentBalance.toString(),
          nonce: account.nonce || 0,
        };
      }

      // Return zero balance if no data
      return {
        address,
        free: '0',
        reserved: '0',
        frozen: '0',
        total: '0',
        transferable: '0',
        nonce: 0,
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getFallbackBalance',
        address: address.substring(0, 10) + '...',
      });
      
      return {
        address,
        free: '0',
        reserved: '0',
        frozen: '0',
        total: '0',
        transferable: '0',
        nonce: 0,
      };
    }
  }

  private async getTransferStatistics(address: string): Promise<{ count: number; totalSent: bigint; totalReceived: bigint }> {
    try {
      const [sentResult, receivedResult] = await Promise.all([
        db.query<{ count: number; total: string }>(
          'SELECT COUNT(*)::int as count, COALESCE(SUM(amount), 0)::text as total FROM transfers WHERE from_address = $1',
          [address]
        ),
        db.query<{ count: number; total: string }>(
          'SELECT COUNT(*)::int as count, COALESCE(SUM(amount), 0)::text as total FROM transfers WHERE to_address = $1',
          [address]
        ),
      ]);

      const sent = sentResult.rows[0];
      const received = receivedResult.rows[0];

      return {
        count: sent.count + received.count,
        totalSent: BigInt(sent.total || '0'),
        totalReceived: BigInt(received.total || '0'),
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getTransferStatistics',
        address: address.substring(0, 10) + '...',
      });
      
      return {
        count: 0,
        totalSent: BigInt(0),
        totalReceived: BigInt(0),
      };
    }
  }

  private async getActivityDates(address: string): Promise<{ first: Date | null; last: Date | null }> {
    try {
      const result = await db.query<{ first_activity: Date; last_activity: Date }>(
        `SELECT 
           MIN(created_at) as first_activity,
           MAX(created_at) as last_activity
         FROM (
           SELECT created_at FROM transfers WHERE from_address = $1 OR to_address = $1
           UNION ALL
           SELECT created_at FROM extrinsics WHERE signer = $1
           UNION ALL  
           SELECT created_at FROM rewards WHERE account_address = $1
         ) activities`,
        [address]
      );

      const activity = result.rows[0];
      return {
        first: activity?.first_activity || null,
        last: activity?.last_activity || null,
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'account-service', 
        action: 'getActivityDates',
        address: address.substring(0, 10) + '...',
      });
      
      return {
        first: null,
        last: null,
      };
    }
  }
}

// Factory function
export const createAccountService = (
  blockchain: AvailBlockchainService,
  transferRepository: TransferRepository,
  extrinsicRepository: ExtrinsicRepository,
  validatorRepository: ValidatorRepository,
  rewardRepository: RewardRepository,
): AccountService => {
  return new AccountService(
    blockchain,
    transferRepository,
    extrinsicRepository,
    validatorRepository,
    rewardRepository,
  );
};