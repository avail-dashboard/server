import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { DataProcessorService, createDataProcessorService } from './processor';
import { ValidatorProcessor, createValidatorProcessor } from './ValidatorProcessor';
import { TransferProcessor, createTransferProcessor } from './TransferProcessor';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { TransferRepository } from '../../database/repositories/TransferRepository';
import { EraRepository } from '../../database/repositories/EraRepository';
import { QueueService } from '../core/queue';
import { DependencyDetectionEngineService } from './dependencyDetectionEngine';
import { ProcessedEntity } from '../types/dependency';
import { 
  BaseService,
  ServiceHealth,
  JobType,
} from '../types/service';
import { 
  BlockData,
} from '../types/blockchain';

interface DependencyResolutionStrategy {
  waitForCritical: boolean;    // Wait for critical dependencies
  continueWithPartial: boolean; // Continue with partial data
  maxWaitTime: number;         // Maximum wait time before timeout
}

export interface IEnhancedProcessorService extends BaseService {
  processBlock(blockData: BlockData): Promise<void>;
  processPhase1Data(blockData: BlockData): Promise<void>;
  processWithDependencyCheck<T>(
    entityType: 'block' | 'account' | 'rollup' | 'validator',
    entityId: string,
    processingFn: () => Promise<T>
  ): Promise<T>;
}

/**
 * EnhancedProcessorService - Extends DataProcessorService with Phase 1.2 processors
 * 
 * TASK-007: Now includes automatic dependency detection and resolution
 * 
 * Responsibilities:
 * - All existing DataProcessorService functionality
 * - Process validator and staking data
 * - Process transfer data with enhanced details
 * - Track era changes and validator statistics
 * - Automatic dependency detection and resolution (NEW)
 * - Maintain backward compatibility
 */
export class EnhancedProcessorService implements IEnhancedProcessorService {
  private dataProcessor: DataProcessorService;
  private validatorProcessor: ValidatorProcessor;
  private transferProcessor: TransferProcessor;
  private queueService: QueueService;
  private dependencyDetectionEngine: DependencyDetectionEngineService;
  private dependencyStrategy: DependencyResolutionStrategy;
  private isRunning = false;
  private phase1Enabled = true; // Feature flag for Phase 1 processing

  constructor(
    database: typeof db,
    blockchain: AvailBlockchainService,
    validatorRepository: ValidatorRepository,
    transferRepository: TransferRepository,
    eraRepository: EraRepository,
    queueService: QueueService,
    dependencyDetectionEngine: DependencyDetectionEngineService,
    dependencyStrategy?: DependencyResolutionStrategy,
  ) {
    // Initialize base data processor
    this.dataProcessor = createDataProcessorService(database, blockchain);
    
    // Initialize Phase 1 processors
    this.validatorProcessor = createValidatorProcessor(blockchain, validatorRepository, eraRepository);
    this.transferProcessor = createTransferProcessor(blockchain, transferRepository);

    // TASK-007: Initialize dependency services
    this.queueService = queueService;
    this.dependencyDetectionEngine = dependencyDetectionEngine;
    this.dependencyStrategy = dependencyStrategy || {
      waitForCritical: true,
      continueWithPartial: false,
      maxWaitTime: 30000, // 30 seconds
    };
  }

