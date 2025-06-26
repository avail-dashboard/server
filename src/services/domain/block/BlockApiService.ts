import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { Block } from '../../../database';
import { IBlockMapper } from '../../../mappers';
import {
  IBlockService,
  BlockValidationResult,
} from './BlockInterfaces';
import { 
  BlockWithMetadataApiResponse,
  BlockApiResponse,
  PaginatedResponse,
  PaginationParams,
  SortParams,
} from '../../../types/database';

/**
 * BlockApiService - Read Operations for Block Data
 * 
 * Responsibilities:
 * - Fetch block details by hash, number, or latest
 * - Get paginated lists of blocks with filtering
 * - Provide block validation utilities
 * - Support queue processor read operations
 */
export class BlockApiService implements IBlockService {
  private blockRepository: BlockRepository;
  private blockchain: AvailBlockchainService;
  private blockMapper: IBlockMapper;

  constructor(
    blockRepository: BlockRepository, 
    blockchain: AvailBlockchainService, 
    blockMapper: IBlockMapper,
  ) {
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
          component: 'block-api-service',
          identifier: hashOrNumber,
          source: 'database',
        });
        return existingBlock;
      }

      // Block not found - return null or throw appropriate error
      logger.info('Block not found in database', {
        component: 'block-api-service',
        identifier: hashOrNumber,
        source: 'database',
      });

      throw new Error(`Block ${hashOrNumber} not found in database`);

    } catch (error) {
      logError(error as Error, {
        component: 'block-api-service',
        action: 'getBlock',
        identifier: hashOrNumber,
      });
      throw error;
    }
  }

  /**
   * Get block by number specifically (needed by queue processors)
   */
  async getBlockByNumber(blockNumber: number): Promise<BlockWithMetadataApiResponse | null> {
    try {
      const block = await this.blockRepository.findByNumber(blockNumber);
      
      if (!block) {
        logger.debug('Block not found by number', {
          component: 'block-api-service',
          blockNumber,
          source: 'database',
        });
        return null;
      }

      logger.debug('Block found by number', {
        component: 'block-api-service',
        blockNumber,
        blockHash: block.hash,
        source: 'database',
      });

      return this.blockMapper.toWithMetadataApiResponse(block);

    } catch (error) {
      logError(error as Error, {
        component: 'block-api-service',
        action: 'getBlockByNumber',
        blockNumber,
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
        component: 'block-api-service',
        blockNumber: latestBlock.number,
        source: 'database',
      });

      // Convert to BlockWithMetadata format using mapper
      return this.blockMapper.toWithMetadataApiResponse(latestBlock);

    } catch (error) {
      logError(error as Error, {
        component: 'block-api-service',
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
        component: 'block-api-service',
        action: 'getBlocks',
      });
      throw error;
    }
  }

  /**
   * Validate block data structure
   */
  async validateBlock(blockData: any): Promise<BlockValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic validation
      if (!blockData) {
        errors.push('Block data is null or undefined');
        return { isValid: false, errors, warnings };
      }

      if (!blockData.number && blockData.number !== 0) {
        errors.push('Block number is required');
      }

      if (!blockData.hash) {
        errors.push('Block hash is required');
      }

      if (!blockData.timestamp) {
        warnings.push('Block timestamp is missing');
      }

      // Check for reasonable block number
      if (typeof blockData.number === 'number' && blockData.number < 0) {
        errors.push('Block number cannot be negative');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'block-api-service',
        action: 'validateBlock',
      });
      
      return {
        isValid: false,
        errors: [`Validation error: ${(error as Error).message}`],
        warnings,
      };
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
        component: 'block-api-service',
        action: 'getBlockFromDatabase',
        identifier: hashOrNumber,
      });
      throw error;
    }
  }
}

export const createBlockApiService = (
  blockRepository: BlockRepository, 
  blockchain: AvailBlockchainService, 
  blockMapper: IBlockMapper,
): BlockApiService => {
  return new BlockApiService(blockRepository, blockchain, blockMapper);
}; 