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
import { BlockData } from '../../../types/blockchain';

/**
 * Core Job Processors - Essential blockchain processing jobs
 * 
 * These processors handle the core functionality:
 * - BLOCK_INDEXING: Individual block processing
 * - DATA_SYNC: Batch block synchronization 
 * - HEALTH_CHECK: System health validation
 * - PROCESS_BLOCK_DOMAINS: Queue-based domain processing (Phase 1)
 */
export class CoreProcessors {
  constructor(
    private dependencies: JobProcessorDependencies,
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {}

  /**
   * PROCESS_BLOCK_DOMAINS processor - Phase 1: Queue Integration
   * 
   * Replicates SelfHealingBlockProcessor functionality using queue system
   * Processes block data through all domain services in parallel
   */
  async processBlockDomains(job: Job<BlockDomainsJobData>) {
    const { blockData, correlationId } = job.data;
    const startTime = Date.now();
    
    logger.info('🔧 PROCESSOR: Starting block domains processing job', {
      component: 'block-domains-processor',
      operation: 'processBlockDomains',
      jobId: job.id,
      blockNumber: blockData.number,
      blockHash: blockData.hash,
      extrinsicsCount: blockData.extrinsics?.length || 0,
      eventsCount: blockData.events?.length || 0,
      priority: job.opts?.priority,
      attempts: job.attemptsMade,
      maxAttempts: job.opts?.attempts,
      correlationId: correlationId || (job.data as any)._correlationId,
      timestamp: new Date().toISOString(),
    });

    try {
      // Step 1: Get required domain services (same as SelfHealingBlockProcessor)
      logger.debug('🔧 PROCESSOR: Getting domain services', {
        component: 'block-domains-processor',
        operation: 'getServices',
        jobId: job.id,
        blockNumber: blockData.number,
        requiredServices: ['accountProcessor', 'validatorProcessor', 'transferProcessor', 'dataSubmissionProcessor'],
      });

      const accountProcessor = await this.getService<any>('accountProcessor');
      const validatorProcessor = await this.getService<any>('validatorProcessor');
      const transferProcessor = await this.getService<any>('transferProcessor');
      const dataSubmissionProcessor = await this.getService<any>('dataSubmissionProcessor');

      logger.debug('✅ PROCESSOR: Domain services obtained successfully', {
        component: 'block-domains-processor',
        operation: 'servicesObtained',
        jobId: job.id,
        blockNumber: blockData.number,
        servicesObtained: ['accountProcessor', 'validatorProcessor', 'transferProcessor', 'dataSubmissionProcessor'],
      });

      // Step 2: Process all domain services in parallel (replicate exact SelfHealingBlockProcessor logic)
      logger.debug('🔧 PROCESSOR: Starting parallel domain processing', {
        component: 'block-domains-processor',
        operation: 'parallelProcessing',
        jobId: job.id,
        blockNumber: blockData.number,
        servicesCount: 4,
      });

      const processingStartTime = Date.now();
      const results = await Promise.all([
        this.processServiceForBlock(accountProcessor, blockData, 'account'),
        this.processServiceForBlock(validatorProcessor, blockData, 'validator'),
        this.processServiceForBlock(transferProcessor, blockData, 'transfer'),
        this.processServiceForBlock(dataSubmissionProcessor, blockData, 'dataSubmission'),
      ]);
      const processingDuration = Date.now() - processingStartTime;

      // Step 3: Aggregate and log results (same pattern as SelfHealingBlockProcessor)
      const successfulServices = results.filter(r => r.success).length;
      const totalServices = results.length;
      const totalDuration = Date.now() - startTime;

      logger.info('✅ PROCESSOR: Block domains processing completed', {
        component: 'block-domains-processor',
        operation: 'processingComplete',
        jobId: job.id,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        successfulServices,
        totalServices,
        successRate: successfulServices / totalServices,
        totalDuration,
        processingDuration,
        results: results.map(r => ({
          service: r.serviceName,
          success: r.success,
          extractedCount: r.extractedCount || 0,
          processedCount: r.processedCount || 0,
          processingTime: r.processingTime,
          error: r.error,
        })),
        timestamp: new Date().toISOString(),
      });

      // Log warnings for failed services (same as SelfHealingBlockProcessor)
      if (successfulServices < totalServices) {
        logger.warn('⚠️ PROCESSOR: Some domain services failed during processing', {
          component: 'block-domains-processor',
          operation: 'partialFailure',
          jobId: job.id,
          blockNumber: blockData.number,
          failedServices: results.filter(r => !r.success).map(r => r.serviceName),
          successRate: successfulServices / totalServices,
          correlationId,
        });
      }

      return {
        success: true,
        data: {
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          successfulServices,
          totalServices,
          successRate: successfulServices / totalServices,
          results,
        },
        metrics: {
          totalDuration,
          processingDuration,
          entitiesProcessed: results.reduce((sum, r) => sum + (r.processedCount || 0), 0),
          processingRate: results.reduce((sum, r) => sum + (r.processedCount || 0), 0) / (totalDuration / 1000),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Phase 3: Use enhanced error handling
      const config = await import('../../../../config');
      if (config.default.queueProcessing.blockDomains.optimization.smartRetryLogic) {
        logger.debug('🔧 PROCESSOR: Using enhanced error handling', {
          component: 'block-domains-processor',
          operation: 'enhancedErrorHandling',
          jobId: job.id,
          blockNumber: blockData.number,
        });
        
        try {
          await this.handleProcessingError(error as Error, job, blockData);
        } catch (handledError) {
          // If enhanced error handling couldn't resolve it, use standard classification
          const classification = ErrorClassifier.classifyError(handledError as Error, JobType.PROCESS_BLOCK_DOMAINS);
          
          logger.error('❌ PROCESSOR: Block domains processing failed after enhanced handling', {
            component: 'block-domains-processor',
            operation: 'processingFailed',
            jobId: job.id,
            blockNumber: blockData.number,
            blockHash: blockData.hash,
            error: (handledError as Error).message,
            originalError: (error as Error).message,
            classification,
            duration,
            attempts: job.attemptsMade,
            maxAttempts: job.opts?.attempts,
            willRetry: classification.isRetryable && job.attemptsMade < (job.opts?.attempts || 3),
            correlationId,
          });
          
          throw handledError;
        }
      } else {
        // Standard error handling (legacy behavior)
        const classification = ErrorClassifier.classifyError(error as Error, JobType.PROCESS_BLOCK_DOMAINS);
        
        logger.error('❌ PROCESSOR: Block domains processing failed', {
          component: 'block-domains-processor',
          operation: 'processingFailed',
          jobId: job.id,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          error: (error as Error).message,
          errorStack: (error as Error).stack,
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
  }

  /**
   * Helper method to process a single service for a block
   * Replicates the exact logic from SelfHealingBlockProcessor's service processing
   */
  private async processServiceForBlock(
    service: any,
    blockData: BlockData,
    serviceName: string,
  ): Promise<{
    serviceName: string;
    success: boolean;
    extractedCount?: number;
    processedCount?: number;
    processingTime: number;
    error?: string;
  }> {
    const serviceStartTime = Date.now();

    try {
      logger.debug(`🔧 PROCESSOR: Starting ${serviceName} processing`, {
        component: 'block-domains-processor',
        service: serviceName,
        blockNumber: blockData.number,
        operation: 'processServiceForBlock',
      });

      // Step 1: Extract entities from block (same as SelfHealingBlockProcessor)
      const extractedEntities = await service.extractFromBlock(blockData);

      logger.debug(`🔧 PROCESSOR: ${serviceName} extracted entities`, {
        component: 'block-domains-processor',
        service: serviceName,
        blockNumber: blockData.number,
        entityCount: extractedEntities.length,
        operation: 'entitiesExtracted',
      });

      // Step 2: Process extracted entities (includes dependency resolution, same as SelfHealingBlockProcessor)
      const processedResults = await service.processExtractedEntities(extractedEntities);

      const processingTime = Date.now() - serviceStartTime;

      logger.debug(`✅ PROCESSOR: ${serviceName} processing complete`, {
        component: 'block-domains-processor',
        service: serviceName,
        blockNumber: blockData.number,
        extractedCount: extractedEntities.length,
        processedCount: processedResults.length,
        processingTimeMs: processingTime,
        operation: 'serviceComplete',
      });

      return {
        serviceName,
        success: true,
        extractedCount: extractedEntities.length,
        processedCount: processedResults.length,
        processingTime,
      };

    } catch (error) {
      const processingTime = Date.now() - serviceStartTime;

      logger.error(`❌ PROCESSOR: ${serviceName} processing failed`, {
        component: 'block-domains-processor',
        service: serviceName,
        blockNumber: blockData.number,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
        processingTimeMs: processingTime,
        operation: 'serviceFailed',
      });

      return {
        serviceName,
        success: false,
        error: (error as Error).message,
        processingTime,
      };
    }
  }

  // ==================== Phase 3: Enhanced Queue Features ====================

  /**
   * Calculate intelligent priority for block processing based on block characteristics
   * Phase 3: Priority-Based Block Processing
   */
  async calculateBlockPriority(blockData: BlockData): Promise<import('../../../types/service').JobPriority> {
    const { JobPriority } = await import('../../../types/service');
    const config = await import('../../../../config');
    
    const extrinsicsCount = blockData.extrinsics?.length || 0;
    const eventsCount = blockData.events?.length || 0;
    const thresholds = config.default.queueProcessing.blockDomains.complexityThresholds;
    
    logger.debug('🔧 PROCESSOR: Calculating block priority', {
      component: 'priority-calculator',
      blockNumber: blockData.number,
      extrinsicsCount,
      eventsCount,
      operation: 'calculatePriority',
    });

    // Critical: Blocks with validator changes or very high activity
    if (await this.hasValidatorChanges(blockData) || extrinsicsCount > thresholds.extrinsicsCount) {
      logger.info('🔴 PROCESSOR: Block marked as CRITICAL priority', {
        component: 'priority-calculator',
        blockNumber: blockData.number,
        reason: extrinsicsCount > thresholds.extrinsicsCount ? 'high_extrinsics' : 'validator_changes',
        extrinsicsCount,
        priority: 'CRITICAL',
      });
      return JobPriority.CRITICAL;
    }

    // High: Recent blocks (within last N blocks) or large data submissions
    const latestBlock = await this.getLatestProcessedBlock();
    const isRecent = blockData.number > (latestBlock - thresholds.recentBlockWindow);
    const hasLargeDataSubmissions = await this.hasLargeDataSubmissions(blockData, thresholds.dataSubmissionSize);

    if (isRecent || hasLargeDataSubmissions) {
      logger.info('🟡 PROCESSOR: Block marked as HIGH priority', {
        component: 'priority-calculator',
        blockNumber: blockData.number,
        reason: isRecent ? 'recent_block' : 'large_data_submissions',
        isRecent,
        hasLargeDataSubmissions,
        priority: 'HIGH',
      });
      return JobPriority.HIGH;
    }

    // Medium: Standard processing for regular blocks
    logger.debug('🟢 PROCESSOR: Block marked as MEDIUM priority', {
      component: 'priority-calculator',
      blockNumber: blockData.number,
      reason: 'standard_block',
      priority: 'MEDIUM',
    });
    return JobPriority.MEDIUM;
  }

  /**
   * Check if block contains validator changes
   */
  private async hasValidatorChanges(blockData: BlockData): Promise<boolean> {
    if (!blockData.extrinsics) return false;
    
    // Look for validator-related extrinsics (staking pallet calls)
    const validatorExtrinsics = blockData.extrinsics.filter(ext => 
      ext.method?.section === 'staking' && 
      ['validate', 'nominate', 'chill', 'unbond'].includes(ext.method.method)
    );
    
    return validatorExtrinsics.length > 0;
  }

  /**
   * Get the latest processed block number for priority calculation
   */
  private async getLatestProcessedBlock(): Promise<number> {
    try {
      const blockService = await this.getService<any>('blockService');
      const latestBlock = await blockService.getLatestBlock();
      return latestBlock?.number || 0;
    } catch (error) {
      logger.warn('⚠️ PROCESSOR: Failed to get latest block, using default', {
        component: 'priority-calculator',
        error: (error as Error).message,
        defaultValue: 0,
      });
      return 0;
    }
  }

  /**
   * Check if block has large data submissions
   */
  private async hasLargeDataSubmissions(blockData: BlockData, sizeThreshold: number): Promise<boolean> {
    if (!blockData.extrinsics) return false;
    
    // Look for data availability extrinsics and estimate their size
    const dataSubmissionExtrinsics = blockData.extrinsics.filter(ext => 
      ext.method?.section === 'dataAvailability' && 
      ext.method.method === 'submitData'
    );
    
    // Estimate total data size (rough approximation)
    const totalDataSize = dataSubmissionExtrinsics.reduce((total, ext) => {
      // Estimate size based on extrinsic args length
      const argsSize = JSON.stringify((ext as any).args || {}).length;
      return total + argsSize;
    }, 0);
    
    return totalDataSize > sizeThreshold;
  }

  /**
   * Enhanced error handling with ErrorClassifier integration
   * Phase 3: Smart Retry Logic
   */
  private async handleProcessingError(error: Error, job: Job, blockData: BlockData): Promise<void> {
    const classification = ErrorClassifier.classifyError(error, job.name as any);
    const config = await import('../../../../config');
    const retryableTypes = config.default.queueProcessing.blockDomains.deadLetterQueue.retryableErrorTypes;
    
    logger.error('❌ PROCESSOR: Enhanced error handling', {
      component: 'enhanced-error-handler',
      blockNumber: blockData.number,
      jobId: job.id,
      error: error.message,
      classification,
      isRetryable: classification.isRetryable,
      category: classification.category,
      alertLevel: classification.alertLevel,
    });

    // Smart retry logic based on error classification
    if (classification.category === 'network' && retryableTypes.includes('network')) {
      logger.warn('🔄 PROCESSOR: Network error detected, will retry with exponential backoff', {
        component: 'enhanced-error-handler',
        blockNumber: blockData.number,
        jobId: job.id,
        category: classification.category,
        retryDelay: classification.retryDelay,
      });
      // Let Bull queue handle the retry with configured exponential backoff
      throw error;
    }

    if (classification.category === 'data' && !classification.isRetryable) {
      logger.error('🚨 PROCESSOR: Non-retryable data error, moving to dead letter queue', {
        component: 'enhanced-error-handler',
        blockNumber: blockData.number,
        jobId: job.id,
        category: classification.category,
        alertLevel: classification.alertLevel,
        requiresManualIntervention: true,
      });
      
      // Mark job for dead letter queue processing
      await this.moveToDeadLetterQueue(job, error, 'data_corruption');
      return;
    }

    if (classification.category === 'service' && retryableTypes.includes('temporary')) {
      logger.warn('🔄 PROCESSOR: Service error detected, attempting alternative processing', {
        component: 'enhanced-error-handler',
        blockNumber: blockData.number,
        jobId: job.id,
        category: classification.category,
      });
      
      // Try alternative processing approach
      await this.tryAlternativeProcessing(blockData, job);
      return;
    }

    // Default behavior: throw error for standard retry logic
    throw error;
  }

  /**
   * Move job to dead letter queue for special handling
   */
  private async moveToDeadLetterQueue(job: Job, error: Error, reason: string): Promise<void> {
    logger.warn('🔄 PROCESSOR: Moving job to dead letter queue', {
      component: 'dead-letter-handler',
      jobId: job.id,
      jobType: job.name,
      reason,
      error: error.message,
      originalData: job.data,
    });

    // The actual movement is handled by Bull queue's built-in dead letter queue
    // We just need to ensure the job fails with proper classification
    const enhancedError = new Error(`DLQ_MOVE: ${reason} - ${error.message}`);
    (enhancedError as any).dlqReason = reason;
    (enhancedError as any).originalError = error;
    throw enhancedError;
  }

  /**
   * Try alternative processing approach for failed jobs
   */
  private async tryAlternativeProcessing(blockData: BlockData, job: Job): Promise<void> {
    logger.info('🔧 PROCESSOR: Attempting alternative processing approach', {
      component: 'alternative-processor',
      blockNumber: blockData.number,
      jobId: job.id,
      operation: 'alternativeProcessing',
    });

    try {
      // Try processing services sequentially instead of parallel
      const services = [
        { name: 'accountProcessor', service: await this.getService<any>('accountProcessor') },
        { name: 'validatorProcessor', service: await this.getService<any>('validatorProcessor') },
        { name: 'transferProcessor', service: await this.getService<any>('transferProcessor') },
        { name: 'dataSubmissionProcessor', service: await this.getService<any>('dataSubmissionProcessor') },
      ];

      const results = [];
      for (const { name, service } of services) {
        try {
          const result = await this.processServiceForBlock(service, blockData, name);
          results.push(result);
          
          logger.debug('✅ PROCESSOR: Alternative processing service completed', {
            component: 'alternative-processor',
            serviceName: name,
            blockNumber: blockData.number,
            success: result.success,
          });
        } catch (serviceError) {
          logger.warn('⚠️ PROCESSOR: Alternative processing service failed, continuing', {
            component: 'alternative-processor',
            serviceName: name,
            blockNumber: blockData.number,
            error: (serviceError as Error).message,
          });
          
          // Continue with other services even if one fails
          results.push({
            serviceName: name,
            success: false,
            error: (serviceError as Error).message,
            processingTime: 0,
          });
        }
      }

      logger.info('✅ PROCESSOR: Alternative processing completed', {
        component: 'alternative-processor',
        blockNumber: blockData.number,
        jobId: job.id,
        successfulServices: results.filter(r => r.success).length,
        totalServices: results.length,
      });

      // If at least half the services succeeded, consider it a partial success
      const successCount = results.filter(r => r.success).length;
      if (successCount >= results.length / 2) {
        return; // Success, no need to throw
      } else {
        throw new Error(`Alternative processing failed: only ${successCount}/${results.length} services succeeded`);
      }
    } catch (altError) {
      logger.error('❌ PROCESSOR: Alternative processing failed', {
        component: 'alternative-processor',
        blockNumber: blockData.number,
        jobId: job.id,
        error: (altError as Error).message,
      });
      throw altError;
    }
  }

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
      // Phase 4: Use queue-based processing by default with orchestrator fallback
      const orchestrator = await this.getService<any>('blockProcessingOrchestrator').catch(() => null);
      const queueService = await this.getService<any>('queue');
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
      
      // Step 3: Process each block through queue system (Phase 4 upgrade)
      for (const block of indexedBlocks) {
        try {
          if (orchestrator) {
            // Use orchestrator if available (dual-mode support)
            await orchestrator.processBlock(block);
          } else {
            // Use queue-based processing with priority
            await queueService.scheduleBlockDomainProcessingWithPriority(block, {
              priority: await this.calculateBlockPriority(block),
              correlationId: `data-sync-${job.id}-block-${block.number}`,
            });
          }
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