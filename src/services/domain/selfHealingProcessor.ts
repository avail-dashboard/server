import { logger, logError } from '../../utils/logger';
import { BaseService, ServiceHealth, JobType } from '../types/service';
import { SelfHealingProcessor } from '../types/self-healing';
import { BlockData } from '../types/blockchain';
import { AccountService } from './account';
import { ValidatorService } from './validator';
import { TransferService } from './transfer';
import { DataSubmissionService } from './dataSubmission';
import { QueueService } from '../core/queue';
import { DependencyDetectionEngineService } from './dependencyDetectionEngine';
import { ProcessedEntity } from '../types/dependency';

/**
 * SelfHealingBlockProcessor - Orchestrates all self-healing services (Phase 6)
 * 
 * TASK-007: Now includes automatic dependency detection and resolution
 * 
 * Responsibilities:
 * - Process blocks using all self-healing services in parallel
 * - Ensure service failures don't cascade to other services
 * - Provide comprehensive logging and error reporting
 * - Replace the complex DataProcessorService with simple orchestration
 * - Enable independent service processing without tight coupling
 * - Automatic dependency detection and resolution (NEW)
 */
export class SelfHealingBlockProcessor implements BaseService {
  private services: Map<string, SelfHealingProcessor> = new Map();
  private queueService: QueueService;
  private dependencyDetectionEngine: DependencyDetectionEngineService;
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
    queueService: QueueService,
    dependencyDetectionEngine: DependencyDetectionEngineService,
  ) {
    // Register all self-healing services
    this.services.set('account', accountService);
    this.services.set('validator', validatorService);
    this.services.set('transfer', transferService);
    this.services.set('dataSubmission', dataSubmissionService);

    // TASK-007: Initialize dependency services
    this.queueService = queueService;
    this.dependencyDetectionEngine = dependencyDetectionEngine;

    // Initialize service stats
    for (const serviceName of this.services.keys()) {
      this.processingStats.serviceSuccessRates.set(serviceName, { success: 0, total: 0 });
    }

    logger.info('SelfHealingBlockProcessor: Initialized with services', {
      component: 'self-healing-processor',
      services: Array.from(this.services.keys()),
      dependencyIntegration: true,
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
   * TASK-007: Now includes automatic dependency detection and resolution
   * This is the main orchestration method that replaces complex sync logic
   */
  async processBlock(blockData: BlockData): Promise<void> {
    if (!this.isRunning) {
      throw new Error('SelfHealingBlockProcessor is not running');
    }

    const startTime = Date.now();

    logger.debug('SelfHealingBlockProcessor: Processing block with dependency detection', {
      component: 'self-healing-processor',
      blockNumber: blockData.number,
      hash: blockData.hash,
      extrinsicsCount: blockData.extrinsics.length,
      timestamp: blockData.timestamp,
    });

    // TASK-007: Use dependency detection pattern for block processing
    await this.processWithDependencyCheck(
      'block',
      blockData.number.toString(),
      async () => {
        // Original block processing logic
        return this.performBlockProcessing(blockData);
      }
    );

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
   * TASK-007: Process block with automatic dependency detection and resolution
   * Adapted from EnhancedProcessor pattern
   */
  private async processWithDependencyCheck(
    entityType: 'block' | 'account' | 'rollup' | 'validator',
    entityId: string,
    processingFn: () => Promise<void>
  ): Promise<void> {
    try {
      logger.debug('SelfHealingBlockProcessor: Starting dependency check', {
        component: 'self-healing-processor',
        entityType,
        entityId,
      });

      // Step 1: Create a processed entity for dependency detection
      const processedEntity: ProcessedEntity = {
        id: entityId,
        type: entityType,
        blockNumber: entityType === 'block' ? parseInt(entityId) : undefined,
        data: {}, // Will be populated by the detection engine
        timestamp: new Date(),
      };

      // Step 2: Detect missing dependencies
      const dependencyReport = await this.dependencyDetectionEngine.detectMissingDependencies(processedEntity);

      // Step 3: If dependencies are missing, queue resolution jobs
      if (dependencyReport.resolutionRequired && dependencyReport.missingDependencies.length > 0) {
        logger.info('SelfHealingBlockProcessor: Missing dependencies detected, queuing resolution', {
          component: 'self-healing-processor',
          entityType,
          entityId,
          missingCount: dependencyReport.totalMissing,
          criticalCount: dependencyReport.criticalMissing,
        });

        // Queue dependency detection job (triggers resolution workflow)
        await this.queueService.addJob(JobType.DEPENDENCY_DETECTION, {
          entityType,
          entityId,
          priority: dependencyReport.criticalMissing > 0 ? 1 : 2,
          blockNumber: processedEntity.blockNumber,
          requiredBy: entityId,
        });

        // For self-healing, we continue with partial data but log the dependency issues
        logger.info('SelfHealingBlockProcessor: Continuing with partial data (self-healing mode)', {
          component: 'self-healing-processor',
          entityType,
          entityId,
          missingCount: dependencyReport.totalMissing,
        });
      }

      // Step 4: Continue with original processing
      await processingFn();

      logger.debug('SelfHealingBlockProcessor: Dependency check completed', {
        component: 'self-healing-processor',
        entityType,
        entityId,
        hadDependencies: dependencyReport.resolutionRequired,
      });

    } catch (error) {
      // TASK-007: Apply John's error classification framework
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('dependency')) {
        logger.warn('SelfHealingBlockProcessor: Dependency resolution failed, continuing with self-healing', { 
          component: 'self-healing-processor',
          entityType, 
          entityId, 
          error: errorMessage,
        });
        
        // Continue with processing despite dependency issues (self-healing behavior)
        await processingFn();
      } else {
        logger.error('SelfHealingBlockProcessor: Processing failed', { 
          component: 'self-healing-processor',
          entityType, 
          entityId, 
          error: errorMessage,
        });
        throw error;
      }
    }
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
        this.processingStats.totalFailures++;

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
    
    this.processingStats.totalEntitiesProcessed += totalEntitiesProcessed;

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
  queueService: QueueService,
  dependencyDetectionEngine: DependencyDetectionEngineService,
): SelfHealingBlockProcessor => {
  return new SelfHealingBlockProcessor(
    accountService, 
    validatorService, 
    transferService, 
    dataSubmissionService,
    queueService,
    dependencyDetectionEngine,
  );
}; 