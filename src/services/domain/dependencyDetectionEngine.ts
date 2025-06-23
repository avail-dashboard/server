import { logger, logError } from '../../utils/logger';
import { 
  DependencyDetectionEngine,
  ProcessedEntity,
  MissingDependency,
  DependencyReport,
  DependencyPriorityAnalysis,
  ResolutionPlan,
  DependencyPriority,
  DependencyConfig,
  DependencyMetrics,
} from '../types/dependency';
import { BaseService, ServiceHealth } from '../types/service';

/**
 * Dependency Detection Engine - John's Implementation
 * 
 * Core component for Phase 2 dependency management.
 * Automatically detects missing dependencies during data processing
 * and creates resolution strategies.
 */
export class DependencyDetectionEngineService implements DependencyDetectionEngine, BaseService {
  private isRunning = false;
  private config: DependencyConfig;
  private metrics: DependencyMetrics;
  private serviceFactory: any;

  constructor(config: DependencyConfig, serviceFactory: any) {
    this.config = config;
    this.serviceFactory = serviceFactory;
    this.metrics = {
      detectionTime: 0,
      resolutionTime: 0,
      successRate: 0,
      failureRate: 0,
      batchEfficiency: 0,
      cacheHitRate: 0,
      totalDependenciesProcessed: 0,
      averageResolutionTime: 0,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('DependencyDetectionEngine is already running');
      return;
    }

    try {
      logger.info('Starting Dependency Detection Engine', {
        component: 'dependency-detection-engine',
        config: {
          enabled: this.config.detection.enabled,
          scanDepth: this.config.detection.scanDepth,
          batchSize: this.config.detection.batchSize,
        },
      });

      this.isRunning = true;
      logger.info('Dependency Detection Engine started successfully');
    } catch (error) {
      logError(error as Error, {
        component: 'dependency-detection-engine',
        action: 'start',
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping Dependency Detection Engine');
      this.isRunning = false;
      logger.info('Dependency Detection Engine stopped successfully');
    } catch (error) {
      logError(error as Error, {
        component: 'dependency-detection-engine',
        action: 'stop',
      });
      throw error;
    }
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        isRunning: this.isRunning,
        configEnabled: this.config.detection.enabled,
        metrics: this.metrics,
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning && this.config.detection.enabled;
  }

  /**
   * Detect missing dependencies in a processed entity
   */
  async detectMissingDependencies(entity: ProcessedEntity): Promise<DependencyReport> {
    const startTime = Date.now();

    try {
      logger.debug('Detecting missing dependencies', {
        component: 'dependency-detection-engine',
        entityId: entity.id,
        entityType: entity.type,
      });

      if (!this.config.detection.enabled) {
        return {
          entityId: entity.id,
          missingDependencies: [],
          totalMissing: 0,
          criticalMissing: 0,
          resolutionRequired: false,
          estimatedResolutionTime: 0,
        };
      }

      const missingDependencies: MissingDependency[] = [];

      // Detect missing block dependencies
      if (entity.blockNumber) {
        const blockExists = await this.validateDependency('block', entity.blockNumber.toString());
        if (!blockExists) {
          missingDependencies.push({
            entityType: 'block',
            entityId: entity.blockNumber.toString(),
            requiredBy: entity.id,
            priority: DependencyPriority.CRITICAL,
            blockNumber: entity.blockNumber,
            discoveredAt: new Date(),
          });
        }
      }

      // Detect missing account dependencies
      if (entity.data.submitter || entity.data.signer) {
        const accountAddress = entity.data.submitter || entity.data.signer;
        const accountExists = await this.validateDependency('account', accountAddress);
        if (!accountExists) {
          missingDependencies.push({
            entityType: 'account',
            entityId: accountAddress,
            requiredBy: entity.id,
            priority: DependencyPriority.HIGH,
            blockNumber: entity.blockNumber,
            discoveredAt: new Date(),
          });
        }
      }

      // Detect missing rollup dependencies
      if (entity.data.appId !== undefined) {
        const rollupExists = await this.validateDependency('rollup', entity.data.appId.toString());
        if (!rollupExists) {
          missingDependencies.push({
            entityType: 'rollup',
            entityId: entity.data.appId.toString(),
            requiredBy: entity.id,
            priority: DependencyPriority.MEDIUM,
            blockNumber: entity.blockNumber,
            discoveredAt: new Date(),
          });
        }
      }

      // Detect validator dependencies for validation-related entities
      if (entity.data.validatorAddress || entity.data.validator) {
        const validatorAddress = entity.data.validatorAddress || entity.data.validator;
        const validatorExists = await this.validateDependency('validator', validatorAddress);
        if (!validatorExists) {
          missingDependencies.push({
            entityType: 'validator',
            entityId: validatorAddress,
            requiredBy: entity.id,
            priority: DependencyPriority.HIGH,
            blockNumber: entity.blockNumber,
            discoveredAt: new Date(),
          });
        }
      }

      const criticalMissing = missingDependencies.filter(dep => dep.priority === DependencyPriority.CRITICAL).length;
      const resolutionRequired = missingDependencies.length > 0;
      const estimatedResolutionTime = this.estimateResolutionTimeForDependencies(missingDependencies);

      const detectionTime = Date.now() - startTime;
      this.updateMetrics(detectionTime, missingDependencies.length);

      const report: DependencyReport = {
        entityId: entity.id,
        missingDependencies,
        totalMissing: missingDependencies.length,
        criticalMissing,
        resolutionRequired,
        estimatedResolutionTime,
      };

      logger.debug('Dependency detection completed', {
        component: 'dependency-detection-engine',
        entityId: entity.id,
        totalMissing: missingDependencies.length,
        criticalMissing,
        detectionTime,
      });

      return report;

    } catch (error) {
      const detectionTime = Date.now() - startTime;
      logError(error as Error, {
        component: 'dependency-detection-engine',
        action: 'detectMissingDependencies',
        entityId: entity.id,
        detectionTime,
      });
      throw error;
    }
  }

  /**
   * Analyze dependency impact and priority
   */
  async analyzeDependencyImpact(dependencies: MissingDependency[]): Promise<DependencyPriorityAnalysis[]> {
    try {
      logger.debug('Analyzing dependency impact', {
        component: 'dependency-detection-engine',
        dependencyCount: dependencies.length,
      });

      const analyses: DependencyPriorityAnalysis[] = [];

      for (const dependency of dependencies) {
        const impactScore = this.calculateImpactScore(dependency);
        const urgencyScore = this.calculateUrgencyScore(dependency);
        const resolutionComplexity = this.calculateResolutionComplexity(dependency);
        const recommendedAction = this.determineRecommendedAction(impactScore, urgencyScore, resolutionComplexity);

        analyses.push({
          dependency,
          impactScore,
          urgencyScore,
          resolutionComplexity,
          recommendedAction,
        });
      }

      // Sort by priority (impact + urgency - complexity)
      analyses.sort((a, b) => {
        const scoreA = a.impactScore + a.urgencyScore - a.resolutionComplexity;
        const scoreB = b.impactScore + b.urgencyScore - b.resolutionComplexity;
        return scoreB - scoreA;
      });

      logger.debug('Dependency impact analysis completed', {
        component: 'dependency-detection-engine',
        analysisCount: analyses.length,
        immediateResolutions: analyses.filter(a => a.recommendedAction === 'resolve_immediately').length,
      });

      return analyses;

    } catch (error) {
      logError(error as Error, {
        component: 'dependency-detection-engine',
        action: 'analyzeDependencyImpact',
        dependencyCount: dependencies.length,
      });
      throw error;
    }
  }

  /**
   * Create resolution strategy
   */
  async createResolutionStrategy(dependencies: DependencyPriorityAnalysis[]): Promise<ResolutionPlan> {
    try {
      logger.debug('Creating resolution strategy', {
        component: 'dependency-detection-engine',
        dependencyCount: dependencies.length,
      });

      const planId = `resolution-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Filter dependencies that need resolution
      const resolvableDependencies = dependencies.filter(dep => 
        dep.recommendedAction === 'resolve_immediately' || dep.recommendedAction === 'queue_for_resolution'
      );

      // Determine resolution order based on priority and dependencies
      const resolutionOrder = await this.calculateResolutionOrder(resolvableDependencies);
      
      // Check if dependencies can be batched
      const batchable = this.canBatchDependencies(resolvableDependencies);
      
      // Check if manual intervention is required
      const requiresManualIntervention = resolvableDependencies.some(dep => 
        dep.resolutionComplexity > 8 || dep.dependency.entityType === 'custom'
      );

      // Estimate total duration
      const estimatedDuration = resolvableDependencies.reduce((total, dep) => {
        return total + this.estimateIndividualResolutionTime(dep.dependency);
      }, 0);

      const plan: ResolutionPlan = {
        planId,
        dependencies: resolvableDependencies.map(dep => dep.dependency),
        resolutionOrder,
        estimatedDuration,
        batchable,
        requiresManualIntervention,
        createdAt: new Date(),
      };

      logger.info('Resolution strategy created', {
        component: 'dependency-detection-engine',
        planId,
        dependencyCount: resolvableDependencies.length,
        estimatedDuration,
        batchable,
        requiresManualIntervention,
      });

      return plan;

    } catch (error) {
      logError(error as Error, {
        component: 'dependency-detection-engine',
        action: 'createResolutionStrategy',
        dependencyCount: dependencies.length,
      });
      throw error;
    }
  }

  /**
   * Validate if dependency exists
   */
  async validateDependency(entityType: string, entityId: string): Promise<boolean> {
    try {
      switch (entityType) {
        case 'block':
          const blockService = this.serviceFactory.get('blockService');
          const block = await blockService.getBlockByNumber(parseInt(entityId, 10));
          return !!block;

        case 'account':
          const accountService = this.serviceFactory.get('accountService');
          const account = await accountService.getAccount(entityId);
          return !!account;

        case 'rollup':
          const rollupService = this.serviceFactory.get('dataAvailabilityService');
          const rollup = await rollupService.getRollupInfo(parseInt(entityId, 10));
          return !!rollup;

        case 'validator':
          const validatorService = this.serviceFactory.get('validatorService');
          const validator = await validatorService.getValidator(entityId);
          return !!validator;

        default:
          logger.warn('Unknown dependency type for validation', {
            component: 'dependency-detection-engine',
            entityType,
            entityId,
          });
          return true; // Assume exists for unknown types
      }
    } catch (error) {
      // If there's an error checking, assume it doesn't exist
      logger.debug('Dependency validation failed, assuming missing', {
        component: 'dependency-detection-engine',
        entityType,
        entityId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Private helper methods
   */
  private calculateImpactScore(dependency: MissingDependency): number {
    const priorityScores = {
      [DependencyPriority.CRITICAL]: 10,
      [DependencyPriority.HIGH]: 7,
      [DependencyPriority.MEDIUM]: 4,
      [DependencyPriority.LOW]: 1,
    };
    return priorityScores[dependency.priority] || 1;
  }

  private calculateUrgencyScore(dependency: MissingDependency): number {
    const age = Date.now() - dependency.discoveredAt.getTime();
    const ageInHours = age / (1000 * 60 * 60);
    
    // More urgent as time passes
    if (ageInHours < 1) return 1;
    if (ageInHours < 6) return 3;
    if (ageInHours < 24) return 6;
    return 10;
  }

  private calculateResolutionComplexity(dependency: MissingDependency): number {
    const complexityScores = {
      'account': 2,
      'rollup': 3,
      'block': 5,
      'validator': 4,
    };
    return complexityScores[dependency.entityType as keyof typeof complexityScores] || 5;
  }

  private determineRecommendedAction(
    impactScore: number, 
    urgencyScore: number, 
    complexity: number
  ): 'resolve_immediately' | 'queue_for_resolution' | 'defer' | 'ignore' {
    const totalScore = impactScore + urgencyScore - complexity;
    
    if (totalScore >= 15) return 'resolve_immediately';
    if (totalScore >= 8) return 'queue_for_resolution';
    if (totalScore >= 3) return 'defer';
    return 'ignore';
  }

  private async calculateResolutionOrder(dependencies: DependencyPriorityAnalysis[]): Promise<string[]> {
    // Sort by priority score (impact + urgency - complexity)
    const sorted = dependencies.sort((a, b) => {
      const scoreA = a.impactScore + a.urgencyScore - a.resolutionComplexity;
      const scoreB = b.impactScore + b.urgencyScore - b.resolutionComplexity;
      return scoreB - scoreA;
    });

    return sorted.map(dep => dep.dependency.entityId);
  }

  private canBatchDependencies(dependencies: DependencyPriorityAnalysis[]): boolean {
    // Can batch if all dependencies are of similar complexity and type
    if (dependencies.length < 2) return false;
    
    const types = new Set(dependencies.map(dep => dep.dependency.entityType));
    const avgComplexity = dependencies.reduce((sum, dep) => sum + dep.resolutionComplexity, 0) / dependencies.length;
    
    return types.size <= 2 && avgComplexity <= 5;
  }

  private estimateIndividualResolutionTime(dependency: MissingDependency): number {
    const baseTime = {
      'account': 1000,    // 1 second
      'rollup': 2000,     // 2 seconds
      'block': 5000,      // 5 seconds
      'validator': 3000,  // 3 seconds
    };
    return baseTime[dependency.entityType as keyof typeof baseTime] || 3000;
  }

  private estimateResolutionTimeForDependencies(dependencies: MissingDependency[]): number {
    return dependencies.reduce((total, dep) => {
      return total + this.estimateIndividualResolutionTime(dep);
    }, 0);
  }

  private updateMetrics(detectionTime: number, dependencyCount: number): void {
    this.metrics.detectionTime = detectionTime;
    this.metrics.totalDependenciesProcessed += dependencyCount;
    
    // Update average detection time
    const totalDetections = this.metrics.totalDependenciesProcessed || 1;
    this.metrics.averageResolutionTime = 
      (this.metrics.averageResolutionTime * (totalDetections - dependencyCount) + detectionTime) / totalDetections;
  }

  /**
   * Get current metrics
   */
  getMetrics(): DependencyMetrics {
    return { ...this.metrics };
  }
}

// Factory function for dependency injection
export const createDependencyDetectionEngine = (
  config: DependencyConfig,
  serviceFactory: any,
): DependencyDetectionEngineService => {
  return new DependencyDetectionEngineService(config, serviceFactory);
}; 