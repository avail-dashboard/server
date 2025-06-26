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
    const startTime = Date.now();
    
    this.logger.info('🔧 QUEUE: Starting dependency initialization', {
      component: 'queue-service',
      operation: 'initializeDependencies',
      dependencyCount: Object.keys(dependencies).length,
      timestamp: new Date().toISOString(),
    });
    
    this.dependencies = dependencies;
    
    this.logger.debug('🔧 QUEUE: Creating JobProcessorRegistry', {
      component: 'queue-service',
      operation: 'createRegistry',
      availableDependencies: Object.keys(dependencies),
    });
    
    // Initialize processor registry with dependencies
    this.processorRegistry = new JobProcessorRegistry(
      dependencies,
      this.getService.bind(this),
      this.addJob.bind(this),
    );
    
    this.logger.info('🔧 QUEUE: JobProcessorRegistry created successfully', {
      component: 'queue-service',
      operation: 'registryCreated',
      processorCount: this.processorRegistry.getProcessorCount(),
      registeredTypes: this.processorRegistry.getRegisteredTypes(),
      setupDuration: Date.now() - startTime,
    });
    
    // Set up queue processors now that dependencies are available
    if (this.queue) {
      this.logger.info('🔧 QUEUE: Setting up queue processors with Bull queue', {
        component: 'queue-service',
        operation: 'setupProcessors',
        queueExists: !!this.queue,
        processorRegistryExists: !!this.processorRegistry,
        queueName: this.queue.name,
      });
      this.setupQueueProcessors();
    } else {
      this.logger.warn('⚠️ QUEUE: Bull queue not available yet - processors will be set up when queue starts', {
        component: 'queue-service',
        operation: 'deferredSetup',
        reason: 'queueNotInitialized',
      });
    }
    
    const totalDuration = Date.now() - startTime;
    this.logger.info('✅ QUEUE: Dependencies initialized successfully', {
      component: 'queue-service',
      operation: 'initializationComplete',
      totalDuration,
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
    const startTime = Date.now();
    
    if (this.isStarted) {
      this.logger.warn('🔧 QUEUE: Service is already started', {
        component: 'queue-service',
        operation: 'start',
        status: 'already_running',
      });
      return;
    }

    try {
      this.logger.info('🚀 QUEUE: Starting queue service', {
        component: 'queue-service',
        operation: 'start',
        timestamp: new Date().toISOString(),
        config: {
          redisUrl: config.redis.url,
          queueDb: config.redis.queueDb,
          defaultJobOptions: config.queue.defaultJobOptions,
        },
      });
      
      // Create Redis connection for queue
      this.logger.debug('🔧 QUEUE: Creating Redis connection', {
        component: 'queue-service',
        operation: 'createRedisConnection',
        redisUrl: config.redis.url,
        queueDb: config.redis.queueDb,
      });
      
      this.redis = new Redis(config.redis.url, {
        db: config.redis.queueDb,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.logger.debug('🔧 QUEUE: Creating Bull queue instance', {
        component: 'queue-service',
        operation: 'createBullQueue',
        queueName: 'avail-explorer-queue',
        redisConfig: {
          port: this.redis.options.port || 6379,
          host: this.redis.options.host || 'localhost',
          db: config.redis.queueDb,
        },
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

      this.logger.debug('🔧 QUEUE: Creating Dead Letter Queue', {
        component: 'queue-service',
        operation: 'createDeadLetterQueue',
        queueName: 'avail-explorer-dead-letter',
      });
      
      // Create Dead Letter Queue
      this.deadLetterQueue = new Bull('avail-explorer-dead-letter', {
        redis: {
          port: this.redis.options.port || 6379,
          host: this.redis.options.host || 'localhost',
          db: config.redis.queueDb,
        },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25, // Keep 25 failed jobs for debugging, prevent memory leak
        },
      });

      // Set up event listeners
      this.logger.debug('🔧 QUEUE: Setting up event listeners', {
        component: 'queue-service',
        operation: 'setupEventListeners',
      });
      this.setupEventListeners();
      
      // Set up queue processors if dependencies are available
      if (this.processorRegistry) {
        this.logger.info('🔧 QUEUE: Setting up queue processors', {
          component: 'queue-service',
          operation: 'setupProcessors',
          processorCount: this.processorRegistry.getProcessorCount(),
          registeredTypes: this.processorRegistry.getRegisteredTypes(),
        });
        this.setupQueueProcessors();
      } else {
        this.logger.warn('⚠️ QUEUE: No processor registry available, processors will be set up later', {
          component: 'queue-service',
          operation: 'deferredProcessorSetup',
          reason: 'registryNotInitialized',
        });
      }

      // Test Redis connection
      this.logger.debug('🔧 QUEUE: Testing Redis connection', {
        component: 'queue-service',
        operation: 'testRedisConnection',
      });
      await this.redis.ping();

      this.isStarted = true;
      
      const initializationDuration = Date.now() - startTime;
      
      this.logger.info('✅ QUEUE: Service started successfully', {
        component: 'queue-service',
        operation: 'startComplete',
        queueName: this.queue.name,
        concurrency: config.queue.concurrency,
        processorCount: this.processorRegistry?.getProcessorCount() || 0,
        initializationDuration,
        timestamp: new Date().toISOString(),
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
        // Remove all event listeners to prevent memory leaks
        this.queue.removeAllListeners();
        await this.queue.close();
        this.queue = null;
      }

      if (this.deadLetterQueue) {
        // Remove all event listeners from dead letter queue
        this.deadLetterQueue.removeAllListeners();
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
    const startTime = Date.now();
    
    if (!this.queue) {
      this.logger.error('🔧 QUEUE: Cannot add job - service not started', {
        component: 'queue-service',
        operation: 'addJob',
        jobType: type,
        error: 'QueueService not started',
      });
      throw new Error('QueueService not started');
    }

    try {
      // Capture current correlation ID to pass to job
      const correlationId = getCorrelationId();
      
      this.logger.debug('🔧 QUEUE: Adding job to queue', {
        component: 'queue-service',
        operation: 'addJob',
        jobType: type,
        correlationId,
        dataSize: JSON.stringify(data).length,
        options: {
          priority: options.priority,
          delay: options.delay,
          attempts: options.attempts,
        },
      });
      
      const jobData = {
        ...data,
        _correlationId: correlationId,
      };

      // Get job-specific retry strategy
      const retryStrategy = config.queue.retryStrategies[type as keyof typeof config.queue.retryStrategies];
      
      this.logger.debug('🔧 QUEUE: Applying retry strategy', {
        component: 'queue-service',
        operation: 'addJob',
        jobType: type,
        retryStrategy: retryStrategy ? 'custom' : 'default',
        retryConfig: retryStrategy,
      });
      
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

      const addDuration = Date.now() - startTime;
      
      this.logger.info('✅ QUEUE: Job added successfully', {
        component: 'queue-service',
        operation: 'addJob',
        jobId: job.id,
        jobType: type,
        priority: options.priority,
        delay: options.delay,
        attempts: jobOptions.attempts,
        addDuration,
        queueLength: await this.queue.count(),
      });

      return queueJob;

    } catch (error) {
      const addDuration = Date.now() - startTime;
      this.logger.error('❌ QUEUE: Failed to add job to queue', {
        component: 'queue-service',
        operation: 'addJob',
        jobType: type,
        error: (error as Error).message,
        addDuration,
        correlationId: getCorrelationId(),
      });
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
      this.logger.warn('🔧 QUEUE: Cannot setup event listeners - queue not available', {
        component: 'queue-service',
        operation: 'setupEventListeners',
      });
      return;
    }

    this.logger.info('🔧 QUEUE: Setting up comprehensive event listeners', {
      component: 'queue-service',
      operation: 'setupEventListeners',
      queueName: this.queue.name,
    });

    // Job completion events
    this.queue.on('completed', (job: Job, result: any) => {
      this.logger.info('✅ QUEUE: Job completed successfully', {
        component: 'queue-service',
        event: 'completed',
        jobId: job.id,
        jobType: job.name,
        priority: job.opts?.priority,
        attempts: job.attemptsMade,
        processedOn: new Date(job.processedOn || Date.now()).toISOString(),
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : undefined,
        resultKeys: result ? Object.keys(result) : [],
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('failed', (job: Job, error: Error) => {
      this.logger.error('❌ QUEUE: Job failed', {
        component: 'queue-service',
        event: 'failed',
        jobId: job.id,
        jobType: job.name,
        priority: job.opts?.priority,
        attempts: job.attemptsMade,
        maxAttempts: job.opts?.attempts,
        error: error.message,
        errorStack: error.stack,
        failedReason: job.failedReason,
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
        failedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
        correlationId: job.data._correlationId,
        willRetry: job.attemptsMade < (job.opts?.attempts || 3),
      });

      // If this is the final failure, move to dead letter queue
      if (job.attemptsMade >= (job.opts?.attempts || 3) && this.deadLetterQueue) {
        this.deadLetterQueue.add('failed-job', {
          originalJobId: job.id,
          jobType: job.name,
          jobData: job.data,
          error: error.message,
          attempts: job.attemptsMade,
          failedAt: new Date().toISOString(),
        });

        this.logger.warn('🔄 QUEUE: Moving failed job to dead letter queue', {
          component: 'queue-service',
          event: 'deadLetter',
          jobId: job.id,
          jobType: job.name,
          finalAttempt: job.attemptsMade,
          maxAttempts: job.opts?.attempts,
        });
      }
    });

    this.queue.on('stalled', (job: Job) => {
      this.logger.warn('⚠️ QUEUE: Job stalled (taking too long)', {
        component: 'queue-service',
        event: 'stalled',
        jobId: job.id,
        jobType: job.name,
        priority: job.opts?.priority,
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
        stallDuration: job.processedOn ? Date.now() - job.processedOn : undefined,
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('progress', (job: Job, progress: any) => {
      this.logger.debug('🔄 QUEUE: Job progress update', {
        component: 'queue-service',
        event: 'progress',
        jobId: job.id,
        jobType: job.name,
        progress,
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('active', (job: Job) => {
      this.logger.debug('▶️ QUEUE: Job started processing', {
        component: 'queue-service',
        event: 'active',
        jobId: job.id,
        jobType: job.name,
        priority: job.opts?.priority,
        attempts: job.attemptsMade,
        startedAt: new Date().toISOString(),
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('waiting', (job: Job) => {
      this.logger.debug('⏳ QUEUE: Job waiting in queue', {
        component: 'queue-service',
        event: 'waiting',
        jobId: job.id,
        jobType: job.name,
        priority: job.opts?.priority,
        delay: job.opts?.delay,
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('delayed', (job: Job) => {
      this.logger.debug('⏰ QUEUE: Job delayed', {
        component: 'queue-service',
        event: 'delayed',
        jobId: job.id,
        jobType: job.name,
        delay: job.opts?.delay,
        delayedUntil: job.opts?.delay ? new Date(Date.now() + job.opts.delay).toISOString() : undefined,
        correlationId: job.data._correlationId,
      });
    });

    this.queue.on('removed', (job: Job) => {
      this.logger.debug('🗑️ QUEUE: Job removed from queue', {
        component: 'queue-service',
        event: 'removed',
        jobId: job.id,
        jobType: job.name,
        correlationId: job.data._correlationId,
      });
    });

    // Queue-level events
    this.queue.on('error', (error: Error) => {
      this.logger.error('❌ QUEUE: Queue system error', {
        component: 'queue-service',
        event: 'error',
        error: error.message,
        errorStack: error.stack,
        queueName: this.queue?.name,
        timestamp: new Date().toISOString(),
      });
    });

    this.queue.on('paused', () => {
      this.logger.warn('⏸️ QUEUE: Queue paused', {
        component: 'queue-service',
        event: 'paused',
        queueName: this.queue?.name,
        timestamp: new Date().toISOString(),
      });
    });

    this.queue.on('resumed', () => {
      this.logger.info('▶️ QUEUE: Queue resumed', {
        component: 'queue-service',
        event: 'resumed',
        queueName: this.queue?.name,
        timestamp: new Date().toISOString(),
      });
    });

    this.queue.on('cleaned', (jobs: Job[], jobType: string) => {
      this.logger.info('🧹 QUEUE: Jobs cleaned from queue', {
        component: 'queue-service',
        event: 'cleaned',
        cleanedCount: jobs.length,
        jobType,
        queueName: this.queue?.name,
        timestamp: new Date().toISOString(),
      });
    });

    // Dead Letter Queue events if available
    if (this.deadLetterQueue) {
      this.deadLetterQueue.on('completed', (job: Job) => {
        this.logger.info('🔄 DEAD_LETTER: Dead letter job processed', {
          component: 'queue-service',
          event: 'deadLetterCompleted',
          jobId: job.id,
          originalJobId: job.data.originalJobId,
          originalJobType: job.data.jobType,
        });
      });

      this.deadLetterQueue.on('failed', (job: Job, error: Error) => {
        this.logger.error('❌ DEAD_LETTER: Dead letter job failed', {
          component: 'queue-service',
          event: 'deadLetterFailed',
          jobId: job.id,
          originalJobId: job.data.originalJobId,
          originalJobType: job.data.jobType,
          error: error.message,
        });
      });
    }

    this.logger.info('✅ QUEUE: Event listeners setup complete', {
      component: 'queue-service',
      operation: 'setupEventListeners',
      eventsRegistered: [
        'completed', 'failed', 'stalled', 'progress', 'active', 
        'waiting', 'delayed', 'removed', 'error', 'paused', 
        'resumed', 'cleaned',
      ],
      deadLetterQueueEvents: !!this.deadLetterQueue,
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

  /**
   * Convenience method to schedule block domain processing
   * Phase 1: Queue Integration - New method for block domain processing
   */
  async scheduleBlockDomainProcessing(blockData: any): Promise<QueueJob> {
    return this.addJob(JobType.PROCESS_BLOCK_DOMAINS, { blockData }, {
      priority: JobPriority.HIGH,
      attempts: 3,
    });
  }

  // ==================== Phase 3: Enhanced Queue Features ====================

  /**
   * Schedule block domain processing with intelligent priority calculation
   * Phase 3: Priority-Based Block Processing
   */
  async scheduleBlockDomainProcessingWithPriority(
    blockData: any, 
    priority?: JobPriority
  ): Promise<QueueJob> {
    const startTime = Date.now();
    
    logger.debug('🔧 QUEUE: Scheduling block with priority calculation', {
      component: 'queue-service',
      operation: 'scheduleWithPriority',
      blockNumber: blockData.number,
      manualPriority: priority,
    });

    let calculatedPriority = priority;
    
    // Calculate priority automatically if not provided and auto-calculation is enabled
    if (!priority) {
      try {
        const config = await import('../../../config');
        if (config.default.queueProcessing.blockDomains.priorityAssignment === 'auto') {
          // We need to get the CoreProcessors instance to calculate priority
          // For now, use a simple heuristic based on block characteristics
          calculatedPriority = this.calculateSimplePriority(blockData);
          
          logger.info('🎯 QUEUE: Auto-calculated block priority', {
            component: 'queue-service',
            operation: 'priorityCalculation',
            blockNumber: blockData.number,
            calculatedPriority,
            extrinsicsCount: blockData.extrinsics?.length || 0,
            reason: 'auto_calculation',
          });
        } else {
          calculatedPriority = JobPriority.MEDIUM; // Default
        }
      } catch (error) {
        logger.warn('⚠️ QUEUE: Failed to calculate priority, using default', {
          component: 'queue-service',
          operation: 'priorityCalculation',
          blockNumber: blockData.number,
          error: (error as Error).message,
          fallbackPriority: JobPriority.MEDIUM,
        });
        calculatedPriority = JobPriority.MEDIUM;
      }
    }

    const job = await this.addJob(JobType.PROCESS_BLOCK_DOMAINS, { blockData }, {
      priority: calculatedPriority,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    const duration = Date.now() - startTime;
    
    logger.info('✅ QUEUE: Block scheduled with priority', {
      component: 'queue-service',
      operation: 'scheduleWithPriority',
      jobId: job.id,
      blockNumber: blockData.number,
      priority: calculatedPriority,
      schedulingDuration: duration,
    });

    return job;
  }

  /**
   * Simple priority calculation based on block characteristics
   * This is a fallback when CoreProcessors is not available
   */
  private calculateSimplePriority(blockData: any): JobPriority {
    const extrinsicsCount = blockData.extrinsics?.length || 0;
    const eventsCount = blockData.events?.length || 0;
    
    // Simple heuristics
    if (extrinsicsCount > 100 || eventsCount > 200) {
      return JobPriority.CRITICAL;
    }
    
    if (extrinsicsCount > 50 || eventsCount > 100) {
      return JobPriority.HIGH;
    }
    
    return JobPriority.MEDIUM;
  }

  /**
   * Schedule batch of blocks with optimized processing order
   * Phase 3: Batch Optimization
   */
  async scheduleBlockBatch(blocks: any[]): Promise<QueueJob[]> {
    const startTime = Date.now();
    
    logger.info('🔧 QUEUE: Scheduling block batch', {
      component: 'queue-service',
      operation: 'scheduleBlockBatch',
      batchSize: blocks.length,
      blockRange: blocks.length > 0 ? `${blocks[0].number}-${blocks[blocks.length - 1].number}` : 'empty',
    });

    try {
      // Optimize batch processing order
      const optimizedBlocks = await this.optimizeBatchOrder(blocks);
      
      // Schedule all blocks in parallel
      const jobs = await Promise.all(
        optimizedBlocks.map(block => this.scheduleBlockDomainProcessingWithPriority(block))
      );

      const duration = Date.now() - startTime;
      
      logger.info('✅ QUEUE: Block batch scheduled successfully', {
        component: 'queue-service',
        operation: 'scheduleBlockBatch',
        batchSize: blocks.length,
        jobsCreated: jobs.length,
        batchDuration: duration,
        jobIds: jobs.map(j => j.id),
      });

      return jobs;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ QUEUE: Failed to schedule block batch', {
        component: 'queue-service',
        operation: 'scheduleBlockBatch',
        batchSize: blocks.length,
        error: (error as Error).message,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Optimize the order of blocks in a batch for better processing efficiency
   */
  private async optimizeBatchOrder(blocks: any[]): Promise<any[]> {
    const config = await import('../../../config');
    
    if (!config.default.queueProcessing.blockDomains.optimization.enableBatchOptimization) {
      return blocks; // Return original order if optimization disabled
    }

    logger.debug('🔧 QUEUE: Optimizing batch order', {
      component: 'queue-service',
      operation: 'optimizeBatchOrder',
      originalOrder: blocks.map(b => b.number),
    });

    // Group blocks by complexity
    const simpleBlocks = [];
    const complexBlocks = [];
    const criticalBlocks = [];

    for (const block of blocks) {
      const priority = this.calculateSimplePriority(block);
      
      if (priority === JobPriority.CRITICAL) {
        criticalBlocks.push(block);
      } else if (priority === JobPriority.HIGH) {
        complexBlocks.push(block);
      } else {
        simpleBlocks.push(block);
      }
    }

    // Process critical blocks first, then complex, then simple
    const optimizedOrder = [...criticalBlocks, ...complexBlocks, ...simpleBlocks];
    
    logger.debug('✅ QUEUE: Batch order optimized', {
      component: 'queue-service',
      operation: 'optimizeBatchOrder',
      optimizedOrder: optimizedOrder.map(b => b.number),
      distribution: {
        critical: criticalBlocks.length,
        complex: complexBlocks.length,
        simple: simpleBlocks.length,
      },
    });

    return optimizedOrder;
  }

  /**
   * Get queue health metrics for monitoring
   * Phase 3: Health Monitoring
   */
  async getQueueHealthMetrics(): Promise<{
    queueStats: any;
    processingRate: number;
    failureRate: number;
    avgProcessingTime: number;
    systemLoad: any;
    alerts: string[];
  }> {
    try {
      const stats = await this.getStats();
      const queueLength = await this.queue?.count() || 0;
      
      // Calculate processing rate (jobs per minute)
      const totalJobs = stats.completed + stats.failed;
      const processingRate = totalJobs > 0 ? (stats.completed / totalJobs) * 60 : 0;
      
      // Calculate failure rate
      const failureRate = totalJobs > 0 ? stats.failed / totalJobs : 0;
      
      // System load metrics
      const systemLoad = {
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        queueLength,
      };
      
      // Generate alerts based on thresholds
      const config = await import('../../../config');
      const thresholds = config.default.queueProcessing.blockDomains.monitoring.alertThresholds;
      const alerts: string[] = [];
      
      if (queueLength > thresholds.queueBacklog) {
        alerts.push(`Queue backlog high: ${queueLength} jobs`);
      }
      
      if (failureRate > thresholds.failureRate) {
        alerts.push(`Failure rate high: ${(failureRate * 100).toFixed(2)}%`);
      }
      
      return {
        queueStats: stats,
        processingRate,
        failureRate,
        avgProcessingTime: 0, // TODO: Calculate from job history
        systemLoad,
        alerts,
      };
    } catch (error) {
      logger.error('❌ QUEUE: Failed to get health metrics', {
        component: 'queue-service',
        operation: 'getQueueHealthMetrics',
        error: (error as Error).message,
      });
      
      throw error;
    }
  }
}

// Factory function for dependency injection
export const createQueueService = (): QueueService => {
  return new QueueService();
};