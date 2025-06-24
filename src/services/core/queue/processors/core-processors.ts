import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { ErrorClassifier } from '../error-classifier';
import { 
  JobProcessorDependencies, 
  BlockIndexingJobData, 
  DataSyncJobData 
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
    private getService: <T>(serviceName: string) => Promise<T>
  ) {}

  /**
   * BLOCK_INDEXING processor - TASK-012 Simplified with Fail-Fast Pattern
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
      // Get required services
      const blockService = await this.getService<any>('blockService');
      const availBlockchain = await this.getService<any>('availBlockchain');
      
      // Simple validation - fail fast if block already exists
      const existingBlock = await blockService.getBlockByNumber(blockNumber);
      if (existingBlock) {
        logger.debug('Block already indexed, skipping', { blockNumber });
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
      
      logger.info('Block indexing completed successfully', {
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
      const classification = ErrorClassifier.classifyError(error as Error, JobType.BLOCK_INDEXING);
      const duration = Date.now() - startTime;
      
      logger.error('Block indexing failed', {
        component: 'queue-service',
        jobId: job.id,
        blockNumber,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      // Log non-retryable errors for immediate attention
      if (!classification.isRetryable) {
        logger.error('BLOCK_INDEXING permanent failure', { 
          blockNumber, 
          error: (error as Error).message,
          alertLevel: classification.alertLevel,
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