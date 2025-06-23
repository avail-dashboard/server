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
        attempts: options.attempts || retryStrategy?.maxRetries || 3,
        backoff: retryStrategy ? this.calculateExponentialBackoff(retryStrategy, {
          type: 'exponential',
          delay: 2000,
        }) : {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail,
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
    // BLOCK_INDEXING processor - John's Implementation
    // Complex single block processing with dependency handling
    this.jobProcessors.set(JobType.BLOCK_INDEXING, async (job: Job) => {
      const { blockNumber } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing block indexing job', { 
        component: 'queue-service',
        jobId: job.id, 
        blockNumber,
      });
      
      try {
        // Get required services using dependency injection pattern
        const selfHealingBlockProcessor = await this.getService<any>('selfHealingBlockProcessor');
        const blockService = await this.getService<any>('blockService');
        const availBlockchain = await this.getService<any>('availBlockchain');
        
        // Step 1: Fetch block data from blockchain
        const blockData = await availBlockchain.getBlockByNumber(blockNumber);
        if (!blockData) {
          throw new Error(`Block ${blockNumber} not found on blockchain`);
        }
        
        // Step 2: Process block through self-healing architecture
        await selfHealingBlockProcessor.processBlock(blockData);
        
        // Step 3: Ensure block is properly indexed
        const indexedBlock = await blockService.indexBlock(blockData);
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Block indexing completed successfully', {
          component: 'queue-service',
          jobId: job.id,
          blockNumber,
          duration,
          entitiesProcessed: indexedBlock?.extrinsics?.length || 0,
        });
        
        return {
          success: true,
          data: {
            blockNumber,
            blockHash: blockData.hash,
            extrinsicsCount: blockData.extrinsics.length,
            timestamp: blockData.timestamp,
          },
          metrics: {
            duration,
            entitiesProcessed: blockData.extrinsics.length,
            processingRate: blockData.extrinsics.length / (duration / 1000),
          },
        };
        
      } catch (error) {
        // Apply error classification framework
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

    // ==================== Phase 2: Dependency Resolution Processors - John's Implementation ====================
    
    // Dependency Detection Scan processor
    this.jobProcessors.set('DEPENDENCY_DETECTION_SCAN', async (job: Job) => {
      const { entityId, entityType, entityData } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing dependency detection scan', { 
        component: 'queue-service',
        jobId: job.id, 
        entityId,
        entityType,
      });
      
      try {
        // Get dependency detection engine service
        const dependencyDetectionEngine = await this.getService<any>('dependencyDetectionEngine');
        
        // Create processed entity for dependency detection
        const processedEntity = {
          id: entityId,
          type: entityType,
          data: entityData,
          blockNumber: entityData.blockNumber,
          timestamp: new Date(),
        };
        
        // Detect missing dependencies
        const dependencyReport = await dependencyDetectionEngine.detectMissingDependencies(processedEntity);
        
        // If dependencies are missing, queue resolution jobs
        if (dependencyReport.resolutionRequired) {
          const resolutionPlan = await dependencyDetectionEngine.createResolutionStrategy(
            await dependencyDetectionEngine.analyzeDependencyImpact(dependencyReport.missingDependencies),
          );
          
          // Queue dependency batch resolution if batchable
          if (resolutionPlan.batchable) {
            await this.addJob('DEPENDENCY_BATCH_RESOLUTION', {
              planId: resolutionPlan.planId,
              dependencies: resolutionPlan.dependencies,
              resolutionOrder: resolutionPlan.resolutionOrder,
            }, { priority: JobPriority.HIGH });
          } else {
            // Queue individual resolution jobs
            for (const dependency of resolutionPlan.dependencies) {
              const jobType = this.getDependencyResolutionJobType(dependency.entityType);
              await this.addJob(jobType, {
                entityType: dependency.entityType,
                entityId: dependency.entityId,
                priority: dependency.priority,
              }, { priority: this.mapDependencyPriorityToJobPriority(dependency.priority) });
            }
          }
        }
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Dependency detection scan completed', {
          component: 'queue-service',
          jobId: job.id,
          entityId,
          totalMissing: dependencyReport.totalMissing,
          criticalMissing: dependencyReport.criticalMissing,
          duration,
        });
        
        return {
          success: true,
          data: {
            entityId,
            entityType,
            dependencyReport,
            resolutionRequired: dependencyReport.resolutionRequired,
          },
          metrics: {
            duration,
            dependenciesDetected: dependencyReport.totalMissing,
            criticalDependencies: dependencyReport.criticalMissing,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, 'DEPENDENCY_DETECTION_SCAN');
        const duration = Date.now() - startTime;
        
        this.logger.error('Dependency detection scan failed', {
          component: 'queue-service',
          jobId: job.id,
          entityId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // Missing Block Resolution processor
    this.jobProcessors.set('RESOLVE_MISSING_BLOCK', async (job: Job) => {
      const { entityId, priority } = job.data;
      const blockNumber = parseInt(entityId, 10);
      const startTime = Date.now();
      
      this.logger.debug('Processing missing block resolution', { 
        component: 'queue-service',
        jobId: job.id, 
        blockNumber,
        priority,
      });
      
      try {
        // Get missing data resolver service
        const missingDataResolver = await this.getService<any>('missingDataResolver');
        
        // Resolve missing block
        const resolution = await missingDataResolver.resolveBlock(blockNumber);
        
        const duration = Date.now() - startTime;
        
        if (resolution.resolved) {
          this.logger.info('Missing block resolved successfully', {
            component: 'queue-service',
            jobId: job.id,
            blockNumber,
            duration,
            resolutionTime: resolution.resolutionTime,
          });
        } else {
          this.logger.warn('Missing block resolution failed', {
            component: 'queue-service',
            jobId: job.id,
            blockNumber,
            error: resolution.error,
            duration,
          });
        }
        
        return {
          success: resolution.resolved,
          data: {
            blockNumber,
            resolution,
          },
          metrics: {
            duration,
            resolutionTime: resolution.resolutionTime,
            resolved: resolution.resolved,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, 'RESOLVE_MISSING_BLOCK');
        const duration = Date.now() - startTime;
        
        this.logger.error('Missing block resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          blockNumber,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // Missing Account Resolution processor
    this.jobProcessors.set('RESOLVE_MISSING_ACCOUNT', async (job: Job) => {
      const { entityId, priority } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing missing account resolution', { 
        component: 'queue-service',
        jobId: job.id, 
        address: entityId,
        priority,
      });
      
      try {
        // Get missing data resolver service
        const missingDataResolver = await this.getService<any>('missingDataResolver');
        
        // Resolve missing account
        const resolution = await missingDataResolver.resolveAccount(entityId);
        
        const duration = Date.now() - startTime;
        
        if (resolution.resolved) {
          this.logger.info('Missing account resolved successfully', {
            component: 'queue-service',
            jobId: job.id,
            address: entityId,
            duration,
            resolutionTime: resolution.resolutionTime,
          });
        } else {
          this.logger.warn('Missing account resolution failed', {
            component: 'queue-service',
            jobId: job.id,
            address: entityId,
            error: resolution.error,
            duration,
          });
        }
        
        return {
          success: resolution.resolved,
          data: {
            address: entityId,
            resolution,
          },
          metrics: {
            duration,
            resolutionTime: resolution.resolutionTime,
            resolved: resolution.resolved,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, 'RESOLVE_MISSING_ACCOUNT');
        const duration = Date.now() - startTime;
        
        this.logger.error('Missing account resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          address: entityId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // Missing Rollup Resolution processor
    this.jobProcessors.set('RESOLVE_MISSING_ROLLUP', async (job: Job) => {
      const { entityId, priority } = job.data;
      const appId = parseInt(entityId, 10);
      const startTime = Date.now();
      
      this.logger.debug('Processing missing rollup resolution', { 
        component: 'queue-service',
        jobId: job.id, 
        appId,
        priority,
      });
      
      try {
        // Get missing data resolver service
        const missingDataResolver = await this.getService<any>('missingDataResolver');
        
        // Resolve missing rollup
        const resolution = await missingDataResolver.resolveRollup(appId);
        
        const duration = Date.now() - startTime;
        
        if (resolution.resolved) {
          this.logger.info('Missing rollup resolved successfully', {
            component: 'queue-service',
            jobId: job.id,
            appId,
            duration,
            resolutionTime: resolution.resolutionTime,
          });
        } else {
          this.logger.warn('Missing rollup resolution failed', {
            component: 'queue-service',
            jobId: job.id,
            appId,
            error: resolution.error,
            duration,
          });
        }
        
        return {
          success: resolution.resolved,
          data: {
            appId,
            resolution,
          },
          metrics: {
            duration,
            resolutionTime: resolution.resolutionTime,
            resolved: resolution.resolved,
          },
        };
        
      } catch (error) {
        const classification = this.classifyError(error as Error, 'RESOLVE_MISSING_ROLLUP');
        const duration = Date.now() - startTime;
        
        this.logger.error('Missing rollup resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          appId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // Dependency Batch Resolution processor
    this.jobProcessors.set('DEPENDENCY_BATCH_RESOLUTION', async (job: Job) => {
      const { planId, dependencies, resolutionOrder } = job.data;
      const startTime = Date.now();
      
      this.logger.debug('Processing dependency batch resolution', { 
        component: 'queue-service',
        jobId: job.id, 
        planId,
        dependencyCount: dependencies.length,
        resolutionOrder,
      });
      
      try {
        // Get missing data resolver service
        const missingDataResolver = await this.getService<any>('missingDataResolver');
        
        // Resolve dependencies in batch
        const batchResolution = await missingDataResolver.resolveBatch(dependencies);
        
        const duration = Date.now() - startTime;
        
        this.logger.info('Dependency batch resolution completed', {
          component: 'queue-service',
          jobId: job.id,
          planId,
          batchId: batchResolution.batchId,
          resolvedCount: batchResolution.resolvedCount,
          failedCount: batchResolution.failedCount,
          efficiency: `${batchResolution.efficiency.toFixed(2)}%`,
          duration,
          totalTime: batchResolution.totalTime,
        });
        
        return {
          success: batchResolution.resolvedCount > 0,
          data: {
            planId,
            batchResolution,
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
        const classification = this.classifyError(error as Error, 'DEPENDENCY_BATCH_RESOLUTION');
        const duration = Date.now() - startTime;
        
        this.logger.error('Dependency batch resolution failed', {
          component: 'queue-service',
          jobId: job.id,
          planId,
          error: (error as Error).message,
          classification,
          duration,
        });
        
        throw error;
      }
    });

    // ==================== End Phase 2 Processors ====================
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