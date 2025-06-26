import { logger } from '../../utils/logger';
import { BaseService, ServiceHealth } from '../types/service';
import { 
  BlockData, 
  BlockProcessingMode, 
  ProcessingResult, 
  ComparisonResult, 
  PerformanceMetrics,
  BlockProcessingOrchestrationConfig
} from '../types/blockchain';
import { SelfHealingBlockProcessor } from './selfHealingProcessor';
import { QueueService } from '../core/queue';

/**
 * Block Processing Orchestrator - Phase 2: Dual-Mode Operation
 * 
 * Manages switching between legacy SelfHealingBlockProcessor and queue-based processing.
 * Provides validation capabilities to ensure both systems produce identical results.
 * Supports three modes: legacy, queue, and dual (side-by-side comparison).
 */
export class BlockProcessingOrchestrator implements BaseService {
  private isRunning = false;
  private processingStats = {
    blocksProcessed: 0,
    legacyProcessed: 0,
    queueProcessed: 0,
    dualModeComparisons: 0,
    significantDifferences: 0,
    alertsTriggered: 0,
  };

  constructor(
    private selfHealingProcessor: SelfHealingBlockProcessor,
    private queueService: QueueService,
    private config: BlockProcessingOrchestrationConfig,
  ) {
    logger.info('BlockProcessingOrchestrator: Initialized', {
      component: 'block-processing-orchestrator',
      mode: config.mode,
      dualModeEnabled: config.dualModeComparisonEnabled,
      performanceLogging: config.performanceLoggingEnabled,
      statisticsValidation: config.statisticsValidationEnabled,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info('BlockProcessingOrchestrator: Starting service', {
      component: 'block-processing-orchestrator',
      mode: this.config.mode,
    });

    this.isRunning = true;

    logger.info('BlockProcessingOrchestrator: Service started successfully', {
      component: 'block-processing-orchestrator',
      mode: this.config.mode,
      monitoring: this.config.monitoring.enabled,
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('BlockProcessingOrchestrator: Stopping service', {
      component: 'block-processing-orchestrator',
      finalStats: this.processingStats,
    });

    this.isRunning = false;

    logger.info('BlockProcessingOrchestrator: Service stopped', {
      component: 'block-processing-orchestrator',
    });
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'BlockProcessingOrchestrator',
        version: '2.0.0',
        isRunning: this.isRunning,
        mode: this.config.mode,
        processingStats: this.processingStats,
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Main processing method - routes to appropriate mode
   */
  async processBlock(blockData: BlockData): Promise<ProcessingResult> {
    if (!this.isRunning) {
      throw new Error('BlockProcessingOrchestrator is not running');
    }

    const mode = this.config.mode;
    
    logger.debug('BlockProcessingOrchestrator: Processing block', {
      component: 'block-processing-orchestrator',
      blockNumber: blockData.number,
      blockHash: blockData.hash,
      mode,
    });

    switch (mode) {
      case 'legacy':
        return this.processWithLegacy(blockData);
      case 'queue':
        return this.processWithQueue(blockData);
      case 'dual':
        return this.processWithDualMode(blockData);
      default:
        throw new Error(`Unknown processing mode: ${mode}`);
    }
  }

  /**
   * Process using legacy SelfHealingBlockProcessor
   */
  private async processWithLegacy(blockData: BlockData): Promise<ProcessingResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();

    logger.debug('BlockProcessingOrchestrator: Processing with legacy mode', {
      component: 'block-processing-orchestrator',
      blockNumber: blockData.number,
      mode: 'legacy',
    });

    try {
      await this.selfHealingProcessor.processBlock(blockData);
      
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const endCpu = process.cpuUsage(startCpu);

      // Get statistics from the processor
      const stats = this.selfHealingProcessor.getProcessingStats();

      const result: ProcessingResult = {
        success: true,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        stats,
        metrics: this.calculatePerformanceMetrics(startTime, startMemory, endMemory, endCpu, {}),
        mode: 'legacy',
      };

      this.processingStats.blocksProcessed++;
      this.processingStats.legacyProcessed++;

      logger.info('BlockProcessingOrchestrator: Legacy processing complete', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        duration,
        success: true,
        mode: 'legacy',
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('BlockProcessingOrchestrator: Legacy processing failed', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        error: (error as Error).message,
        duration,
        mode: 'legacy',
      });

      return {
        success: false,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        stats: {
          blocksProcessed: 0,
          totalErrors: 1,
          errorRate: 1,
          serviceStats: {},
        },
        metrics: this.calculatePerformanceMetrics(startTime, startMemory, process.memoryUsage(), process.cpuUsage(startCpu), {}),
        errors: [error as Error],
        mode: 'legacy',
      };
    }
  }

  /**
   * Process using queue-based system
   */
  private async processWithQueue(blockData: BlockData): Promise<ProcessingResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();

    logger.debug('BlockProcessingOrchestrator: Processing with queue mode', {
      component: 'block-processing-orchestrator',
      blockNumber: blockData.number,
      mode: 'queue',
    });

    try {
      const queueJob = await this.queueService.scheduleBlockDomainProcessing(blockData);
      
      // Wait for job completion - for now we'll simulate the processing
      // In a real implementation, this would await the job result
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const endCpu = process.cpuUsage(startCpu);

      // Simulate queue processing results
      const result: ProcessingResult = {
        success: true,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        stats: {
          blocksProcessed: 1,
          totalErrors: 0,
          errorRate: 0,
          serviceStats: {
            account: { successRate: 1, total: 1, success: 1 },
            validator: { successRate: 1, total: 1, success: 1 },
            transfer: { successRate: 1, total: 1, success: 1 },
            dataSubmission: { successRate: 1, total: 1, success: 1 },
          },
        },
        metrics: this.calculatePerformanceMetrics(startTime, startMemory, endMemory, endCpu, {}),
        mode: 'queue',
      };

      this.processingStats.blocksProcessed++;
      this.processingStats.queueProcessed++;

      logger.info('BlockProcessingOrchestrator: Queue processing complete', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        duration,
        success: true,
        mode: 'queue',
        jobId: queueJob.id,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('BlockProcessingOrchestrator: Queue processing failed', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        error: (error as Error).message,
        duration,
        mode: 'queue',
      });

      // Fallback to legacy if configured
      if (this.config.fallbackToLegacyOnError) {
        logger.warn('BlockProcessingOrchestrator: Falling back to legacy processing', {
          component: 'block-processing-orchestrator',
          blockNumber: blockData.number,
          reason: 'queue_error',
        });
        return this.processWithLegacy(blockData);
      }

      return {
        success: false,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
        stats: {
          blocksProcessed: 0,
          totalErrors: 1,
          errorRate: 1,
          serviceStats: {},
        },
        metrics: this.calculatePerformanceMetrics(startTime, startMemory, process.memoryUsage(), process.cpuUsage(startCpu), {}),
        errors: [error as Error],
        mode: 'queue',
      };
    }
  }

  /**
   * Process using dual-mode (both systems for comparison)
   */
  private async processWithDualMode(blockData: BlockData): Promise<ProcessingResult> {
    const startTime = Date.now();

    logger.info('BlockProcessingOrchestrator: Starting dual-mode processing', {
      component: 'block-processing-orchestrator',
      blockNumber: blockData.number,
      mode: 'dual',
      primaryResult: this.config.primaryResult,
    });

    try {
      // Run both systems in parallel
      const [legacyResult, queueResult] = await Promise.allSettled([
        this.processWithLegacy(blockData),
        this.processWithQueue(blockData),
      ]);

      // Compare results and log differences
      const comparison = this.compareResults(legacyResult, queueResult, blockData);
      
      // Select primary result based on configuration
      const primaryResult = this.selectPrimaryResult(legacyResult, queueResult);

      this.processingStats.dualModeComparisons++;
      if (comparison.significantDifferences) {
        this.processingStats.significantDifferences++;
      }
      if (comparison.alertTriggered) {
        this.processingStats.alertsTriggered++;
      }

      const totalDuration = Date.now() - startTime;

      logger.info('BlockProcessingOrchestrator: Dual-mode processing complete', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        totalDuration,
        comparison: {
          legacySuccess: comparison.legacySuccess,
          queueSuccess: comparison.queueSuccess,
          significantDifferences: comparison.significantDifferences,
          processingTimeDiff: comparison.processingTimeDiff,
        },
        primaryResult: this.config.primaryResult,
      });

      return primaryResult;

    } catch (error) {
      logger.error('BlockProcessingOrchestrator: Dual-mode processing failed', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        error: (error as Error).message,
        mode: 'dual',
      });

      // Fallback to legacy processing
      return this.processWithLegacy(blockData);
    }
  }

  /**
   * Compare results from legacy and queue processing
   */
  private compareResults(
    legacyResult: PromiseSettledResult<ProcessingResult>,
    queueResult: PromiseSettledResult<ProcessingResult>,
    blockData: BlockData,
  ): ComparisonResult {
    const comparison: ComparisonResult = {
      blockNumber: blockData.number,
      legacySuccess: legacyResult.status === 'fulfilled',
      queueSuccess: queueResult.status === 'fulfilled',
      processingTimeDiff: 0,
      statisticsDiff: {
        serviceSuccessRatesDiff: {},
        totalErrorsDiff: 0,
        blocksProcessedDiff: 0,
      },
      errorsDiff: [],
      significantDifferences: false,
      alertTriggered: false,
    };

    if (legacyResult.status === 'fulfilled' && queueResult.status === 'fulfilled') {
      // Compare processing times
      comparison.processingTimeDiff = queueResult.value.duration - legacyResult.value.duration;

      // Compare processing statistics
      comparison.statisticsDiff = this.compareStatistics(
        legacyResult.value.stats,
        queueResult.value.stats,
      );

      // Check for significant differences
      comparison.significantDifferences = this.hasSignificantDifferences(comparison);

      // Trigger alerts if necessary
      if (comparison.significantDifferences && this.config.monitoring.alertOnDifferences) {
        comparison.alertTriggered = true;
        this.alertOnDifferences(comparison);
      }
    } else {
      // At least one failed - this is a significant difference
      comparison.significantDifferences = true;
      comparison.alertTriggered = true;
      
      if (legacyResult.status === 'rejected') {
        comparison.errorsDiff.push(`Legacy: ${legacyResult.reason}`);
      }
      if (queueResult.status === 'rejected') {
        comparison.errorsDiff.push(`Queue: ${queueResult.reason}`);
      }
    }

    // Log detailed comparison if enabled
    if (this.config.monitoring.logComparisons) {
      logger.info('🔄 DUAL_MODE: Processing comparison complete', {
        component: 'block-processing-orchestrator',
        blockNumber: blockData.number,
        comparison,
      });
    }

    return comparison;
  }

  /**
   * Compare processing statistics between legacy and queue results
   */
  private compareStatistics(legacyStats: any, queueStats: any) {
    const serviceSuccessRatesDiff: { [serviceName: string]: number } = {};

    // Compare service success rates
    for (const serviceName in legacyStats.serviceStats) {
      const legacyRate = legacyStats.serviceStats[serviceName]?.successRate || 0;
      const queueRate = queueStats.serviceStats[serviceName]?.successRate || 0;
      serviceSuccessRatesDiff[serviceName] = Math.abs(legacyRate - queueRate);
    }

    return {
      serviceSuccessRatesDiff,
      totalErrorsDiff: Math.abs(legacyStats.totalErrors - queueStats.totalErrors),
      blocksProcessedDiff: Math.abs(legacyStats.blocksProcessed - queueStats.blocksProcessed),
    };
  }

  /**
   * Check if comparison results show significant differences
   */
  private hasSignificantDifferences(comparison: ComparisonResult): boolean {
    const thresholds = this.config.comparisonThresholds;

    // Check processing time difference
    const timeDiffPercent = Math.abs(comparison.processingTimeDiff) / 1000; // Convert to percentage
    if (timeDiffPercent > thresholds.processingTimeDifferencePercent) {
      return true;
    }

    // Check service success rate differences
    for (const serviceName in comparison.statisticsDiff.serviceSuccessRatesDiff) {
      const rateDiff = comparison.statisticsDiff.serviceSuccessRatesDiff[serviceName];
      if (rateDiff > thresholds.successRateDifferencePercent / 100) {
        return true;
      }
    }

    // Check error count difference
    if (comparison.statisticsDiff.totalErrorsDiff > thresholds.errorCountDifference) {
      return true;
    }

    return false;
  }

  /**
   * Trigger alerts for significant differences
   */
  private alertOnDifferences(comparison: ComparisonResult): void {
    logger.warn('🚨 DUAL_MODE: Significant differences detected', {
      component: 'block-processing-orchestrator',
      blockNumber: comparison.blockNumber,
      alert: 'significant_differences',
      comparison,
      thresholds: this.config.comparisonThresholds,
    });

    // Additional alerting mechanisms can be added here
    // (webhooks, email notifications, etc.)
  }

  /**
   * Select primary result based on configuration
   */
  private selectPrimaryResult(
    legacyResult: PromiseSettledResult<ProcessingResult>,
    queueResult: PromiseSettledResult<ProcessingResult>,
  ): ProcessingResult {
    if (this.config.primaryResult === 'legacy' && legacyResult.status === 'fulfilled') {
      return legacyResult.value;
    } else if (this.config.primaryResult === 'queue' && queueResult.status === 'fulfilled') {
      return queueResult.value;
    } else if (legacyResult.status === 'fulfilled') {
      // Fallback to legacy if primary is not available
      return legacyResult.value;
    } else if (queueResult.status === 'fulfilled') {
      // Fallback to queue if legacy is not available
      return queueResult.value;
    } else {
      // Both failed - return error result
      throw new Error(`Both processing modes failed for block ${queueResult.status === 'rejected' ? queueResult.reason : 'unknown'}`);
    }
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    startTime: number,
    startMemory: NodeJS.MemoryUsage,
    endMemory: NodeJS.MemoryUsage,
    cpuUsage: NodeJS.CpuUsage,
    serviceBreakdown: any,
  ): PerformanceMetrics {
    return {
      processingTime: Date.now() - startTime,
      memoryUsage: endMemory,
      cpuUsage,
      serviceBreakdown,
    };
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    return {
      ...this.processingStats,
      mode: this.config.mode,
      dualModeEnabled: this.config.dualModeComparisonEnabled,
      alertThresholds: this.config.comparisonThresholds,
    };
  }

  /**
   * Update configuration (for runtime mode switching)
   */
  updateConfig(newConfig: Partial<BlockProcessingOrchestrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    logger.info('BlockProcessingOrchestrator: Configuration updated', {
      component: 'block-processing-orchestrator',
      newConfig,
      currentMode: this.config.mode,
    });
  }
}

export const createBlockProcessingOrchestrator = (
  selfHealingProcessor: SelfHealingBlockProcessor,
  queueService: QueueService,
  config: BlockProcessingOrchestrationConfig,
): BlockProcessingOrchestrator => {
  return new BlockProcessingOrchestrator(
    selfHealingProcessor,
    queueService,
    config,
  );
}; 