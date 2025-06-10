import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { BlockchainService } from '../core/blockchain';
import { 
  Block, 
  BlockWithMetadata, 
  PaginatedResponse,
  PaginationParams,
  SortParams,
} from '../../types/database';
import { BlockData } from '../types/blockchain';

export interface IBlockService {
  getBlock(hashOrNumber: string | number): Promise<BlockWithMetadata>;
  getLatestBlock(): Promise<BlockWithMetadata>;
  getBlocks(pagination?: PaginationParams, sort?: SortParams): Promise<PaginatedResponse<Block>>;
}

export class BlockService implements IBlockService {
  private db: typeof db;
  private blockchain: BlockchainService;

  constructor(database: typeof db, blockchain: BlockchainService) {
    this.db = database;
    this.blockchain = blockchain;
  }

  /**
   * Get block by hash or number
   * Pattern: Check database first, then fetch from blockchain if needed
   */
  async getBlock(hashOrNumber: string | number): Promise<BlockWithMetadata> {
    try {
      // Step 1: Check database first
      const existingBlock = await this.getBlockFromDatabase(hashOrNumber);
      if (existingBlock) {
        logger.info('Block found in database', { 
          component: 'block-service',
          identifier: hashOrNumber,
          source: 'database'
        });
        return existingBlock;
      }

      // Step 2: Fetch from blockchain if not in database
      logger.info('Block not found in database, fetching from blockchain', {
        component: 'block-service',
        identifier: hashOrNumber,
        source: 'blockchain'
      });

      const blockData = await this.fetchBlockFromBlockchain(hashOrNumber);
      
      // Step 3: Persist to database for analytics
      const persistedBlock = await this.persistBlockToDatabase(blockData);
      
      logger.info('Block fetched and persisted successfully', {
        component: 'block-service',
        identifier: hashOrNumber,
        blockNumber: persistedBlock.number,
      });

      return persistedBlock;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlock',
        identifier: hashOrNumber
      });
      throw error;
    }
  }

  /**
   * Get the latest block
   */
  async getLatestBlock(): Promise<BlockWithMetadata> {
    try {
      // Get latest block from blockchain first (since it's the most current)
      const latestBlockData = await this.blockchain.getLatestBlock();
      
      // Check if we already have this block in database
      const existingBlock = await this.getBlockFromDatabase(latestBlockData.number);
      if (existingBlock) {
        return existingBlock;
      }

      // Persist the latest block for analytics
      const persistedBlock = await this.persistBlockToDatabase(latestBlockData);
      
      logger.info('Latest block fetched and persisted', {
        component: 'block-service',
        blockNumber: persistedBlock.number
      });

      return persistedBlock;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getLatestBlock'
      });
      throw error;
    }
  }

  /**
   * Get paginated list of blocks (primarily from database for analytics)
   */
  async getBlocks(
    pagination: PaginationParams = { page: 1, limit: 20 },
    sort: SortParams = { sort_by: 'number', sort_order: 'desc' },
  ): Promise<PaginatedResponse<Block>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_by: sortBy = 'number', sort_order: sortOrder = 'desc' } = sort;

      const result = await this.db.paginate<Block>(
        'blocks',
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
          has_prev: result.meta.page > 1
        }
      };

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlocks'
      });
      throw error;
    }
  }

  /**
   * Private: Get block from database
   */
  private async getBlockFromDatabase(hashOrNumber: string | number): Promise<BlockWithMetadata | null> {
    try {
      let whereClause: Record<string, any>;
      
      if (typeof hashOrNumber === 'string') {
        whereClause = { hash: hashOrNumber };
      } else {
        whereClause = { number: hashOrNumber };
      }

      const block = await this.db.findOne<Block>('blocks', whereClause);
      
      if (!block) {
        return null;
      }

      // For now, return basic block data
      // TODO: Add metadata (events, extrinsics, etc.) in future iterations
      return {
        ...block,
        events: [],
        logs: [],
        data_submissions: [],
        transfers: []
      } as BlockWithMetadata;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlockFromDatabase',
        identifier: hashOrNumber
      });
      throw error;
    }
  }

  /**
   * Private: Fetch block from blockchain
   */
  private async fetchBlockFromBlockchain(hashOrNumber: string | number): Promise<BlockData> {
    try {
      return await this.blockchain.getBlock(hashOrNumber);
    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'fetchBlockFromBlockchain',
        identifier: hashOrNumber
      });
      throw error;
    }
  }

  /**
   * Private: Persist block to database for analytics
   */
  private async persistBlockToDatabase(blockData: BlockData): Promise<BlockWithMetadata> {
    try {
      const blockRecord: Omit<Block, 'created_at'> = {
        number: BigInt(blockData.number),
        hash: blockData.hash,
        parent_hash: blockData.parentHash,
        state_root: blockData.stateRoot,
        timestamp: BigInt(blockData.timestamp),
        extrinsics_count: blockData.extrinsics?.length || 0
      };

      const insertedBlock = await this.db.insert<Block>('blocks', blockRecord);
      
      // Return as BlockWithMetadata
      return {
        ...insertedBlock,
        events: [],
        logs: [],
        data_submissions: [],
        transfers: []
      } as BlockWithMetadata;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'persistBlockToDatabase',
        blockNumber: blockData.number
      });
      throw error;
    }
  }
}

// Factory function for dependency injection
export const createBlockService = (database: typeof db, blockchain: BlockchainService): BlockService => {
  return new BlockService(database, blockchain);
}; 