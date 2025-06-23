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
import { AvailBlockchainService } from '../src/services/core/avail-blockchain';
import { createBlockIndexerService } from '../src/services/domain/indexer';

import { createEnhancedProcessorService, EnhancedProcessorService } from '../src/services/domain/EnhancedProcessor';
import { ValidatorRepository } from '../src/database/repositories/ValidatorRepository';
import { TransferRepository } from '../src/database/repositories/TransferRepository';
import { EraRepository } from '../src/database/repositories/EraRepository';
import { createSyncService } from '../src/services/core/sync';
import { QueueService } from '../src/services/core/queue';
import { AvailDataSubmissionIndexer } from '../src/services/domain/availDataSubmissionIndexer';

interface SyncOptions {
  mode: 'full' | 'incremental' | 'range' | 'live';
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  delayMs?: number;
  phase1Enabled?: boolean;
}

class StandaloneSyncScript {
  private blockchain: AvailBlockchainService;
  private indexer: ReturnType<typeof createBlockIndexerService>;
  private processor: EnhancedProcessorService;
  private queueService: QueueService;
  private syncService: ReturnType<typeof createSyncService>;
  private availIndexer: AvailDataSubmissionIndexer;
  private shouldStop = false;
  private currentBlock = 0;
  private phase1Enabled = true;

  constructor() {
    // Initialize services - using only Avail SDK
    this.blockchain = new AvailBlockchainService();
    this.indexer = createBlockIndexerService(db, this.blockchain);
    
    // Initialize Phase 1 repositories
    const validatorRepository = new ValidatorRepository();
    const transferRepository = new TransferRepository();
    const eraRepository = new EraRepository();
    
    // Create enhanced processor with Phase 1 support
    this.processor = createEnhancedProcessorService(
      db, 
      this.blockchain,
      validatorRepository,
      transferRepository,
      eraRepository,
    );
    
    // Create a minimal queue service for sync service dependency
    this.queueService = new QueueService();
    this.syncService = createSyncService(db, this.blockchain, this.queueService);
    
    // Initialize Avail-specific indexer
    this.availIndexer = new AvailDataSubmissionIndexer();
  }

  /**
   * Initialize all services
   */
  async initialize(options?: SyncOptions): Promise<void> {
    try {
      logger.info('🚀 Initializing sync script services (Avail SDK only)...', {
        phase1Enabled: options?.phase1Enabled ?? this.phase1Enabled,
      });

      // Configure Phase 1 based on options
      if (options?.phase1Enabled !== undefined) {
        this.phase1Enabled = options.phase1Enabled;
        this.processor.setPhase1Enabled(this.phase1Enabled);
      }

      // Initialize database connection
      await db.connect();
      logger.info('✅ Database connected');

      // Initialize blockchain services
      await this.blockchain.start();
      logger.info('✅ Avail blockchain service started');

      // Initialize queue service first (required by sync service)
      await this.queueService.start();
      logger.info('✅ Queue service started');

      // Initialize domain services
      await this.indexer.start();
      await this.processor.start();
      await this.syncService.start();
      
      // Initialize Avail-specific indexer
      await this.availIndexer.initialize();
      logger.info('✅ All services initialized (Avail SDK only)', {
        phase1Enabled: this.phase1Enabled,
      });

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
      
      // Cleanup Avail indexer
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
      phase1Enabled: process.env.PHASE1_ENABLED !== 'false', // Default to true, disable with env var
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
      } else if (arg === '--phase1-enabled') {
        options.phase1Enabled = true;
      } else if (arg === '--phase1-disabled') {
        options.phase1Enabled = false;
      }
    }

    return options;
  }

  /**
   * Determine sync range based on options and current state
   */
  async determineSyncRange(options: SyncOptions): Promise<{ from: number; to: number }> {
    const latestBlock = await this.blockchain.getLatestBlock();
    
    let from: number;
    let to: number;

    switch (options.mode) {
    case 'full':
      from = options.fromBlock ?? 0;
      to = options.toBlock ?? latestBlock.number;
      break;
        
    case 'incremental': {
      // Only use sync service for incremental mode
      const syncState = await this.syncService.getCurrentSyncState();
      from = Number(syncState.last_synced_block) + 1;
      to = options.toBlock ?? latestBlock.number;
      break;
    }
        
    case 'range':
      if (options.fromBlock === undefined || options.toBlock === undefined) {
        throw new Error('Range mode requires --from and --to parameters');
      }
      from = options.fromBlock;
      to = options.toBlock;
      break;
        
    case 'live': {
      // Only use sync service for live mode
      const liveSyncState = await this.syncService.getCurrentSyncState();
      from = Number(liveSyncState.last_synced_block) + 1;
      to = latestBlock.number;
      break;
    }
        
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
      const currentBatchSize = batchEnd - blockNum + 1;
      
      try {
        logger.debug(`🔄 Processing batch: ${blockNum} to ${batchEnd} (${currentBatchSize} blocks)`);
        
        // Process batch of blocks
        await this.processBatch(blockNum, batchEnd);
        
        processedBlocks += currentBatchSize;
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
        processedBlocks += currentBatchSize;
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
   * Process a batch of blocks
   */
  async processBatch(fromBlock: number, toBlock: number): Promise<void> {
    try {
      logger.debug(`🔄 Processing batch: ${fromBlock} to ${toBlock} (${toBlock - fromBlock + 1} blocks)`);

      // First try to index blocks normally
      const indexedBlocks = await this.indexer.indexBlockRange(fromBlock, toBlock);
      
      if (indexedBlocks.length === 0) {
        logger.warn(`⚠️ No blocks indexed for range ${fromBlock}-${toBlock}, trying direct processing`);
        
        // Try direct processing with Avail SDK
        const processedBlocks = await this.processBlocksWithAvailSDK(fromBlock, toBlock);
        
        if (processedBlocks.length > 0) {
          logger.info(`✅ Direct processing completed for range ${fromBlock}-${toBlock}: ${processedBlocks.length} blocks processed`);
          
          // Process each block through the enhanced processor
          for (const blockData of processedBlocks) {
            await this.processor.processBlock(blockData.block);
            logger.debug(`✅ Processed block ${blockData.block.number}`);
          }
        }
      } else {
        logger.info(`✅ Successfully indexed ${indexedBlocks.length} blocks from range ${fromBlock}-${toBlock}`);
        
        // Process indexed blocks through enhanced processor
        for (const block of indexedBlocks) {
          await this.processor.processBlock(block);
          logger.debug(`✅ Processed block ${block.number}`);
        }
      }

    } catch (error) {
      logger.error(`❌ Error processing batch ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  /**
   * Process blocks with direct Avail SDK approach (no hybrid fallback)
   */
  private async processBlocksWithAvailSDK(fromBlock: number, toBlock: number): Promise<any[]> {
    const processedBlocks: any[] = [];
    
    logger.info(`🔄 Processing blocks ${fromBlock}-${toBlock} with Avail SDK`);
    
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        // Get block data directly from Avail SDK
        const blockData = await this.blockchain.getBlockWithDataSubmissions(blockNum);
        
        if (blockData) {
          processedBlocks.push(blockData);
          logger.debug(`✅ Processed block ${blockNum} with Avail SDK`);
        } else {
          logger.warn(`⚠️ No block data returned for block ${blockNum}`);
        }
      } catch (error) {
        logger.error(`❌ Failed to process block ${blockNum} with Avail SDK:`, error);
        // With Avail SDK as primary, we want to see errors clearly
        throw error;
      }
    }
    
    return processedBlocks;
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
      await this.initialize(options);

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