/**
 * Domain Processing Orchestrator - Phase 3
 * 
 * Coordinates all domain processing services with intelligent strategy selection
 * and proper error isolation between services.
 */

import { logger, logError } from '../../utils/logger';
import { 
  BaseService,
  ServiceHealth, 
} from '../types/service';
import { BlockData } from '../types/blockchain';
import {
  DomainProcessingResult,
  ServiceResult,
  DomainProcessingStrategy,
  DomainProcessorConfig,
  ProcessingContext,
  ExtractedEntities,
  DEFAULT_DOMAIN_PROCESSOR_CONFIG,
} from './types/domainProcessing';

export interface IDomainProcessingOrchestrator {
  processAllDomainsForBlock(blockData: BlockData, correlationId?: string): Promise<DomainProcessingResult>;
  determineProcessingStrategy(blockData: BlockData): DomainProcessingStrategy;
  getProcessingStats(): Promise<DomainProcessingStats>;
}

export interface DomainProcessingStats {
  totalBlocksProcessed: number;
  parallelProcessingCount: number;
  sequentialProcessingCount: number;
  averageProcessingTime: number;
  successRate: number;
  serviceStats: Record<string, {
    successCount: number;
    failureCount: number;
    averageTime: number;
  }>;
}

/**
 * Domain Processing Orchestrator Service
 * 
 * Responsibilities:
 * - Coordinate domain processing across all services
 * - Determine optimal processing strategy (parallel vs sequential)
 * - Provide error isolation between domain services
 * - Track processing metrics and performance
 * - Handle service failures gracefully
 */
export class DomainProcessingOrchestrator implements BaseService, IDomainProcessingOrchestrator {
  private config: DomainProcessorConfig;
  private isRunning = false;
  private stats: DomainProcessingStats;
  
  // Service dependencies (injected via service factory)
  private accountProcessor: any;
  private validatorProcessor: any;
  private transferProcessor: any;
  private dataSubmissionProcessor: any;

  constructor(
    accountProcessor: any,
    validatorProcessor: any,
    transferProcessor: any,
    dataSubmissionProcessor: any,
    config: DomainProcessorConfig = DEFAULT_DOMAIN_PROCESSOR_CONFIG,
  ) {
    this.accountProcessor = accountProcessor;
    this.validatorProcessor = validatorProcessor;
    this.transferProcessor = transferProcessor;
    this.dataSubmissionProcessor = dataSubmissionProcessor;
    this.config = config;
    
    this.stats = {
      totalBlocksProcessed: 0,
      parallelProcessingCount: 0,
      sequentialProcessingCount: 0,
      averageProcessingTime: 0,
      successRate: 0,
      serviceStats: {},
    };
  }

