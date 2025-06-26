import { logger, logError } from '../../utils/logger';
import { BaseService, ServiceHealth } from '../types/service';
import { BlockData } from '../types/blockchain';
import { SelfHealingProcessor } from '../types/self-healing';
import { AccountProcessor } from './account/AccountProcessor';
import { ValidatorProcessor } from './validator/ValidatorProcessor';
import { TransferProcessor } from './transfer/TransferProcessor';
// TODO: Re-enable when DataSubmissionProcessor properly implements SelfHealingProcessor interface
// import { DataSubmissionService } from './dataSubmission';

// Temporary type alias for DataSubmissionService until migration is complete
type DataSubmissionService = SelfHealingProcessor;
import { QueueService } from '../core/queue';
// Dependency detection engine removed - using queue-based approach

/**
 * Self-Healing Block Processor Service
 * 
 * Orchestrates block processing across multiple domain services
 * with automatic error recovery and self-healing capabilities.
 * 
 * TASK-007: Enhanced with dependency detection and queue integration
 * Now uses queue-based dependency management instead of complex detection engine
 */
export class SelfHealingBlockProcessor implements BaseService {
  private services: Map<string, SelfHealingProcessor> = new Map();
  private queueService: QueueService;
  // dependencyDetectionEngine removed - using queue-based approach
  private isRunning = false;
  private processingStats = {
    blocksProcessed: 0,
    totalErrors: 0,
    serviceSuccessRates: new Map<string, { success: number; total: number }>(),
  };