  /**
   * Start the enhanced processor service
   */
  async start(): Promise<void> {
    try {
      logger.info('EnhancedProcessorService: Starting service', { component: 'enhanced-processor' });
      
      // Start base data processor
      await this.dataProcessor.start();
      
      this.isRunning = true;
      logger.info('EnhancedProcessorService: Service started successfully', { 
        component: 'enhanced-processor',
        phase1Enabled: this.phase1Enabled,
      });
      
    } catch (error) {
      logError(error as Error, { component: 'enhanced-processor', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the enhanced processor service
   */
  async stop(): Promise<void> {
    try {
      logger.info('EnhancedProcessorService: Stopping service', { component: 'enhanced-processor' });
      
      // Stop base data processor
      await this.dataProcessor.stop();
      
      this.isRunning = false;
      logger.info('EnhancedProcessorService: Service stopped', { component: 'enhanced-processor' });
      
    } catch (error) {
      logError(error as Error, { component: 'enhanced-processor', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Get base processor health
      const baseHealth = await this.dataProcessor.getHealth();
      
      return {
        healthy: this.isRunning && baseHealth.healthy,
        lastCheck: now,
        error: baseHealth.error,
        details: {
          isRunning: this.isRunning,
          baseProcessorHealthy: baseHealth.healthy,
          phase1Enabled: this.phase1Enabled,
          ...baseHealth.details,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          isRunning: this.isRunning,
          phase1Enabled: this.phase1Enabled,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isRunning && this.dataProcessor.isHealthy();
  }

  /**
   * Process a complete block with Phase 1 enhancements
   */
  async processBlock(blockData: BlockData): Promise<void> {
    try {
      logger.debug('EnhancedProcessorService: Processing block', { 
        component: 'enhanced-processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
        phase1Enabled: this.phase1Enabled,
      });

      // 1. Process Phase 1 data FIRST if enabled (to satisfy foreign key constraints)
      if (this.phase1Enabled) {
        await this.processPhase1Data(blockData);
      }

      // 2. Process with base data processor (existing functionality)
      await this.dataProcessor.processBlock(blockData);

      logger.debug('EnhancedProcessorService: Block processed successfully', { 
        component: 'enhanced-processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'enhanced-processor', 
        action: 'processBlock',
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      throw error;
    }
  }

  /**
   * Process Phase 1 specific data (validators, transfers, etc.)
   */
  async processPhase1Data(blockData: BlockData): Promise<void> {
    try {
      logger.debug('EnhancedProcessorService: Processing Phase 1 data', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
      });

      // Process in parallel for better performance
      const phase1Tasks = [
        // Process validator data
        this.validatorProcessor.processBlockValidator(blockData),
        this.validatorProcessor.processEraChange(blockData),
        
        // Process transfer data
        this.transferProcessor.processBlockTransfers(blockData),
      ];

      await Promise.all(phase1Tasks);

      logger.debug('EnhancedProcessorService: Phase 1 data processed', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'enhanced-processor',
        action: 'processPhase1Data',
        blockNumber: blockData.number,
      });
      // Don't throw - Phase 1 processing failures shouldn't break base processing
      logger.warn('EnhancedProcessorService: Phase 1 processing failed, continuing with base processing', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Enable or disable Phase 1 processing
   */
  setPhase1Enabled(enabled: boolean): void {
    this.phase1Enabled = enabled;
    logger.info('EnhancedProcessorService: Phase 1 processing toggled', {
      component: 'enhanced-processor',
      phase1Enabled: this.phase1Enabled,
    });
  }

  /**
   * Get processing statistics including Phase 1 metrics
   */
  async getProcessingStats(): Promise<{
    blocksProcessed: number;
    extrinsicsProcessed: number;
    eventsProcessed: number;
    accountsTracked: number;
    processingRate: number;
    phase1Stats: {
      validatorsTracked: number;
      transfersProcessed: number;
      erasTracked: number;
    };
  }> {
    try {
      // Get base stats
      const baseStats = await this.dataProcessor.getProcessingStats();

      // Get Phase 1 stats (simplified for now)
      const phase1Stats = {
        validatorsTracked: 0, // TODO: Implement actual counting
        transfersProcessed: 0, // TODO: Implement actual counting
        erasTracked: 0, // TODO: Implement actual counting
      };

      return {
        ...baseStats,
        phase1Stats,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'enhanced-processor',
        action: 'getProcessingStats',
      });
      throw error;
    }
  }

  /**
   * TASK-007: Process entity with automatic dependency detection and resolution
   */
  async processWithDependencyCheck<T>(
    entityType: 'block' | 'account' | 'rollup' | 'validator',
    entityId: string,
    processingFn: () => Promise<T>
  ): Promise<T> {
    try {
      logger.debug('EnhancedProcessor: Starting dependency check', {
        component: 'enhanced-processor',
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
        logger.info('EnhancedProcessor: Missing dependencies detected, queuing resolution', {
          component: 'enhanced-processor',
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

        // Handle dependency resolution strategy
        if (this.dependencyStrategy.waitForCritical && dependencyReport.criticalMissing > 0) {
          logger.info('EnhancedProcessor: Waiting for critical dependencies', {
            component: 'enhanced-processor',
            entityType,
            entityId,
            waitTime: this.dependencyStrategy.maxWaitTime,
          });

          // Wait for critical dependencies with timeout
          await this.waitForDependencyResolution(entityId, this.dependencyStrategy.maxWaitTime);
        } else if (!this.dependencyStrategy.continueWithPartial) {
          logger.info('EnhancedProcessor: Waiting for all dependencies', {
            component: 'enhanced-processor',
            entityType,
            entityId,
          });

          // Wait for all dependencies
          await this.waitForDependencyResolution(entityId, this.dependencyStrategy.maxWaitTime);
        } else {
          logger.info('EnhancedProcessor: Continuing with partial data', {
            component: 'enhanced-processor',
            entityType,
            entityId,
            missingCount: dependencyReport.totalMissing,
          });
        }
      }

      // Step 4: Continue with original processing
      const result = await processingFn();

      logger.debug('EnhancedProcessor: Dependency check completed', {
        component: 'enhanced-processor',
        entityType,
        entityId,
        hadDependencies: dependencyReport.resolutionRequired,
      });

      return result;

    } catch (error) {
      // TASK-007: Apply John's error classification framework
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('dependency')) {
        logger.warn('EnhancedProcessor: Dependency resolution failed, continuing with partial data', { 
          component: 'enhanced-processor',
          entityType, 
          entityId, 
          error: errorMessage,
        });
        
        // Continue with processing despite dependency issues
        return await processingFn();
      } else {
        logger.error('EnhancedProcessor: Processing failed', { 
          component: 'enhanced-processor',
          entityType, 
          entityId, 
          error: errorMessage,
        });
        throw error;
      }
    }
  }

  /**
   * TASK-007: Wait for dependency resolution with timeout
   */
  private async waitForDependencyResolution(entityId: string, maxWaitTime: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every second

    while (Date.now() - startTime < maxWaitTime) {
      // Check if dependencies are resolved by querying the queue
      // This is a simplified implementation - in production, you might use Redis pub/sub
      const queueStats = await this.queueService.getStats();
      
      // If no dependency jobs are in progress, assume resolution is complete
      if (queueStats.waiting === 0 && queueStats.active === 0) {
        logger.debug('EnhancedProcessor: Dependencies appear to be resolved', {
          component: 'enhanced-processor',
          entityId,
          waitTime: Date.now() - startTime,
        });
        return;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    logger.warn('EnhancedProcessor: Dependency resolution timeout', {
      component: 'enhanced-processor',
      entityId,
      maxWaitTime,
    });
  }
}

export const createEnhancedProcessorService = (
  database: typeof db,
  blockchain: AvailBlockchainService,
  validatorRepository: ValidatorRepository,
  transferRepository: TransferRepository,
  eraRepository: EraRepository,
  queueService: QueueService,
  dependencyDetectionEngine: DependencyDetectionEngineService,
  dependencyStrategy?: DependencyResolutionStrategy,
): EnhancedProcessorService => {
  return new EnhancedProcessorService(
    database,
    blockchain,
    validatorRepository,
    transferRepository,
    eraRepository,
    queueService,
    dependencyDetectionEngine,
    dependencyStrategy,
  );
}; 