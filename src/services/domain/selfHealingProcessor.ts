import { logger, logError } from '../../utils/logger';
import { BaseService, ServiceHealth } from '../types/service';
import { BlockData } from '../types/blockchain';
import { SelfHealingProcessor } from '../types/self-healing';
import { AccountService } from './account';
import { ValidatorService } from './validator';
import { TransferService } from './transfer';
import { DataSubmissionService } from './dataSubmission';
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
    accountService: AccountService,
    validatorService: ValidatorService,
    transferService: TransferService,
    dataSubmissionService: DataSubmissionService,
    queueService: QueueService,
  ) {
    // Register all self-healing services
    this.services.set('account', accountService);
    this.services.set('validator', validatorService);
    this.services.set('transfer', transferService);
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
        this.processingStats.totalErrors++;

        return {
          service: serviceName,
          success: false,
          error: (error as Error).message,
          processingTime,
        };
      }
    });

    // Wait for all services to complete
    const results = await Promise.all(processingPromises);
    
    // Update processing statistics
    const successfulServices = results.filter(r => r.success).length;
    const totalEntitiesProcessed = results.reduce((sum, r) => sum + (r.extractedCount || 0), 0);
    
    // totalEntitiesProcessed tracking removed for simplification

    logger.debug('SelfHealingBlockProcessor: All services completed', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      successfulServices,
      totalServices: results.length,
      totalEntitiesProcessed,
      results: results.map(r => ({
        service: r.service,
        success: r.success,
        extractedCount: r.extractedCount || 0,
        processedCount: r.processedCount || 0,
        processingTime: r.processingTime,
      })),
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
      totalErrors: this.processingStats.totalErrors,
      overallSuccessRate: this.processingStats.blocksProcessed > 0 
        ? ((this.processingStats.blocksProcessed - this.processingStats.totalErrors) / this.processingStats.blocksProcessed * 100).toFixed(2) + '%'
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
      totalErrors: 0,
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
  queueService: QueueService,
): SelfHealingBlockProcessor => {
  return new SelfHealingBlockProcessor(
    accountService, 
    validatorService, 
    transferService, 
    dataSubmissionService,
    queueService,
  );
}; 