  constructor(
    accountProcessor: AccountProcessor,
    validatorProcessor: ValidatorProcessor,
    transferProcessor: TransferProcessor,
    dataSubmissionService: DataSubmissionService,
    queueService: QueueService,
  ) {
    // Register all self-healing services
    this.services.set('account', accountProcessor);
    this.services.set('validator', validatorProcessor);
    this.services.set('transfer', transferProcessor);
    this.services.set('dataSubmission', dataSubmissionService);

    // TASK-007: Initialize queue service (dependency detection now handled by queue)
    this.queueService = queueService;

    // Initialize service stats
    for (const serviceName of this.services.keys()) {
      this.processingStats.serviceSuccessRates.set(serviceName, { success: 0, total: 0 });
    }

    logger.info('SelfHealingBlockProcessor: Initialized with services', {
      component: 'self-healing-processor',
      services: Array.from(this.services.keys()),
      queueIntegration: true,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info('SelfHealingBlockProcessor: Starting service', { 
      component: 'self-healing-processor',
    });

    this.isRunning = true;

    logger.info('SelfHealingBlockProcessor: Service started successfully', { 
      component: 'self-healing-processor',
      registeredServices: Array.from(this.services.keys()),
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('SelfHealingBlockProcessor: Stopping service', { 
      component: 'self-healing-processor',
    });

    this.isRunning = false;

    // Log final statistics
    logger.info('SelfHealingBlockProcessor: Final processing statistics', {
      component: 'self-healing-processor',
      stats: this.getProcessingStats(),
    });

    logger.info('SelfHealingBlockProcessor: Service stopped', { 
      component: 'self-healing-processor',
    });
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'SelfHealingBlockProcessor',
        version: '1.0.0',
        isRunning: this.isRunning,
        registeredServices: Array.from(this.services.keys()),
        processingStats: this.getProcessingStats(),
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Process a block using all self-healing services in parallel
   * TASK-013: Simplified - now uses queue-based dependency management
   * This is the main orchestration method that replaces complex sync logic
   */
  async processBlock(blockData: BlockData): Promise<void> {
    if (!this.isRunning) {
      throw new Error('SelfHealingBlockProcessor is not running');
    }

    const startTime = Date.now();

    logger.debug('SelfHealingBlockProcessor: Processing block with queue-based dependencies', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      hash: blockData.hash,
      extrinsicsCount: blockData.extrinsics.length,
      timestamp: blockData.timestamp,
    });

    // TASK-013: Simplified dependency handling - queue manages dependencies automatically
    await this.performBlockProcessing(blockData);

    const processingTime = Date.now() - startTime;
    this.processingStats.blocksProcessed++;

    logger.debug('SelfHealingBlockProcessor: Block processing complete', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      processingTimeMs: processingTime,
      totalBlocksProcessed: this.processingStats.blocksProcessed,
    });
  }

  /**
   * Original block processing logic (extracted from processBlock)
   * TASK-007: This is now called through the dependency check wrapper
   */
  private async performBlockProcessing(blockData: BlockData): Promise<void> {
    // Process all services independently and in parallel
    const processingPromises = Array.from(this.services.entries()).map(async ([serviceName, service]) => {
      const serviceStartTime = Date.now();
      
      try {
        logger.debug(`SelfHealingBlockProcessor: Starting ${serviceName} processing`, {
          component: 'self-healing-processor',
          service: serviceName,
          blockNumber: blockData.number,
        });

        // Step 1: Extract entities from block
        const extractedEntities = await service.extractFromBlock(blockData);
        
        logger.debug(`SelfHealingBlockProcessor: ${serviceName} extracted entities`, {
          component: 'self-healing-processor',
          service: serviceName,
          blockNumber: blockData.number,
          entityCount: extractedEntities.length,
        });

        // Step 2: Process extracted entities (includes dependency resolution)
        const processedResults = await service.processExtractedEntities(extractedEntities);
        
        const processingTime = Date.now() - serviceStartTime;

        logger.debug(`SelfHealingBlockProcessor: ${serviceName} processing complete`, {
          component: 'self-healing-processor',
          service: serviceName,
          blockNumber: blockData.number,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
          processingTimeMs: processingTime,
        });

        // Update success statistics
        const serviceStats = this.processingStats.serviceSuccessRates.get(serviceName);
        if (serviceStats) {
          serviceStats.success++;
          serviceStats.total++;
        }

        return {
          serviceName,
          success: true,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
          processingTime,
        };

      } catch (error) {
        const processingTime = Date.now() - serviceStartTime;
        this.processingStats.totalErrors++;

        // Update failure statistics
        const serviceStats = this.processingStats.serviceSuccessRates.get(serviceName);
        if (serviceStats) {
          serviceStats.total++;
        }

        logError(error as Error, {
          component: 'self-healing-processor',
          service: serviceName,
          blockNumber: blockData.number,
          action: 'processBlock',
        });

        return {
          serviceName,
          success: false,
          error: (error as Error).message,
          processingTime,
        };
      }
    });

    // Wait for all services to complete (or fail)
    const results = await Promise.all(processingPromises);

    // Log aggregated results
    const successfulServices = results.filter(r => r.success).length;
    const totalServices = results.length;

    logger.debug('SelfHealingBlockProcessor: All services completed', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      successfulServices,
      totalServices,
      successRate: successfulServices / totalServices,
      results: results.map(r => ({
        service: r.serviceName,
        success: r.success,
        extractedCount: 'extractedCount' in r ? r.extractedCount : 0,
        processedCount: 'processedCount' in r ? r.processedCount : 0,
        processingTime: r.processingTime,
      })),
    });

    // If any critical services failed, this might indicate data integrity issues
    // but we continue processing to maintain system availability
    if (successfulServices < totalServices) {
      logger.warn('SelfHealingBlockProcessor: Some services failed during block processing', {
        component: 'self-healing-processor',
        blockNumber: blockData.number,
        failedServices: results.filter(r => !r.success).map(r => r.serviceName),
        successRate: successfulServices / totalServices,
      });
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    const serviceStats: Record<string, { successRate: number; total: number; success: number }> = {};
    
    for (const [serviceName, stats] of this.processingStats.serviceSuccessRates.entries()) {
      serviceStats[serviceName] = {
        successRate: stats.total > 0 ? stats.success / stats.total : 0,
        total: stats.total,
        success: stats.success,
      };
    }

    return {
      blocksProcessed: this.processingStats.blocksProcessed,
      totalErrors: this.processingStats.totalErrors,
      errorRate: this.processingStats.blocksProcessed > 0 
        ? this.processingStats.totalErrors / this.processingStats.blocksProcessed 
        : 0,
      serviceStats,
    };
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.processingStats = {
      blocksProcessed: 0,
      totalErrors: 0,
      serviceSuccessRates: new Map(),
    };

    // Reinitialize service stats
    for (const serviceName of this.services.keys()) {
      this.processingStats.serviceSuccessRates.set(serviceName, { success: 0, total: 0 });
    }

    logger.info('SelfHealingBlockProcessor: Statistics reset', {
      component: 'self-healing-processor',
    });
  }

  /**
   * Get list of registered services
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Check if a specific service is registered
   */
  hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }
}

export const createSelfHealingBlockProcessor = (
  accountProcessor: AccountProcessor,
  validatorProcessor: ValidatorProcessor,
  transferProcessor: TransferProcessor,
  dataSubmissionService: DataSubmissionService,
  queueService: QueueService,
): SelfHealingBlockProcessor => {
  return new SelfHealingBlockProcessor(
    accountProcessor,
    validatorProcessor,
    transferProcessor,
    dataSubmissionService,
    queueService,
  );
}; 