  /**
   * Start the orchestrator service
   */
  async start(): Promise<void> {
    try {
      logger.info('DomainProcessingOrchestrator: Starting service', {
        component: 'domain-orchestrator',
      });
      
      this.isRunning = true;
      
      logger.info('DomainProcessingOrchestrator: Service started successfully', {
        component: 'domain-orchestrator',
        config: this.config,
      });
      
    } catch (error) {
      logError(error as Error, { component: 'domain-orchestrator', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the orchestrator service
   */
  async stop(): Promise<void> {
    try {
      logger.info('DomainProcessingOrchestrator: Stopping service', {
        component: 'domain-orchestrator',
        finalStats: this.stats,
      });
      
      this.isRunning = false;
      
      logger.info('DomainProcessingOrchestrator: Service stopped', {
        component: 'domain-orchestrator',
      });
      
    } catch (error) {
      logError(error as Error, { component: 'domain-orchestrator', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      return {
        healthy: this.isRunning,
        lastCheck: now,
        details: {
          isRunning: this.isRunning,
          totalBlocksProcessed: this.stats.totalBlocksProcessed,
          successRate: this.stats.successRate,
          averageProcessingTime: this.stats.averageProcessingTime,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          isRunning: this.isRunning,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Process all domain services for a block in optimal order
   */
  async processAllDomainsForBlock(
    blockData: BlockData,
    correlationId?: string,
  ): Promise<DomainProcessingResult> {
    const startTime = Date.now();
    
    logger.info('🔧 DOMAIN ORCHESTRATOR: Starting block domain processing', {
      component: 'domain-orchestrator',
      blockNumber: blockData.number,
      correlationId,
    });

    try {
      // Step 1: Determine processing strategy based on block complexity
      const strategy = this.determineProcessingStrategy(blockData);
      
      logger.debug('🔧 DOMAIN ORCHESTRATOR: Processing strategy determined', {
        component: 'domain-orchestrator',
        blockNumber: blockData.number,
        strategy: strategy.type,
        reason: strategy.reason,
        expectedDuration: strategy.expectedDuration,
        correlationId,
      });

      // Step 2: Create processing context
      const context: ProcessingContext = {
        blockNumber: blockData.number,
        correlationId,
        startTime,
        strategy: strategy.type,
        metadata: {
          extrinsicsCount: blockData.extrinsics?.length || 0,
          eventsCount: blockData.events?.length || 0,
          processingComplexity: strategy.riskLevel,
          estimatedProcessingTime: strategy.expectedDuration,
        },
      };

      // Step 3: Execute processing based on strategy
      let results: ServiceResult[];

      if (strategy.type === 'PARALLEL' && this.config.enableParallelProcessing) {
        results = await this.processServicesInParallel(blockData, context);
        this.stats.parallelProcessingCount++;
      } else {
        results = await this.processServicesSequentially(blockData, context);
        this.stats.sequentialProcessingCount++;
      }

      // Step 4: Aggregate and validate results
      const summary = this.aggregateResults(results, blockData, Date.now() - startTime, strategy.type, correlationId);

      // Step 5: Update statistics
      this.updateStats(summary, results);

      logger.info('✅ DOMAIN ORCHESTRATOR: Block domain processing completed', {
        component: 'domain-orchestrator',
        blockNumber: blockData.number,
        strategy: strategy.type,
        successfulServices: summary.successfulServices,
        totalServices: summary.totalServices,
        duration: summary.totalProcessingTime,
        correlationId,
      });

      return summary;

    } catch (error) {
      logError(error as Error, {
        component: 'domain-orchestrator',
        action: 'processAllDomainsForBlock',
        blockNumber: blockData.number,
        correlationId,
      });

      // Return failed result
      return {
        blockNumber: blockData.number,
        totalServices: 4,
        successfulServices: 0,
        failedServices: 4,
        totalProcessingTime: Date.now() - startTime,
        strategy: 'SEQUENTIAL',
        serviceResults: [],
        overallSuccess: false,
        correlationId,
      };
    }
  }

  /**
   * Determine optimal processing strategy based on block characteristics
   */
  determineProcessingStrategy(blockData: BlockData): DomainProcessingStrategy {
    const extrinsicsCount = blockData.extrinsics?.length || 0;
    const eventsCount = blockData.events?.length || 0;

    // Check for validator-related extrinsics
    const hasValidatorExtrinsics = blockData.extrinsics?.some(ext =>
      ext.method?.section === 'staking' || 
      ext.method?.section === 'session' ||
      ext.method?.section === 'validatorSet',
    ) || false;

    // Check for large data submissions
    const hasLargeDataSubmissions = blockData.extrinsics?.some(ext =>
      ext.method?.section === 'dataAvailability' && 
      ext.method?.args && 
      JSON.stringify(ext.method.args).length > 10000,
    ) || false;

    // Determine strategy based on complexity thresholds
    if (extrinsicsCount > this.config.sequentialThreshold.extrinsicsCount ||
        eventsCount > this.config.sequentialThreshold.eventsCount ||
        hasValidatorExtrinsics ||
        hasLargeDataSubmissions) {
      
      return {
        type: 'SEQUENTIAL',
        reason: `Complex block: ${extrinsicsCount} extrinsics, ${eventsCount} events, validator=${hasValidatorExtrinsics}, largeData=${hasLargeDataSubmissions}`,
        expectedDuration: 5000 + (extrinsicsCount * 20) + (eventsCount * 5),
        riskLevel: 'HIGH',
      };
    }

    // Use parallel processing for simpler blocks
    return {
      type: 'PARALLEL',
      reason: `Simple block: ${extrinsicsCount} extrinsics, ${eventsCount} events`,
      expectedDuration: 2000 + (extrinsicsCount * 10) + (eventsCount * 2),
      riskLevel: 'LOW',
    };
  }

  /**
   * Process services in parallel (default strategy for simple blocks)
   */
  private async processServicesInParallel(blockData: BlockData, context: ProcessingContext): Promise<ServiceResult[]> {
    logger.debug('🔧 DOMAIN ORCHESTRATOR: Using parallel processing strategy', {
      component: 'domain-orchestrator',
      blockNumber: context.blockNumber,
      correlationId: context.correlationId,
    });

    const servicePromises = [
      this.processServiceSafely(this.accountProcessor, blockData, 'account', context),
      this.processServiceSafely(this.validatorProcessor, blockData, 'validator', context),
      this.processServiceSafely(this.transferProcessor, blockData, 'transfer', context),
      this.processServiceSafely(this.dataSubmissionProcessor, blockData, 'dataSubmission', context),
    ];

    return await Promise.all(servicePromises);
  }

  /**
   * Process services sequentially (for complex blocks)
   */
  private async processServicesSequentially(blockData: BlockData, context: ProcessingContext): Promise<ServiceResult[]> {
    logger.debug('🔧 DOMAIN ORCHESTRATOR: Using sequential processing strategy', {
      component: 'domain-orchestrator',
      blockNumber: context.blockNumber,
      correlationId: context.correlationId,
    });

    const results: ServiceResult[] = [];
    const services = [
      { processor: this.accountProcessor, name: 'account' },
      { processor: this.validatorProcessor, name: 'validator' },
      { processor: this.transferProcessor, name: 'transfer' },
      { processor: this.dataSubmissionProcessor, name: 'dataSubmission' },
    ];

    for (const { processor, name } of services) {
      const result = await this.processServiceSafely(processor, blockData, name, context);
      results.push(result);

      // Stop processing if critical service fails
      if (!result.success && this.config.criticalServices.includes(name)) {
        logger.warn('🔧 DOMAIN ORCHESTRATOR: Critical service failed, stopping sequential processing', {
          component: 'domain-orchestrator',
          blockNumber: context.blockNumber,
          failedService: name,
          correlationId: context.correlationId,
        });
        break;
      }
    }

    return results;
  }

  /**
   * Process individual service with error isolation
   */
  private async processServiceSafely(
    processor: any,
    blockData: BlockData,
    serviceName: string,
    context: ProcessingContext,
  ): Promise<ServiceResult> {
    const serviceStartTime = Date.now();
    let retryAttempts = 0;

    while (retryAttempts <= this.config.maxRetryAttempts) {
      try {
        logger.debug('🔧 DOMAIN ORCHESTRATOR: Processing service', {
          component: 'domain-orchestrator',
          blockNumber: context.blockNumber,
          serviceName,
          attempt: retryAttempts + 1,
          correlationId: context.correlationId,
        });

        // Extract entities from block
        const extractedEntities = await this.extractEntitiesFromBlock(processor, blockData, serviceName);

        // Process extracted entities
        const processedResults = await this.processExtractedEntities(processor, extractedEntities, serviceName);

        const processingTime = Date.now() - serviceStartTime;

        logger.debug('✅ DOMAIN ORCHESTRATOR: Service processing completed', {
          component: 'domain-orchestrator',
          blockNumber: context.blockNumber,
          serviceName,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
          processingTime,
          correlationId: context.correlationId,
        });

        return {
          serviceName,
          success: true,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
          processingTime,
          retryAttempts,
        };

      } catch (error) {
        retryAttempts++;
        const errorMessage = (error as Error).message;

        if (retryAttempts > this.config.maxRetryAttempts) {
          logger.error('❌ DOMAIN ORCHESTRATOR: Service processing failed after retries', {
            component: 'domain-orchestrator',
            blockNumber: context.blockNumber,
            serviceName,
            error: errorMessage,
            retryAttempts,
            correlationId: context.correlationId,
          });

          return {
            serviceName,
            success: false,
            error: errorMessage,
            processingTime: Date.now() - serviceStartTime,
            retryAttempts,
          };
        }

        logger.warn('⚠️ DOMAIN ORCHESTRATOR: Service processing failed, retrying', {
          component: 'domain-orchestrator',
          blockNumber: context.blockNumber,
          serviceName,
          error: errorMessage,
          attempt: retryAttempts,
          correlationId: context.correlationId,
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryAttempts));
      }
    }

    // This should never be reached, but TypeScript requires it
    return {
      serviceName,
      success: false,
      error: 'Unexpected error in retry loop',
      processingTime: Date.now() - serviceStartTime,
      retryAttempts,
    };
  }

  /**
   * Extract entities from block using service-specific logic
   */
  private async extractEntitiesFromBlock(processor: any, blockData: BlockData, serviceName: string): Promise<any[]> {
    if (processor && typeof processor.extractFromBlock === 'function') {
      return await processor.extractFromBlock(blockData);
    }
    
    // Fallback: return empty array if service doesn't have extraction method
    logger.debug('🔧 DOMAIN ORCHESTRATOR: Service missing extractFromBlock method, using fallback', {
      component: 'domain-orchestrator',
      serviceName,
    });
    return [];
  }

  /**
   * Process extracted entities using service-specific logic
   */
  private async processExtractedEntities(processor: any, entities: any[], serviceName: string): Promise<any[]> {
    if (processor && typeof processor.processExtractedEntities === 'function') {
      return await processor.processExtractedEntities(entities);
    }
    
    // Fallback: return entities as-is if service doesn't have processing method
    logger.debug('🔧 DOMAIN ORCHESTRATOR: Service missing processExtractedEntities method, using fallback', {
      component: 'domain-orchestrator',
      serviceName,
    });
    return entities;
  }

  /**
   * Aggregate service results into domain processing summary
   */
  private aggregateResults(
    results: ServiceResult[],
    blockData: BlockData,
    totalTime: number,
    strategy: 'PARALLEL' | 'SEQUENTIAL',
    correlationId?: string,
  ): DomainProcessingResult {
    const successfulServices = results.filter(r => r.success).length;
    const failedServices = results.length - successfulServices;
    const overallSuccess = failedServices === 0;

    return {
      blockNumber: blockData.number,
      totalServices: results.length,
      successfulServices,
      failedServices,
      totalProcessingTime: totalTime,
      strategy,
      serviceResults: results,
      overallSuccess,
      correlationId,
    };
  }

  /**
   * Update internal statistics
   */
  private updateStats(summary: DomainProcessingResult, results: ServiceResult[]): void {
    this.stats.totalBlocksProcessed++;
    
    // Update average processing time
    const currentAvg = this.stats.averageProcessingTime;
    const newAvg = (currentAvg * (this.stats.totalBlocksProcessed - 1) + summary.totalProcessingTime) / this.stats.totalBlocksProcessed;
    this.stats.averageProcessingTime = newAvg;
    
    // Update success rate
    const successCount = this.stats.totalBlocksProcessed - (summary.overallSuccess ? 0 : 1);
    this.stats.successRate = (successCount / this.stats.totalBlocksProcessed) * 100;
    
    // Update service-specific stats
    results.forEach(result => {
      if (!this.stats.serviceStats[result.serviceName]) {
        this.stats.serviceStats[result.serviceName] = {
          successCount: 0,
          failureCount: 0,
          averageTime: 0,
        };
      }
      
      const serviceStats = this.stats.serviceStats[result.serviceName];
      
      if (result.success) {
        serviceStats.successCount++;
      } else {
        serviceStats.failureCount++;
      }
      
      const totalCalls = serviceStats.successCount + serviceStats.failureCount;
      serviceStats.averageTime = (serviceStats.averageTime * (totalCalls - 1) + result.processingTime) / totalCalls;
    });
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<DomainProcessingStats> {
    return { ...this.stats };
  }
}

/**
 * Factory function to create a DomainProcessingOrchestrator instance
 */
export const createDomainProcessingOrchestrator = (
  accountProcessor: any,
  validatorProcessor: any,
  transferProcessor: any,
  dataSubmissionProcessor: any,
  config?: DomainProcessorConfig,
): DomainProcessingOrchestrator => {
  return new DomainProcessingOrchestrator(
    accountProcessor,
    validatorProcessor,
    transferProcessor,
    dataSubmissionProcessor,
    config,
  );
}; 