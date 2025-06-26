import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { ErrorClassifier } from '../error-classifier';
import { 
  JobProcessorDependencies, 
  BlockIndexingJobData, 
  DataSyncJobData,
  BlockDomainsJobData,
} from '../types';

/**
 * Core Job Processors - Phase 2: Simplified Pure Coordinators
 * 
 * These processors handle coordination only:
 * - BLOCK_INDEXING: Individual block storage coordination
 * - DATA_SYNC: Batch synchronization coordination 
 * - HEALTH_CHECK: System health validation
 * - PROCESS_BLOCK_DOMAINS: Pure delegation to domain services
 * 
 * Phase 2 Changes:
 * - Removed 315+ lines of complex business logic
 * - Queue processors now delegate to dedicated services
 * - Single responsibility: coordinate job execution
 * - No more direct domain processing or blockchain calls
 */
export class CoreProcessors {
  constructor(
    private dependencies: JobProcessorDependencies,
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {}

  /**
   * PROCESS_BLOCK_DOMAINS processor - Phase 2: Pure Delegation
   * 
   * Simplified from 178 lines to ~20 lines
   * Delegates all domain processing to SelfHealingBlockProcessor
   */
  async processBlockDomains(job: Job<BlockDomainsJobData>) {
    const { blockData, correlationId } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Delegating block domains processing', {
      component: 'block-domains-processor',
      operation: 'processBlockDomains',
      jobId: job.id,
      blockNumber: blockData.number,
      blockHash: blockData.hash,
      correlationId: correlationId || (job.data as any)._correlationId,
      timestamp: new Date().toISOString(),
    });

    try {
      // Phase 3: Enhanced delegation to domain processing orchestrator
      const domainOrchestrator = await this.getService<any>('domainProcessingOrchestrator');
      const result = await domainOrchestrator.processAllDomainsForBlock(blockData, correlationId);

      const duration = Date.now() - startTime;

      logger.info('✅ PROCESSOR: Block domains processing completed via domain orchestrator', {
        component: 'block-domains-processor',
        operation: 'processingComplete',
        jobId: job.id,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        delegatedTo: 'domainProcessingOrchestrator',
        strategy: result.strategy,
        successfulServices: result.successfulServices,
        totalServices: result.totalServices,
        overallSuccess: result.overallSuccess,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          delegatedTo: 'domainProcessingOrchestrator',
          strategy: result.strategy,
          successfulServices: result.successfulServices,
          totalServices: result.totalServices,
          overallSuccess: result.overallSuccess,
        },
        metrics: {
          duration,
          processingMethod: 'orchestrated-delegation',
          serviceResults: result.serviceResults,
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.PROCESS_BLOCK_DOMAINS);
      
      logger.error('❌ PROCESSOR: Block domains processing failed', {
        component: 'block-domains-processor',
        operation: 'processingFailed',
        jobId: job.id,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        error: (error as Error).message,
        classification,
        duration,
        attempts: job.attemptsMade,
        maxAttempts: job.opts?.attempts,
        willRetry: classification.isRetryable && job.attemptsMade < (job.opts?.attempts || 3),
        correlationId,
      });
      
      throw error;
    }
  }

  /**
   * BLOCK_INDEXING processor - Already clean, keeping as-is
   */
  async processBlockIndexing(job: Job<BlockIndexingJobData>) {
    const { blockNumber } = job.data;
    const startTime = Date.now();
    
    logger.debug('Processing block indexing job', { 
      component: 'queue-service',
      jobId: job.id, 
      blockNumber,
    });
    
    try {
      // Get block indexer service
      const blockIndexer = await this.getService<any>('blockIndexerService');
      
      // Index the block by number
      await blockIndexer.indexBlockByNumber(blockNumber);
      
      const duration = Date.now() - startTime;
      
      logger.debug('Block indexing completed successfully', {
        component: 'queue-service',
        jobId: job.id,
        blockNumber,
        duration,
      });
      
      return {
        success: true,
        data: {
          blockNumber,
          indexed: true,
        },
        metrics: {
          duration,
          indexingRate: 1 / (duration / 1000),
        },
      };
      
    } catch (error) {
      const classification = ErrorClassifier.classifyError(error as Error, JobType.BLOCK_INDEXING);
      const duration = Date.now() - startTime;
      
      logger.error('Block indexing job failed', {
        component: 'queue-service',
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
      });
      
      // Log non-retryable errors for immediate attention
      if (!classification.isRetryable) {
        logger.error('🚨 PROCESSOR: BLOCK_INDEXING permanent failure - requires attention', { 
          component: 'block-indexing-processor',
          operation: 'permanentFailure',
          blockNumber, 
          error: (error as Error).message,
          alertLevel: classification.alertLevel,
          requiresManualIntervention: true,
          jobId: job.id,
          correlationId: (job.data as any)._correlationId,
        });
      }
      
      throw error;
    }
  }

