import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { ErrorClassifier } from '../error-classifier';
import { 
  JobProcessorDependencies, 
  BlockIndexingJobData, 
  DataSyncJobData,
  ValidatorIndexingJobData,
  AccountIndexingJobData,
  TransferIndexingJobData,
} from '../types';
import { BlockchainCallOptimizer } from '../../blockchain/call-optimizer';
import { AdvancedQueueManager } from '../advanced-queue-manager';
import { CircuitBreaker } from '../../monitoring/circuit-breaker';
import { PerformanceMonitor } from '../../monitoring/performance-monitor';

/**
 * Phase 4: Optimized Core Processors
 * 
 * Enhanced processors with performance optimization:
 * - Blockchain call optimization and intelligent caching
 * - Advanced queue management with adaptive concurrency
 * - Circuit breaker protection for error resilience
 * - Comprehensive performance monitoring and alerting
 * - Intelligent retry mechanisms with exponential backoff
 */
export class OptimizedCoreProcessors {
  private callOptimizer: BlockchainCallOptimizer;
  private queueManager: AdvancedQueueManager;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private performanceMonitor: PerformanceMonitor;

  constructor(
    private dependencies: JobProcessorDependencies,
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {
    this.callOptimizer = new BlockchainCallOptimizer();
    this.queueManager = new AdvancedQueueManager();
    this.circuitBreakers = new Map();
    this.performanceMonitor = new PerformanceMonitor();

    this.initializeCircuitBreakers();
  }

  /**
   * BLOCK_INDEXING processor - Phase 4: Optimized with performance monitoring
   */
  async processBlockIndexing(job: Job<BlockIndexingJobData>) {
    const { blockNumber } = job.data;
    const startTime = Date.now();
    const domain = 'block-indexing';
    
    logger.debug('Processing optimized block indexing job', { 
      component: 'optimized-queue-service',
      jobId: job.id, 
      blockNumber,
    });
    
    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreakers.get('blockchain')!.executeWithBreaker(
        domain,
        'indexBlock',
        async () => {
          // Get block indexer with optimized calls
          const blockIndexer = await this.getService<any>('blockIndexer');
          
          // Use optimized blockchain calls
          const blockResult = await this.callOptimizer.optimizeCall(
            'block.byNumber',
            { blockNumber },
            () => blockIndexer.indexBlock(blockNumber),
            { cacheable: false }, // Blocks are immutable but don't cache (large data)
          );
          
          return blockResult;
        },
      );
      
      // Process dependencies with optimization
      if (result.dependentEntities) {
        await this.processOptimizedDependencies(result.dependentEntities, blockNumber);
      }
      
      const duration = Date.now() - startTime;
      
      // Record performance metrics
      this.performanceMonitor.recordOperation(domain, 'indexBlock', duration, true);
      
      // Check for performance anomalies
      const anomalies = this.performanceMonitor.detectAnomalies(domain);
      if (anomalies.hasAnomalies) {
        logger.warn('Performance anomalies detected in block indexing', {
          blockNumber,
          anomalies: anomalies.anomalies,
        });
      }
      
      logger.debug('Optimized block indexing completed successfully', {
        component: 'optimized-queue-service',
        jobId: job.id,
        blockNumber,
        duration,
        dependenciesQueued: result.dependentEntities ? Object.keys(result.dependentEntities).length : 0,
        cacheMetrics: this.callOptimizer.getMetrics(),
      });
      
      return {
        success: true,
        data: {
          blockNumber,
          indexed: true,
          blockData: result.blockData,
          dependenciesQueued: result.dependentEntities,
        },
        metrics: {
          duration,
          indexingRate: 1 / (duration / 1000),
          cacheHitRate: this.callOptimizer.getMetrics().cacheHitRate,
        },
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failure metrics
      this.performanceMonitor.recordOperation(domain, 'indexBlock', duration, false);
      
      const classification = ErrorClassifier.classifyError(error as Error, JobType.BLOCK_INDEXING);
      
      logger.error('Optimized block indexing job failed', {
        component: 'optimized-queue-service',
        jobId: job.id,
        blockNumber,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
        classification,
        duration,
        attempts: job.attemptsMade,
        maxAttempts: job.opts?.attempts,
        willRetry: classification.isRetryable && job.attemptsMade < (job.opts?.attempts || 3),
        correlationId: (job.data as any)._correlationId,
        circuitBreakerState: this.circuitBreakers.get('blockchain')?.getState(),
      });
      
      throw error;
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics() {
    return {
      callOptimizer: this.callOptimizer.getMetrics(),
      queueManager: this.queueManager.getPerformanceMetrics(),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
        name,
        metrics: cb.getMetrics(),
      })),
      performanceMonitor: this.performanceMonitor.getPerformanceSummary(),
    };
  }

  private initializeCircuitBreakers(): void {
    // Initialize circuit breakers for different domains
    this.circuitBreakers.set('blockchain', new CircuitBreaker('blockchain', {
      failureThreshold: 0.5,
      resetTimeout: 60000,
      monitoringPeriod: 10000,
    }));
    
    this.circuitBreakers.set('database', new CircuitBreaker('database', {
      failureThreshold: 0.3,
      resetTimeout: 30000,
      monitoringPeriod: 5000,
    }));
    
    logger.info('Circuit breakers initialized', {
      count: this.circuitBreakers.size,
      domains: Array.from(this.circuitBreakers.keys()),
    });
  }

  private async processOptimizedDependencies(dependencies: any, blockNumber: number) {
    const { validators, accounts, transfers } = dependencies;
    const queueService = await this.getService<any>('queue');
    
    // Batch validator processing for efficiency
    if (validators && validators.length > 0) {
      // Check existing validators in batch
      const validatorRepo = await this.getService<any>('validatorRepository');
      const nonExistentValidators = [];
      
      for (const validatorId of validators) {
        const exists = await validatorRepo.exists(validatorId);
        if (!exists) {
          nonExistentValidators.push(validatorId);
        }
      }
      
      // Queue non-existent validators with dynamic priority
      for (const validatorId of nonExistentValidators) {
        const priority = this.queueManager.calculateDynamicPriority(
          JobType.INDEX_VALIDATOR,
          await this.getQueueDepth(),
        );
        
        await queueService.add('INDEX_VALIDATOR', { validatorId }, { priority });
        logger.debug('Queued optimized validator indexing', { validatorId, priority, blockNumber });
      }
    }
    
    // Process accounts with optimization
    if (accounts && accounts.length > 0) {
      for (const accountAddress of accounts) {
        const accountRepo = await this.getService<any>('accountRepository');
        const exists = await accountRepo.exists(accountAddress);
        
        if (!exists) {
          const priority = this.queueManager.calculateDynamicPriority(
            JobType.INDEX_ACCOUNT,
            await this.getQueueDepth(),
          );
          
          await queueService.add('INDEX_ACCOUNT', { accountAddress }, { priority });
          logger.debug('Queued optimized account indexing', { accountAddress, priority, blockNumber });
        }
      }
    }
  }

  private async getQueueDepth(): Promise<number> {
    // Get current queue depth for priority calculation
    return 50; // Default value for now
  }
} 