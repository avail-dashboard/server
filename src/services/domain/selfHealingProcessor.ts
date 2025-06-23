import { logger, logError } from '../../utils/logger';
import { BaseService, ServiceHealth } from '../types/service';
import { SelfHealingProcessor } from '../types/self-healing';
import { BlockData } from '../types/blockchain';
import { AccountService } from './account';
import { ValidatorService } from './validator';
import { TransferService } from './transfer';
import { DataSubmissionService } from './dataSubmission';

/**
 * SelfHealingBlockProcessor - Orchestrates all self-healing services (Phase 6)
 * 
 * Responsibilities:
 * - Process blocks using all self-healing services in parallel
 * - Ensure service failures don't cascade to other services
 * - Provide comprehensive logging and error reporting
 * - Replace the complex DataProcessorService with simple orchestration
 * - Enable independent service processing without tight coupling
 */
export class SelfHealingBlockProcessor implements BaseService {
  private services: Map<string, SelfHealingProcessor> = new Map();
  private isRunning = false;
  private processingStats = {
    blocksProcessed: 0,
    totalEntitiesProcessed: 0,
    totalFailures: 0,
    serviceSuccessRates: new Map<string, { success: number; total: number }>(),
  };

  constructor(
    accountService: AccountService,
    validatorService: ValidatorService,
    transferService: TransferService,
    dataSubmissionService: DataSubmissionService,
  ) {
    // Register all self-healing services
    this.services.set('account', accountService);
    this.services.set('validator', validatorService);
    this.services.set('transfer', transferService);
    this.services.set('dataSubmission', dataSubmissionService);

    // Initialize service stats
    for (const serviceName of this.services.keys()) {
      this.processingStats.serviceSuccessRates.set(serviceName, { success: 0, total: 0 });
    }

    logger.info('SelfHealingBlockProcessor: Initialized with services', {
      component: 'self-healing-processor',
      services: Array.from(this.services.keys()),
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
   * This is the main orchestration method that replaces complex sync logic
   */
  async processBlock(blockData: BlockData): Promise<void> {
    if (!this.isRunning) {
      throw new Error('SelfHealingBlockProcessor is not running');
    }

    const startTime = Date.now();

    logger.debug('SelfHealingBlockProcessor: Processing block', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      hash: blockData.hash,
      extrinsicsCount: blockData.extrinsics.length,
      timestamp: blockData.timestamp,
    });

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
          service: serviceName,
          success: true,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
          processingTime,
          results: processedResults,
        };

      } catch (error) {
        const processingTime = Date.now() - serviceStartTime;

        logError(error as Error, {
          component: 'self-healing-processor',
          service: serviceName,
          action: 'processBlock',
          blockNumber: blockData.number,
          processingTimeMs: processingTime,
        });

        // Update failure statistics
        const serviceStats = this.processingStats.serviceSuccessRates.get(serviceName);
        if (serviceStats) {
          serviceStats.total++;
        }
        this.processingStats.totalFailures++;

        return {
          service: serviceName,
          success: false,
          error: (error as Error).message,
          processingTime,
          extractedCount: 0,
          processedCount: 0,
        };
      }
    });

    // Wait for all services to complete (don't fail if one service fails)
    const results = await Promise.allSettled(processingPromises);
    
    const totalProcessingTime = Date.now() - startTime;

    // Collect results and statistics
    const serviceResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceName = Array.from(this.services.keys())[index];
        logError(new Error(result.reason), {
          component: 'self-healing-processor',
          service: serviceName,
          action: 'processBlock',
          blockNumber: blockData.number,
          error: 'Promise rejected',
        });
        return {
          service: serviceName,
          success: false,
          error: result.reason,
          processingTime: 0,
          extractedCount: 0,
          processedCount: 0,
        };
      }
    });

    // Calculate summary statistics
    const successful = serviceResults.filter(r => r.success).length;
    const failed = serviceResults.length - successful;
    const totalEntities = serviceResults.reduce((sum, r) => sum + r.processedCount, 0);

    // Update global statistics
    this.processingStats.blocksProcessed++;
    this.processingStats.totalEntitiesProcessed += totalEntities;

    // Log comprehensive processing summary
    logger.info('SelfHealingBlockProcessor: Block processing complete', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      hash: blockData.hash,
      totalProcessingTimeMs: totalProcessingTime,
      serviceResults: {
        successful,
        failed,
        totalServices: serviceResults.length,
      },
      entityProcessing: {
        totalEntitiesProcessed: totalEntities,
        serviceBreakdown: serviceResults.map(r => ({
          service: r.service,
          success: r.success,
          entitiesProcessed: r.processedCount,
          processingTimeMs: r.processingTime,
        })),
      },
    });

    // Log any failures for monitoring
    const failedServices = serviceResults.filter(r => !r.success);
    if (failedServices.length > 0) {
      logger.warn('SelfHealingBlockProcessor: Some services failed during block processing', {
        component: 'self-healing-processor',
        blockNumber: blockData.number,
        failedServices: failedServices.map(r => ({
          service: r.service,
          error: r.error,
        })),
      });
    }

    // The block is considered processed even if some services failed
    // This provides resilience - partial failures don't stop the sync
    logger.debug('SelfHealingBlockProcessor: Block processing result', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      status: failed === 0 ? 'complete' : 'partial',
      successfulServices: successful,
      failedServices: failed,
    });
  }

  /**
   * Get comprehensive processing statistics
   */
  getProcessingStats() {
    const serviceStats: Record<string, any> = {};
    
    for (const [serviceName, stats] of this.processingStats.serviceSuccessRates.entries()) {
      serviceStats[serviceName] = {
        successRate: stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) + '%' : '0%',
        successful: stats.success,
        total: stats.total,
        failed: stats.total - stats.success,
      };
    }

    return {
      blocksProcessed: this.processingStats.blocksProcessed,
      totalEntitiesProcessed: this.processingStats.totalEntitiesProcessed,
      totalFailures: this.processingStats.totalFailures,
      overallSuccessRate: this.processingStats.blocksProcessed > 0 
        ? ((this.processingStats.blocksProcessed - this.processingStats.totalFailures) / this.processingStats.blocksProcessed * 100).toFixed(2) + '%'
        : '0%',
      serviceStatistics: serviceStats,
      registeredServices: Array.from(this.services.keys()),
    };
  }

  /**
   * Reset processing statistics (useful for testing)
   */
  resetStats(): void {
    this.processingStats = {
      blocksProcessed: 0,
      totalEntitiesProcessed: 0,
      totalFailures: 0,
      serviceSuccessRates: new Map(),
    };

    // Re-initialize service stats
    for (const serviceName of this.services.keys()) {
      this.processingStats.serviceSuccessRates.set(serviceName, { success: 0, total: 0 });
    }

    logger.debug('SelfHealingBlockProcessor: Processing statistics reset', {
      component: 'self-healing-processor',
    });
  }

  /**
   * Get registered services info
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

// Factory function
export const createSelfHealingBlockProcessor = (
  accountService: AccountService,
  validatorService: ValidatorService,
  transferService: TransferService,
  dataSubmissionService: DataSubmissionService,
): SelfHealingBlockProcessor => {
  return new SelfHealingBlockProcessor(
    accountService, 
    validatorService, 
    transferService, 
    dataSubmissionService,
  );
}; 