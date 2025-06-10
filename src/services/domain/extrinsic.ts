import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { BlockchainService } from '../core/blockchain';
import { 
  Extrinsic, 
  ExtrinsicWithMetadata, 
  PaginatedResponse,
  PaginationParams,
  SortParams,
} from '../../types/database';
import { ExtrinsicData, BlockData } from '../types/blockchain';

export interface IExtrinsicService {
  getExtrinsic(hash: string): Promise<ExtrinsicWithMetadata>;
  getExtrinsicsForBlock(blockNumber: number): Promise<ExtrinsicWithMetadata[]>;
  getExtrinsics(pagination?: PaginationParams, sort?: SortParams): Promise<PaginatedResponse<Extrinsic>>;
  processExtrinsicsFromBlock(blockData: BlockData): Promise<ExtrinsicWithMetadata[]>;
}

export interface FeeCalculation {
  baseFee: bigint;
  tip: bigint;
  totalFee: bigint;
  feePerByte?: bigint;
}

export class ExtrinsicService implements IExtrinsicService {
  private db: typeof db;
  private blockchain: BlockchainService;

  constructor(database: typeof db, blockchain: BlockchainService) {
    this.db = database;
    this.blockchain = blockchain;
  }

  /**
   * Get extrinsic by hash
   * Pattern: Check database first, then fetch from blockchain if needed
   */
  async getExtrinsic(hash: string): Promise<ExtrinsicWithMetadata> {
    try {
      // Step 1: Check database first
      const existingExtrinsic = await this.getExtrinsicFromDatabase(hash);
      if (existingExtrinsic) {
        logger.info('Extrinsic found in database', { 
          component: 'extrinsic-service',
          hash,
          source: 'database',
        });
        return existingExtrinsic;
      }

      // Step 2: If not in database, we need to fetch the block and process extrinsics
      logger.info('Extrinsic not found in database, fetching from blockchain', {
        component: 'extrinsic-service',
        hash,
        source: 'blockchain',
      });

      // We need to find which block contains this extrinsic
      // For now, throw an error - in a real implementation, we'd need to search or have an index
      throw new Error(`Extrinsic ${hash} not found in database and block lookup not implemented`);

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsic',
        hash,
      });
      throw error;
    }
  }

  /**
   * Get all extrinsics for a specific block
   */
  async getExtrinsicsForBlock(blockNumber: number): Promise<ExtrinsicWithMetadata[]> {
    try {
      // Step 1: Check database first
      const existingExtrinsics = await this.getExtrinsicsFromDatabaseByBlock(blockNumber);
      if (existingExtrinsics.length > 0) {
        logger.info('Extrinsics found in database for block', { 
          component: 'extrinsic-service',
          blockNumber,
          count: existingExtrinsics.length,
          source: 'database',
        });
        return existingExtrinsics;
      }

      // Step 2: Fetch block from blockchain and process extrinsics
      logger.info('Extrinsics not found in database, fetching block from blockchain', {
        component: 'extrinsic-service',
        blockNumber,
        source: 'blockchain',
      });

      const blockData = await this.blockchain.getBlock(blockNumber);
      const processedExtrinsics = await this.processExtrinsicsFromBlock(blockData);
      
      logger.info('Extrinsics processed and persisted for block', {
        component: 'extrinsic-service',
        blockNumber,
        count: processedExtrinsics.length,
      });

      return processedExtrinsics;

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsicsForBlock',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Get paginated list of extrinsics (primarily from database for analytics)
   */
  async getExtrinsics(
    pagination: PaginationParams = { page: 1, limit: 20 },
    sort: SortParams = { sort_by: 'id', sort_order: 'desc' },
  ): Promise<PaginatedResponse<Extrinsic>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_by: sortBy = 'id', sort_order: sortOrder = 'desc' } = sort;

      const result = await this.db.paginate<Extrinsic>(
        'extrinsics',
        page,
        limit,
        undefined, // no where clause
        sortBy,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );

      return {
        data: result.data,
        pagination: {
          page: result.meta.page,
          limit: result.meta.limit,
          total_count: result.meta.total,
          total_pages: result.meta.totalPages,
          has_next: result.meta.page < result.meta.totalPages,
          has_prev: result.meta.page > 1,
        },
      };

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsics',
      });
      throw error;
    }
  }

  /**
   * Process extrinsics from a block and persist to database
   */
  async processExtrinsicsFromBlock(blockData: BlockData): Promise<ExtrinsicWithMetadata[]> {
    try {
      const processedExtrinsics: ExtrinsicWithMetadata[] = [];

      for (let i = 0; i < blockData.extrinsics.length; i++) {
        const extrinsicData = blockData.extrinsics[i];
        
        // Calculate fees
        const feeCalculation = this.calculateFees(extrinsicData);
        
        // Create extrinsic record
        const extrinsicRecord: Omit<Extrinsic, 'id' | 'created_at'> = {
          hash: extrinsicData.hash,
          block_number: BigInt(blockData.number),
          extrinsic_index: extrinsicData.index,
          module: extrinsicData.method.section,
          call: extrinsicData.method.method,
          success: extrinsicData.success,
          timestamp: BigInt(blockData.timestamp),
          signer: extrinsicData.signer || undefined,
          fee: feeCalculation.totalFee,
        };

        // Persist to database
        const insertedExtrinsic = await this.db.insert<Extrinsic>('extrinsics', extrinsicRecord);
        
        // Create enriched response
        const enrichedExtrinsic: ExtrinsicWithMetadata = {
          ...insertedExtrinsic,
          events: [], // TODO: Add events in future iterations
          transfers: [], // TODO: Add transfers in future iterations
          data_submission: undefined, // TODO: Add data submissions in future iterations
          gas_info: {
            gas_used: undefined, // TODO: Extract from blockchain data
            gas_limit: undefined, // TODO: Extract from blockchain data
            gas_price: undefined, // TODO: Extract from blockchain data
          },
        };

        processedExtrinsics.push(enrichedExtrinsic);
      }

      return processedExtrinsics;

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'processExtrinsicsFromBlock',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }

  /**
   * Calculate fees for an extrinsic
   */
  private calculateFees(extrinsicData: ExtrinsicData): FeeCalculation {
    try {
      // Extract fee components from extrinsic data
      const baseFee = extrinsicData.fee ? BigInt(extrinsicData.fee) : BigInt(0);
      const tip = extrinsicData.tip ? BigInt(extrinsicData.tip) : BigInt(0);
      const totalFee = baseFee + tip;

      return {
        baseFee,
        tip,
        totalFee,
        feePerByte: undefined, // TODO: Calculate based on extrinsic size
      };

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'calculateFees',
        extrinsicHash: extrinsicData.hash,
      });
      
      // Return zero fees if calculation fails
      return {
        baseFee: BigInt(0),
        tip: BigInt(0),
        totalFee: BigInt(0),
      };
    }
  }

  /**
   * Private: Get extrinsic from database by hash
   */
  private async getExtrinsicFromDatabase(hash: string): Promise<ExtrinsicWithMetadata | null> {
    try {
      const extrinsic = await this.db.findOne<Extrinsic>('extrinsics', { hash });
      
      if (!extrinsic) {
        return null;
      }

      // For now, return basic extrinsic data with empty metadata
      // TODO: Add metadata (events, transfers, etc.) in future iterations
      return {
        ...extrinsic,
        events: [],
        transfers: [],
        data_submission: undefined,
        gas_info: {
          gas_used: undefined,
          gas_limit: undefined,
          gas_price: undefined,
        },
      } as ExtrinsicWithMetadata;

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsicFromDatabase',
        hash,
      });
      throw error;
    }
  }

  /**
   * Private: Get extrinsics from database by block number
   */
  private async getExtrinsicsFromDatabaseByBlock(blockNumber: number): Promise<ExtrinsicWithMetadata[]> {
    try {
      const extrinsics = await this.db.findMany<Extrinsic>(
        'extrinsics',
        { block_number: blockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );

      return extrinsics.map(extrinsic => ({
        ...extrinsic,
        events: [],
        transfers: [],
        data_submission: undefined,
        gas_info: {
          gas_used: undefined,
          gas_limit: undefined,
          gas_price: undefined,
        },
      })) as ExtrinsicWithMetadata[];

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsicsFromDatabaseByBlock',
        blockNumber,
      });
      throw error;
    }
  }
}

// Factory function for dependency injection
export const createExtrinsicService = (database: typeof db, blockchain: BlockchainService): ExtrinsicService => {
  return new ExtrinsicService(database, blockchain);
}; 