import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { TransferRepository } from '../../database/repositories/TransferRepository';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { BaseService, ServiceHealth } from '../types/service';
import { SelfHealingProcessor, ExtractedEntity, DependencyResolver } from '../types/self-healing';
import { BlockData, ExtrinsicData } from '../types/blockchain';

// Service interfaces
export interface TransferFilters {
  fromAddress?: string;
  toAddress?: string;
  minAmount?: string;
  maxAmount?: string;
  startDate?: Date;
  endDate?: Date;
  blockNumber?: number;
  blockHash?: string;
}

export interface TransferWithDetails {
  id: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  fee: string | null;
  success: boolean;
  blockNumber: number;
  blockHash: string;
  extrinsicIndex: number;
  timestamp: Date;
  // Enhanced details
  fromIdentity?: {
    display?: string;
    legal?: string;
    web?: string;
    twitter?: string;
  };
  toIdentity?: {
    display?: string;
    legal?: string;
    web?: string;
    twitter?: string;
  };
  blockDetails?: {
    timestamp: Date;
    validator: string;
    validatorName?: string;
  };
}

export interface TransferList {
  transfers: TransferWithDetails[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface TransferStats {
  totalTransfers: number;
  totalVolume: string;
  uniqueAddresses: number;
  averageAmount: string;
  transfersToday: number;
  volumeToday: string;
  topTransfersByAmount: Array<{
    hash: string;
    amount: string;
    fromAddress: string;
    toAddress: string;
    timestamp: Date;
  }>;
  mostActiveAddresses: Array<{
    address: string;
    transferCount: number;
    totalVolume: string;
    identity?: {
      display?: string;
      legal?: string;
    };
  }>;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'timestamp' | 'amount' | 'blockNumber';
  sortOrder?: 'asc' | 'desc';
}

export interface ITransferService {
  getTransfers(filters?: TransferFilters, options?: PaginationOptions): Promise<TransferList>;
  getTransfer(id: string): Promise<TransferWithDetails | null>;
  getTransferByHash(hash: string): Promise<TransferWithDetails | null>;
  getTransfersByBlock(blockNumber: number, options?: PaginationOptions): Promise<TransferList>;
  getTransfersByAccount(address: string, options?: PaginationOptions): Promise<TransferList>;
  getTransferStatistics(period?: string): Promise<TransferStats>;
}

/**
 * TransferService - Manages transfer data and operations
 * 
 * Responsibilities:
 * - Fetch transfer details and lists with filtering
 * - Get transfers by block, account, or hash
 * - Provide transfer statistics and analytics
 * - Support pagination and sorting
 * - Enhance transfers with identity and block information
 * - Extract and process transfers from blockchain data (Phase 4)
 */
export class TransferService implements BaseService, ITransferService, SelfHealingProcessor {
  private blockchain: AvailBlockchainService;
  private transferRepository: TransferRepository;
  private blockRepository: BlockRepository;
  private dependencyResolver: DependencyResolver;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    transferRepository: TransferRepository,
    blockRepository: BlockRepository,
    dependencyResolver: DependencyResolver,
  ) {
    this.blockchain = blockchain;
    this.transferRepository = transferRepository;
    this.blockRepository = blockRepository;
    this.dependencyResolver = dependencyResolver;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    logger.info('TransferService: Starting service', { component: 'transfer-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('TransferService: Stopping service', { component: 'transfer-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'TransferService',
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
      logger.debug('TransferService: Getting transfers', { 
        component: 'transfer-service',
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

      logger.debug('TransferService: Transfers retrieved', { 
        component: 'transfer-service',
        count: enhancedTransfers.length,
        total: result.total,
        page,
      });

      return transferList;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
      logger.debug('TransferService: Getting transfer by ID', { 
        component: 'transfer-service',
        id,
      });

      const transfer = await this.transferRepository.findById(id);
      
      if (!transfer) {
        return null;
      }

      const enhancedTransfer = await this.enhanceTransferDetails(transfer);

      logger.debug('TransferService: Transfer retrieved by ID', { 
        component: 'transfer-service',
        id,
        hash: enhancedTransfer.hash,
      });

      return enhancedTransfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
      logger.debug('TransferService: Getting transfer by hash', { 
        component: 'transfer-service',
        hash,
      });

      // For now, search by extrinsic hash since findByHash doesn't exist
      const transfers = await this.transferRepository.findByExtrinsicHash(hash);
      const transfer = transfers.length > 0 ? transfers[0] : null;
      
      if (!transfer) {
        return null;
      }

      const enhancedTransfer = await this.enhanceTransferDetails(transfer);

      logger.debug('TransferService: Transfer retrieved by hash', { 
        component: 'transfer-service',
        hash,
        id: enhancedTransfer.id,
      });

      return enhancedTransfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
      logger.debug('TransferService: Getting transfers by block', { 
        component: 'transfer-service',
        blockNumber,
        options,
      });

      return await this.getTransfers(
        { blockNumber },
        options,
      );

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
      logger.debug('TransferService: Getting transfers by account', { 
        component: 'transfer-service',
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

      logger.debug('TransferService: Transfers retrieved by account', { 
        component: 'transfer-service',
        address,
        count: enhancedTransfers.length,
        total: result.total,
      });

      return transferList;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
      logger.debug('TransferService: Getting transfer statistics', { 
        component: 'transfer-service',
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

      logger.debug('TransferService: Transfer statistics retrieved', { 
        component: 'transfer-service',
        period,
        totalTransfers: transferStats.totalTransfers,
        transfersToday: transferStats.transfersToday,
      });

      return transferStats;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
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
        component: 'transfer-service', 
        action: 'enhanceTransferDetails',
        transferId: transfer.id,
      });

      return {
        id: transfer.id,
        hash: transfer.hash,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
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
   */
  private async getAddressIdentity(address: string): Promise<any> {
    try {
      // Try to get identity from blockchain
      const api = await this.blockchain.getApi();
      const identity = await api.query.identity?.identityOf(address);
      
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

  // Self-Healing Processor Methods (Phase 4 Implementation)

  /**
   * Extract transfer information from block data
   * Identifies balance.transfer, balance.transferKeepAlive, and balance.transferAll extrinsics
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    try {
      logger.debug('TransferService: Extracting transfers from block', { 
        component: 'transfer-service',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      const transfers: ExtractedEntity[] = [];

      blockData.extrinsics.forEach((extrinsic, index) => {
        if (this.isTransferExtrinsic(extrinsic)) {
          const transferData = this.extractTransferData(extrinsic, blockData, index);
          if (transferData) {
            transfers.push({
              type: 'transfer',
              id: `${blockData.number}-${index}`,
              data: transferData,
              dependencies: [
                {
                  service: 'account',
                  entityType: 'account',
                  entityId: transferData.fromAddress,
                  required: true,
                },
                {
                  service: 'account',
                  entityType: 'account',
                  entityId: transferData.toAddress,
                  required: true,
                },
              ],
            });
          }
        }
      });

      logger.debug('TransferService: Extracted transfers from block', { 
        component: 'transfer-service',
        blockNumber: blockData.number,
        transferCount: transfers.length,
      });

      return transfers;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'extractFromBlock',
        blockNumber: blockData.number,
      });
      return [];
    }
  }

  /**
   * Process extracted transfer entities
   * Creates transfer records after ensuring dependencies exist
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<any[]> {
    try {
      logger.debug('TransferService: Processing extracted transfer entities', { 
        component: 'transfer-service',
        entityCount: entities.length,
      });

      const results: any[] = [];

      for (const entity of entities) {
        try {
          // Ensure dependencies exist first
          await this.ensureDependencies(entity);

          // Process the transfer
          const transfer = await this.processTransfer(entity);
          if (transfer) {
            results.push(transfer);
          }

        } catch (error) {
          logError(error as Error, { 
            component: 'transfer-service', 
            action: 'processExtractedEntity',
            entityId: entity.id,
          });
          // Continue processing other entities
        }
      }

      logger.debug('TransferService: Processed transfer entities', { 
        component: 'transfer-service',
        processedCount: results.length,
        totalEntities: entities.length,
      });

      return results;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'processExtractedEntities',
      });
      return [];
    }
  }

  /**
   * Ensure transfer dependencies exist (from and to accounts)
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    try {
      // Ensure from account exists
      if (entity.data.fromAddress) {
        await this.dependencyResolver.ensureAccount(entity.data.fromAddress);
      }

      // Ensure to account exists  
      if (entity.data.toAddress) {
        await this.dependencyResolver.ensureAccount(entity.data.toAddress);
      }

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'ensureDependencies',
        entityId: entity.id,
      });
      throw error;
    }
  }

  /**
   * Helper method: Check if extrinsic is a transfer
   */
  private isTransferExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'balances' && 
           ['transfer', 'transferKeepAlive', 'transferAll'].includes(extrinsic.method.method);
  }

  /**
   * Helper method: Extract transfer data from extrinsic
   */
  private extractTransferData(extrinsic: ExtrinsicData, blockData: BlockData, index: number) {
    try {
      if (!extrinsic.signer) {
        return null; // No signer means no valid transfer
      }

      // Extract destination address
      let toAddress: string | null = null;
      if (extrinsic.method.args.dest) {
        // Handle different destination formats
        if (typeof extrinsic.method.args.dest === 'string') {
          toAddress = extrinsic.method.args.dest;
        } else if (extrinsic.method.args.dest.Id) {
          toAddress = extrinsic.method.args.dest.Id;
        } else if (extrinsic.method.args.dest.toString) {
          toAddress = extrinsic.method.args.dest.toString();
        }
      }

      if (!toAddress) {
        logger.warn('TransferService: Could not extract destination address', {
          component: 'transfer-service',
          extrinsicHash: extrinsic.hash,
          args: extrinsic.method.args,
        });
        return null;
      }

      // Extract amount
      let amount = BigInt(0);
      if (extrinsic.method.args.value) {
        try {
          amount = BigInt(extrinsic.method.args.value.toString());
        } catch {
          logger.warn('TransferService: Could not parse transfer amount', {
            component: 'transfer-service',
            extrinsicHash: extrinsic.hash,
            value: extrinsic.method.args.value,
          });
        }
      }

      return {
        extrinsicHash: extrinsic.hash,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        extrinsicIndex: index,
        fromAddress: extrinsic.signer,
        toAddress,
        amount: amount.toString(),
        fee: extrinsic.fee || '0',
        success: extrinsic.success,
        timestamp: new Date(blockData.timestamp),
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'extractTransferData',
        extrinsicHash: extrinsic.hash,
      });
      return null;
    }
  }

  /**
   * Helper method: Process a single transfer entity
   */
  private async processTransfer(entity: ExtractedEntity): Promise<any> {
    try {
      const transferData = entity.data;

      // Check if transfer already exists
      const existing = await this.transferRepository.findByExtrinsicHash(transferData.extrinsicHash);
      if (existing) {
        logger.debug('TransferService: Transfer already exists, skipping', {
          component: 'transfer-service',
          extrinsicHash: transferData.extrinsicHash,
        });
        return existing;
      }

      // Create new transfer record
      const transfer = await this.transferRepository.create({
        id: `${transferData.extrinsicHash}-${transferData.extrinsicIndex}`,
        extrinsicHash: transferData.extrinsicHash,
        fromAddress: transferData.fromAddress,
        toAddress: transferData.toAddress,
        amount: BigInt(transferData.amount),
        tokenType: 'AVAIL',
        fees: BigInt(transferData.fee),
        status: transferData.success ? 'success' : 'failed',
        blockNumber: transferData.blockNumber,
        extrinsicIndex: transferData.extrinsicIndex,
        timestamp: transferData.timestamp,
      });

      logger.debug('TransferService: Transfer created', {
        component: 'transfer-service',
        transferId: transfer.id,
        fromAddress: transferData.fromAddress.substring(0, 10) + '...',
        toAddress: transferData.toAddress.substring(0, 10) + '...',
        amount: transferData.amount,
      });

      return transfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'processTransfer',
        entityId: entity.id,
      });
      throw error;
    }
  }

  /**
   * Public method for dependency resolver integration
   */
  async ensureTransferExists(extrinsicHash: string): Promise<any> {
    try {
      const transfer = await this.transferRepository.findByExtrinsicHash(extrinsicHash);
      return transfer;
    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-service', 
        action: 'ensureTransferExists',
        extrinsicHash,
      });
      throw error;
    }
  }
}

// Factory function
export const createTransferService = (
  blockchain: AvailBlockchainService,
  transferRepository: TransferRepository,
  blockRepository: BlockRepository,
  dependencyResolver: DependencyResolver,
): TransferService => {
  return new TransferService(blockchain, transferRepository, blockRepository, dependencyResolver);
}; 