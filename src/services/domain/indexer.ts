import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { BlockchainService } from '../core/blockchain';
import { 
  BaseService,
  ServiceHealth, 
} from '../types/service';
import { 
  BlockData,
  ExtrinsicData, 
} from '../types/blockchain';
import { withRetry, retryConfigs } from '../../utils/retry';

export interface IBlockIndexerService {
  indexBlock(blockNumber: number): Promise<BlockData>;
  indexBlockRange(startBlock: number, endBlock: number): Promise<BlockData[]>;
  validateBlock(blockData: BlockData): Promise<boolean>;
  handleReorganization(fromBlock: number): Promise<void>;
}

/**
 * BlockIndexerService - Responsible for fetching and indexing blocks from RPC
 * 
 * Responsibilities:
 * - Fetch individual blocks from blockchain RPC
 * - Batch fetch block ranges efficiently
 * - Validate block data integrity
 * - Handle blockchain reorganizations
 * - Manage connection retries and error handling
 * - Extract and normalize blockchain data
 */
export class BlockIndexerService implements BaseService, IBlockIndexerService {
  private db: typeof db;
  private blockchain: BlockchainService;
  private isRunning = false;
  private readonly MAX_RETRIES = 5;
  private readonly BATCH_SIZE = 20; // blocks to fetch in parallel

  constructor(database: typeof db, blockchain: BlockchainService) {
    this.db = database;
    this.blockchain = blockchain;
  }

