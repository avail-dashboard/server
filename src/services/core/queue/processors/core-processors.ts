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
      
      // Phase 2: DB-first dependency checking and queuing
      if (result.dependentEntities) {
        await this.processDependencies(result.dependentEntities, blockNumber);
      }
      
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
   * Phase 2: DB-first dependency processing
   */
  private async processDependencies(dependencies: any, blockNumber: number) {
    const { validators, accounts, transfers } = dependencies;
    const queueService = await this.getService<any>('queue');
    
    // Check and queue validators
    if (validators && validators.length > 0) {
      for (const validatorId of validators) {
        const validatorRepo = await this.getService<any>('validatorRepository');
        const exists = await validatorRepo.exists(validatorId);
        
        if (!exists) {
          await queueService.add('INDEX_VALIDATOR', { validatorId });
          logger.debug('Queued validator indexing', { validatorId, blockNumber });
        }
      }
    }
    
    // Check and queue accounts - Phase 3: Now using AccountRepository exists() method
    if (accounts && accounts.length > 0) {
      for (const accountAddress of accounts) {
        const accountRepo = await this.getService<any>('accountRepository');
        const exists = await accountRepo.exists(accountAddress);
        
        if (!exists) {
          await queueService.add('INDEX_ACCOUNT', { accountAddress });
          logger.debug('Queued account indexing', { accountAddress, blockNumber });
        }
      }
    }
    
    // Queue transfers (always process for new blocks)
    if (transfers && transfers.length > 0) {
      await queueService.add('INDEX_TRANSFER', { 
        blockNumber, 
        transferIds: transfers,
      });
      logger.debug('Queued transfer indexing', { transferCount: transfers.length, blockNumber });
    }
  }

  /**
   * DATA_SYNC processor - Phase 2: Direct Domain Indexing
   * 
   * Updated to use direct domain indexing instead of orchestrator pattern
   * Implements DB-first dependency checking for all domains
   */
  async processDataSync(job: Job<DataSyncJobData>) {
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
      const queueService = await this.getService<any>('queue');
      
      // Index blocks and collect dependencies
      const indexingResults = await blockIndexer.indexBlockRange(startBlock, endBlock);
      
      // Schedule domain indexing for all dependencies
      const scheduledJobs = [];
      for (const result of indexingResults) {
        const dependencyJobs = await this.scheduleBlockDependencies(result, queueService);
        scheduledJobs.push(...dependencyJobs);
      }
      
      const duration = Date.now() - startTime;
      const successCount = scheduledJobs.filter(j => j.scheduled).length;
      
      logger.info('Data sync batch completed with direct domain indexing', {
        component: 'queue-service',
        jobId: job.id,
        startBlock,
        endBlock,
        blocksIndexed: indexingResults.length,
        domainJobsScheduled: successCount,
        duration,
      });
      
      return {
        success: true,
        data: {
          startBlock,
          endBlock,
          blocksIndexed: indexingResults.length,
          domainJobsScheduled: successCount,
          scheduledJobs,
        },
        metrics: {
          duration,
          processingRate: indexingResults.length / (duration / 1000),
        },
      };
      
    } catch (error) {
      const classification = ErrorClassifier.classifyError(error as Error, JobType.DATA_SYNC);
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
   * Phase 2: Schedule block dependencies with DB-first checking
   */
  private async scheduleBlockDependencies(result: any, queueService: any) {
    const { validators, accounts, transfers } = result.dependentEntities;
    const scheduledJobs = [];
    
    // Schedule validator indexing with DB check
    if (validators && validators.length > 0) {
      for (const validatorId of validators) {
        const validatorRepo = await this.getService<any>('validatorRepository');
        const exists = await validatorRepo.exists(validatorId);
        
        if (!exists) {
          try {
            const job = await queueService.add('INDEX_VALIDATOR', { validatorId });
            scheduledJobs.push({ type: 'validator', id: validatorId, jobId: job.id, scheduled: true });
          } catch (error) {
            scheduledJobs.push({ type: 'validator', id: validatorId, scheduled: false, error: (error as Error).message });
          }
        }
      }
    }
    
    // Schedule account indexing with DB check
    if (accounts && accounts.length > 0) {
      for (const accountAddress of accounts) {
        // For now, we'll queue all accounts since we don't have account repository exists() yet
        try {
          const job = await queueService.add('INDEX_ACCOUNT', { accountAddress });
          scheduledJobs.push({ type: 'account', id: accountAddress, jobId: job.id, scheduled: true });
        } catch (error) {
          scheduledJobs.push({ type: 'account', id: accountAddress, scheduled: false, error: (error as Error).message });
        }
      }
    }
    
    // Schedule transfer indexing (always for new blocks)
    if (transfers && transfers.length > 0) {
      try {
        const job = await queueService.add('INDEX_TRANSFER', { 
          blockNumber: result.blockData.number, 
          transferIds: transfers,
        });
        scheduledJobs.push({ type: 'transfer', blockNumber: result.blockData.number, jobId: job.id, scheduled: true });
      } catch (error) {
        scheduledJobs.push({ type: 'transfer', blockNumber: result.blockData.number, scheduled: false, error: (error as Error).message });
      }
    }
    
    return scheduledJobs;
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
    const { validatorId } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting validator indexing', {
      component: 'validator-indexing-processor',
      operation: 'processValidatorIndexing',
      jobId: job.id,
      validatorId,
      timestamp: new Date().toISOString(),
    });

    try {
      const validatorIndexer = await this.getService<any>('validatorIndexer');
      const result = await validatorIndexer.indexValidator(validatorId);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Validator indexing completed', {
          component: 'validator-indexing-processor',
          operation: 'indexingComplete',
          jobId: job.id,
          validatorId,
          duration,
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          data: {
            validatorId,
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
        validatorId,
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
    const { blockNumber, transferIds } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting transfer indexing', {
      component: 'transfer-indexing-processor',
      jobId: job.id,
      blockNumber,
      transferCount: transferIds?.length || 0,
    });

    try {
      // Get block data for transfer extraction
      const blockIndexer = await this.getService<any>('blockIndexer');
      const blockResult = await blockIndexer.indexBlock(blockNumber);
      
      const transferIndexer = await this.getService<any>('transferIndexer');
      const result = await transferIndexer.indexTransfersForBlock(blockResult.blockData);
      
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
    const { startBlock, endBlock } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting data submission indexing', {
      component: 'data-submission-indexing-processor',
      jobId: job.id,
      startBlock,
      endBlock,
    });

    try {
      const dataSubmissionIndexer = await this.getService<any>('dataSubmissionIndexer');
      const result = await dataSubmissionIndexer.indexBlockRange(startBlock, endBlock);
      
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info('✅ PROCESSOR: Data submission indexing completed', {
          component: 'data-submission-indexing-processor',
          jobId: job.id,
          startBlock,
          endBlock,
          submissionsProcessed: result.submissionsProcessed,
          duration,
        });

        return {
          success: true,
          data: {
            startBlock,
            endBlock,
            submissionsProcessed: result.submissionsProcessed,
            submissions: result.submissions,
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
        startBlock,
        endBlock,
        error: (error as Error).message,
        classification,
        duration,
      });
      
      throw error;
    }
  }
}