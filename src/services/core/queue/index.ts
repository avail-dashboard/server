import Bull, { Queue, Job, JobOptions } from 'bull';
import Redis from 'ioredis';
import config from '../../../config';
import { logger } from '../../../utils/logger';
import { runWithCorrelationId, createChildCorrelationId, getCorrelationId } from '../../../utils/correlationId';
import { 
  QueueServiceInterface, 
  QueueJob, 
  QueueStats, 
  JobType,
  JobPriority,
} from '../../types/service';
import { JobProcessorRegistry } from './processors';
import { JobProcessorDependencies } from './types';

/**
 * QueueService - Background job processing with Bull queue
 * 
 * Refactored for better maintainability:
 * - Processors extracted to separate modules
 * - Clean separation of concerns
 * - Simplified service management
 * 
 * Features:
 * - Bull queue integration with Redis
 * - Job scheduling and processing
 * - Retry mechanisms with exponential backoff
 * - Health monitoring
 * - Dead letter queue support
 */
export class QueueService implements QueueServiceInterface {
  private queue: Queue | null = null;
  private deadLetterQueue: Queue | null = null;
  private redis: Redis | null = null;
  private isStarted = false;
  private logger = logger;
  private processorRegistry: JobProcessorRegistry | null = null;
  private dependencies: JobProcessorDependencies = {};

  constructor() {
    // Processor registry will be initialized after dependencies are set
  }

  /**
   * Initialize queue dependencies and set up processors
   */
  initializeDependencies(dependencies: JobProcessorDependencies): void {
    console.log('🔧 INIT DEPENDENCIES: Starting dependency initialization...');
    
    this.dependencies = dependencies;
    
    console.log('🔧 INIT DEPENDENCIES: Creating JobProcessorRegistry...');
    
    // Initialize processor registry with dependencies
    this.processorRegistry = new JobProcessorRegistry(
      dependencies,
      this.getService.bind(this),
      this.addJob.bind(this),
    );
    
    console.log('🔧 INIT DEPENDENCIES: Registry created with', this.processorRegistry.getProcessorCount(), 'processors');
    
    this.logger.info('🔧 JobProcessorRegistry created', {
      component: 'queue-service',
      processorCount: this.processorRegistry.getProcessorCount(),
      registeredTypes: this.processorRegistry.getRegisteredTypes(),
    });
    
    console.log('🔧 INIT DEPENDENCIES: Checking if queue exists...', !!this.queue);
    
    // Set up queue processors now that dependencies are available
    if (this.queue) {
      console.log('🔧 INIT DEPENDENCIES: Calling setupQueueProcessors from initializeDependencies()...');
      this.logger.info('🔧 Setting up queue processors with Bull queue', {
        component: 'queue-service',
        queueExists: !!this.queue,
        processorRegistryExists: !!this.processorRegistry,
      });
      this.setupQueueProcessors();
    } else {
      console.log('❌ INIT DEPENDENCIES: Bull queue not available yet - processors will be set up when queue starts');
      this.logger.warn('⚠️ Bull queue not available yet - processors will be set up when queue starts', {
        component: 'queue-service',
      });
    }
    
    console.log('✅ INIT DEPENDENCIES COMPLETE');
    
    this.logger.info('✅ QueueService: Dependencies initialized', {
      component: 'queue-service',
      availableDependencies: Object.keys(dependencies),
      processorCount: this.processorRegistry.getProcessorCount(),
      queueProcessorsSetup: !!this.queue && !!(this.queue as any)._processorsInitialized,
    });
  }

