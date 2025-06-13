import { logger, logError } from '../../utils/logger';
import { BlockchainService } from '../core/blockchain';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { Block } from '../../database';
import { 
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
  private blockRepository: BlockRepository;
  private blockchain: BlockchainService;

  constructor(blockRepository: BlockRepository, blockchain: BlockchainService) {
    this.blockRepository = blockRepository;
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
          source: 'database',
        });
        return existingBlock;
      }

      // Step 2: Fetch from blockchain if not in database
      logger.info('Block not found in database, fetching from blockchain', {
        component: 'block-service',
        identifier: hashOrNumber,
        source: 'blockchain',
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
        identifier: hashOrNumber,
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
        blockNumber: persistedBlock.number,
      });

      return persistedBlock;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getLatestBlock',
      });
      throw error;
    }
  }

  /**
   * Get paginated list of blocks using repository
   */
  async getBlocks(
    pagination: PaginationParams = { page: 1, limit: 20 },
    sort: SortParams = { sort_by: 'number', sort_order: 'desc' },
  ): Promise<PaginatedResponse<Block>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_order: sortOrder = 'desc' } = sort;

      const { blocks, total } = await this.blockRepository.findMany({
        page,
        limit,
        orderBy: sortOrder.toLowerCase() as 'asc' | 'desc',
      });

      return {
        data: blocks.map(block => ({
          number: block.number,
          hash: block.hash,
          parentHash: block.parentHash,
          stateRoot: block.stateRoot,
          timestamp: block.timestamp,
          extrinsicsCount: block.extrinsicsCount,
          createdAt: block.createdAt,
        })),
        pagination: {
          page,
          limit,
          total_count: total,
          total_pages: Math.ceil(total / limit),
          has_next: page < Math.ceil(total / limit),
          has_prev: page > 1,
        },
      };

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlocks',
      });
      throw error;
    }
  }

  /**
   * Private: Get block from database using repository
   */
  private async getBlockFromDatabase(hashOrNumber: string | number): Promise<BlockWithMetadata | null> {
    try {
      let block: Block | null;
      
      if (typeof hashOrNumber === 'string') {
        block = await this.blockRepository.findByHash(hashOrNumber);
      } else {
        block = await this.blockRepository.findByNumber(hashOrNumber);
      }
      
      if (!block) {
        return null;
      }

      // Convert to BlockWithMetadata format
      // TODO: Add metadata (events, extrinsics, etc.) in future iterations
      return {
        number: block.number,
        hash: block.hash,
        parent_hash: block.parentHash,
        state_root: block.stateRoot,
        timestamp: block.timestamp,
        extrinsics_count: block.extrinsicsCount,
        created_at: block.createdAt,
        events: [],
        logs: [],
        data_submissions: [],
        transfers: [],
      } as BlockWithMetadata;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlockFromDatabase',
        identifier: hashOrNumber,
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
        identifier: hashOrNumber,
      });
      throw error;
    }
  }

  /**
   * Private: Persist block to database using repository
   */
  private async persistBlockToDatabase(blockData: BlockData): Promise<BlockWithMetadata> {
    try {
      const insertedBlock = await this.blockRepository.create({
        number: blockData.number,
        hash: blockData.hash,
        parentHash: blockData.parentHash,
        stateRoot: blockData.stateRoot,
        timestamp: new Date(blockData.timestamp),
        extrinsicsCount: blockData.extrinsics?.length || 0,
      });
      
      // Convert to BlockWithMetadata format
      return {
        number: insertedBlock.number,
        hash: insertedBlock.hash,
        parent_hash: insertedBlock.parentHash,
        state_root: insertedBlock.stateRoot,
        timestamp: insertedBlock.timestamp,
        extrinsics_count: insertedBlock.extrinsicsCount,
        created_at: insertedBlock.createdAt,
        events: [],
        logs: [],
        data_submissions: [],
        transfers: [],
      } as BlockWithMetadata;

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'persistBlockToDatabase',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }
}

export const createBlockService = (blockRepository: BlockRepository, blockchain: BlockchainService): BlockService => {
  return new BlockService(blockRepository, blockchain);
}; 