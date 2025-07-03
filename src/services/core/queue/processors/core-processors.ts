import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { ErrorClassifier } from '../error-classifier';
import { 
  BlockIndexingJobData, 
  BlockRangeIndexingJobData,
} from '../types';

/**
 * Core Job Processors - Phase 3: Simple Independent Processing
 * 
 * Simplified processors with minimal coordination:
 * - BLOCK_INDEXING: Direct block indexing
 * - BLOCK_RANGE_INDEXING: Simple batch block indexing
 * - HEALTH_CHECK: System health validation
 * - Domain indexers handle their own cross-domain dependencies
 * 
 * Phase 3 Changes:
 * - Removed complex dependency coordination
 * - Removed batch optimization logic
 * - Domain indexers are independent and self-contained
 * - No centralized coordination needed
 */
export class CoreProcessors {
  constructor(
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {}



  /**
   * BLOCK_INDEXING processor - Phase 2: Updated with DB-first dependency queuing
   */
  async processBlockIndexing(job: Job<BlockIndexingJobData>) {
    const { blockNumber } = job.data;
    const startTime = Date.now();
    
    logger.debug('Processing block indexing job with DB-first dependency queuing', { 
      component: 'queue-service',
      jobId: job.id, 
      blockNumber,
    });
    
    try {
      // Phase 2: Use new domain indexer instead of service
      const blockIndexer = await this.getService<any>('blockIndexer');
      
      // Index the block and get dependency metadata
      const result = await blockIndexer.indexBlock(blockNumber);
      
      // Phase 3: Domain indexers handle their own cross-domain dependencies
      // No centralized coordination needed - each indexer queues its own dependencies
      
      const duration = Date.now() - startTime;
      
      logger.debug('Block indexing completed successfully with dependency queuing', {
        component: 'queue-service',
        jobId: job.id,
        blockNumber,
        duration,
        dependenciesQueued: result.dependentEntities ? Object.keys(result.dependentEntities).length : 0,
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
   * BLOCK_RANGE_INDEXING processor - Phase 2: Direct Domain Indexing
   * 
   * Updated to use direct domain indexing instead of orchestrator pattern
   * Implements DB-first dependency checking for all domains
   */
  async processBlockRangeIndexing(job: Job<BlockRangeIndexingJobData>) {
    const { startBlock, endBlock, batchIndex, totalBatches } = job.data;
    const startTime = Date.now();
    
    logger.debug('Processing data sync job with direct domain indexing', { 
      component: 'queue-service',
      jobId: job.id, 
      startBlock,
      endBlock,
      batchIndex,
      totalBatches,
    });
    
    try {
      const blockIndexer = await this.getService<any>('blockIndexer');
      
      // Phase 3: Simple block indexing - domain indexers handle their own dependencies
      const indexingResults = await blockIndexer.indexBlockRange(startBlock, endBlock);
      
      const duration = Date.now() - startTime;
      
      logger.info('Data sync batch completed with independent domain indexing', {
        component: 'queue-service',
        jobId: job.id,
        startBlock,
        endBlock,
        blocksIndexed: indexingResults.length,
        duration,
      });
      
      return {
        success: true,
        data: {
          startBlock,
          endBlock,
          blocksIndexed: indexingResults.length,
        },
        metrics: {
          duration,
          processingRate: indexingResults.length / (duration / 1000),
        },
      };
      
    } catch (error) {
      const classification = ErrorClassifier.classifyError(error as Error, JobType.BLOCK_RANGE_INDEXING);
      const duration = Date.now() - startTime;
      
      logger.error('Data sync job failed', {
        component: 'queue-service',
        jobId: job.id,
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

  /**
   * Phase 2: INDEX_VALIDATOR processor
   */
  async processValidatorIndexing(job: Job<any>) {
    const { validatorAddress, blockNumber, blockHash } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting validator indexing', {
      component: 'validator-indexing-processor',
      operation: 'processValidatorIndexing',
      jobId: job.id,
      validatorAddress,
      blockNumber,
      blockHash,
      timestamp: new Date().toISOString(),
    });

    try {
      const validatorIndexer = await this.getService<any>('validatorIndexer');
      const result = await validatorIndexer.indexValidator(validatorAddress);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Validator indexing completed', {
          component: 'validator-indexing-processor',
          operation: 'indexingComplete',
          jobId: job.id,
          validatorAddress,
          duration,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          data: {
            validatorAddress,
            indexed: true,
            validatorData: result.validatorData,
          },
          metrics: { duration },
        };
      } else {
        throw new Error(result.error || 'Validator indexing failed');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.INDEX_VALIDATOR);
      
      logger.error('❌ PROCESSOR: Validator indexing failed', {
        component: 'validator-indexing-processor',
        operation: 'indexingFailed',
        jobId: job.id,
        validatorAddress,
        error: (error as Error).message,
        classification,
        duration,
        attempts: job.attemptsMade,
        maxAttempts: job.opts?.attempts,
        willRetry: classification.isRetryable && job.attemptsMade < (job.opts?.attempts || 3),
      });
      
      throw error;
    }
  }

  /**
   * Phase 2: INDEX_ACCOUNT processor
   */
  async processAccountIndexing(job: Job<any>) {
    const { accountAddress } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting account indexing', {
      component: 'account-indexing-processor',
      jobId: job.id,
      accountAddress,
    });

    try {
      const accountIndexer = await this.getService<any>('accountIndexer');
      const result = await accountIndexer.indexAccount(accountAddress);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Account indexing completed', {
          component: 'account-indexing-processor',
          jobId: job.id,
          accountAddress,
          duration,
        });

        return {
          success: true,
          data: {
            accountAddress,
            indexed: true,
            accountData: result.accountData,
          },
          metrics: { duration },
        };
      } else {
        throw new Error(result.error || 'Account indexing failed');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.INDEX_ACCOUNT);
      
      logger.error('❌ PROCESSOR: Account indexing failed', {
        component: 'account-indexing-processor',
        jobId: job.id,
        accountAddress,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Phase 2: INDEX_TRANSFER processor
   */
  async processTransferIndexing(job: Job<any>) {
    const { blockNumber, blockHash, transferId, transferIds } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting transfer indexing', {
      component: 'transfer-indexing-processor',
      jobId: job.id,
      blockNumber,
      blockHash,
      transferId,
      transferCount: transferIds?.length || 0,
    });

    try {
      // Get block data directly from blockchain service instead of re-indexing
      const availBlockchain = await this.getService<any>('availBlockchain');
      const blockData = blockHash ? 
        await availBlockchain.getBlock(blockHash) : 
        await availBlockchain.getBlock(blockNumber);
      
      const transferIndexer = await this.getService<any>('transferIndexer');
      const result = await transferIndexer.indexTransfersForBlock(blockData);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Transfer indexing completed', {
          component: 'transfer-indexing-processor',
          jobId: job.id,
          blockNumber,
          transfersProcessed: result.transfersProcessed,
          duration,
        });

        return {
          success: true,
          data: {
            blockNumber,
            transfersProcessed: result.transfersProcessed,
            transfers: result.transfers,
          },
          metrics: { duration },
        };
      } else {
        throw new Error(result.error || 'Transfer indexing failed');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.INDEX_TRANSFER);
      
      logger.error('❌ PROCESSOR: Transfer indexing failed', {
        component: 'transfer-indexing-processor',
        jobId: job.id,
        blockNumber,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Phase 2: INDEX_DATA_SUBMISSION processor
   */
  async processDataSubmissionIndexing(job: Job<any>) {
    const { blockNumber, blockHash } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting data submission indexing', {
      component: 'data-submission-indexing-processor',
      jobId: job.id,
      blockNumber,
      blockHash,
    });

    try {
      const dataSubmissionIndexer = await this.getService<any>('dataSubmissionIndexer');
      const result = await dataSubmissionIndexer.indexBlockRange(blockNumber, blockNumber);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Data submission indexing completed', {
          component: 'data-submission-indexing-processor',
          jobId: job.id,
          blockNumber,
          submissionsProcessed: result.submissionsProcessed,
          duration,
        });

        return {
          success: true,
          data: {
            blockNumber,
            submissionsProcessed: result.submissionsProcessed,
            stats: result.stats,
          },
          metrics: { duration },
        };
      } else {
        throw new Error(result.error || 'Data submission indexing failed');
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.INDEX_DATA_SUBMISSION);
      
