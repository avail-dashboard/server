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
import { initializeCorrelationId } from '../src/utils/correlationId';
import db from '../src/utils/database';
import { AvailBlockchainService } from '../src/services/core/avail-blockchain';
import { createBlockIndexerService } from '../src/services/domain/indexer';
// Phase 7: Use ServiceFactory instead of individual processors
import { ServiceFactory } from '../src/services';
import { SelfHealingBlockProcessor } from '../src/services/domain/selfHealingProcessor';
import { SyncService } from '../src/services/core/sync';
import { QueueService } from '../src/services/core/queue';

interface SyncOptions {
  mode: 'full' | 'incremental' | 'range' | 'live';
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  delayMs?: number;
  useQueue?: boolean;
}

class StandaloneSyncScript {
  private serviceFactory: ServiceFactory;
  private blockchain: AvailBlockchainService;
  private indexer: ReturnType<typeof createBlockIndexerService>;
  private processor: SelfHealingBlockProcessor;
  private syncService: SyncService;
  private queueService: QueueService;
  private shouldStop = false;
  private currentBlock = 0;

  constructor() {
    // Initialize correlation ID namespace for background job processing
    initializeCorrelationId();
    
    // Phase 7: Initialize with ServiceFactory for integrated self-healing services
    this.serviceFactory = ServiceFactory.getInstance();
    
    // Note: Individual services will be initialized through ServiceFactory
    // This provides the complete self-healing architecture (Phases 1-6)
  }

  /**
   * Initialize all services using ServiceFactory (Phase 7)
   */
  async initialize(_options?: SyncOptions): Promise<void> {
    try {
      logger.info('🚀 Initializing sync script with SelfHealingBlockProcessor...');

      // Initialize database connection
      await db.connect();
      logger.info('✅ Database connected');

      // Initialize ServiceFactory with all self-healing services (Phases 1-6)
      await this.serviceFactory.initializeAllServices();
      logger.info('✅ ServiceFactory initialized with all self-healing services');

      // Get services from factory
      this.blockchain = this.serviceFactory.get('availBlockchain');
      this.processor = this.serviceFactory.get('selfHealingBlockProcessor');
      this.syncService = this.serviceFactory.get('syncService');
      this.queueService = this.serviceFactory.get('queue');
      
      // Create independent indexer (not part of self-healing architecture)
      this.indexer = createBlockIndexerService(db, this.blockchain);
      await this.indexer.start();
      
      logger.info('✅ All services initialized (Self-Healing Architecture)');
      logger.info(`📊 SelfHealingBlockProcessor services: ${this.processor.getRegisteredServices().join(', ')}`);

    } catch (error) {
      logger.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown services (Phase 7)
   */
  async cleanup(): Promise<void> {
    try {
      logger.info('🧹 Shutting down services...');

      // Stop independent indexer
      if (this.indexer) {
        await this.indexer.stop();
      }
      
      // Shutdown ServiceFactory (handles all self-healing services)
      if (this.serviceFactory && this.serviceFactory.isInitialized()) {
        await this.serviceFactory.shutdown();
      }
      
      await db.disconnect();

      logger.info('✅ All services shut down successfully');
    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Get last synced block from database (replaces syncService dependency)
   */
  private async getLastSyncedBlock(): Promise<number> {
    try {
      // Query the database for the highest block number
      const result = await db.query('SELECT MAX(number) as last_block FROM blocks');
      const lastBlock = result.rows[0]?.last_block;
      return lastBlock ? parseInt(lastBlock) : 0;
    } catch (error) {
      logger.warn('Failed to get last synced block from database, starting from 0:', error);
      return 0;
    }
  }

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
      } else if (arg === '--use-queue') {
        options.useQueue = true;
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
      // Get last synced block from database
      const lastSyncedBlock = await this.getLastSyncedBlock();
      from = lastSyncedBlock + 1;
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
      // Get last synced block from database for live mode
      const lastSyncedBlock = await this.getLastSyncedBlock();
      from = lastSyncedBlock + 1;
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
   * Sync using queue system instead of direct processing
   */
  async syncBlockRangeWithQueue(from: number, to: number): Promise<void> {
    try {
      logger.info(`🔄 Starting queue-based sync: blocks ${from} to ${to}`);
      
      // Start sync through SyncService (this will queue DATA_SYNC jobs)
      await this.syncService.startSync('incremental', from, to);
      
      // Monitor queue progress
      await this.monitorQueueProgress(from, to);
      
      logger.info(`✅ Queue-based sync completed: blocks ${from} to ${to}`);
      
    } catch (error) {
      logger.error('❌ Queue-based sync failed:', error);
      throw error;
    }
  }

  /**
   * Monitor queue progress until sync completes
   */
  private async monitorQueueProgress(from: number, to: number): Promise<void> {
    const startTime = Date.now();
    const totalBlocks = to - from + 1;
    
    while (!this.shouldStop) {
      try {
        // Get queue stats
        const queueStats = await this.queueService.getStats();
        
        // Calculate progress estimate based on queue completion
        const completed = queueStats.completed;
        const progress = totalBlocks > 0 ? Math.min(completed / Math.ceil(totalBlocks / 50) * 100, 100) : 100; // Assume batch size 50
        const elapsed = (Date.now() - startTime) / 1000;
        
        logger.info(`📊 Queue Sync Progress: ${progress.toFixed(1)}% | Queue: ${queueStats.waiting} waiting, ${queueStats.active} active, ${queueStats.completed} completed, ${queueStats.failed} failed | Elapsed: ${elapsed.toFixed(0)}s`);
        
        // Check if completed (no active or waiting jobs)
        if (queueStats.waiting === 0 && queueStats.active === 0) {
          logger.info('✅ Queue processing completed - no more jobs waiting or active');
          break;
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error('Error monitoring queue progress:', error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
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

      // Execute sync based on mode and queue option
      if (options.mode === 'live') {
        await this.liveSyncMode(options);
      } else {
        const { from, to } = await this.determineSyncRange(options);
        
        if (options.useQueue) {
          // Use queue-based approach
          await this.syncBlockRangeWithQueue(from, to);
        } else {
          // Use direct processing approach (existing)
          await this.syncBlockRange(from, to, options.batchSize || 50, options.delayMs || 100);
        }
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