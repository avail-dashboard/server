import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { TransferRepository, TransferWithRelations } from '../../database/repositories/TransferRepository';
import { ExtrinsicRepository } from '../../database/repositories/ExtrinsicRepository';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { RewardRepository } from '../../database/repositories/RewardRepository';
import { Account, Extrinsic, Validator, Reward } from '@prisma/client';
import { BaseService, ServiceHealth } from '../types/service';
import { SelfHealingProcessor, ExtractedEntity, ENTITY_TYPES } from '../types/self-healing';
import { BlockData, ExtrinsicData } from '../types/blockchain';
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
export class AccountService implements BaseService, IAccountService, SelfHealingProcessor {
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

  // Self-Healing Helper Methods
  
  /**
   * Validate if a string is a valid Avail address
   * Avail uses Substrate SS58 format
   */
  private isValidAvailAddress(address: string): boolean {
    try {
      // Basic validation: address should be a string and have reasonable length
      if (!address || typeof address !== 'string') {
        return false;
      }
      
      // Avail addresses typically start with '5' and are 47-48 characters long
      if (address.length < 40 || address.length > 50) {
        return false;
      }
      
      // Should start with '5' for SS58 format
      if (!address.startsWith('5')) {
        return false;
      }
      
      // Basic character validation (base58 characters)
      const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]+$/;
      return base58Regex.test(address);
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if an extrinsic is a transfer operation
   */
  private isTransferExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'balances' && 
           ['transfer', 'transferKeepAlive', 'transferAll'].includes(extrinsic.method.method);
  }

