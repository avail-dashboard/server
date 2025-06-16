#!/usr/bin/env tsx

/**
 * Standalone Blockchain Data Sync Script
 * 
 * This script syncs blockchain data directly using our services without the queue system.
 * Perfect for initial sync, development, and controlled operations.
 * 
 * Usage:
 *   npm run sync:full                    # Full sync from genesis
 *   npm run sync:incremental             # Continue from last synced block
 *   npm run sync:range -- --from=1000 --to=2000  # Sync specific range
 *   npm run sync:live                    # Live sync (continuous)
 */

import { logger } from '../src/utils/logger';
import db from '../src/utils/database';
import { ConnectionManager } from '../src/services/core/connection-manager';
import { AvailBlockchainService } from '../src/services/core/avail-blockchain';
import { createBlockIndexerService } from '../src/services/domain/indexer';
import { createDataProcessorService } from '../src/services/domain/processor';
import { createSyncService } from '../src/services/core/sync';
import { QueueService } from '../src/services/core/queue';
import { HybridProcessor } from '../src/services/domain/hybrid-processor';
import { AvailDataSubmissionIndexer } from '../src/services/domain/availDataSubmissionIndexer';

interface SyncOptions {
  mode: 'full' | 'incremental' | 'range' | 'live';
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  delayMs?: number;
}

class StandaloneSyncScript {
  private connectionManager: ConnectionManager;
  private blockchain: AvailBlockchainService;
  private indexer: ReturnType<typeof createBlockIndexerService>;
  private processor: ReturnType<typeof createDataProcessorService>;
  private queueService: QueueService;
  private syncService: ReturnType<typeof createSyncService>;
  private hybridProcessor: HybridProcessor;
  private availIndexer: AvailDataSubmissionIndexer;
  private shouldStop = false;
  private currentBlock = 0;