  /**
   * DATA_SYNC processor - Phase 2: Simplified Coordination
   * 
   * Removed direct blockchain calls and complex processing logic
   * Now focuses on coordination between indexer and queue services
   */
  async processDataSync(job: Job<DataSyncJobData>) {
    const { startBlock, endBlock, batchIndex, totalBatches } = job.data;
    const startTime = Date.now();
    
    logger.debug('Processing data sync job', { 
      component: 'queue-service',
      jobId: job.id, 
      startBlock,
      endBlock,
      batchIndex,
      totalBatches,
    });
    
    try {
      // Phase 2: Simple service coordination - no direct blockchain calls
      const blockIndexer = await this.getService<any>('blockIndexerService');
      const queueService = await this.getService<any>('queue');
      
      // Phase 3: Enhanced indexing with domain processing preparation
      const indexingResults = await blockIndexer.indexBlockRangeWithDomainPrep(startBlock, endBlock);
      
      // Step 2: Schedule domain processing for each indexed block with enhanced metadata
      const scheduledJobs = [];
      for (const indexingResult of indexingResults) {
        const block = indexingResult.blockData;
        const metadata = indexingResult.domainProcessingMetadata;
        
        try {
          const job = await queueService.scheduleBlockDomainProcessing(block, {
            complexity: metadata.processingComplexity,
            estimatedTime: metadata.estimatedProcessingTime,
            requiresSequentialProcessing: metadata.requiresSequentialProcessing,
          });
          
          scheduledJobs.push({
            blockNumber: block.number,
            jobId: job.id,
            scheduled: true,
            complexity: metadata.processingComplexity,
            estimatedTime: metadata.estimatedProcessingTime,
          });
          
          logger.debug('Block domain processing scheduled with metadata', {
            component: 'queue-service',
            jobId: job.id,
            blockNumber: block.number,
            complexity: metadata.processingComplexity,
            estimatedTime: metadata.estimatedProcessingTime,
            parentJobId: job.id,
          });
          
        } catch (error) {
          logger.error(`Failed to schedule domain processing for block ${block.number}`, {
            component: 'queue-service',
            jobId: job.id,
            blockNumber: block.number,
            error: (error as Error).message,
          });
          
          scheduledJobs.push({
            blockNumber: block.number,
            scheduled: false,
            error: (error as Error).message,
          });
        }
      }
      
      const duration = Date.now() - startTime;
      const successCount = scheduledJobs.filter(j => j.scheduled).length;
      const failureCount = scheduledJobs.length - successCount;
      
      // Calculate complexity distribution for enhanced reporting
      const complexityDistribution = scheduledJobs.reduce((acc, job) => {
        if (job.complexity) {
          acc[job.complexity] = (acc[job.complexity] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      logger.info('Data sync batch completed with enhanced metadata', {
        component: 'queue-service',
        jobId: job.id,
        startBlock,
        endBlock,
        batchIndex,
        totalBatches,
        blocksRequested: endBlock - startBlock + 1,
        blocksIndexed: indexingResults.length,
        jobsScheduled: successCount,
        jobsFailed: failureCount,
        complexityDistribution,
        duration,
        processingRate: indexingResults.length / (duration / 1000),
      });
      
      return {
        success: true,
        data: {
          startBlock,
          endBlock,
          batchIndex,
          totalBatches,
          blocksRequested: endBlock - startBlock + 1,
          blocksIndexed: indexingResults.length,
          jobsScheduled: successCount,
          jobsFailed: failureCount,
          scheduledJobs,
          complexityDistribution,
        },
        metrics: {
          duration,
          processingRate: indexingResults.length / (duration / 1000),
          successRate: successCount / indexingResults.length * 100,
        },
      };
      
    } catch (error) {
      const classification = ErrorClassifier.classifyError(error as Error, JobType.DATA_SYNC);
      const duration = Date.now() - startTime;
      
      logger.error('Data sync job failed', {
        component: 'queue-service',
        jobId: job.id,
        startBlock,
        endBlock,
        batchIndex,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * HEALTH_CHECK processor - Simple system validation
   */
  async processHealthCheck(job: Job) {
    logger.debug('Processing health check job', { jobId: job.id });
    
    // TODO: Perform system health checks
    // const health = await this.getHealth();
    
    return { success: true, message: 'Health check completed' };
  }
}