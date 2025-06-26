import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { IBlockMapper } from '../../../mappers';
import { BlockData } from '../../types/blockchain';
import {
  IBlockProcessor,
  BlockProcessingOptions,
  BlockProcessingResult,
  BlockValidationResult,
} from './BlockInterfaces';

/**
 * BlockProcessor - Processing and Indexing Logic for Block Data
 * 
 * Responsibilities:
 * - Create blocks from blockchain data
 * - Index blocks with proper validation
 * - Handle block processing for queue processors
 * - Ensure block data integrity
 */
export class BlockProcessor implements IBlockProcessor {
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
   * Create a block from blockchain data (needed by queue processors)
   */
  async createBlock(blockData: BlockData, options: BlockProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Creating block from blockchain data', {
        component: 'block-processor',
        action: 'createBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
      });

      // Validate block data first
      if (!options.skipValidation) {
        const validation = await this.validateBlockData(blockData);
        if (!validation.isValid) {
          throw new Error(`Block validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Check if block already exists
      const existingBlock = await this.blockRepository.findByNumber(blockData.number);
      if (existingBlock) {
        if (!options.updateIfExists) {
          logger.warn('Block already exists, skipping creation', {
            component: 'block-processor',
            action: 'createBlock',
            blockNumber: blockData.number,
            blockHash: blockData.hash,
          });
          return;
        }
        logger.info('Block exists, updating', {
          component: 'block-processor',
          action: 'createBlock',
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }

      // Create block entity matching Prisma schema
      const blockEntity = {
        number: blockData.number,
        hash: blockData.hash,
        parentHash: blockData.parentHash || null,
        stateRoot: blockData.stateRoot || null,
        extrinsicsRoot: blockData.extrinsicsRoot || null,
        timestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
        validatorAddress: blockData.validator || null,
        validatorName: null, // Will be populated later when validator data is available
        specVersion: null, // Will be populated from chain info
        totalFees: null, // Will be calculated from extrinsics
        transferCount: null, // Will be calculated when transfers are processed
        dataSubmissionsSize: null, // Will be calculated when data submissions are processed
      };

      if (existingBlock && options.updateIfExists) {
        await this.blockRepository.update(blockData.number, blockEntity);
      } else {
        await this.blockRepository.create(blockEntity);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Block created successfully', {
        component: 'block-processor',
        action: 'createBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'block-processor',
        action: 'createBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
      });
      throw error;
    }
  }

  /**
   * Index a block with full processing (needed by queue processors)
   */
  async indexBlock(blockData: BlockData, options: BlockProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Indexing block with full processing', {
        component: 'block-processor',
        action: 'indexBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
      });

      // First, create the block if it doesn't exist
      await this.createBlock(blockData, options);

      // Additional indexing logic can be added here
      // For now, indexBlock is equivalent to createBlock
      // In future iterations, this could include:
      // - Processing extrinsics
      // - Processing events
      // - Updating dependent entities
      // - Cache warming

      const duration = Date.now() - startTime;
      
      logger.info('Block indexed successfully', {
        component: 'block-processor',
        action: 'indexBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        processed: true,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'block-processor',
        action: 'indexBlock',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
      });
      throw error;
    }
  }

  /**
   * Process a block (alias for indexBlock to match interface)
   */
  async processBlock(blockData: BlockData, options: BlockProcessingOptions = {}): Promise<void> {
    return this.indexBlock(blockData, options);
  }

  /**
   * Process multiple blocks in batch
   */
  async processBlocks(blocks: BlockData[], options: BlockProcessingOptions = {}): Promise<BlockProcessingResult[]> {
    const results: BlockProcessingResult[] = [];
    
    logger.info('Processing multiple blocks', {
      component: 'block-processor',
      action: 'processBlocks',
      blockCount: blocks.length,
      startBlock: blocks[0]?.number,
      endBlock: blocks[blocks.length - 1]?.number,
    });

    for (const blockData of blocks) {
      const startTime = Date.now();
      
      try {
        await this.processBlock(blockData, options);
        
        const result: BlockProcessingResult = {
          success: true,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          created: true,
          indexed: true,
          duration: Date.now() - startTime,
          metadata: {
            extrinsicsCount: blockData.extrinsics?.length || 0,
            eventsCount: blockData.events?.length || 0,
            timestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
          },
        };
        
        results.push(result);
        
      } catch (error) {
        const result: BlockProcessingResult = {
          success: false,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          created: false,
          indexed: false,
          duration: Date.now() - startTime,
        };
        
        results.push(result);
        
        logError(error as Error, {
          component: 'block-processor',
          action: 'processBlocks',
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
        
        // Continue processing other blocks
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    logger.info('Batch block processing completed', {
      component: 'block-processor',
      action: 'processBlocks',
      totalBlocks: blocks.length,
      successCount,
      failureCount,
      successRate: (successCount / blocks.length) * 100,
    });

    return results;
  }

  /**
   * Validate block data structure
   */
  private async validateBlockData(blockData: BlockData): Promise<BlockValidationResult> {
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

      // Validate hash format (should be hex string)
      if (blockData.hash && !/^0x[a-fA-F0-9]+$/.test(blockData.hash)) {
        errors.push('Block hash must be a valid hex string');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'block-processor',
        action: 'validateBlockData',
      });
      
      return {
        isValid: false,
        errors: [`Validation error: ${(error as Error).message}`],
        warnings,
      };
    }
  }
}

export const createBlockProcessor = (
  blockRepository: BlockRepository,
  blockchain: AvailBlockchainService,
  blockMapper: IBlockMapper,
): BlockProcessor => {
  return new BlockProcessor(blockRepository, blockchain, blockMapper);
}; 