  constructor() {
    // Initialize services
    this.connectionManager = new ConnectionManager();
    this.blockchain = new AvailBlockchainService();
    this.indexer = createBlockIndexerService(db, this.blockchain);
    this.processor = createDataProcessorService(db, this.blockchain);
    
    // Create a minimal queue service for sync service dependency
    this.queueService = new QueueService();
    this.syncService = createSyncService(db, this.blockchain, this.queueService);
    
    // Initialize dual SDK services
    this.hybridProcessor = new HybridProcessor();
    this.availIndexer = new AvailDataSubmissionIndexer();
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing sync script services...');

      // Initialize database connection
      await db.connect();
      logger.info('✅ Database connected');

      // Initialize blockchain services
      await this.blockchain.start();
      logger.info('✅ Blockchain service started');

      // Initialize queue service first (required by sync service)
      await this.queueService.start();
      logger.info('✅ Queue service started');

      // Initialize domain services
      await this.indexer.start();
      await this.processor.start();
      await this.syncService.start();
      
      // Initialize dual SDK services
      await this.hybridProcessor.initialize();
      await this.availIndexer.initialize();
      logger.info('✅ All services initialized (including dual SDK support)');

    } catch (error) {
      logger.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown services
   */
  async cleanup(): Promise<void> {
    try {
      logger.info('🧹 Shutting down services...');

      // Stop services in dependency order (dependent services first)
      if (this.syncService) {
        await this.syncService.stop();
      }
      
      if (this.processor) {
        await this.processor.stop();
      }
      
      if (this.indexer) {
        await this.indexer.stop();
      }
      
      // Cleanup dual SDK services before main blockchain service
      if (this.hybridProcessor) {
        await this.hybridProcessor.disconnect();
      }
      
      if (this.availIndexer) {
        await this.availIndexer.disconnect();
      }
      
      if (this.queueService) {
        await this.queueService.stop();
      }
      
      // Stop blockchain service last (other services depend on it)
      if (this.blockchain) {
        await this.blockchain.stop();
      }
      
      await db.disconnect();

      logger.info('✅ All services shut down successfully');
    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Parse command line arguments
   */
  parseArguments(): SyncOptions {
    const args = process.argv.slice(2);
    const options: SyncOptions = {
      mode: 'incremental',
      batchSize: 50,
      delayMs: 100,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--mode' && args[i + 1]) {
        options.mode = args[i + 1] as SyncOptions['mode'];
        i++;
      } else if (arg === '--from' && args[i + 1]) {
        options.fromBlock = parseInt(args[i + 1]);
        i++;
      } else if (arg === '--to' && args[i + 1]) {
        options.toBlock = parseInt(args[i + 1]);
        i++;
      } else if (arg === '--batch-size' && args[i + 1]) {
        options.batchSize = parseInt(args[i + 1]);
        i++;
      } else if (arg === '--delay' && args[i + 1]) {
        options.delayMs = parseInt(args[i + 1]);
        i++;
      }
    }

    return options;
  }

  /**
   * Determine sync range based on options and current state
   */
  async determineSyncRange(options: SyncOptions): Promise<{ from: number; to: number }> {
    const latestBlock = await this.blockchain.getLatestBlock();
    const syncState = await this.syncService.getCurrentSyncState();
    
    let from: number;
    let to: number;

    switch (options.mode) {
    case 'full':
      from = options.fromBlock ?? 0;
      to = options.toBlock ?? latestBlock.number;
      break;
        
    case 'incremental':
      from = Number(syncState.last_synced_block) + 1;
      to = options.toBlock ?? latestBlock.number;
      break;
        
    case 'range':
      if (options.fromBlock === undefined || options.toBlock === undefined) {
        throw new Error('Range mode requires --from and --to parameters');
      }
      from = options.fromBlock;
      to = options.toBlock;
      break;
        
    case 'live':
      from = Number(syncState.last_synced_block) + 1;
      to = latestBlock.number;
      break;
        
    default:
      throw new Error(`Unknown sync mode: ${options.mode}`);
    }

    // Validation
    if (from < 0) {
      throw new Error('From block cannot be negative');
    }
    if (to < from) {
      throw new Error('To block must be greater than or equal to from block');
    }
    if (to > latestBlock.number) {
      logger.warn(`To block ${to} is greater than latest block ${latestBlock.number}, adjusting...`);
      to = latestBlock.number;
    }

    return { from, to };
  }

  /**
   * Sync a range of blocks
   */
  async syncBlockRange(from: number, to: number, batchSize: number, delayMs: number): Promise<void> {
    const totalBlocks = to - from + 1;
    let processedBlocks = 0;
    let errors = 0;
    const startTime = Date.now();

    logger.info(`📦 Starting sync: blocks ${from} to ${to} (${totalBlocks} total)`);

    for (let blockNum = from; blockNum <= to && !this.shouldStop; blockNum += batchSize) {
      const batchEnd = Math.min(blockNum + batchSize - 1, to);
      const batchSize_ = batchEnd - blockNum + 1;
      
      try {
        logger.debug(`🔄 Processing batch: ${blockNum} to ${batchEnd} (${batchSize_} blocks)`);
        
        // Process batch of blocks
        await this.processBatch(blockNum, batchEnd);
        
        processedBlocks += batchSize_;
        this.currentBlock = batchEnd;
        
        // Progress reporting
        const progress = (processedBlocks / totalBlocks) * 100;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processedBlocks / elapsed;
        const eta = totalBlocks > processedBlocks ? (totalBlocks - processedBlocks) / rate : 0;
        
        logger.info(`📊 Progress: ${progress.toFixed(1)}% (${processedBlocks}/${totalBlocks}) | Rate: ${rate.toFixed(1)} blocks/sec | ETA: ${eta.toFixed(0)}s | Errors: ${errors}`);
        
        // Delay between batches to avoid overwhelming RPC
        if (delayMs > 0 && blockNum + batchSize <= to) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (error) {
        errors++;
        logger.error(`❌ Error processing batch ${blockNum}-${batchEnd}:`, error);
        
        // If too many errors, abort
        if (errors > 10) {
          throw new Error(`Too many errors (${errors}), aborting sync`);
        }
        
        // Continue with next batch after error
        processedBlocks += batchSize_;
        this.currentBlock = batchEnd;
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processedBlocks / elapsed;
    
    if (this.shouldStop) {
      logger.warn(`⏹️ Sync stopped by user at block ${this.currentBlock}`);
    } else {
      logger.info(`✅ Sync completed! Processed ${processedBlocks} blocks in ${elapsed.toFixed(1)}s (${rate.toFixed(1)} blocks/sec)`);
    }
  }

  /**
   * Process a batch of blocks with hybrid SDK fallback
   */
  async processBatch(fromBlock: number, toBlock: number): Promise<void> {
    try {
      // Try regular polkadot.js indexing first
      let blocks;
      try {
        blocks = await this.indexer.indexBlockRange(fromBlock, toBlock);
        
        // Check if we got the expected number of blocks
        const expectedBlockCount = toBlock - fromBlock + 1;
        if (blocks.length < expectedBlockCount) {
          logger.warn(`⚠️ Polkadot.js indexing incomplete: got ${blocks.length}/${expectedBlockCount} blocks for range ${fromBlock}-${toBlock}, trying hybrid approach`);
          
          // Fallback to hybrid processing for individual blocks
          blocks = await this.processBlocksWithHybridFallback(fromBlock, toBlock);
        } else {
          logger.debug(`✅ Regular indexing successful for range ${fromBlock}-${toBlock}`);
        }
      } catch (polkadotError) {
        const errorMessage = (polkadotError as Error).message;
        
        // Check if this is a metadata error - if so, go straight to hybrid
        if (this.isMetadataError(errorMessage)) {
          logger.warn(`⚠️ Metadata decoding errors detected for range ${fromBlock}-${toBlock}, using hybrid approach`, {
            error: errorMessage,
          });
        } else {
          logger.warn(`⚠️ Polkadot.js indexing failed for range ${fromBlock}-${toBlock}, trying hybrid approach`, {
            error: errorMessage,
          });
        }
        
        // Fallback to hybrid processing for individual blocks
        blocks = await this.processBlocksWithHybridFallback(fromBlock, toBlock);
      }
      
      if (blocks.length === 0) {
        logger.warn(`⚠️ No blocks returned for range ${fromBlock}-${toBlock}`);
        return;
      }
      
      // Process each block
      for (const blockData of blocks) {
        try {
          await this.processor.processBlock(blockData);
          logger.debug(`✅ Processed block ${blockData.number}`);
        } catch (error) {
          logger.error(`❌ Failed to process block ${blockData.number}:`, error);
          throw error;
        }
      }
      
    } catch (error) {
      logger.error(`❌ Failed to process batch ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  /**
   * Process blocks individually using hybrid approach when batch indexing fails
   */
  private async processBlocksWithHybridFallback(fromBlock: number, toBlock: number): Promise<any[]> {
    const blocks: any[] = [];
    
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        logger.debug(`🔄 Hybrid processing block ${blockNum}...`);
        
        // Use hybrid processor for problematic blocks
        const hybridResult = await this.hybridProcessor.extractBlockData(blockNum);
        
        // Use the block data from hybrid result (already contains extrinsics and events)
        const blockData = hybridResult.blockData;
        
        blocks.push(blockData);
        
        // Also process data submissions if found
        if (hybridResult.dataSubmissions && hybridResult.dataSubmissions.length > 0) {
          logger.info(`📊 Found ${hybridResult.dataSubmissions.length} data submissions in block ${blockNum} via hybrid processing`);
          
          try {
            await this.availIndexer.indexBlock(blockNum);
            logger.debug(`✅ Data submissions indexed for block ${blockNum}`);
          } catch (indexError) {
            logger.warn(`⚠️ Failed to index data submissions for block ${blockNum}`, {
              error: (indexError as Error).message,
            });
          }
        }
        
        logger.debug(`✅ Hybrid processing successful for block ${blockNum}`);
        
      } catch (error) {
        logger.error(`❌ Hybrid processing failed for block ${blockNum}:`, error);
        
        // Try to get at least basic block data via avail-sdk directly
        try {
          const blockData = await this.availIndexer['availService'].getBlock(blockNum);
          blocks.push(blockData);
          logger.warn(`⚠️ Using basic block data for ${blockNum} after hybrid failure`);
        } catch (basicError) {
          logger.error(`❌ Failed to get basic block data for ${blockNum}:`, basicError);
          // Skip this block rather than create invalid placeholder
          logger.error(`❌ Skipping block ${blockNum} - could not retrieve any data`);
        }
      }
    }
    
    logger.info(`✅ Hybrid processing completed for range ${fromBlock}-${toBlock}: ${blocks.length} blocks processed`);
    return blocks;
  }

  /**
   * Live sync mode - continuously sync new blocks
   */
  async liveSyncMode(options: SyncOptions): Promise<void> {
    logger.info('🔴 Starting live sync mode...');
    
    while (!this.shouldStop) {
      try {
        // Get current range to sync
        const { from, to } = await this.determineSyncRange(options);
        
        if (from <= to) {
          logger.info(`🔄 Live sync: processing blocks ${from} to ${to}`);
          await this.syncBlockRange(from, to, options.batchSize || 10, options.delayMs || 1000);
        } else {
          logger.debug('📡 Live sync: no new blocks, waiting...');
        }
        
        // Wait before checking for new blocks
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error('❌ Error in live sync:', error);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
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
      'METADATA_ERROR:',
    ];
    
    return metadataErrorPatterns.some(pattern => 
      errorMessage.includes(pattern)
    );
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`🛑 Received ${signal}, gracefully shutting down...`);
        this.shouldStop = true;
        // Don't call process.exit(0) immediately - let operations complete gracefully
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error);
      this.shouldStop = true;
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
      this.shouldStop = true;
    });
  }

  /**
   * Main execution function
   */
  async run(): Promise<void> {
    try {
      // Parse command line arguments
      const options = this.parseArguments();
      logger.info('🎯 Sync options:', options);

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Initialize services
      await this.initialize();

      // Execute sync based on mode
      if (options.mode === 'live') {
        await this.liveSyncMode(options);
      } else {
        const { from, to } = await this.determineSyncRange(options);
        await this.syncBlockRange(from, to, options.batchSize || 50, options.delayMs || 100);
      }

    } catch (error) {
      logger.error('💥 Fatal error in sync script:', error);
      throw error;
    } finally {
      await this.cleanup();
      
      // Small delay to ensure cleanup completes before script exit
      if (this.shouldStop) {
        logger.info('🔄 Waiting for graceful shutdown...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const script = new StandaloneSyncScript();
  await script.run();
}

// Handle script execution
if (require.main === module) {
  main().catch((error) => {
    logger.error('💥 Script execution failed:', error);
    process.exit(1);
  });
} 