  /**
   * Get service instance with error handling
   */
  private async getService<T>(serviceName: string): Promise<T> {
    if (!this.dependencies.serviceFactory) {
      throw new Error('ServiceFactory not available - ensure dependencies are initialized');
    }

    try {
      return this.dependencies.serviceFactory.get(serviceName) as T;
    } catch (error) {
      this.logger.error('Failed to get service dependency', {
        component: 'queue-service',
        serviceName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Calculate Enhanced Exponential Backoff - Integrated with Bull queue processing
   */
  private calculateExponentialBackoff(retryStrategy: any, fallbackConfig: any): any {
    if (!retryStrategy) {
      return fallbackConfig;
    }

    return {
      type: 'exponential',
      delay: retryStrategy.baseDelay,
      settings: {
        maxDelay: retryStrategy.maxDelay,
        exponentialFactor: retryStrategy.exponentialFactor,
        jitterEnabled: retryStrategy.jitterEnabled,
      },
    };
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
      console.log('🔧 QUEUE START: Creating Redis connection...');
      
      // Create Redis connection for queue
      this.redis = new Redis(config.redis.url, {
        db: config.redis.queueDb,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      console.log('🔧 QUEUE START: Creating Bull queue...');
      
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

      console.log('🔧 QUEUE START: Creating Dead Letter Queue...');
      
      // Create Dead Letter Queue
      this.deadLetterQueue = new Bull('avail-explorer-dead-letter', {
        redis: {
          port: this.redis.options.port || 6379,
          host: this.redis.options.host || 'localhost',
          db: config.redis.queueDb,
        },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 0,
        },
      });

      // Set up event listeners
      this.setupEventListeners();
      
      console.log('🔧 QUEUE START: Checking processor registry...', !!this.processorRegistry);
      
      // Set up queue processors if dependencies are available
      if (this.processorRegistry) {
        console.log('🔧 QUEUE START: Calling setupQueueProcessors from start()...');
        this.setupQueueProcessors();
      } else {
        console.log('❌ QUEUE START: No processor registry available, processors will be set up later');
      }

      // Test Redis connection
      await this.redis.ping();

      this.isStarted = true;
      
      console.log('✅ QUEUE START COMPLETE: processorCount =', this.processorRegistry?.getProcessorCount() || 0);
      
      this.logger.info('QueueService started successfully', {
        queueName: this.queue.name,
        concurrency: config.queue.concurrency,
        processorCount: this.processorRegistry?.getProcessorCount() || 0,
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

      if (this.deadLetterQueue) {
        await this.deadLetterQueue.close();
        this.deadLetterQueue = null;
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
   * Add a job to the queue with enhanced retry strategy support
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
        _correlationId: correlationId,
      };

      // Get job-specific retry strategy
      const retryStrategy = config.queue.retryStrategies[type as keyof typeof config.queue.retryStrategies];
      
      // Enhanced job options with exponential backoff integration
      const jobOptions: JobOptions = {
        priority: options.priority || JobPriority.MEDIUM,
        delay: options.delay || 0,
        attempts: options.attempts || 3,
        backoff: retryStrategy ? this.calculateExponentialBackoff(retryStrategy, {
          type: 'exponential',
          delay: 2000,
        }) : {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: config.queue.defaultJobOptions.removeOnComplete,
        removeOnFail: config.queue.defaultJobOptions.removeOnFail,
      };

      const job = await this.queue.add(type, jobData, jobOptions);

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
   * Queue management methods
   */
  async pauseQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }
    await this.queue.pause();
    this.logger.info('Queue paused');
  }

  async resumeQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }
    await this.queue.resume();
    this.logger.info('Queue resumed');
  }

  async clearQueue(): Promise<void> {
    if (!this.queue) {
      throw new Error('QueueService not started');
    }
    await this.queue.empty();
    this.logger.info('Queue cleared');
  }

  /**
   * Get Bull queue instances for Bull Board dashboard
   */
  getBullQueue(): Queue | null {
    return this.queue;
  }

  getBullDeadLetterQueue(): Queue | null {
    return this.deadLetterQueue;
  }

  /**
   * Setup queue processors with Bull
   */
  private setupQueueProcessors(): void {
    console.log('🔧 SETUP QUEUE PROCESSORS CALLED');
    
    if (!this.queue) {
      console.log('❌ NO BULL QUEUE AVAILABLE');
      this.logger.warn('⚠️ Cannot setup processors: Bull queue not available', {
        component: 'queue-service',
        hasQueue: !!this.queue,
      });
      return;
    }
    
    if (!this.processorRegistry) {
      console.log('❌ NO PROCESSOR REGISTRY AVAILABLE');
      this.logger.warn('⚠️ Cannot setup processors: ProcessorRegistry not available', {
        component: 'queue-service',
        hasProcessorRegistry: !!this.processorRegistry,
      });
      return;
    }
    
    console.log('✅ BOTH QUEUE AND REGISTRY AVAILABLE');
    
    // Check if processors are already set up to avoid duplicates
    if ((this.queue as any)._processorsInitialized) {
      console.log('ℹ️ PROCESSORS ALREADY INITIALIZED, SKIPPING');
      this.logger.info('ℹ️ Queue processors already initialized, skipping', {
        component: 'queue-service',
        processorCount: this.processorRegistry.getProcessorCount(),
      });
      return;
    }

    console.log('🔧 SETTING UP', this.processorRegistry.getProcessorCount(), 'PROCESSORS');
    this.logger.info('🔧 Setting up Bull queue processors', {
      component: 'queue-service',
      processorCount: this.processorRegistry.getProcessorCount(),
      registeredTypes: this.processorRegistry.getRegisteredTypes(),
      concurrency: config.queue.concurrency,
    });

    // Process jobs with configured concurrency
    this.queue.process('*', config.queue.concurrency, async (job: Job) => {
      const startTime = Date.now();
      
      // Extract correlation ID from job data and run processor within correlation context
      const correlationId = job.data._correlationId || createChildCorrelationId('job');
      
      return runWithCorrelationId(correlationId, async () => {
        try {
          const processor = this.processorRegistry!.getProcessor(job.name);
          
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
    
    // Mark processors as initialized
    (this.queue as any)._processorsInitialized = true;
    
    console.log('✅ BULL QUEUE PROCESSORS SETUP COMPLETE');
    this.logger.info('✅ Bull queue processors setup complete', {
      component: 'queue-service',
      processorCount: this.processorRegistry.getProcessorCount(),
      concurrency: config.queue.concurrency,
      isInitialized: true,
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

  // ==================== Convenience Methods ====================

  async addCriticalJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.CRITICAL });
  }

  async addHighPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.HIGH });
  }

  async addMediumPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.MEDIUM });
  }

  async addLowPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.LOW });
  }

  // Quick job scheduling methods
  async scheduleBlockIndexing(blockNumber: number, priority = 0): Promise<QueueJob> {
    return this.addJob(JobType.BLOCK_INDEXING, { blockNumber }, { priority });
  }

  async scheduleDataSync(fromBlock: number, toBlock: number): Promise<QueueJob> {
    return this.addJob(JobType.DATA_SYNC, { fromBlock, toBlock });
  }

  async scheduleHealthCheck(delay = 0): Promise<QueueJob> {
    return this.addJob(JobType.HEALTH_CHECK, {}, { delay });
  }

  // ENSURE_* convenience methods
  async ensureBlock(blockNumber: number): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_BLOCK, { blockNumber }, { priority: JobPriority.CRITICAL });
  }

  async ensureAccount(address: string): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_ACCOUNT, { address }, { priority: JobPriority.HIGH });
  }

  async ensureRollup(appId: number): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_ROLLUP, { appId }, { priority: JobPriority.MEDIUM });
  }

  async ensureValidator(address: string): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_VALIDATOR, { address }, { priority: JobPriority.HIGH });
  }
}

// Factory function for dependency injection
export const createQueueService = (): QueueService => {
  return new QueueService();
};