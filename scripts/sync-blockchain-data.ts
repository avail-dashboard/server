#!/usr/bin/env tsx

/**
 * Standalone Blockchain Data Sync Script
 * 
 * Phase 1: Pure Job Scheduler - No Domain Processing
 * This script coordinates blockchain data sync through the queue system only.
 * All domain processing is handled by queue workers, maintaining clean separation.
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
import { ServiceFactory } from '../src/services';
import { SyncService } from '../src/services/core/sync';
import { QueueService } from '../src/services/core/queue';

interface SyncOptions {
  mode: 'full' | 'incremental' | 'range' | 'live';
  fromBlock?: number;
  toBlock?: number;
  batchSize?: number;
  delayMs?: number;
  waitForCompletion?: boolean;
}

class StandaloneSyncScript {
  private serviceFactory: ServiceFactory;
  private blockchain: AvailBlockchainService;
  private syncService: SyncService;
  private queueService: QueueService;
  private shouldStop = false;
  private currentBlock = 0;
  private readonly BATCH_SIZE = 50;

  constructor() {
    // Initialize correlation ID namespace for background job processing
    initializeCorrelationId();
    
    // Initialize with ServiceFactory for integrated queue-based services
    this.serviceFactory = ServiceFactory.getInstance();
  }

  /**
   * Initialize all services using ServiceFactory
   */
  async initialize(_options?: SyncOptions): Promise<void> {
    try {
      logger.info('🚀 Initializing sync script with queue-based processing...');

      // Initialize database connection
      await db.connect();
      logger.info('✅ Database connected');

      // Initialize ServiceFactory with queue-based services
      await this.serviceFactory.initializeAllServices();
      logger.info('✅ ServiceFactory initialized with queue-based services');

      // Get services from factory - only coordination services, no domain processors
      this.blockchain = this.serviceFactory.get('availBlockchain');
      this.syncService = this.serviceFactory.get('syncService');
      this.queueService = this.serviceFactory.get('queue');
      
      // Phase 3: Queue-based architecture - no independent indexer needed
      
      logger.info('✅ All coordination services initialized (Queue-Based Architecture)');
      logger.info('📊 Sync script ready for pure job scheduling');

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

      // Phase 3: No independent indexer to stop
      
      // Shutdown ServiceFactory (handles all queue-based services)
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
      waitForCompletion: true,
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
      } else if (arg === '--no-wait') {
        options.waitForCompletion = false;
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

    // Validate range
    if (from > to) {
      logger.warn(`⚠ Start block (${from}) is greater than end block (${to}), no sync needed`);
      return { from: to + 1, to }; // Return invalid range to skip processing
    }

    if (from < 0) {
      logger.warn('⚠ Start block cannot be negative, setting to 0');
      from = 0;
    }

    logger.info(`📋 Sync range determined: ${from} to ${to} (${to - from + 1} blocks)`);
    return { from, to };
  }

  /**
   * Schedule sync jobs through queue system - Pure Job Scheduler
   */
  async syncBlockRange(from: number, to: number, batchSize: number, options: SyncOptions): Promise<void> {
    const totalBlocks = to - from + 1;
    const startTime = Date.now();

    logger.info(`📦 Starting queue-based sync: blocks ${from} to ${to} (${totalBlocks} total)`);

    try {
      // Schedule data sync jobs through queue service
      await this.queueService.scheduleDataSync(from, to);

      logger.info(`✅ Scheduled sync jobs for blocks ${from} to ${to}`);

      // Monitor job completion if requested
      if (options.waitForCompletion) {
        await this.monitorBatchCompletion(from, to);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      logger.info(`✅ Queue-based sync completed! Range ${from}-${to} processed in ${elapsed.toFixed(1)}s`);

    } catch (error) {
      logger.error(`❌ Error scheduling sync jobs for range ${from}-${to}:`, error);
      throw error;
    }
  }

  /**
   * Monitor batch completion through queue system
   */
  private async monitorBatchCompletion(from: number, to: number): Promise<void> {
    const startTime = Date.now();
    const totalBlocks = to - from + 1;
    
    logger.info(`📊 Monitoring queue progress for blocks ${from} to ${to}...`);
    
    while (!this.shouldStop) {
      try {
        // Get queue stats
        const queueStats = await this.queueService.getStats();
        
        // Calculate progress estimate based on queue completion
        const completed = queueStats.completed;
        const estimatedBatches = Math.ceil(totalBlocks / this.BATCH_SIZE);
        const progress = estimatedBatches > 0 ? Math.min((completed / estimatedBatches) * 100, 100) : 100;
        const elapsed = (Date.now() - startTime) / 1000;
        
        logger.info(`📊 Queue Progress: ${progress.toFixed(1)}% | Queue: ${queueStats.waiting} waiting, ${queueStats.active} active, ${queueStats.completed} completed, ${queueStats.failed} failed | Elapsed: ${elapsed.toFixed(0)}s`);
        
        // Check if completed (no active or waiting jobs)
        if (queueStats.waiting === 0 && queueStats.active === 0 && queueStats.completed > 0) {
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
   * Live sync mode - continuously schedule new block sync jobs
   */
  async liveSyncMode(options: SyncOptions): Promise<void> {
    logger.info('🔴 Starting live sync mode...');
    
    while (!this.shouldStop) {
      try {
        // Get current range to sync
        const { from, to } = await this.determineSyncRange(options);
        
        if (from <= to) {
          logger.info(`🔄 Live sync: scheduling jobs for blocks ${from} to ${to}`);
          await this.syncBlockRange(from, to, options.batchSize || 10, options);
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

      // Execute sync based on mode - All modes use queue-based approach
      if (options.mode === 'live') {
        await this.liveSyncMode(options);
      } else {
        const { from, to } = await this.determineSyncRange(options);
        
        // Always use queue-based approach (Phase 1: Single processing path)
        await this.syncBlockRange(from, to, options.batchSize || 50, options);
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