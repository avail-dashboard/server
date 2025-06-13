import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import config from '../../config';
import { logger } from '../../utils/logger';
import { runWithCorrelationId, createChildCorrelationId, getCorrelationId } from '../../utils/correlationId';
import { 
  QueueServiceInterface, 
  QueueJob, 
  QueueStats, 
  JobType,
} from '../types/service';

/**
 * QueueService - Background job processing with Bull queue
 * 
 * Features:
 * - Bull queue integration
 * - Job scheduling and processing
 * - Background task coordination
 * - Retry mechanisms with exponential backoff
 * - Health monitoring
 */
export class QueueService implements QueueServiceInterface {
  private queue: Queue | null = null;
  private redis: Redis | null = null;
  private isStarted = false;
  private logger = logger;
  private jobProcessors: Map<string, (job: Job) => Promise<any>> = new Map();

  constructor() {
    this.setupJobProcessors();
  }

  /**
   * Start the queue service
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.warn('QueueService is already started');
      return;
    }

    try {
      // Create Redis connection for queue
      this.redis = new Redis(config.redis.url, {
        db: config.redis.queueDb,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Create Bull queue
      this.queue = new Bull('avail-explorer-queue', {
        redis: {
          port: this.redis.options.port || 6379,
          host: this.redis.options.host || 'localhost',
          db: config.redis.queueDb,
        },
        defaultJobOptions: config.queue.defaultJobOptions,
        settings: {
          stalledInterval: 30 * 1000, // 30 seconds
          maxStalledCount: 1,
        },
      });

      // Set up job processors
      this.setupQueueProcessors();

      // Set up event listeners
      this.setupEventListeners();

      // Test Redis connection
      await this.redis.ping();

      this.isStarted = true;
      this.logger.info('QueueService started successfully', {
        queueName: this.queue.name,
        concurrency: config.queue.concurrency,
      });

    } catch (error) {
      this.logger.error('Failed to start QueueService', { error });
      throw error;
    }
  }

  /**
   * Stop the queue service
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      if (this.queue) {
        await this.queue.close();
        this.queue = null;
      }

      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
      }

      this.isStarted = false;
      this.logger.info('QueueService stopped successfully');

    } catch (error) {
      this.logger.error('Error stopping QueueService', { error });
      throw error;
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob<T>(
    type: string, 
    data: T, 
    options: JobOptions = {},
  ): Promise<QueueJob<T>> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }

    try {
      // Capture current correlation ID to pass to job
      const correlationId = getCorrelationId();
      
      const jobData = {
        ...data,
        _correlationId: correlationId, // Add correlation ID to job data
      };

      const job = await this.queue.add(type, jobData, {
        ...config.queue.defaultJobOptions,
        ...options,
      });

      const queueJob: QueueJob<T> = {
        id: job.id?.toString() || '',
        type,
        data,
        priority: options.priority,
        delay: options.delay,
        attempts: options.attempts,
      };

      this.logger.debug('Job added to queue', {
        jobId: job.id,
        type,
        priority: options.priority,
      });

      return queueJob;

    } catch (error) {
      this.logger.error('Failed to add job to queue', { type, error });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      // Check if queue is paused
      const isPaused = await this.queue.isPaused();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: isPaused ? 1 : 0,
      };

    } catch (error) {
      this.logger.error('Failed to get queue stats', { error });
      throw error;
    }
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{ status: string; stats: QueueStats }> {
    try {
      if (!this.isStarted || !this.queue || !this.redis) {
        return {
          status: 'unhealthy',
          stats: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: 0,
          },
        };
      }

      // Test Redis connection
      await this.redis.ping();

      const stats = await this.getStats();
      
      return {
        status: 'healthy',
        stats,
      };

    } catch (error) {
      this.logger.error('Queue health check failed', { error });
      return {
        status: 'unhealthy',
        stats: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        },
      };
    }
  }

  /**
   * Pause the queue
   */
  async pauseQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }

    await this.queue.pause();
    this.logger.info('Queue paused');
  }

  /**
   * Resume the queue
   */
  async resumeQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }

    await this.queue.resume();
    this.logger.info('Queue resumed');
  }

  /**
   * Clear all jobs from the queue
   */
  async clearQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }

    await this.queue.empty();
    this.logger.info('Queue cleared');
  }

  /**
   * Setup job processors for different job types
   */
  private setupJobProcessors(): void {
    // Block indexing processor
    this.jobProcessors.set(JobType.BLOCK_INDEXING, async (job: Job) => {
      this.logger.debug('Processing block indexing job', { jobId: job.id, data: job.data });
      
      // TODO: Implement block indexing logic
      // This will be connected to BlockService when implemented
      
      return { success: true, message: 'Block indexing completed' };
    });

    // Extrinsic processing processor
    this.jobProcessors.set(JobType.EXTRINSIC_PROCESSING, async (job: Job) => {
      this.logger.debug('Processing extrinsic job', { jobId: job.id, data: job.data });
      
      // TODO: Implement extrinsic processing logic
      // This will be connected to ExtrinsicService when implemented
      
      return { success: true, message: 'Extrinsic processing completed' };
    });

    // Analytics calculation processor
    this.jobProcessors.set(JobType.ANALYTICS_CALCULATION, async (job: Job) => {
      this.logger.debug('Processing analytics job', { jobId: job.id, data: job.data });
      
      // TODO: Implement analytics calculation logic
      // This will be connected to Analytics services when implemented
      
      return { success: true, message: 'Analytics calculation completed' };
    });

    // Rollup statistics processor
    this.jobProcessors.set(JobType.ROLLUP_STATISTICS, async (job: Job) => {
      this.logger.debug('Processing rollup statistics job', { jobId: job.id, data: job.data });
      
      // TODO: Implement rollup statistics logic
      // This will be connected to RollupAnalyticsService when implemented
      
      return { success: true, message: 'Rollup statistics completed' };
    });

    // Data sync processor
    this.jobProcessors.set(JobType.DATA_SYNC, async (job: Job) => {
      this.logger.debug('Processing data sync job', { jobId: job.id, data: job.data });
      
      // TODO: Implement data synchronization logic
      // This will coordinate with blockchain service for data sync
      
      return { success: true, message: 'Data sync completed' };
    });

    // Health check processor
    this.jobProcessors.set(JobType.HEALTH_CHECK, async (job: Job) => {
      this.logger.debug('Processing health check job', { jobId: job.id });
      
      // Perform system health checks
      const health = await this.getHealth();
      
      return { success: true, health };
    });
  }

  /**
   * Setup queue processors with Bull
   */
  private setupQueueProcessors(): void {
    if (!this.queue) {
      return;
    }

    // Process jobs with configured concurrency
    this.queue.process('*', config.queue.concurrency, async (job: Job) => {
      const startTime = Date.now();
      
      // Extract correlation ID from job data and run processor within correlation context
      const correlationId = job.data._correlationId || createChildCorrelationId('job');
      
      return runWithCorrelationId(correlationId, async () => {
        try {
          const processor = this.jobProcessors.get(job.name);
          
          if (!processor) {
            throw new Error(`No processor found for job type: ${job.name}`);
          }

          const result = await processor(job);
          const duration = Date.now() - startTime;

          this.logger.debug('Job completed successfully', {
            jobId: job.id,
            type: job.name,
            duration,
          });

          return result;

        } catch (error) {
          const duration = Date.now() - startTime;
          
          this.logger.error('Job failed', {
            jobId: job.id,
            type: job.name,
            duration,
            error,
          });

          throw error;
        }
      });
    });
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupEventListeners(): void {
    if (!this.queue) {
      return;
    }

    this.queue.on('completed', (job: Job, result: any) => {
      this.logger.debug('Job completed', {
        jobId: job.id,
        type: job.name,
        result,
      });
    });

    this.queue.on('failed', (job: Job, error: Error) => {
      this.logger.error('Job failed', {
        jobId: job.id,
        type: job.name,
        error: error.message,
        attempts: job.attemptsMade,
      });
    });

    this.queue.on('stalled', (job: Job) => {
      this.logger.warn('Job stalled', {
        jobId: job.id,
        type: job.name,
      });
    });

    this.queue.on('error', (error: Error) => {
      this.logger.error('Queue error', { error });
    });
  }

  /**
   * Add a convenience method for common job types
   */
  async scheduleBlockIndexing(blockNumber: number, priority = 0): Promise<QueueJob> {
    return this.addJob(JobType.BLOCK_INDEXING, { blockNumber }, { priority });
  }

  async scheduleExtrinsicProcessing(extrinsicHash: string, priority = 0): Promise<QueueJob> {
    return this.addJob(JobType.EXTRINSIC_PROCESSING, { extrinsicHash }, { priority });
  }

  async scheduleAnalyticsCalculation(type: string, timeframe: string): Promise<QueueJob> {
    return this.addJob(JobType.ANALYTICS_CALCULATION, { type, timeframe });
  }

  async scheduleDataSync(fromBlock: number, toBlock: number): Promise<QueueJob> {
    return this.addJob(JobType.DATA_SYNC, { fromBlock, toBlock });
  }

  async scheduleHealthCheck(delay = 0): Promise<QueueJob> {
    return this.addJob(JobType.HEALTH_CHECK, {}, { delay });
  }
}

// Factory function for dependency injection
export const createQueueService = (): QueueService => {
  return new QueueService();
};

// Class exported above with declaration 