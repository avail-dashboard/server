import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { AvailBlockchainService } from './avail-blockchain';
import { QueueService } from './queue';
import { 
  BaseService,
  ServiceHealth,
  JobType, 
} from '../types/service';
import { 
  SyncState, 
  SyncProgress, 
  SyncMetrics, 
} from '../../types/database';

export interface ISyncService {
  getCurrentSyncState(): Promise<SyncState>;
  getSyncProgress(): Promise<SyncProgress>;
  getSyncMetrics(): Promise<SyncMetrics>;
  startSync(mode?: 'full' | 'incremental' | 'live', fromBlock?: number, toBlock?: number): Promise<void>;
  pauseSync(): Promise<void>;
  resumeSync(): Promise<void>;
  resetSync(): Promise<void>;
}

/**
 * SyncService - Core service for orchestrating blockchain data synchronization
 * 
 * Responsibilities:
 * - Manage sync state and persistence
 * - Coordinate between block indexer and data processor
 * - Track sync progress and metrics
 * - Handle sync lifecycle (start, pause, resume, reset)
 * - Monitor sync health and performance
 */
export class SyncService implements BaseService, ISyncService {
  private db: typeof db;
  private blockchain: AvailBlockchainService;
  private queue: QueueService;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly SYNC_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly BATCH_SIZE = 50; // blocks per batch

  constructor(database: typeof db, blockchain: AvailBlockchainService, queue: QueueService) {
    this.db = database;
    this.blockchain = blockchain;
    this.queue = queue;
  }

  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    try {
      logger.info('SyncService: Starting service', { component: 'sync' });
      
      // Ensure sync state table exists and has initial record
      await this.initializeSyncState();
      
      // Start monitoring sync progress
      this.startSyncMonitor();
      
      this.isRunning = true;
      logger.info('SyncService: Service started successfully', { component: 'sync' });
      
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the sync service
   */
  async stop(): Promise<void> {
    try {
      logger.info('SyncService: Stopping service', { component: 'sync' });
      
      // Stop sync monitor
      if (this.syncIntervalId) {
        clearInterval(this.syncIntervalId);
        this.syncIntervalId = null;
      }
      
      // Pause any active sync
      await this.pauseSync();
      
      this.isRunning = false;
      logger.info('SyncService: Service stopped', { component: 'sync' });
      
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      const syncState = await this.getCurrentSyncState();
      const progress = await this.getSyncProgress();
      
      const healthy = this.isRunning && 
                     syncState.sync_status !== 'error' && 
                     syncState.error_count < 10; // Allow some errors
      
      return {
        healthy,
        lastCheck: now,
        error: !healthy ? `Sync status: ${syncState.sync_status}, errors: ${syncState.error_count}` : undefined,
        details: {
          syncState,
          progress,
          isRunning: this.isRunning,
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
    return this.isRunning;
  }

  /**
   * Get current sync state
   */
  async getCurrentSyncState(): Promise<SyncState> {
    try {
      const result = await this.db.query<SyncState>(
        'SELECT * FROM sync_state ORDER BY id DESC LIMIT 1',
      );
      
      if (result.rows.length === 0) {
        throw new Error('No sync state found. Please initialize sync state.');
      }
      
      return result.rows[0];
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'getCurrentSyncState' });
      throw error;
    }
  }

  /**
   * Get sync progress information
   */
  async getSyncProgress(): Promise<SyncProgress> {
    try {
      const syncState = await this.getCurrentSyncState();
      const latestBlock = await this.blockchain.getLatestBlock();
      
      const currentBlock = Number(syncState.last_synced_block);
      const targetBlock = syncState.target_block ? Number(syncState.target_block) : latestBlock.number;
      const blocksRemaining = targetBlock - currentBlock;
      const progressPercentage = targetBlock > 0 ? (currentBlock / targetBlock) * 100 : 0;
      
      // Calculate estimated time remaining based on current speed
      let estimatedTimeRemaining: number | undefined;
      if (syncState.blocks_per_minute && syncState.blocks_per_minute > 0 && blocksRemaining > 0) {
        estimatedTimeRemaining = Math.ceil(blocksRemaining / syncState.blocks_per_minute * 60); // seconds
      }
      
      return {
        current_block: currentBlock,
        target_block: targetBlock,
        progress_percentage: Math.min(progressPercentage, 100),
        blocks_remaining: blocksRemaining > 0 ? blocksRemaining : 0,
        estimated_time_remaining: estimatedTimeRemaining,
        current_speed: syncState.blocks_per_minute || 0,
      };
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'getSyncProgress' });
      throw error;
    }
  }

