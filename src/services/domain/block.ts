import { logger, logError } from '../../utils/logger';
import { BlockchainService } from '../core/blockchain';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { Block } from '../../database';
import { 
  BlockWithMetadataApiResponse,
  BlockApiResponse,
  PaginatedResponse,
  PaginationParams,
  SortParams,
} from '../../types/database';

import { IBlockMapper } from '../../mappers';

export interface IBlockService {
  getBlock(hashOrNumber: string | number): Promise<BlockWithMetadataApiResponse>;
  getLatestBlock(): Promise<BlockWithMetadataApiResponse>;
  getBlocks(pagination?: PaginationParams, sort?: SortParams): Promise<PaginatedResponse<BlockApiResponse>>;
}

export class BlockService implements IBlockService {
  private blockRepository: BlockRepository;
  private blockchain: BlockchainService;
  private blockMapper: IBlockMapper;

  constructor(blockRepository: BlockRepository, blockchain: BlockchainService, blockMapper: IBlockMapper) {
    this.blockRepository = blockRepository;
    this.blockchain = blockchain;
    this.blockMapper = blockMapper;
  }

  /**
   * Get block by hash or number (database-only)
   */
  async getBlock(hashOrNumber: string | number): Promise<BlockWithMetadataApiResponse> {
    try {
      // Database-only approach - no blockchain fallback
      const existingBlock = await this.getBlockFromDatabase(hashOrNumber);
      
      if (existingBlock) {
        logger.info('Block found in database', { 
          component: 'block-service',
          identifier: hashOrNumber,
          source: 'database',
        });
        return existingBlock;
      }

      // Block not found - return null or throw appropriate error
      logger.info('Block not found in database', {
        component: 'block-service',
        identifier: hashOrNumber,
        source: 'database',
      });

      throw new Error(`Block ${hashOrNumber} not found in database`);

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
   * Get the latest block (database-only)
   */
  async getLatestBlock(): Promise<BlockWithMetadataApiResponse> {
    try {
      // Database-only approach - get latest block from database
      const latestBlock = await this.blockRepository.getLatest();
      
      if (!latestBlock) {
        throw new Error('No blocks found in database');
      }

      logger.info('Latest block retrieved from database', {
        component: 'block-service',
        blockNumber: latestBlock.number,
        source: 'database',
      });

      // Convert to BlockWithMetadata format using mapper
      return this.blockMapper.toWithMetadataApiResponse(latestBlock);

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
  ): Promise<PaginatedResponse<BlockApiResponse>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_order: sortOrder = 'desc' } = sort;

      const { blocks, total } = await this.blockRepository.findMany({
        page,
        limit,
        orderBy: sortOrder.toLowerCase() as 'asc' | 'desc',
      });

      return {
        data: this.blockMapper.toApiResponseArray(blocks),
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
  private async getBlockFromDatabase(hashOrNumber: string | number): Promise<BlockWithMetadataApiResponse | null> {
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

      // Convert to BlockWithMetadata format using mapper
      // TODO: Add metadata (events, extrinsics, etc.) in future iterations
      return this.blockMapper.toWithMetadataApiResponse(block);

    } catch (error) {
      logError(error as Error, {
        component: 'block-service',
        action: 'getBlockFromDatabase',
        identifier: hashOrNumber,
      });
      throw error;
    }
  }

}

export const createBlockService = (blockRepository: BlockRepository, blockchain: BlockchainService, blockMapper: IBlockMapper): BlockService => {
  return new BlockService(blockRepository, blockchain, blockMapper);
}; 