import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { ErrorClassifier } from '../error-classifier';
import { 
  JobProcessorDependencies, 
  BlockIndexingJobData, 
  DataSyncJobData,
} from '../types';

/**
 * Core Job Processors - Essential blockchain processing jobs
 * 
 * These processors handle the core functionality:
 * - BLOCK_INDEXING: Individual block processing
 * - DATA_SYNC: Batch block synchronization 
 * - HEALTH_CHECK: System health validation
 */
export class CoreProcessors {
  constructor(
    private dependencies: JobProcessorDependencies,
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {}

  /**
   * BLOCK_INDEXING processor - TASK-012 Simplified with Fail-Fast Pattern
   */
  async processBlockIndexing(job: Job<BlockIndexingJobData>) {
    const { blockNumber } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting block indexing job', { 
      component: 'block-indexing-processor',
      operation: 'processBlockIndexing',
      jobId: job.id, 
      blockNumber,
      priority: job.opts?.priority,
      attempts: job.attemptsMade,
      maxAttempts: job.opts?.attempts,
      correlationId: (job.data as any)._correlationId,
      timestamp: new Date().toISOString(),
    });
    
    try {
      // Step 1: Get required services
      logger.debug('🔧 PROCESSOR: Getting required services', {
        component: 'block-indexing-processor',
        operation: 'getServices',
        jobId: job.id,
        blockNumber,
        requiredServices: ['blockService', 'availBlockchain'],
      });
      
      const blockService = await this.getService<any>('blockService');
      const availBlockchain = await this.getService<any>('availBlockchain');
      
      logger.debug('✅ PROCESSOR: Services obtained successfully', {
        component: 'block-indexing-processor',
        operation: 'servicesObtained',
        jobId: job.id,
        blockNumber,
        servicesObtained: ['blockService', 'availBlockchain'],
      });
      
      // Step 2: Validation - fail fast if block already exists
      logger.debug('🔧 PROCESSOR: Checking if block already exists', {
        component: 'block-indexing-processor',
        operation: 'checkExisting',
        jobId: job.id,
        blockNumber,
      });
      
      const existingBlock = await blockService.getBlockByNumber(blockNumber);
      if (existingBlock) {
        const skipDuration = Date.now() - startTime;
        logger.info('⏭️ PROCESSOR: Block already indexed, skipping', {
          component: 'block-indexing-processor',
          operation: 'skipExisting',
          jobId: job.id,
          blockNumber,
          blockId: existingBlock.id,
          skipDuration,
          reason: 'already_exists',
        });
        return {
          success: true,
          data: { blockNumber, status: 'already_exists', existingBlockId: existingBlock.id },
          metrics: { duration: skipDuration },
        };
      }
      
      logger.debug('✅ PROCESSOR: Block not found in database, proceeding with indexing', {
        component: 'block-indexing-processor',
        operation: 'proceedWithIndexing',
        jobId: job.id,
        blockNumber,
      });
      
      // Step 3: Fetch block data from blockchain
      logger.debug('🔧 PROCESSOR: Fetching block data from blockchain', {
        component: 'block-indexing-processor',
        operation: 'fetchBlockData',
        jobId: job.id,
        blockNumber,
      });
      
      const blockData = await availBlockchain.getBlockByNumber(blockNumber);
      if (!blockData) {
        const fetchDuration = Date.now() - startTime;
        logger.error('❌ PROCESSOR: Block not found on blockchain', {
          component: 'block-indexing-processor',
          operation: 'blockNotFound',
          jobId: job.id,
          blockNumber,
          fetchDuration,
          error: `Block ${blockNumber} not found on blockchain`,
        });
        throw new Error(`Block ${blockNumber} not found on blockchain`);
      }
      
      logger.info('✅ PROCESSOR: Block data fetched successfully', {
        component: 'block-indexing-processor',
        operation: 'blockDataFetched',
        jobId: job.id,
        blockNumber,
        blockHash: blockData.hash,
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
        timestamp: blockData.timestamp,
        fetchDuration: Date.now() - startTime,
      });
      
      // Step 4: Index block data
      logger.debug('🔧 PROCESSOR: Starting block indexing', {
        component: 'block-indexing-processor',
        operation: 'indexBlock',
        jobId: job.id,
        blockNumber,
        blockHash: blockData.hash,
        dataToIndex: {
          extrinsics: blockData.extrinsics?.length || 0,
          events: blockData.events?.length || 0,
        },
      });
      
      const indexingStartTime = Date.now();
      await blockService.indexBlock(blockData);
      const indexingDuration = Date.now() - indexingStartTime;
      
      const totalDuration = Date.now() - startTime;
      
      logger.info('✅ PROCESSOR: Block indexing completed successfully', {
        component: 'block-indexing-processor',
        operation: 'indexingComplete',
        jobId: job.id,
        blockNumber,
        blockHash: blockData.hash,
        totalDuration,
        indexingDuration,
        entitiesProcessed: blockData.extrinsics?.length || 0,
        eventsProcessed: blockData.events?.length || 0,
        processingRate: (blockData.extrinsics?.length || 0) / (totalDuration / 1000),
        timestamp: new Date().toISOString(),
      });
      
      return {
        success: true,
        data: {
          blockNumber,
          blockHash: blockData.hash,
          extrinsicsCount: blockData.extrinsics?.length || 0,
          eventsCount: blockData.events?.length || 0,
          timestamp: blockData.timestamp,
        },
        metrics: {
          totalDuration,
          indexingDuration,
          entitiesProcessed: blockData.extrinsics?.length || 0,
          processingRate: (blockData.extrinsics?.length || 0) / (totalDuration / 1000),
        },
      };
      
    } catch (error) {
      const classification = ErrorClassifier.classifyError(error as Error, JobType.BLOCK_INDEXING);
      const duration = Date.now() - startTime;
      
      logger.error('❌ PROCESSOR: Block indexing failed', {
        component: 'block-indexing-processor',
        operation: 'indexingFailed',
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
   * DATA_SYNC processor - TASK-015: Queue-Centric Architecture Implementation
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
      // Get required services
      const blockIndexer = await this.getService<any>('blockIndexerService');
      const selfHealingProcessor = await this.getService<any>('selfHealingBlockProcessor');
      const availBlockchain = await this.getService<any>('availBlockchain');
      
      const blocksProcessed: any[] = [];
      
      // Step 1: Index block range (using existing indexer logic)
      let indexedBlocks = await blockIndexer.indexBlockRange(startBlock, endBlock);
      
      // Step 2: Fallback to direct Avail SDK if indexer returns no blocks
      if (indexedBlocks.length === 0) {
        logger.warn(`No blocks indexed for range ${startBlock}-${endBlock}, using direct processing`, {
          component: 'queue-service',
          jobId: job.id,
          startBlock,
          endBlock,
        });
        
        // Direct processing with Avail SDK
        const directBlocks: any[] = [];
        for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
          try {
            const blockData = await availBlockchain.getBlockWithDataSubmissions(blockNum);
            if (blockData && blockData.block) {
              directBlocks.push(blockData.block);
            }
          } catch (error) {
            logger.error(`Failed to get block ${blockNum}`, {
              component: 'queue-service',
              jobId: job.id,
              blockNum,
              error: (error as Error).message,
            });
            // Continue with other blocks
          }
        }
        indexedBlocks = directBlocks;
      }
      
      // Step 3: Process each block through SelfHealingBlockProcessor
      for (const block of indexedBlocks) {
        try {
          await selfHealingProcessor.processBlock(block);
          blocksProcessed.push({
            number: block.number,
            hash: block.hash,
            processed: true,
          });
          
          logger.debug('Block processed successfully', {
            component: 'queue-service',
            jobId: job.id,
            blockNumber: block.number,
          });
          
        } catch (error) {
          // Log error but continue with other blocks
          logger.error(`Failed to process block ${block.number}`, {
            component: 'queue-service',
            jobId: job.id,
            blockNumber: block.number,
            error: (error as Error).message,
          });
          
          blocksProcessed.push({
            number: block.number,
            hash: block.hash,
            processed: false,
            error: (error as Error).message,
          });
        }
      }
      
      const duration = Date.now() - startTime;
      const successCount = blocksProcessed.filter(b => b.processed).length;
      const failureCount = blocksProcessed.length - successCount;
      
      logger.info('Data sync batch completed', {
        component: 'queue-service',
        jobId: job.id,
        startBlock,
        endBlock,
        batchIndex,
        totalBatches,
        blocksRequested: endBlock - startBlock + 1,
        blocksIndexed: indexedBlocks.length,
        blocksProcessed: successCount,
        blocksFailed: failureCount,
        duration,
        processingRate: indexedBlocks.length / (duration / 1000),
      });
      
      return {
        success: true,
        data: {
          startBlock,
          endBlock,
          batchIndex,
          totalBatches,
          blocksRequested: endBlock - startBlock + 1,
          blocksIndexed: indexedBlocks.length,
          blocksProcessed: successCount,
          blocksFailed: failureCount,
          blocks: blocksProcessed,
        },
        metrics: {
          duration,
          processingRate: indexedBlocks.length / (duration / 1000),
          successRate: successCount / indexedBlocks.length * 100,
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
   * HEALTH_CHECK processor
   */
  async processHealthCheck(job: Job) {
    logger.debug('Processing health check job', { jobId: job.id });
    
    // TODO: Perform system health checks
    // const health = await this.getHealth();
    
    return { success: true, message: 'Health check completed' };
  }
}