  /**
   * Get sync metrics and statistics
   */
  async getSyncMetrics(): Promise<SyncMetrics> {
    try {
      const syncState = await this.getCurrentSyncState();
      
      // Calculate sync duration
      let syncDuration = 0;
      if (syncState.started_at) {
        const endTime = syncState.completed_at || new Date();
        syncDuration = Math.floor((endTime.getTime() - syncState.started_at.getTime()) / 1000);
      }
      
      // Calculate average blocks per minute
      const averageBlocksPerMinute = syncDuration > 0 ? 
        (Number(syncState.last_synced_block) / (syncDuration / 60)) : 
        (syncState.blocks_per_minute || 0);
      
      // Calculate error rate
      const totalBlocks = Number(syncState.last_synced_block);
      const errorRate = totalBlocks > 0 ? (syncState.error_count / totalBlocks) * 100 : 0;
      
      return {
        total_blocks_synced: syncState.last_synced_block,
        total_errors: syncState.error_count,
        average_blocks_per_minute: averageBlocksPerMinute,
        sync_duration: syncDuration,
        last_successful_block: syncState.last_synced_block,
        error_rate: errorRate,
      };
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'getSyncMetrics' });
      throw error;
    }
  }

  /**
   * Start blockchain synchronization
   */
  async startSync(
    mode: 'full' | 'incremental' | 'live' = 'incremental', 
    fromBlock?: number, 
    toBlock?: number,
  ): Promise<void> {
    try {
      logger.info('SyncService: Starting sync', { 
        component: 'sync', 
        mode, 
        fromBlock, 
        toBlock, 
      });
      
      const latestBlock = await this.blockchain.getLatestBlock();
      const syncState = await this.getCurrentSyncState();
      
      // Determine starting block
      let startBlock = fromBlock;
      if (!startBlock) {
        startBlock = mode === 'full' ? 0 : Number(syncState.last_synced_block) + 1;
      }
      
      // Determine target block
      const targetBlock = toBlock || latestBlock.number;
      
      // Update sync state
      await this.updateSyncState({
        sync_status: 'syncing',
        sync_mode: mode,
        target_block: targetBlock,
        started_at: new Date(),
        paused_at: undefined,
        completed_at: undefined,
        last_error: undefined,
      });
      
      // Queue block range jobs
      await this.queueBlockRangeJobs(startBlock, targetBlock);
      
      logger.info('SyncService: Sync started successfully', {
        component: 'sync',
        mode,
        startBlock,
        targetBlock,
        totalBlocks: targetBlock - startBlock + 1,
      });
      
    } catch (error) {
      await this.updateSyncState({
        sync_status: 'error',
        last_error: (error as Error).message,
        error_count: (await this.getCurrentSyncState()).error_count + 1,
      });
      logError(error as Error, { component: 'sync', action: 'startSync' });
      throw error;
    }
  }

  /**
   * Pause synchronization
   */
  async pauseSync(): Promise<void> {
    try {
      logger.info('SyncService: Pausing sync', { component: 'sync' });
      
      const syncState = await this.getCurrentSyncState();
      
      // Only pause if sync is actually running
      if (syncState.sync_status === 'syncing') {
        await this.updateSyncState({
          sync_status: 'paused',
          paused_at: new Date(),
        });
        
        // Pause the queue to stop processing new jobs
        await this.queue.pauseQueue();
        
        logger.info('SyncService: Sync paused', { component: 'sync' });
      } else {
        logger.info('SyncService: Sync is not running, no need to pause', { 
          component: 'sync', 
          currentStatus: syncState.sync_status,
        });
      }
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'pauseSync' });
      throw error;
    }
  }

  /**
   * Resume synchronization
   */
  async resumeSync(): Promise<void> {
    try {
      logger.info('SyncService: Resuming sync', { component: 'sync' });
      
      const syncState = await this.getCurrentSyncState();
      
      if (syncState.sync_status !== 'paused') {
        throw new Error(`Cannot resume sync. Current status: ${syncState.sync_status}`);
      }
      
      await this.updateSyncState({
        sync_status: 'syncing',
        paused_at: undefined,
      });
      
      // Resume the queue
      await this.queue.resumeQueue();
      
      logger.info('SyncService: Sync resumed', { component: 'sync' });
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'resumeSync' });
      throw error;
    }
  }

  /**
   * Reset synchronization state
   */
  async resetSync(): Promise<void> {
    try {
      logger.info('SyncService: Resetting sync', { component: 'sync' });
      
      // Pause sync first
      await this.pauseSync();
      
      // Clear queue
      await this.queue.clearQueue();
      
      // Reset sync state
      await this.updateSyncState({
        last_synced_block: 0,
        target_block: undefined,
        sync_status: 'idle',
        sync_mode: 'incremental',
        blocks_per_minute: undefined,
        estimated_completion: undefined,
        error_count: 0,
        last_error: undefined,
        last_error_block: undefined,
        started_at: undefined,
        paused_at: undefined,
        completed_at: undefined,
      });
      
      logger.info('SyncService: Sync reset completed', { component: 'sync' });
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'resetSync' });
      throw error;
    }
  }

  /**
   * Update sync state in database
   */
  private async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    try {
      const updateFields = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
      
      const values = [
        ...Object.values(updates),
        new Date(), // updated_at
      ];
      
      await this.db.query(
        `UPDATE sync_state 
         SET ${updateFields}, updated_at = $${values.length}
         WHERE id = (SELECT id FROM sync_state ORDER BY id DESC LIMIT 1)`,
        values,
      );
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'updateSyncState' });
      throw error;
    }
  }

  /**
   * Initialize sync state if it doesn't exist
   */
  private async initializeSyncState(): Promise<void> {
    try {
      const result = await this.db.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM sync_state',
      );
      
      if (Number(result.rows[0].count) === 0) {
        await this.db.query(
          `INSERT INTO sync_state (last_synced_block, sync_status, sync_mode) 
           VALUES (0, 'idle', 'incremental')`,
        );
        logger.info('SyncService: Initialized sync state', { component: 'sync' });
      }
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'initializeSyncState' });
      throw error;
    }
  }

  /**
   * Start sync monitor to track progress
   */
  private startSyncMonitor(): void {
    this.syncIntervalId = setInterval(async () => {
      try {
        await this.updateSyncProgress();
      } catch (error) {
        logError(error as Error, { component: 'sync', action: 'syncMonitor' });
      }
    }, this.SYNC_CHECK_INTERVAL);
  }

  /**
   * Update sync progress metrics
   */
  private async updateSyncProgress(): Promise<void> {
    try {
      const syncState = await this.getCurrentSyncState();
      
      if (syncState.sync_status !== 'syncing') {
        return;
      }
      
      // Calculate blocks per minute based on recent progress
      const blocksPerMinute = await this.calculateBlocksPerMinute();
      
      // Check if sync is complete
      if (syncState.target_block && syncState.last_synced_block >= syncState.target_block) {
        await this.updateSyncState({
          sync_status: 'completed',
          completed_at: new Date(),
          blocks_per_minute: blocksPerMinute,
        });
        logger.info('SyncService: Sync completed', { 
          component: 'sync',
          finalBlock: syncState.last_synced_block, 
        });
        return;
      }
      
      // Update progress metrics
      await this.updateSyncState({
        blocks_per_minute: blocksPerMinute,
      });
      
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'updateSyncProgress' });
    }
  }

  /**
   * Calculate current sync speed (blocks per minute)
   */
  private async calculateBlocksPerMinute(): Promise<number> {
    try {
      // Get sync history from last 5 minutes
      const result = await this.db.query<{ block_count: number }>(
        `SELECT COUNT(*) as block_count 
         FROM blocks 
         WHERE created_at >= NOW() - INTERVAL '5 minutes'`,
      );
      
      const blocksInLast5Min = result.rows[0]?.block_count || 0;
      return Math.round(blocksInLast5Min); // blocks per 5 minutes, roughly blocks per minute
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'calculateBlocksPerMinute' });
      return 0;
    }
  }

  /**
   * Queue block range jobs for processing
   */
  private async queueBlockRangeJobs(startBlock: number, endBlock: number): Promise<void> {
    try {
      const totalBlocks = endBlock - startBlock + 1;
      const numberOfBatches = Math.ceil(totalBlocks / this.BATCH_SIZE);
      
      logger.info('SyncService: Queueing block range jobs', {
        component: 'sync',
        startBlock,
        endBlock,
        totalBlocks,
        batchSize: this.BATCH_SIZE,
        numberOfBatches,
      });
      
      for (let i = 0; i < numberOfBatches; i++) {
        const batchStart = startBlock + (i * this.BATCH_SIZE);
        const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);
        
        await this.queue.addJob(JobType.DATA_SYNC, {
          startBlock: batchStart,
          endBlock: batchEnd,
          batchIndex: i,
          totalBatches: numberOfBatches,
        }, {
          priority: numberOfBatches - i, // Later blocks get higher priority
        });
      }
      
      logger.info('SyncService: Block range jobs queued successfully', {
        component: 'sync',
        numberOfBatches,
      });
    } catch (error) {
      logError(error as Error, { component: 'sync', action: 'queueBlockRangeJobs' });
      throw error;
    }
  }
}

/**
 * Factory function to create a SyncService instance
 */
export const createSyncService = (
  database: typeof db, 
  blockchain: AvailBlockchainService,
  queue: QueueService,
): SyncService => {
  return new SyncService(database, blockchain, queue);
};

// Export singleton instance (will be created by ServiceFactory)
export let syncService: SyncService; 