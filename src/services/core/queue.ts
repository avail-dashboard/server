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
  JobPriority,
  DeadLetterJob,
} from '../types/service';

// Service Integration Architecture - John's Implementation
interface JobProcessorDependencies {
  selfHealingBlockProcessor?: any;
  analyticsService?: any;
  blockService?: any;
  serviceFactory?: any;
  // Phase 2: Dependency Management Services
  dependencyDetectionEngine?: any;
  missingDataResolver?: any;
}

interface ErrorClassification {
  isRetryable: boolean;
  retryDelay?: number;
  category: 'network' | 'service' | 'data' | 'system';
  alertLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Phase 2: Dependency Job Data Interfaces - Adam's Implementation
interface DependencyDetectionJobData {
  entityType: 'block' | 'account' | 'rollup' | 'validator';
  entityId: string;
  priority?: number;
}

interface DependencyResolutionJobData {
  dependencyType: string;
  dependencyId: string;
  entityType: string;
  entityId: string;
  priority: number;
}

interface DependencyBatchResolutionJobData {
  dependencies: Array<{
    dependencyType: string;
    dependencyId: string;
    entityType: string;
    entityId: string;
  }>;
  batchSize?: number;
}

/**
 * QueueService - Background job processing with Bull queue
 * 
 * Features:
 * - Bull queue integration
 * - Job scheduling and processing
 * - Background task coordination
 * - Retry mechanisms with exponential backoff
 * - Health monitoring
 * - Service Integration Architecture (John's Implementation)
 */
export class QueueService implements QueueServiceInterface {
  private queue: Queue | null = null;
  private deadLetterQueue: Queue | null = null;
  private redis: Redis | null = null;
  private isStarted = false;
  private logger = logger;
  private jobProcessors: Map<string, (job: Job) => Promise<any>> = new Map();
  private dependencies: JobProcessorDependencies = {};

  constructor() {
    this.setupJobProcessors();
  }

  /**
   * Initialize service dependencies for job processors
   * Called by ServiceFactory after all services are ready
   */
  initializeDependencies(dependencies: JobProcessorDependencies): void {
    this.dependencies = dependencies;
    this.logger.info('QueueService: Dependencies initialized', {
      component: 'queue-service',
      availableDependencies: Object.keys(dependencies),
    });
  }

  /**
   * Get service instance with error handling
   * Pattern for Adam to follow in his processor implementations
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
   * Calculate Enhanced Exponential Backoff - John's Implementation
   * Integrates Adam's retry strategies with Bull queue processing
   */
  private calculateExponentialBackoff(retryStrategy: any, fallbackConfig: any): any {
    if (!retryStrategy) {
      return fallbackConfig;
    }

    // Enhanced exponential backoff with jitter support
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
   * Error Classification Framework - John's Implementation
   * Adam should use this in his processor implementations
   */
  private classifyError(error: Error, _jobType: string): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    // Network-related errors (retryable)
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('connection') || 
        errorMessage.includes('network') ||
        errorMessage.includes('econnreset')) {
      return {
        isRetryable: true,
        retryDelay: 5000,
        category: 'network',
        alertLevel: 'medium',
      };
    }
    
    // Service unavailable errors (retryable with backoff)
    if (errorMessage.includes('service unavailable') ||
        errorMessage.includes('temporarily unavailable') ||
        errorMessage.includes('rate limit')) {
      return {
        isRetryable: true,
        retryDelay: 10000,
        category: 'service',
        alertLevel: 'medium',
      };
    }
    
    // Data validation errors (not retryable)
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid data') ||
        errorMessage.includes('malformed')) {
      return {
        isRetryable: false,
        category: 'data',
        alertLevel: 'high',
      };
    }
    
    // System errors (analyze further)
    if (errorMessage.includes('out of memory') ||
        errorMessage.includes('disk full')) {
      return {
        isRetryable: false,
        category: 'system',
        alertLevel: 'critical',
      };
    }
    