  /**
   * Extract transfer destination address from transfer extrinsic
   */
  private extractTransferDestination(extrinsic: ExtrinsicData): string | null {
    try {
      if (!this.isTransferExtrinsic(extrinsic)) {
        return null;
      }

      const args = extrinsic.method.args;
      
      // Different transfer methods have different argument structures
      if (extrinsic.method.method === 'transfer' || extrinsic.method.method === 'transferKeepAlive') {
        // transfer(dest, value) or transferKeepAlive(dest, value)
        return args.dest || args.destination || null;
      }
      
      if (extrinsic.method.method === 'transferAll') {
        // transferAll(dest, keepAlive)
        return args.dest || args.destination || null;
      }

      return null;
    } catch (error) {
      logger.warn('AccountService: Failed to extract transfer destination', {
        component: 'account-service',
        extrinsicHash: extrinsic.hash,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Extract addresses from extrinsic method arguments
   * This is a generic method that looks for address-like strings in arguments
   */
  private extractAddressesFromArgs(args: Record<string, any>): string[] {
    const addresses: string[] = [];
    
    try {
      const extractFromValue = (value: any): void => {
        if (typeof value === 'string' && this.isValidAvailAddress(value)) {
          addresses.push(value);
        } else if (Array.isArray(value)) {
          value.forEach(extractFromValue);
        } else if (value && typeof value === 'object') {
          Object.values(value).forEach(extractFromValue);
        }
      };

      Object.values(args).forEach(extractFromValue);
    } catch (error) {
      // Ignore errors in argument parsing - this is best-effort extraction
    }

    return addresses;
  }

  // Self-Healing Processor Methods
  // Phase 2: Account extraction and processing implementation

  /**
   * Extract account addresses from block data
   * 
   * Extracts addresses from:
   * - Block validator (block author)
   * - Extrinsic signers
   * - Transfer destinations (balances.transfer calls)
   * - Other extrinsic arguments that contain addresses
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    const addresses = new Set<string>();
    
    try {
      logger.debug('AccountService: Extracting addresses from block', { 
        component: 'account-service',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      // 1. Extract block validator (block author)
      if (blockData.validator && this.isValidAvailAddress(blockData.validator)) {
        addresses.add(blockData.validator);
        logger.debug('AccountService: Added block validator address', {
          component: 'account-service',
          blockNumber: blockData.number,
          validator: blockData.validator.substring(0, 20) + '...',
        });
      }

      // 2. Extract from extrinsics
      blockData.extrinsics.forEach((extrinsic, index) => {
        try {
          // Extract extrinsic signer
          if (extrinsic.signer && this.isValidAvailAddress(extrinsic.signer)) {
            addresses.add(extrinsic.signer);
          }

          // Extract transfer destinations
          if (this.isTransferExtrinsic(extrinsic)) {
            const destination = this.extractTransferDestination(extrinsic);
            if (destination && this.isValidAvailAddress(destination)) {
              addresses.add(destination);
            }
          }

          // Extract other addresses from extrinsic arguments
          const argAddresses = this.extractAddressesFromArgs(extrinsic.method.args);
          argAddresses.forEach(addr => {
            if (this.isValidAvailAddress(addr)) {
              addresses.add(addr);
            }
          });

        } catch (error) {
          logger.warn('AccountService: Failed to extract addresses from extrinsic', {
            component: 'account-service',
            blockNumber: blockData.number,
            extrinsicIndex: index,
            error: (error as Error).message,
          });
          // Continue processing other extrinsics
        }
      });

      // Convert to ExtractedEntity array
      const entities: ExtractedEntity[] = Array.from(addresses).map(address => ({
        type: ENTITY_TYPES.ACCOUNT,
        id: address,
        data: {
          address,
          blockNumber: blockData.number,
          extractedFrom: 'block_processing',
        },
        dependencies: [], // Accounts have no dependencies
      }));

      logger.debug('AccountService: Address extraction complete', {
        component: 'account-service',
        blockNumber: blockData.number,
        addressCount: entities.length,
      });

      return entities;

    } catch (error) {
      logger.error('AccountService: Failed to extract addresses from block', {
        component: 'account-service',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      
      // Return empty array on error - don't fail the entire block processing
      return [];
    }
  }

  /**
   * Process extracted account entities
   * 
   * For each extracted address, ensure the account exists in the database
   * Uses the existing getOrCreateAccount method for consistent account creation
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<Account[]> {
    const results: Account[] = [];
    
    try {
      logger.debug('AccountService: Processing extracted account entities', { 
        component: 'account-service',
        entityCount: entities.length,
      });

      for (const entity of entities) {
        try {
          // Ensure dependencies are resolved first
          await this.ensureDependencies(entity);
          
          // Process the account entity
          const account = await this.ensureAccountExists(entity.data.address);
          results.push(account);
          
          logger.debug('AccountService: Account processed successfully', {
            component: 'account-service',
            address: entity.data.address.substring(0, 20) + '...',
            entityType: entity.type,
            blockNumber: entity.data.blockNumber,
          });

        } catch (error) {
          logger.error('AccountService: Failed to process account entity', {
            component: 'account-service',
            entityId: entity.id,
            entityType: entity.type,
            error: (error as Error).message,
          });
          // Continue processing other entities - don't fail the entire batch
        }
      }

      logger.debug('AccountService: Account entity processing complete', {
        component: 'account-service',
        totalEntities: entities.length,
        successfullyProcessed: results.length,
        failed: entities.length - results.length,
      });

      return results;

    } catch (error) {
      logger.error('AccountService: Failed to process extracted entities', {
        component: 'account-service',
        entityCount: entities.length,
        error: (error as Error).message,
      });
      
      // Return partial results on error
      return results;
    }
  }

  /**
   * Ensure account dependencies exist
   * 
   * Accounts are the base entity type and have no dependencies.
   * This method is a no-op but is required by the SelfHealingProcessor interface.
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    // No-op: accounts have no dependencies - they are the base entity type
    logger.debug('AccountService: ensureDependencies called (no dependencies required)', { 
      component: 'account-service',
      entityType: entity.type,
      entityId: entity.id.substring(0, 20) + '...',
    });
  }

  /**
   * Helper method for other services to ensure account exists
   * This method already exists in the current implementation as getOrCreateAccount
   * TODO: Phase 2 - Expose this as ensureAccountExists for other services
   */
  async ensureAccountExists(address: string): Promise<Account> {
    return this.getOrCreateAccount(address);
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