import { Job } from 'bull';
import { logger } from '../../../../utils/logger';
import { JobType } from '../../../types/service';
import { BlockData } from '../../../types/blockchain';

/**
 * Dead Letter Queue Processor
 * Phase 3: Enhanced Queue Features - Dead Letter Queue Handling
 * 
 * Handles failed block processing jobs with sophisticated recovery strategies
 */
export class DeadLetterProcessor {
  constructor(
    private getService: <T>(serviceName: string) => Promise<T>,
  ) {}

  /**
   * Process failed block domains jobs from dead letter queue
   */
  async processFailedBlockDomains(job: Job): Promise<{
    success: boolean;
    recoveryAttempted: boolean;
    recoveryMethod?: string;
    data?: any;
  }> {
    const { originalJobData, failureReason, attemptCount, originalJobId } = job.data;
    const startTime = Date.now();
    
    logger.info('🔄 DLQ: Processing failed block domains job', {
      component: 'dead-letter-processor',
      operation: 'processFailedBlockDomains',
      jobId: job.id,
      originalJobId,
      blockNumber: originalJobData.blockData?.number,
      failureReason,
      attemptCount,
      timestamp: new Date().toISOString(),
    });

    try {
      // Analyze failure pattern to determine recovery strategy
      const failurePattern = await this.analyzeFailurePattern(originalJobData.blockData, failureReason);
      
      if (failurePattern.isRecoverable) {
        logger.info('🔧 DLQ: Attempting recovery for failed job', {
          component: 'dead-letter-processor',
          operation: 'attemptRecovery',
          jobId: job.id,
          blockNumber: originalJobData.blockData?.number,
          recoveryStrategy: failurePattern.recoveryStrategy,
          confidence: failurePattern.confidence,
        });
        
        const recoveryResult = await this.attemptAlternativeProcessing(
          originalJobData.blockData,
          failurePattern.recoveryStrategy
        );
        
        const duration = Date.now() - startTime;
        
        logger.info('✅ DLQ: Recovery attempt completed', {
          component: 'dead-letter-processor',
          operation: 'recoveryComplete',
          jobId: job.id,
          blockNumber: originalJobData.blockData?.number,
          recoverySuccess: recoveryResult.success,
          recoveryMethod: failurePattern.recoveryStrategy,
          duration,
        });
        
        return {
          success: recoveryResult.success,
          recoveryAttempted: true,
          recoveryMethod: failurePattern.recoveryStrategy,
          data: recoveryResult.data,
        };
      } else {
        // Log permanent failure and alert
        await this.logPermanentFailure(originalJobData, failureReason, failurePattern);
        
        return {
          success: false,
          recoveryAttempted: false,
          data: {
            permanentFailure: true,
            reason: failureReason,
            analysis: failurePattern,
          },
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ DLQ: Failed to process dead letter job', {
        component: 'dead-letter-processor',
        operation: 'processingFailed',
        jobId: job.id,
        originalJobId,
        blockNumber: originalJobData.blockData?.number,
        error: (error as Error).message,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Analyze failure pattern to determine recovery strategy
   */
  private async analyzeFailurePattern(blockData: BlockData, failureReason: string): Promise<{
    isRecoverable: boolean;
    recoveryStrategy: string;
    confidence: number;
    analysis: string;
  }> {
    logger.debug('🔍 DLQ: Analyzing failure pattern', {
      component: 'dead-letter-processor',
      operation: 'analyzeFailurePattern',
      blockNumber: blockData.number,
      failureReason,
    });

    // Analyze failure reason patterns
    if (failureReason.includes('network') || failureReason.includes('timeout')) {
      return {
        isRecoverable: true,
        recoveryStrategy: 'sequential_retry',
        confidence: 0.8,
        analysis: 'Network-related failure, likely recoverable with sequential processing',
      };
    }

    if (failureReason.includes('service') || failureReason.includes('unavailable')) {
      return {
        isRecoverable: true,
        recoveryStrategy: 'partial_processing',
        confidence: 0.7,
        analysis: 'Service failure, attempt processing with available services only',
      };
    }

    if (failureReason.includes('data') || failureReason.includes('corruption')) {
      return {
        isRecoverable: false,
        recoveryStrategy: 'none',
        confidence: 0.9,
        analysis: 'Data corruption detected, manual intervention required',
      };
    }

    if (failureReason.includes('dependency')) {
      return {
        isRecoverable: true,
        recoveryStrategy: 'dependency_resolution',
        confidence: 0.85,
        analysis: 'Dependency issue, attempt to resolve missing dependencies first',
      };
    }

    // Default analysis for unknown failures
    return {
      isRecoverable: true,
      recoveryStrategy: 'conservative_retry',
      confidence: 0.5,
      analysis: 'Unknown failure pattern, attempting conservative recovery',
    };
  }

  /**
   * Attempt alternative processing strategies for failed jobs
   */
  private async attemptAlternativeProcessing(
    blockData: BlockData,
    recoveryStrategy: string
  ): Promise<{ success: boolean; data?: any }> {
    const startTime = Date.now();
    
    logger.info('🔧 DLQ: Starting alternative processing', {
      component: 'dead-letter-processor',
      operation: 'alternativeProcessing',
      blockNumber: blockData.number,
      recoveryStrategy,
    });

    try {
      switch (recoveryStrategy) {
        case 'sequential_retry':
          return await this.sequentialProcessing(blockData);
          
        case 'partial_processing':
          return await this.partialProcessing(blockData);
          
        case 'dependency_resolution':
          return await this.dependencyResolutionProcessing(blockData);
          
        case 'conservative_retry':
          return await this.conservativeProcessing(blockData);
          
        default:
          throw new Error(`Unknown recovery strategy: ${recoveryStrategy}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ DLQ: Alternative processing failed', {
        component: 'dead-letter-processor',
        operation: 'alternativeProcessing',
        blockNumber: blockData.number,
        recoveryStrategy,
        error: (error as Error).message,
        duration,
      });
      
      return { success: false };
    }
  }

  /**
   * Sequential processing strategy - process services one by one with delays
   */
  private async sequentialProcessing(blockData: BlockData): Promise<{ success: boolean; data?: any }> {
    logger.debug('🔧 DLQ: Using sequential processing strategy', {
      component: 'dead-letter-processor',
      operation: 'sequentialProcessing',
      blockNumber: blockData.number,
    });

    const services = [
      { name: 'accountProcessor', critical: true },
      { name: 'validatorProcessor', critical: false },
      { name: 'transferProcessor', critical: false },
      { name: 'dataSubmissionProcessor', critical: false },
    ];

    const results = [];
    let criticalFailures = 0;

    for (const { name, critical } of services) {
      try {
        logger.debug(`🔧 DLQ: Processing service ${name}`, {
          component: 'dead-letter-processor',
          serviceName: name,
          blockNumber: blockData.number,
          critical,
        });

        const service = await this.getService<any>(name);
        
        // Extract and process entities
        const extractedEntities = await service.extractFromBlock(blockData);
        const processedResults = await service.processExtractedEntities(extractedEntities);
        
        results.push({
          serviceName: name,
          success: true,
          extractedCount: extractedEntities.length,
          processedCount: processedResults.length,
        });
        
        // Add small delay between services to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        results.push({
          serviceName: name,
          success: false,
          error: (error as Error).message,
        });
        
        if (critical) {
          criticalFailures++;
        }
        
        logger.warn(`⚠️ DLQ: Service ${name} failed in sequential processing`, {
          component: 'dead-letter-processor',
          serviceName: name,
          blockNumber: blockData.number,
          error: (error as Error).message,
          critical,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const success = criticalFailures === 0 && successCount >= 2; // At least 2 services must succeed
    
    return { success, data: { results, strategy: 'sequential' } };
  }

  /**
   * Partial processing strategy - skip failing services, continue with others
   */
  private async partialProcessing(blockData: BlockData): Promise<{ success: boolean; data?: any }> {
    logger.debug('🔧 DLQ: Using partial processing strategy', {
      component: 'dead-letter-processor',
      operation: 'partialProcessing',
      blockNumber: blockData.number,
    });

    // Try each service independently, continue even if some fail
    const serviceResults = await Promise.allSettled([
      this.processSingleService('accountProcessor', blockData),
      this.processSingleService('validatorProcessor', blockData),
      this.processSingleService('transferProcessor', blockData),
      this.processSingleService('dataSubmissionProcessor', blockData),
    ]);

    const results = serviceResults.map((result, index) => {
      const serviceName = ['accountProcessor', 'validatorProcessor', 'transferProcessor', 'dataSubmissionProcessor'][index];
      
      if (result.status === 'fulfilled') {
        return { serviceName, success: true, ...result.value };
      } else {
        return { serviceName, success: false, error: result.reason?.message };
      }
    });

    const successCount = results.filter(r => r.success).length;
    const success = successCount >= 1; // At least 1 service must succeed for partial success
    
    return { success, data: { results, strategy: 'partial' } };
  }

  /**
   * Dependency resolution processing - resolve dependencies first, then process
   */
  private async dependencyResolutionProcessing(blockData: BlockData): Promise<{ success: boolean; data?: any }> {
    logger.debug('🔧 DLQ: Using dependency resolution strategy', {
      component: 'dead-letter-processor',
      operation: 'dependencyResolutionProcessing',
      blockNumber: blockData.number,
    });

    try {
      // Try to resolve common dependencies first
      const queueService = await this.getService<any>('queue');
      
      // Ensure block exists
      await queueService.ensureBlock(blockData.number);
      
      // Wait a bit for dependency resolution
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try sequential processing after dependency resolution
      return await this.sequentialProcessing(blockData);
    } catch (error) {
      logger.error('❌ DLQ: Dependency resolution failed', {
        component: 'dead-letter-processor',
        operation: 'dependencyResolutionProcessing',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      
      return { success: false };
    }
  }

  /**
   * Conservative processing - minimal processing with maximum safety
   */
  private async conservativeProcessing(blockData: BlockData): Promise<{ success: boolean; data?: any }> {
    logger.debug('🔧 DLQ: Using conservative processing strategy', {
      component: 'dead-letter-processor',
      operation: 'conservativeProcessing',
      blockNumber: blockData.number,
    });

    try {
      // Only process account service (most critical and stable)
      const result = await this.processSingleService('accountProcessor', blockData);
      
      return {
        success: true,
        data: {
          results: [{ serviceName: 'accountProcessor', success: true, ...result }],
          strategy: 'conservative',
          note: 'Only critical account processing completed',
        },
      };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Process a single service safely
   */
  private async processSingleService(serviceName: string, blockData: BlockData): Promise<any> {
    const service = await this.getService<any>(serviceName);
    const extractedEntities = await service.extractFromBlock(blockData);
    const processedResults = await service.processExtractedEntities(extractedEntities);
    
    return {
      extractedCount: extractedEntities.length,
      processedCount: processedResults.length,
    };
  }

  /**
   * Log permanent failures for manual intervention
   */
  private async logPermanentFailure(
    originalJobData: any,
    failureReason: string,
    failurePattern: any
  ): Promise<void> {
    const config = await import('../../../../config');
    
    logger.error('🚨 DLQ: PERMANENT FAILURE - Manual intervention required', {
      component: 'dead-letter-processor',
      operation: 'permanentFailure',
      blockNumber: originalJobData.blockData?.number,
      failureReason,
      failurePattern,
      alertLevel: 'CRITICAL',
      requiresManualIntervention: true,
      timestamp: new Date().toISOString(),
    });

    // If alerting is enabled, this would trigger external alerts
    if (config.default.queueProcessing.blockDomains.deadLetterQueue.alertOnPermanentFailures) {
      // TODO: Integrate with alerting system (Slack, PagerDuty, etc.)
      logger.error('🚨 ALERT: Permanent block processing failure requires attention', {
        component: 'dead-letter-processor',
        alertType: 'PERMANENT_FAILURE',
        blockNumber: originalJobData.blockData?.number,
        failureReason,
        urgency: 'HIGH',
      });
    }
  }
}

export const createDeadLetterProcessor = (
  getService: <T>(serviceName: string) => Promise<T>
): DeadLetterProcessor => {
  return new DeadLetterProcessor(getService);
};