      logger.error('❌ PROCESSOR: Data submission indexing failed', {
        component: 'data-submission-indexing-processor',
        jobId: job.id,
        blockNumber,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * EXTRINSIC_PROCESSING processor
   */
  async processExtrinsicIndexing(job: Job<any>) {
    const { blockNumber, blockHash } = job.data;
    const startTime = Date.now();
    
    logger.debug('🔧 PROCESSOR: Starting extrinsic processing', {
      component: 'extrinsic-processing-processor',
      jobId: job.id,
      blockNumber,
      blockHash,
    });

    try {
      // Get block data from blockchain service instead of expecting it in job payload
      const availBlockchain = await this.getService<any>('availBlockchain');
      const blockData = blockHash ? 
        await availBlockchain.getBlock(blockHash) : 
        await availBlockchain.getBlock(blockNumber);
      
      // Delegate to domain-specific ExtrinsicIndexer
      const extrinsicIndexer = await this.getService<any>('extrinsicIndexer');
      const result = await extrinsicIndexer.indexBlockExtrinsics(blockData);
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logger.debug('✅ PROCESSOR: Extrinsic processing completed', {
          component: 'extrinsic-processing-processor',
          jobId: job.id,
          blockNumber,
          processedCount: result.processedCount,
          duration
        });

        return {
          success: true,
          data: {
            blockNumber,
            processedExtrinsics: result.processedCount,
            extrinsics: result.extrinsics
          },
          metrics: { duration }
        };
      } else {
        throw new Error(result.error || 'Extrinsic processing failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const classification = ErrorClassifier.classifyError(error as Error, JobType.EXTRINSIC_PROCESSING);
      
      logger.error('❌ PROCESSOR: Extrinsic processing failed', {
        component: 'extrinsic-processing-processor',
        jobId: job.id,
        blockNumber,
        error: (error as Error).message,
        classification,
        duration
      });
      
      throw error;
    }
  }

}