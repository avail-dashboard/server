import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { TransferRepository } from '../../../database/repositories/TransferRepository';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { BaseService, ServiceHealth } from '../../types/service';
import {
  TransferFilters,
  TransferWithDetails,
  TransferList,
  TransferStats,
  PaginationOptions,
  ITransferService,
} from './TransferInterfaces';

/**
 * TransferApiService - Read Operations for Transfer Data
 * 
 * Responsibilities:
 * - Fetch transfer details and lists with filtering
 * - Get transfers by block, account, or hash
 * - Provide transfer statistics and analytics
 * - Support pagination and sorting
 * - Enhance transfers with identity and block information
 */
export class TransferApiService implements BaseService, ITransferService {
  private blockchain: AvailBlockchainService;
  private transferRepository: TransferRepository;
  private blockRepository: BlockRepository;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    transferRepository: TransferRepository,
    blockRepository: BlockRepository,
  ) {
    this.blockchain = blockchain;
    this.transferRepository = transferRepository;
    this.blockRepository = blockRepository;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    logger.info('TransferApiService: Starting service', { component: 'transfer-api-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('TransferApiService: Stopping service', { component: 'transfer-api-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'TransferApiService',
        version: '1.0.0',
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get transfers with optional filtering and pagination
   */
  async getTransfers(filters?: TransferFilters, options?: PaginationOptions): Promise<TransferList> {
    try {
      logger.debug('TransferApiService: Getting transfers', { 
        component: 'transfer-api-service',
        filters,
        options,
      });

      const page = options?.page || 1;
      const limit = Math.min(options?.limit || 20, 100);
      const offset = (page - 1) * limit;

      // Build filter conditions
      const whereConditions: any = {};
      
      if (filters?.fromAddress) {
        whereConditions.fromAddress = filters.fromAddress;
      }
      
      if (filters?.toAddress) {
        whereConditions.toAddress = filters.toAddress;
      }
      
      if (filters?.blockNumber) {
        whereConditions.blockNumber = filters.blockNumber;
      }
      
      if (filters?.blockHash) {
        whereConditions.blockHash = filters.blockHash;
      }

      if (filters?.minAmount || filters?.maxAmount) {
        whereConditions.amount = {};
        if (filters.minAmount) {
          whereConditions.amount.gte = filters.minAmount;
        }
        if (filters.maxAmount) {
          whereConditions.amount.lte = filters.maxAmount;
        }
      }

      if (filters?.startDate || filters?.endDate) {
        whereConditions.timestamp = {};
        if (filters.startDate) {
          whereConditions.timestamp.gte = filters.startDate;
        }
        if (filters.endDate) {
          whereConditions.timestamp.lte = filters.endDate;
        }
      }

      // Get transfers with enhanced details
      const result = await this.transferRepository.findMany({
        page,
        limit,
        filters: whereConditions,
        orderBy: options?.sortBy || 'timestamp',
        orderDirection: options?.sortOrder || 'desc',
      });

      // Enhance transfers with additional details
      const enhancedTransfers = await Promise.all(
        result.transfers.map(transfer => this.enhanceTransferDetails(transfer)),
      );

      const transferList: TransferList = {
        transfers: enhancedTransfers,
        total: result.total,
        page,
        limit,
        hasMore: result.total > offset + limit,
      };

      logger.debug('TransferApiService: Transfers retrieved', { 
        component: 'transfer-api-service',
        count: enhancedTransfers.length,
        total: result.total,
        page,
      });

      return transferList;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransfers',
        filters,
        options,
      });
      throw error;
    }
  }

  /**
   * Get a specific transfer by ID
   */
  async getTransfer(id: string): Promise<TransferWithDetails | null> {
    try {
      logger.debug('TransferApiService: Getting transfer by ID', { 
        component: 'transfer-api-service',
        id,
      });

      const transfer = await this.transferRepository.findById(id);
      
      if (!transfer) {
        return null;
      }

      const enhancedTransfer = await this.enhanceTransferDetails(transfer);

      logger.debug('TransferApiService: Transfer retrieved by ID', { 
        component: 'transfer-api-service',
        id,
        hash: enhancedTransfer.hash,
      });

      return enhancedTransfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransfer',
        id,
      });
      throw error;
    }
  }

  /**
   * Get a specific transfer by hash
   */
  async getTransferByHash(hash: string): Promise<TransferWithDetails | null> {
    try {
      logger.debug('TransferApiService: Getting transfer by hash', { 
        component: 'transfer-api-service',
        hash,
      });

      // For now, search by extrinsic hash since findByHash doesn't exist
      const transfers = await this.transferRepository.findByExtrinsicHash(hash);
      const transfer = transfers.length > 0 ? transfers[0] : null;
      
      if (!transfer) {
        return null;
      }

      const enhancedTransfer = await this.enhanceTransferDetails(transfer);

      logger.debug('TransferApiService: Transfer retrieved by hash', { 
        component: 'transfer-api-service',
        hash,
        id: enhancedTransfer.id,
      });

      return enhancedTransfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransferByHash',
        hash,
      });
      throw error;
    }
  }

  /**
   * Get transfers for a specific block
   */
  async getTransfersByBlock(blockNumber: number, options?: PaginationOptions): Promise<TransferList> {
    try {
      logger.debug('TransferApiService: Getting transfers by block', { 
        component: 'transfer-api-service',
        blockNumber,
        options,
      });

      return await this.getTransfers(
        { blockNumber },
        options,
      );

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransfersByBlock',
        blockNumber,
        options,
      });
      throw error;
    }
  }

  /**
   * Get transfers for a specific account
   */
  async getTransfersByAccount(address: string, options?: PaginationOptions): Promise<TransferList> {
    try {
      logger.debug('TransferApiService: Getting transfers by account', { 
        component: 'transfer-api-service',
        address,
        options,
      });

      // Use the repository's findByAccount method which handles both sent and received
      const page = options?.page || 1;
      const limit = Math.min(options?.limit || 20, 100);
      
      const result = await this.transferRepository.findByAccount(address, {
        page,
        limit,
        type: 'all',
      });

      // Enhance transfers with additional details
      const enhancedTransfers = await Promise.all(
        result.transfers.map(transfer => this.enhanceTransferDetails(transfer)),
      );

      const transferList: TransferList = {
        transfers: enhancedTransfers,
        total: result.total,
        page,
        limit,
        hasMore: result.total > (page - 1) * limit + limit,
      };

      logger.debug('TransferApiService: Transfers retrieved by account', { 
        component: 'transfer-api-service',
        address,
        count: enhancedTransfers.length,
        total: result.total,
      });

      return transferList;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransfersByAccount',
        address,
        options,
      });
      throw error;
    }
  }

  /**
   * Get transfer statistics for a given period
   */
  async getTransferStatistics(period: string = '24h'): Promise<TransferStats> {
    try {
      logger.debug('TransferApiService: Getting transfer statistics', { 
        component: 'transfer-api-service',
        period,
      });

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      // For now, return mock data until repository methods are implemented
      const transferStats: TransferStats = {
        totalTransfers: 0,
        totalVolume: '0',
        uniqueAddresses: 0,
        averageAmount: '0',
        transfersToday: 0,
        volumeToday: '0',
        topTransfersByAmount: [],
        mostActiveAddresses: [],
      };

      logger.debug('TransferApiService: Transfer statistics retrieved', { 
        component: 'transfer-api-service',
        period,
        totalTransfers: transferStats.totalTransfers,
        transfersToday: transferStats.transfersToday,
      });

      return transferStats;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'getTransferStatistics',
        period,
      });
      throw error;
    }
  }

  /**
   * Enhance transfer details with additional information
   */
  private async enhanceTransferDetails(transfer: any): Promise<TransferWithDetails> {
    try {
      // Get identity information for from and to addresses
            const [fromIdentity, toIdentity, blockDetails] = await Promise.all([
        this.getAddressIdentity(transfer.fromAddress),
        this.getAddressIdentity(transfer.toAddress),
        this.getBlockDetails(transfer.blockNumber),
      ]);

      const enhancedTransfer: TransferWithDetails = {
        id: transfer.id,
        hash: transfer.hash,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
        asset_id: transfer.tokenType === 'AVAIL' ? 1 : 0,
        fee: transfer.fee,
        success: transfer.success,
        blockNumber: transfer.blockNumber,
        blockHash: transfer.blockHash,
        extrinsicIndex: transfer.extrinsicIndex,
        timestamp: transfer.timestamp,
        fromIdentity,
        toIdentity,
        blockDetails,
      };

      return enhancedTransfer;

    } catch (error) {
      // If enhancement fails, return basic transfer details
      logError(error as Error, { 
        component: 'transfer-api-service', 
        action: 'enhanceTransferDetails',
        transferId: transfer.id,
      });

      return {
        id: transfer.id,
        hash: transfer.hash,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
        asset_id: transfer.tokenType === 'AVAIL' ? 1 : 0,
        fee: transfer.fee,
        success: transfer.success,
        blockNumber: transfer.blockNumber,
        blockHash: transfer.blockHash,
        extrinsicIndex: transfer.extrinsicIndex,
        timestamp: transfer.timestamp,
      };
    }
  }

  /**
   * Get identity information for an address
   * PERFORMANCE: Uses cached blockchain methods (300-1000ms → <50ms for cached data)
   */
  private async getAddressIdentity(address: string): Promise<any> {
    try {
      // Try to get identity from blockchain using cached method
      const identity = await this.blockchain.getIdentity(address);
      
      if (identity && !identity.isEmpty) {
        const identityData = identity.unwrap();
        return {
          display: identityData.info.display.asRaw.toUtf8(),
          legal: identityData.info.legal.asRaw.toUtf8(),
          web: identityData.info.web.asRaw.toUtf8(),
          twitter: identityData.info.twitter.asRaw.toUtf8(),
        };
      }

      return undefined;

    } catch (error) {
      // Identity lookup failed, return undefined
      return undefined;
    }
  }

  /**
   * Get block details for enhanced transfer information
   */
  private async getBlockDetails(blockNumber: number): Promise<any> {
    try {
      const block = await this.blockRepository.findByNumber(blockNumber);
      
      if (!block) {
        return undefined;
      }

      return {
        timestamp: block.timestamp,
        validator: 'Unknown', // Block doesn't have validator info
        validatorName: undefined,
      };

    } catch (error) {
      return undefined;
    }
  }
}

// Factory function
export const createTransferApiService = (
  blockchain: AvailBlockchainService,
  transferRepository: TransferRepository,
  blockRepository: BlockRepository,
): TransferApiService => {
  return new TransferApiService(blockchain, transferRepository, blockRepository);
}; 