    // Default: retryable with caution
    return {
      isRetryable: true,
      retryDelay: 3000,
      category: 'system',
      alertLevel: 'medium',
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

      // Create Dead Letter Queue
      this.deadLetterQueue = new Bull('avail-explorer-dead-letter', {
        redis: {
          port: this.redis.options.port || 6379,
          host: this.redis.options.host || 'localhost',
          db: config.redis.queueDb,
        },
        defaultJobOptions: {
          removeOnComplete: 50, // Keep more dead letter jobs for inspection
          removeOnFail: 0, // Never remove failed dead letter jobs
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
   * @param type Job type identifier
   * @param data Job data payload
   * @param options Job options including priority and retry strategy overrides
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

      // Get job-specific retry strategy
      const retryStrategy = config.queue.retryStrategies[type as keyof typeof config.queue.retryStrategies];
      
      // Enhanced job options with John's exponential backoff integration
      const jobOptions: JobOptions = {
        priority: options.priority || JobPriority.MEDIUM,
        delay: options.delay || 0,
        attempts: options.attempts || 3, // Simplified: use default attempts instead of accessing non-existent maxRetries
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
   * Add a critical priority job to the queue
   * Critical jobs process before all others (dependencies, core data)
   */
  async addCriticalJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.CRITICAL });
  }

  /**
   * Add a high priority job to the queue
   * High priority jobs process before medium and low (block processing)
   */
  async addHighPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.HIGH });
  }

  /**
   * Add a medium priority job to the queue
   * Medium priority is the default (standard processing)
   */
  async addMediumPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.MEDIUM });
  }

  /**
   * Add a low priority job to the queue
   * Low priority jobs process last (analytics, cleanup)
   */
  async addLowPriorityJob<T>(type: string, data: T, options: JobOptions = {}): Promise<QueueJob<T>> {
    return this.addJob(type, data, { ...options, priority: JobPriority.LOW });
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
    // BLOCK_INDEXING processor - TASK-012 Simplified with Fail-Fast Pattern
    // Simple block processing with fail-fast dependency validation
    this.jobProcessors.set(JobType.BLOCK_INDEXING, async (job: Job) => {
      const { blockNumber } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing block indexing job', { 
        component: 'queue-service',
        jobId: job.id, 
        blockNumber,
      });
      
      try {
        // Get required services
        const blockService = await this.getService<any>('blockService');
        const availBlockchain = await this.getService<any>('availBlockchain');
        
        // Simple validation - fail fast if block already exists
        const existingBlock = await blockService.getBlockByNumber(blockNumber);
        if (existingBlock) {
          this.logger.debug('Block already indexed, skipping', { blockNumber });
          return {
            success: true,
            data: { blockNumber, status: 'already_exists' },
            metrics: { duration: Date.now() - startTime },
          };
        }
        
        // Fetch and process block data
        const blockData = await availBlockchain.getBlockByNumber(blockNumber);
        if (!blockData) {
          throw new Error(`Block ${blockNumber} not found on blockchain`);
        }
        
        // Simple block indexing without complex dependency orchestration
        await blockService.indexBlock(blockData);
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Block indexing completed successfully', {
          component: 'queue-service',
          jobId: job.id,
          blockNumber,
          duration,
          entitiesProcessed: blockData.extrinsics?.length || 0,
        });
        
        return {
          success: true,
          data: {
            blockNumber,
            blockHash: blockData.hash,
            extrinsicsCount: blockData.extrinsics?.length || 0,
            timestamp: blockData.timestamp,
          },
          metrics: {
            duration,
            entitiesProcessed: blockData.extrinsics?.length || 0,
            processingRate: (blockData.extrinsics?.length || 0) / (duration / 1000),
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, JobType.BLOCK_INDEXING);
        const duration = Date.now() - startTime;
        
        this.logger.error('Block indexing failed', {
          component: 'queue-service',
          jobId: job.id,
          blockNumber,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        // Log non-retryable errors for immediate attention
        if (!classification.isRetryable) {
          this.logger.error('BLOCK_INDEXING permanent failure', { 
            blockNumber, 
            error: (error as Error).message,
            alertLevel: classification.alertLevel,
          });
        }
        
        throw error;
      }
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

    // ==================== Phase 2: Simplified Dependency Processors - TASK-010 Implementation ====================
    
    // DEPENDENCY_DETECTION processor - TASK-012 Simplified with Fail-Fast Pattern  
    this.jobProcessors.set(JobType.DEPENDENCY_DETECTION, async (job: Job<DependencyDetectionJobData>) => {
      const { entityType, entityId, priority = 1 } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing dependency detection job', { 
        component: 'queue-service',
        jobId: job.id, 
        entityType,
        entityId,
        priority,
      });
      
      try {
        // Simple validation - fail fast if required dependencies missing
        let dependenciesQueued = 0;
        
        // Check entity-specific dependencies with fail-fast pattern
        switch (entityType) {
        case 'block':
          // For blocks, check if parent block exists (if not block 0)
          if (parseInt(entityId, 10) > 0) {
            const blockService = await this.getService<any>('blockService');
            const parentBlockNumber = parseInt(entityId, 10) - 1;
            const parentBlock = await blockService.getBlockByNumber(parentBlockNumber);
            if (!parentBlock) {
              await this.addJob(JobType.ENSURE_BLOCK, { blockNumber: parentBlockNumber }, { priority: JobPriority.CRITICAL });
              dependenciesQueued++;
              throw new Error(`Parent block ${parentBlockNumber} not found - queued for creation`);
            }
          }
          break;
        case 'account':
          // For accounts, no specific dependencies required - they can be created independently
          break;
        case 'rollup':
          // For rollups, no specific dependencies required - they can be created independently  
          break;
        case 'validator':
          // For validators, no specific dependencies required - they can be created independently
          break;
        default:
          throw new Error(`Unsupported entity type: ${entityType}`);
        }
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Dependency detection completed successfully', {
          component: 'queue-service',
          jobId: job.id,
          entityType,
          entityId,
          dependenciesQueued,
          duration,
        });
        
        return {
          success: true,
          data: {
            entityType,
            entityId,
            dependenciesQueued,
            status: dependenciesQueued > 0 ? 'dependencies_queued' : 'no_dependencies_required',
          },
          metrics: {
            duration,
            dependenciesQueued,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, JobType.DEPENDENCY_DETECTION);
        const duration = Date.now() - startTime;
        
        this.logger.error('Dependency detection failed', {
          component: 'queue-service',
          jobId: job.id,
          entityType,
          entityId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // DEPENDENCY_RESOLUTION processor - TASK-012 Simplified with Fail-Fast Pattern
    this.jobProcessors.set(JobType.DEPENDENCY_RESOLUTION, async (job: Job<DependencyResolutionJobData>) => {
      const { dependencyType, dependencyId, entityType, entityId, priority } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing dependency resolution job', { 
        component: 'queue-service',
        jobId: job.id, 
        dependencyType,
        dependencyId,
        entityType,
        entityId,
        priority,
      });
      
      try {
        // Simple fail-fast resolution - queue appropriate ENSURE_* job
        let ensureJobQueued = false;
        
        switch (dependencyType) {
        case 'block':
          await this.addJob(JobType.ENSURE_BLOCK, { blockNumber: parseInt(dependencyId, 10) }, { priority: JobPriority.CRITICAL });
          ensureJobQueued = true;
          break;
        case 'account':
          await this.addJob(JobType.ENSURE_ACCOUNT, { address: dependencyId }, { priority: JobPriority.HIGH });
          ensureJobQueued = true;
          break;
        case 'validator':
          await this.addJob(JobType.ENSURE_VALIDATOR, { address: dependencyId }, { priority: JobPriority.HIGH });
          ensureJobQueued = true;
          break;
        case 'rollup':
          await this.addJob(JobType.ENSURE_ROLLUP, { appId: parseInt(dependencyId, 10) }, { priority: JobPriority.MEDIUM });
          ensureJobQueued = true;
          break;
        default:
          throw new Error(`Unsupported dependency type: ${dependencyType}`);
        }
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Dependency resolution completed - ENSURE job queued', {
          component: 'queue-service',
          jobId: job.id,
          dependencyType,
          dependencyId,
          entityType,
          entityId,
          ensureJobQueued,
          duration,
        });
        
        return {
          success: true,
          data: {
            dependencyType,
            dependencyId,
            entityType,
            entityId,
            ensureJobQueued,
            status: 'ensure_job_queued',
          },
          metrics: {
            duration,
            ensureJobQueued,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, JobType.DEPENDENCY_RESOLUTION);
        const duration = Date.now() - startTime;
        
        this.logger.error('Dependency resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          dependencyType,
          dependencyId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // DEPENDENCY_BATCH_RESOLUTION processor - Simplified batch processing
    this.jobProcessors.set(JobType.DEPENDENCY_BATCH_RESOLUTION, async (job: Job<DependencyBatchResolutionJobData>) => {
      const { dependencies, batchSize = 10 } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing dependency batch resolution job', { 
        component: 'queue-service',
        jobId: job.id, 
        dependencyCount: dependencies.length,
        batchSize,
      });
      
      try {
        // Get missing data resolver service
        const missingDataResolver = await this.getService<any>('missingDataResolver');
        
        // Convert to MissingDependency format for batch processing
        const missingDependencies = dependencies.map(dep => ({
          entityType: dep.dependencyType,
          entityId: dep.dependencyId,
          requiredBy: dep.entityId,
          priority: 2, // Default to HIGH priority
          discoveredAt: new Date(),
        }));
        
        // Resolve dependencies in batch using simplified logic
        const batchResolution = await missingDataResolver.resolveBatch(missingDependencies);
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Dependency batch resolution completed', {
          component: 'queue-service',
          jobId: job.id,
          batchId: batchResolution.batchId,
          totalDependencies: batchResolution.totalDependencies,
          resolvedCount: batchResolution.resolvedCount,
          failedCount: batchResolution.failedCount,
          efficiency: `${batchResolution.efficiency.toFixed(2)}%`,
          duration,
          totalTime: batchResolution.totalTime,
        });
        
        return {
          success: batchResolution.resolvedCount > 0,
          data: {
            batchResolution,
            processedCount: dependencies.length,
          },
          metrics: {
            duration,
            totalTime: batchResolution.totalTime,
            resolvedCount: batchResolution.resolvedCount,
            failedCount: batchResolution.failedCount,
            efficiency: batchResolution.efficiency,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, JobType.DEPENDENCY_BATCH_RESOLUTION);
        const duration = Date.now() - startTime;
        
        this.logger.error('Dependency batch resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          dependencyCount: dependencies.length,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // ==================== Phase 3: TASK-012 Simple Dependency Creation Processors ====================
    
    // ENSURE_BLOCK processor - Simple block creation
    this.jobProcessors.set(JobType.ENSURE_BLOCK, async (job: Job) => {
      const { blockNumber } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing ensure block job', { 
        component: 'queue-service',
        jobId: job.id, 
        blockNumber,
      });
      
      try {
        const blockService = await this.getService<any>('blockService');
        const blockchain = await this.getService<any>('availBlockchain');
        
        // Check if block already exists
        const existingBlock = await blockService.getBlockByNumber(blockNumber);
        if (existingBlock) {
          this.logger.debug('Block already exists', { blockNumber });
          return { success: true, created: false, message: 'Block already exists' };
        }
        
        // Fetch from blockchain and create
        const blockData = await blockchain.getBlockByNumber(blockNumber);
        if (blockData) {
          await blockService.createBlock(blockData);
          const duration = Date.now() - startTime;
          
          this.logger.info('Block created successfully', {
            component: 'queue-service',
            jobId: job.id,
            blockNumber,
            duration,
          });
          
          return { success: true, created: true, blockData, duration };
        } else {
          throw new Error(`Block ${blockNumber} not found on blockchain`);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        this.logger.error('Block creation failed', {
          component: 'queue-service',
          jobId: job.id,
          blockNumber,
          error: (error as Error).message,
          duration,
        });
        throw error;
      }
    });

    // ENSURE_ACCOUNT processor - Simple account creation
    this.jobProcessors.set(JobType.ENSURE_ACCOUNT, async (job: Job) => {
      const { address } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing ensure account job', { 
        component: 'queue-service',
        jobId: job.id, 
        address,
      });
      
      try {
        const accountService = await this.getService<any>('accountService');
        const blockchain = await this.getService<any>('availBlockchain');
        
        // Check if account already exists
        const existingAccount = await accountService.getAccount(address);
        if (existingAccount) {
          this.logger.debug('Account already exists', { address });
          return { success: true, created: false, message: 'Account already exists' };
        }
        
        // Fetch from blockchain and create (or create empty account)
        const accountData = await blockchain.getAccount(address).catch(() => null);
        await accountService.createAccount({
          address,
          balance: accountData?.balance || '0',
          nonce: accountData?.nonce || 0,
          createdAt: new Date(),
        });
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Account created successfully', {
          component: 'queue-service',
          jobId: job.id,
          address,
          duration,
        });
        
        return { success: true, created: true, accountData, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        this.logger.error('Account creation failed', {
          component: 'queue-service',
          jobId: job.id,
          address,
          error: (error as Error).message,
          duration,
        });
        throw error;
      }
    });

    // ENSURE_ROLLUP processor - Simple rollup creation
    this.jobProcessors.set(JobType.ENSURE_ROLLUP, async (job: Job) => {
      const { appId } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing ensure rollup job', { 
        component: 'queue-service',
        jobId: job.id, 
        appId,
      });
      
      try {
        const dataAvailabilityService = await this.getService<any>('dataAvailabilityService');
        const blockchain = await this.getService<any>('availBlockchain');
        
        // Check if rollup already exists
        const existingRollup = await dataAvailabilityService.getRollupInfo(appId);
        if (existingRollup) {
          this.logger.debug('Rollup already exists', { appId });
          return { success: true, created: false, message: 'Rollup already exists' };
        }
        
        // Fetch from blockchain and create (or create basic rollup)
        const rollupData = await blockchain.getRollupInfo(appId).catch(() => null);
        await dataAvailabilityService.createRollup({
          appId,
          name: rollupData?.name || `Rollup ${appId}`,
          description: rollupData?.description || 'Auto-created rollup',
          createdAt: new Date(),
        });
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Rollup created successfully', {
          component: 'queue-service',
          jobId: job.id,
          appId,
          duration,
        });
        
        return { success: true, created: true, rollupData, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        this.logger.error('Rollup creation failed', {
          component: 'queue-service',
          jobId: job.id,
          appId,
          error: (error as Error).message,
          duration,
        });
        throw error;
      }
    });

    // ENSURE_VALIDATOR processor - Simple validator creation
    this.jobProcessors.set(JobType.ENSURE_VALIDATOR, async (job: Job) => {
      const { address } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing ensure validator job', { 
        component: 'queue-service',
        jobId: job.id, 
        address,
      });
      
      try {
        const validatorService = await this.getService<any>('validatorService');
        const blockchain = await this.getService<any>('availBlockchain');
        
        // Check if validator already exists
        const existingValidator = await validatorService.getValidator(address);
        if (existingValidator) {
          this.logger.debug('Validator already exists', { address });
          return { success: true, created: false, message: 'Validator already exists' };
        }
        
        // Fetch from blockchain and create
        const validatorData = await blockchain.getValidator(address).catch(() => null);
        if (validatorData) {
          await validatorService.createValidator(validatorData);
        } else {
          // Create basic validator entry
          await validatorService.createValidator({
            address,
            isActive: false,
            createdAt: new Date(),
          });
        }
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Validator created successfully', {
          component: 'queue-service',
          jobId: job.id,
          address,
          duration,
        });
        
        return { success: true, created: true, validatorData, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        this.logger.error('Validator creation failed', {
          component: 'queue-service',
          jobId: job.id,
          address,
          error: (error as Error).message,
          duration,
        });
        throw error;
      }
    });

    this.logger.info('QueueService: Job processors setup completed', {
      component: 'queue-service',
      totalProcessors: this.jobProcessors.size,
      dependencyProcessors: ['DEPENDENCY_DETECTION', 'DEPENDENCY_RESOLUTION', 'DEPENDENCY_BATCH_RESOLUTION'],
      ensureProcessors: ['ENSURE_BLOCK', 'ENSURE_ACCOUNT', 'ENSURE_ROLLUP', 'ENSURE_VALIDATOR'],
    });
  }

  /**
   * Helper methods for Phase 2 dependency resolution
   */
  private getDependencyResolutionJobType(entityType: string): string {
    switch (entityType) {
    case 'block':
      return 'RESOLVE_MISSING_BLOCK';
    case 'account':
    case 'validator':
      return 'RESOLVE_MISSING_ACCOUNT';
    case 'rollup':
      return 'RESOLVE_MISSING_ROLLUP';
    default:
      throw new Error(`Unsupported dependency entity type: ${entityType}`);
    }
  }

  private mapDependencyPriorityToJobPriority(dependencyPriority: number): number {
    // Map dependency priority (1-4) to job priority
    switch (dependencyPriority) {
    case 1: // CRITICAL
      return JobPriority.CRITICAL;
    case 2: // HIGH
      return JobPriority.HIGH;
    case 3: // MEDIUM
      return JobPriority.MEDIUM;
    case 4: // LOW
    default:
      return JobPriority.LOW;
    }
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

  // ==================== TASK-012 Simple Dependency Creation - Convenience Methods ====================

  /**
   * Ensure a block exists - queue creation if missing
   */
  async ensureBlock(blockNumber: number): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_BLOCK, { blockNumber }, { priority: JobPriority.CRITICAL });
  }

  /**
   * Ensure an account exists - queue creation if missing  
   */
  async ensureAccount(address: string): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_ACCOUNT, { address }, { priority: JobPriority.HIGH });
  }

  /**
   * Ensure a rollup exists - queue creation if missing
   */
  async ensureRollup(appId: number): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_ROLLUP, { appId }, { priority: JobPriority.MEDIUM });
  }

  /**
   * Ensure a validator exists - queue creation if missing
   */
  async ensureValidator(address: string): Promise<QueueJob> {
    return this.addJob(JobType.ENSURE_VALIDATOR, { address }, { priority: JobPriority.HIGH });
  }

  // ==================== Adam's Phase 2 Queue Integration - Convenience Methods ====================

  /**
   * Schedule dependency detection for an entity
   */
  async scheduleDependencyDetection(
    entityType: 'block' | 'account' | 'rollup' | 'validator',
    entityId: string,
    priority = 1,
  ): Promise<QueueJob> {
    return this.addJob(JobType.DEPENDENCY_DETECTION, {
      entityType,
      entityId,
      priority,
    }, { priority: this.mapDependencyPriorityToJobPriority(priority) });
  }

  /**
   * Schedule resolution of a specific dependency
   */
  async scheduleDependencyResolution(
    dependencyType: string,
    dependencyId: string,
    entityType: string,
    entityId: string,
    priority: number,
  ): Promise<QueueJob> {
    return this.addJob(JobType.DEPENDENCY_RESOLUTION, {
      dependencyType,
      dependencyId,
      entityType,
      entityId,
      priority,
    }, { priority: this.mapDependencyPriorityToJobPriority(priority) });
  }

  /**
   * Schedule batch resolution of multiple dependencies
   */
  async scheduleDependencyBatchResolution(
    dependencies: Array<{
      dependencyType: string;
      dependencyId: string;
      entityType: string;
      entityId: string;
    }>,
    batchSize = 10,
  ): Promise<QueueJob> {
    return this.addJob(JobType.DEPENDENCY_BATCH_RESOLUTION, {
      dependencies,
      batchSize,
    }, { priority: JobPriority.HIGH });
  }

  /**
   * Dead Letter Queue Methods
   */

  /**
   * Move a failed job to the dead letter queue
   */
  async moveToDeadLetter(job: Job, finalError: Error): Promise<void> {
    if (!this.deadLetterQueue) {
      this.logger.error('Dead letter queue not available');
      return;
    }

    try {
      const deadLetterJobData: DeadLetterJob = {
        originalJobId: job.id?.toString() || '',
        jobType: job.name,
        jobData: job.data,
        failureReason: finalError.message,
        attemptCount: job.attemptsMade || 0,
        firstFailedAt: new Date(job.processedOn || Date.now()),
        lastFailedAt: new Date(),
        retryStrategy: {
          maxRetries: job.opts.attempts || 3,
          baseDelay: 2000,
          maxDelay: 30000,
          exponentialFactor: 2,
          jitterEnabled: true,
        },
      };

      await this.deadLetterQueue.add('dead-letter-job', deadLetterJobData, {
        removeOnComplete: 50,
        removeOnFail: 0,
      });

      this.logger.warn('Job moved to dead letter queue', {
        originalJobId: job.id,
        jobType: job.name,
        error: finalError.message,
        attempts: job.attemptsMade,
      });

    } catch (error) {
      this.logger.error('Failed to move job to dead letter queue', {
        jobId: job.id,
        error,
      });
    }
  }

  /**
   * Get jobs from dead letter queue
   */
  async getDeadLetterJobs(start = 0, end = -1): Promise<DeadLetterJob[]> {
    if (!this.deadLetterQueue) {
      return [];
    }

    try {
      const jobs = await this.deadLetterQueue.getJobs(['completed', 'failed'], start, end);
      return jobs.map(job => job.data as DeadLetterJob);
    } catch (error) {
      this.logger.error('Failed to get dead letter jobs', { error });
      return [];
    }
  }

  /**
   * Retry a job from dead letter queue
   */
  async retryDeadLetterJob(deadLetterJobId: string): Promise<QueueJob | null> {
    if (!this.deadLetterQueue) {
      this.logger.error('Dead letter queue not available');
      return null;
    }

    try {
      const job = await this.deadLetterQueue.getJob(deadLetterJobId);
      if (!job) {
        this.logger.warn('Dead letter job not found', { deadLetterJobId });
        return null;
      }

      const deadLetterData = job.data as DeadLetterJob;
      
      // Retry the original job with original data
      const retriedJob = await this.addJob(
        deadLetterData.jobType,
        deadLetterData.jobData,
        { priority: JobPriority.HIGH }, // Give retried jobs high priority
      );

      // Remove from dead letter queue
      await job.remove();

      this.logger.info('Dead letter job retried successfully', {
        deadLetterJobId,
        newJobId: retriedJob.id,
        jobType: deadLetterData.jobType,
      });

      return retriedJob;

    } catch (error) {
      this.logger.error('Failed to retry dead letter job', {
        deadLetterJobId,
        error,
      });
      return null;
    }
  }
}

// Factory function for dependency injection
export const createQueueService = (): QueueService => {
  return new QueueService();
}; 