  /**
   * Start the indexer service
   */
  async start(): Promise<void> {
    try {
      logger.info('BlockIndexerService: Starting service', { component: 'indexer' });
      
      // Verify blockchain connection
      if (!this.blockchain.isHealthy()) {
        throw new Error('Blockchain service is not healthy');
      }
      
      this.isRunning = true;
      logger.info('BlockIndexerService: Service started successfully', { component: 'indexer' });
      
    } catch (error) {
      logError(error as Error, { component: 'indexer', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the indexer service
   */
  async stop(): Promise<void> {
    try {
      logger.info('BlockIndexerService: Stopping service', { component: 'indexer' });
      
      this.isRunning = false;
      logger.info('BlockIndexerService: Service stopped', { component: 'indexer' });
      
    } catch (error) {
      logError(error as Error, { component: 'indexer', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Test indexing capability with latest block
      const latestBlock = await this.blockchain.getLatestBlock();
      const canIndex = !!latestBlock && latestBlock.number > 0;
      
      return {
        healthy: this.isRunning && canIndex,
        lastCheck: now,
        error: !canIndex ? 'Unable to fetch latest block' : undefined,
        details: {
          isRunning: this.isRunning,
          latestBlockNumber: latestBlock?.number,
          blockchainHealthy: this.blockchain.isHealthy(),
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          isRunning: this.isRunning,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isRunning && this.blockchain.isHealthy();
  }

  /**
   * Index a single block by number
   */
  async indexBlock(blockNumber: number): Promise<BlockData> {
    try {
      logger.debug('BlockIndexerService: Indexing block', { 
        component: 'indexer', 
        blockNumber, 
      });
      
      // Check if block already exists in database
      const existingBlock = await this.db.findOne('blocks', { number: blockNumber });
      if (existingBlock) {
        logger.debug('BlockIndexerService: Block already indexed', { 
          component: 'indexer', 
          blockNumber, 
        });
        // Convert database record to BlockData format
        return this.convertDbBlockToBlockData(existingBlock);
      }
      
      // Fetch block from blockchain with retry logic
      const blockData = await this.fetchBlockWithRetry(blockNumber);
      
      // Validate block data
      const isValid = await this.validateBlock(blockData);
      if (!isValid) {
        throw new Error(`Invalid block data for block ${blockNumber}`);
      }
      
      logger.debug('BlockIndexerService: Block indexed successfully', { 
        component: 'indexer', 
        blockNumber,
        hash: blockData.hash,
        extrinsicsCount: blockData.extrinsics.length,
      });
      
      return blockData;
      
    } catch (error) {
      logError(error as Error, { 
        component: 'indexer', 
        action: 'indexBlock',
        blockNumber, 
      });
      throw error;
    }
  }

  /**
   * Index a range of blocks efficiently
   */
  async indexBlockRange(startBlock: number, endBlock: number): Promise<BlockData[]> {
    try {
      logger.info('BlockIndexerService: Indexing block range', { 
        component: 'indexer', 
        startBlock, 
        endBlock,
        totalBlocks: endBlock - startBlock + 1,
      });
      
      const blockNumbers = Array.from(
        { length: endBlock - startBlock + 1 }, 
        (_, i) => startBlock + i,
      );
      
      const indexedBlocks: BlockData[] = [];
      
      // Process blocks in batches for efficiency
      for (let i = 0; i < blockNumbers.length; i += this.BATCH_SIZE) {
        const batch = blockNumbers.slice(i, i + this.BATCH_SIZE);
        
        logger.debug('BlockIndexerService: Processing batch', {
          component: 'indexer',
          batchStart: batch[0],
          batchEnd: batch[batch.length - 1],
          batchSize: batch.length,
        });
        
        // Index blocks in parallel within the batch
        const batchPromises = batch.map(blockNumber => 
          this.indexBlock(blockNumber).catch(error => {
            logError(error as Error, { 
              component: 'indexer', 
              action: 'indexBlockRange',
              blockNumber, 
            });
            return null; // Continue with other blocks
          }),
        );
        
        const batchResults = await Promise.all(batchPromises);
        
        // Filter out failed blocks and add successful ones
        const successfulBlocks = batchResults.filter(block => block !== null) as BlockData[];
        indexedBlocks.push(...successfulBlocks);
        
        // Log batch progress
        logger.debug('BlockIndexerService: Batch completed', {
          component: 'indexer',
          successful: successfulBlocks.length,
          failed: batch.length - successfulBlocks.length,
        });
      }
      
      logger.info('BlockIndexerService: Block range indexing completed', { 
        component: 'indexer',
        startBlock,
        endBlock,
        successfulBlocks: indexedBlocks.length,
        requestedBlocks: blockNumbers.length,
      });
      
      return indexedBlocks;
      
    } catch (error) {
      logError(error as Error, { 
        component: 'indexer', 
        action: 'indexBlockRange',
        startBlock,
        endBlock, 
      });
      throw error;
    }
  }

  /**
   * Validate block data integrity
   */
  async validateBlock(blockData: BlockData): Promise<boolean> {
    try {
      // Basic validation checks
      if (!blockData) {
        logger.warn('BlockIndexerService: Block data is null/undefined', { component: 'indexer' });
        return false;
      }
      
      if (!blockData.hash || blockData.hash.length !== 66) {
        logger.warn('BlockIndexerService: Invalid block hash', { 
          component: 'indexer', 
          hash: blockData.hash, 
        });
        return false;
      }
      
      if (blockData.number < 0) {
        logger.warn('BlockIndexerService: Invalid block number', { 
          component: 'indexer', 
          number: blockData.number, 
        });
        return false;
      }
      
      if (!blockData.parentHash || blockData.parentHash.length !== 66) {
        logger.warn('BlockIndexerService: Invalid parent hash', { 
          component: 'indexer', 
          parentHash: blockData.parentHash, 
        });
        return false;
      }
      
      if (!Array.isArray(blockData.extrinsics)) {
        logger.warn('BlockIndexerService: Extrinsics is not an array', { component: 'indexer' });
        return false;
      }
      
      if (!Array.isArray(blockData.events)) {
        logger.warn('BlockIndexerService: Events is not an array', { component: 'indexer' });
        return false;
      }
      
      // Validate timestamp
      if (!blockData.timestamp || blockData.timestamp <= 0) {
        logger.warn('BlockIndexerService: Invalid timestamp', { 
          component: 'indexer', 
          timestamp: blockData.timestamp, 
        });
        return false;
      }
      
      // Validate extrinsics structure
      for (const extrinsic of blockData.extrinsics) {
        if (!this.validateExtrinsic(extrinsic)) {
          logger.warn('BlockIndexerService: Invalid extrinsic found', { 
            component: 'indexer',
            blockNumber: blockData.number,
            extrinsicIndex: extrinsic.index,
          });
          return false;
        }
      }
      
      logger.debug('BlockIndexerService: Block validation passed', { 
        component: 'indexer',
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      
      return true;
      
    } catch (error) {
      logError(error as Error, { 
        component: 'indexer', 
        action: 'validateBlock',
        blockNumber: blockData?.number, 
      });
      return false;
    }
  }

  /**
   * Handle blockchain reorganization
   */
  async handleReorganization(fromBlock: number): Promise<void> {
    try {
      logger.warn('BlockIndexerService: Handling reorganization', { 
        component: 'indexer', 
        fromBlock, 
      });
      
      // Remove blocks from database that may be invalid due to reorg
      await this.db.query(
        'DELETE FROM blocks WHERE number >= $1',
        [fromBlock],
      );
      
      // Also remove related data (extrinsics, events, etc.)
      await this.db.query(
        'DELETE FROM extrinsics WHERE block_number >= $1',
        [fromBlock],
      );
      
      logger.info('BlockIndexerService: Reorganization handled', { 
        component: 'indexer',
        fromBlock,
        message: 'Removed blocks and related data from database',
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'indexer', 
        action: 'handleReorganization',
        fromBlock, 
      });
      throw error;
    }
  }

  /**
   * Fetch block from blockchain with retry logic
   */
  private async fetchBlockWithRetry(blockNumber: number): Promise<BlockData> {
    return withRetry(async () => {
      try {
        const blockData = await this.blockchain.getBlock(blockNumber);
        
        if (!blockData) {
          throw new Error(`No block data returned for block ${blockNumber}`);
        }
        
        return blockData;
      } catch (error) {
        const errorMessage = (error as Error).message;
        
        // Check if this is a metadata/decoding error that won't be fixed by retrying
        if (this.isMetadataError(errorMessage)) {
          logger.warn('BlockIndexerService: Metadata decoding error detected, skipping retries', {
            component: 'indexer',
            blockNumber,
            error: errorMessage,
          });
          // Create a special error type to indicate this should not be retried
          const metadataError = new Error(`METADATA_ERROR: ${errorMessage}`);
          metadataError.name = 'MetadataError';
          throw metadataError;
        }
        
        logger.warn('BlockIndexerService: Failed to fetch block, retrying...', {
          component: 'indexer',
          blockNumber,
          error: errorMessage,
        });
        throw error;
      }
    }, retryConfigs.blockchain, `fetch-block-${blockNumber}`);
  }

  /**
   * Check if error is a metadata/decoding error that won't be fixed by retrying
   */
  private isMetadataError(errorMessage: string): boolean {
    const metadataErrorPatterns = [
      'findMetaCall: Unable to find Call with index',
      'createType(Call):: findMetaCall',
      'createType(ExtrinsicV4):: createType(Call)',
      'Unable to decode on index',
      'Struct: failed on extrinsics',
      'PORTABLEREGISTRY: Unable to determine runtime Call type',
    ];
    
    return metadataErrorPatterns.some(pattern => 
      errorMessage.includes(pattern)
    );
  }

  /**
   * Validate individual extrinsic structure
   */
  private validateExtrinsic(extrinsic: ExtrinsicData): boolean {
    try {
      if (!extrinsic) {return false;}
      if (typeof extrinsic.index !== 'number' || extrinsic.index < 0) {return false;}
      if (!extrinsic.hash || extrinsic.hash.length !== 66) {return false;}
      if (typeof extrinsic.isSigned !== 'boolean') {return false;}
      if (!extrinsic.method || !extrinsic.method.section || !extrinsic.method.method) {return false;}
      if (typeof extrinsic.success !== 'boolean') {return false;}
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert database block record to BlockData format
   */
  private convertDbBlockToBlockData(dbBlock: any): BlockData {
    return {
      hash: dbBlock.hash,
      number: Number(dbBlock.number),
      parentHash: dbBlock.parent_hash || '',
      stateRoot: dbBlock.state_root || '',
      extrinsicsRoot: '', // Not stored in basic schema
      timestamp: Number(dbBlock.timestamp),
      validator: undefined, // Not stored in basic schema
      extrinsics: [], // Will be fetched separately if needed
      events: [], // Will be fetched separately if needed
    };
  }

  /**
   * Get indexing statistics
   */
  async getIndexingStats(): Promise<{
    totalBlocksIndexed: number;
    latestIndexedBlock: number;
    indexingRate: number; // blocks per minute
  }> {
    try {
      const totalResult = await this.db.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM blocks',
      );
      
      const latestResult = await this.db.query<{ number: number }>(
        'SELECT MAX(number) as number FROM blocks',
      );
      
      // Calculate indexing rate from last hour
      const rateResult = await this.db.query<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM blocks 
         WHERE created_at >= NOW() - INTERVAL '1 hour'`,
      );
      
      return {
        totalBlocksIndexed: totalResult.rows[0]?.count || 0,
        latestIndexedBlock: latestResult.rows[0]?.number || 0,
        indexingRate: rateResult.rows[0]?.count || 0, // blocks per hour, roughly
      };
    } catch (error) {
      logError(error as Error, { component: 'indexer', action: 'getIndexingStats' });
      return {
        totalBlocksIndexed: 0,
        latestIndexedBlock: 0,
        indexingRate: 0,
      };
    }
  }
}

/**
 * Factory function to create a BlockIndexerService instance
 */
export const createBlockIndexerService = (
  database: typeof db, 
  blockchain: BlockchainService,
): BlockIndexerService => {
  return new BlockIndexerService(database, blockchain);
};

// Export for service factory registration
export let blockIndexerService: BlockIndexerService; 