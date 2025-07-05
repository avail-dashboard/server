import { logger } from '../../utils/logger';
import { QueueService } from './queue';
import { JobType } from '../types/service';

export enum RecoveryPriority {
  CRITICAL = 1,  // Missing blocks
  HIGH = 5,      // Missing core entities (extrinsics, events)
  MEDIUM = 10,   // Missing derived entities (validators, accounts)
  LOW = 15       // Missing optional entities (transfers, data submissions)
}

export interface RecoveryJobConfig {
  blockBatchSize: number;
  entityBatchSize: number;
  throttleThreshold: number;
  maxRetries: number;
  delayBetweenBatches: number;
}

export interface RecoveryProgress {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  estimatedDuration: string;
  currentBatchInfo: {
    batchType: string;
    batchSize: number;
    progress: number;
  };
}

/**
 * RecoveryJobScheduler - Intelligently schedules recovery jobs
 * 
 * Handles:
 * - Batch processing with configurable sizes
 * - Queue health monitoring and throttling
 * - Priority-based job scheduling
 * - Progress tracking and estimation
 */
export class RecoveryJobScheduler {
  private queueService: QueueService;
  private config: RecoveryJobConfig;
  private progress: RecoveryProgress;

  constructor(queueService: QueueService, config: RecoveryJobConfig) {
    this.queueService = queueService;
    this.config = config;
    this.progress = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      estimatedDuration: '0m',
      currentBatchInfo: {
        batchType: '',
        batchSize: 0,
        progress: 0,
      },
    };
  }

  /**
   * Queue missing block indexing jobs in batches
   */
  async queueMissingBlocks(blockNumbers: number[], batchSize?: number): Promise<void> {
    const actualBatchSize = batchSize || this.config.blockBatchSize;
    
    logger.info('Queuing missing block recovery jobs', {
      component: 'recovery-job-scheduler',
      totalBlocks: blockNumbers.length,
      batchSize: actualBatchSize,
      priority: RecoveryPriority.CRITICAL,
    });

    // Sort blocks to ensure sequential processing
    const sortedBlocks = blockNumbers.sort((a, b) => a - b);
    const batches = this.createBatches(sortedBlocks, actualBatchSize);

    this.updateProgress('missing_blocks', batches.length * actualBatchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Wait for queue capacity if needed
      await this.waitForQueueCapacity();

      // Queue batch job
      await this.queueService.addJob(
        JobType.BLOCK_RANGE_INDEXING,
        {
          startBlock: batch[0],
          endBlock: batch[batch.length - 1],
          blockNumbers: batch,
          recoveryMode: true,
        },
        { priority: RecoveryPriority.CRITICAL }
      );

      this.updateBatchProgress('missing_blocks', i + 1, batches.length);

      // Add delay between batches to prevent overwhelming
      if (i < batches.length - 1) {
        await this.sleep(this.config.delayBetweenBatches);
      }

      logger.debug('Queued missing block batch', {
        component: 'recovery-job-scheduler',
        batchIndex: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
        blockRange: `${batch[0]}-${batch[batch.length - 1]}`,
      });
    }

    logger.info('Missing block recovery jobs queued successfully', {
      component: 'recovery-job-scheduler',
      totalBlocks: blockNumbers.length,
      totalBatches: batches.length,
      priority: RecoveryPriority.CRITICAL,
    });
  }

  /**
   * Queue missing entity recovery jobs
   */
  async queueMissingEntities(
    entityType: string,
    entityIds: string[],
    batchSize?: number
  ): Promise<void> {
    const actualBatchSize = batchSize || this.config.entityBatchSize;
    const priority = this.getEntityPriority(entityType);

    logger.info('Queuing missing entity recovery jobs', {
      component: 'recovery-job-scheduler',
      entityType,
      totalEntities: entityIds.length,
      batchSize: actualBatchSize,
      priority,
    });

    const batches = this.createBatches(entityIds, actualBatchSize);
    this.updateProgress(`missing_${entityType}`, batches.length * actualBatchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Wait for queue capacity if needed
      await this.waitForQueueCapacity();

      // Queue appropriate job type based on entity
      const jobType = this.getJobTypeForEntity(entityType);
      if (jobType) {
        await this.queueService.addJob(
          jobType,
          {
            entityIds: batch,
            entityType,
            recoveryMode: true,
          },
          { priority }
        );
      }

      this.updateBatchProgress(`missing_${entityType}`, i + 1, batches.length);

      // Add delay between batches
      if (i < batches.length - 1) {
        await this.sleep(this.config.delayBetweenBatches);
      }

      logger.debug('Queued missing entity batch', {
        component: 'recovery-job-scheduler',
        entityType,
        batchIndex: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
      });
    }

    logger.info('Missing entity recovery jobs queued successfully', {
      component: 'recovery-job-scheduler',
      entityType,
      totalEntities: entityIds.length,
      totalBatches: batches.length,
      priority,
    });
  }

  /**
   * Queue incomplete block recovery jobs
   */
  async queueIncompleteBlocks(
    blockNumbers: number[],
    issueType: 'extrinsics' | 'events' | 'data_submissions'
  ): Promise<void> {
    const priority = RecoveryPriority.HIGH;
    
    logger.info('Queuing incomplete block recovery jobs', {
      component: 'recovery-job-scheduler',
      issueType,
      totalBlocks: blockNumbers.length,
      priority,
    });

    // Process each block individually for targeted recovery
    for (const blockNumber of blockNumbers) {
      await this.waitForQueueCapacity();

      const jobType = this.getJobTypeForIssue(issueType);
      if (jobType) {
        await this.queueService.addJob(
          jobType,
          {
            blockNumber,
            issueType,
            recoveryMode: true,
          },
          { priority }
        );
      }

      // Small delay to prevent overwhelming
      await this.sleep(100);
    }

    logger.info('Incomplete block recovery jobs queued successfully', {
      component: 'recovery-job-scheduler',
      issueType,
      totalBlocks: blockNumbers.length,
      priority,
    });
  }

  /**
   * Wait for queue capacity before adding more jobs
   */
  async waitForQueueCapacity(): Promise<void> {
    let stats = await this.queueService.getStats();
    let queueLength = stats.waiting + stats.active;
    
    while (queueLength > this.config.throttleThreshold) {
      logger.debug('Queue capacity exceeded, waiting...', {
        component: 'recovery-job-scheduler',
        currentQueueLength: queueLength,
        waiting: stats.waiting,
        active: stats.active,
        throttleThreshold: this.config.throttleThreshold,
      });

      await this.sleep(2000); // Wait 2 seconds
      stats = await this.queueService.getStats();
      queueLength = stats.waiting + stats.active;
    }
  }

  /**
   * Get current recovery progress
   */
  getProgress(): RecoveryProgress {
    return { ...this.progress };
  }

  /**
   * Update progress tracking
   */
  private updateProgress(batchType: string, totalJobs: number): void {
    this.progress.totalJobs += totalJobs;
    this.progress.currentBatchInfo.batchType = batchType;
    this.progress.currentBatchInfo.batchSize = totalJobs;
    this.progress.currentBatchInfo.progress = 0;
    
    // Estimate duration based on average job processing time (rough estimate)
    const avgJobTime = 5000; // 5 seconds per job
    const remainingJobs = this.progress.totalJobs - this.progress.completedJobs;
    const estimatedMs = remainingJobs * avgJobTime;
    this.progress.estimatedDuration = this.formatDuration(estimatedMs);
  }

  /**
   * Update batch progress
   */
  private updateBatchProgress(batchType: string, completed: number, total: number): void {
    this.progress.currentBatchInfo.progress = (completed / total) * 100;
    
    logger.debug('Batch progress updated', {
      component: 'recovery-job-scheduler',
      batchType,
      completed,
      total,
      progress: this.progress.currentBatchInfo.progress,
    });
  }

  /**
   * Create batches from array of items
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Get priority for entity type
   */
  private getEntityPriority(entityType: string): RecoveryPriority {
    switch (entityType) {
      case 'validators':
      case 'accounts':
        return RecoveryPriority.MEDIUM;
      case 'transfers':
      case 'data_submissions':
        return RecoveryPriority.LOW;
      default:
        return RecoveryPriority.MEDIUM;
    }
  }

  /**
   * Get job type for entity type
   */
  private getJobTypeForEntity(entityType: string): JobType | null {
    switch (entityType) {
      case 'validators':
        return JobType.INDEX_VALIDATOR;
      case 'accounts':
        return JobType.INDEX_ACCOUNT;
      case 'transfers':
        return JobType.INDEX_TRANSFER;
      case 'data_submissions':
        return JobType.INDEX_DATA_SUBMISSION;
      default:
        return null;
    }
  }

  /**
   * Get job type for issue type
   */
  private getJobTypeForIssue(issueType: string): JobType | null {
    switch (issueType) {
      case 'extrinsics':
        return JobType.EXTRINSIC_PROCESSING;
      case 'events':
        return JobType.INDEX_EVENT;
      case 'data_submissions':
        return JobType.INDEX_DATA_SUBMISSION;
      default:
        return null;
    }
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}