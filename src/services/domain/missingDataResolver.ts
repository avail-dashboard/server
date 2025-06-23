import { logger, logError } from '../../utils/logger';
import { 
  MissingDataResolver,
  MissingDependency,
  BlockResolution,
  AccountResolution,
  RollupResolution,
  BatchResolution,
  DependencyConfig,
  DependencyMetrics,
} from '../types/dependency';
import { BaseService, ServiceHealth } from '../types/service';

/**
 * Missing Data Resolver - John's Implementation
 * 
 * Resolves missing dependencies by fetching data from blockchain
 * and creating entities in the database. Supports batch processing
 * for efficiency.
 */
export class MissingDataResolverService implements MissingDataResolver, BaseService {
  private isRunning = false;
  private config: DependencyConfig;
  private metrics: DependencyMetrics;
  private serviceFactory: any;
  private blockchainService: any;

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
      logger.warn('MissingDataResolver is already running');
      return;
    }

    try {
      logger.info('Starting Missing Data Resolver', {
        component: 'missing-data-resolver',
        config: {
          maxConcurrentResolutions: this.config.resolution.maxConcurrentResolutions,
          retryAttempts: this.config.resolution.retryAttempts,
          batchTimeout: this.config.resolution.batchTimeout,
        },
      });

      // Initialize blockchain service
      this.blockchainService = this.serviceFactory.get('blockchainService');
      
      this.isRunning = true;
      logger.info('Missing Data Resolver started successfully');
    } catch (error) {
      logError(error as Error, {
        component: 'missing-data-resolver',
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
      logger.info('Stopping Missing Data Resolver');
      this.isRunning = false;
      logger.info('Missing Data Resolver stopped successfully');
    } catch (error) {
      logError(error as Error, {
        component: 'missing-data-resolver',
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
        metrics: this.metrics,
        blockchainConnected: !!this.blockchainService,
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning && !!this.blockchainService;
  }

  /**
   * Resolve missing block data
   */
  async resolveBlock(blockNumber: number): Promise<BlockResolution> {
    const startTime = Date.now();

    try {
      logger.debug('Resolving missing block', {
        component: 'missing-data-resolver',
        blockNumber,
      });

      // Fetch block data from blockchain
      const blockData = await this.blockchainService.getBlock(blockNumber);
      
      if (!blockData) {
        return {
          blockNumber,
          resolved: false,
          resolutionTime: Date.now() - startTime,
          error: 'Block not found on blockchain',
        };
      }

      // Create block entity in database
      const blockService = this.serviceFactory.get('blockService');
      await blockService.createBlock({
        number: blockNumber,
        hash: blockData.hash,
        parentHash: blockData.parentHash,
        timestamp: blockData.timestamp,
        extrinsicsCount: blockData.extrinsicsCount || 0,
        // Add other block fields as needed
      });

      const resolutionTime = Date.now() - startTime;
      
      logger.info('Block resolved successfully', {
        component: 'missing-data-resolver',
        blockNumber,
        resolutionTime,
      });

      return {
        blockNumber,
        resolved: true,
        blockData,
        resolutionTime,
      };

    } catch (error) {
      const resolutionTime = Date.now() - startTime;
      logError(error as Error, {
        component: 'missing-data-resolver',
        action: 'resolveBlock',
        blockNumber,
        resolutionTime,
      });

      return {
        blockNumber,
        resolved: false,
        resolutionTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Resolve missing account data
   */
  async resolveAccount(address: string): Promise<AccountResolution> {
    const startTime = Date.now();

    try {
      logger.debug('Resolving missing account', {
        component: 'missing-data-resolver',
        address,
      });

      // Fetch account data from blockchain
      const accountData = await this.blockchainService.getAccount(address);
      
      if (!accountData) {
        // Create empty account entry
        const accountService = this.serviceFactory.get('accountService');
        await accountService.createAccount({
          address,
          balance: '0',
          nonce: 0,
          createdAt: new Date(),
        });

        const resolutionTime = Date.now() - startTime;
        
        return {
          address,
          resolved: true,
          accountData: { address, balance: '0', nonce: 0 },
          balance: '0',
          nonce: 0,
          resolutionTime,
        };
      }

      // Create account entity in database
      const accountService = this.serviceFactory.get('accountService');
      await accountService.createAccount({
        address,
        balance: accountData.balance || '0',
        nonce: accountData.nonce || 0,
        createdAt: new Date(),
      });

      const resolutionTime = Date.now() - startTime;
      
      logger.info('Account resolved successfully', {
        component: 'missing-data-resolver',
        address,
        resolutionTime,
      });

      return {
        address,
        resolved: true,
        accountData,
        balance: accountData.balance,
        nonce: accountData.nonce,
        resolutionTime,
      };

    } catch (error) {
      const resolutionTime = Date.now() - startTime;
      logError(error as Error, {
        component: 'missing-data-resolver',
        action: 'resolveAccount',
        address,
        resolutionTime,
      });

      return {
        address,
        resolved: false,
        resolutionTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Resolve missing rollup data
   */
  async resolveRollup(appId: number): Promise<RollupResolution> {
    const startTime = Date.now();

    try {
      logger.debug('Resolving missing rollup', {
        component: 'missing-data-resolver',
        appId,
      });

      // Fetch rollup data from blockchain or external source
      const rollupData = await this.blockchainService.getRollupInfo(appId);
      
      if (!rollupData) {
        // Create basic rollup entry
        const dataAvailabilityService = this.serviceFactory.get('dataAvailabilityService');
        await dataAvailabilityService.createRollup({
          appId,
          name: `Rollup ${appId}`,
          description: 'Auto-created rollup',
          createdAt: new Date(),
        });

        const resolutionTime = Date.now() - startTime;
        
        return {
          appId,
          resolved: true,
          rollupData: { appId, name: `Rollup ${appId}` },
          name: `Rollup ${appId}`,
          description: 'Auto-created rollup',
          resolutionTime,
        };
      }

      // Create rollup entity in database
      const dataAvailabilityService = this.serviceFactory.get('dataAvailabilityService');
      await dataAvailabilityService.createRollup({
        appId,
        name: rollupData.name || `Rollup ${appId}`,
        description: rollupData.description || '',
        createdAt: new Date(),
      });

      const resolutionTime = Date.now() - startTime;
      
      logger.info('Rollup resolved successfully', {
        component: 'missing-data-resolver',
        appId,
        resolutionTime,
      });

      return {
        appId,
        resolved: true,
        rollupData,
        name: rollupData.name,
        description: rollupData.description,
        resolutionTime,
      };

    } catch (error) {
      const resolutionTime = Date.now() - startTime;
      logError(error as Error, {
        component: 'missing-data-resolver',
        action: 'resolveRollup',
        appId,
        resolutionTime,
      });

      return {
        appId,
        resolved: false,
        resolutionTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Batch resolution for efficiency
   */
  async resolveBatch(dependencies: MissingDependency[]): Promise<BatchResolution> {
    const startTime = Date.now();
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Starting batch resolution', {
        component: 'missing-data-resolver',
        batchId,
        dependencyCount: dependencies.length,
      });

      const resolutions: (BlockResolution | AccountResolution | RollupResolution)[] = [];
      const maxConcurrent = this.config.resolution.maxConcurrentResolutions;
      
      // Group dependencies by type for efficient processing
      const groupedDependencies = this.groupDependenciesByType(dependencies);
      
      // Process each group concurrently
      for (const [entityType, deps] of Object.entries(groupedDependencies)) {
        const typeResolutions = await this.resolveGroupConcurrently(entityType, deps, maxConcurrent);
        resolutions.push(...typeResolutions);
      }

      const totalTime = Date.now() - startTime;
      const resolvedCount = resolutions.filter(r => r.resolved).length;
      const failedCount = resolutions.length - resolvedCount;
      const efficiency = (resolvedCount / resolutions.length) * 100;

      // Update metrics
      this.updateBatchMetrics(totalTime, resolvedCount, failedCount, efficiency);

      const batchResult: BatchResolution = {
        batchId,
        totalDependencies: dependencies.length,
        resolvedCount,
        failedCount,
        resolutions,
        totalTime,
        efficiency,
      };

      logger.info('Batch resolution completed', {
        component: 'missing-data-resolver',
        batchId,
        resolvedCount,
        failedCount,
        efficiency: `${efficiency.toFixed(2)}%`,
        totalTime,
      });

      return batchResult;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      logError(error as Error, {
        component: 'missing-data-resolver',
        action: 'resolveBatch',
        batchId,
        dependencyCount: dependencies.length,
        totalTime,
      });

      return {
        batchId,
        totalDependencies: dependencies.length,
        resolvedCount: 0,
        failedCount: dependencies.length,
        resolutions: [],
        totalTime,
        efficiency: 0,
      };
    }
  }

  /**
   * Check if resolver can handle dependency type
   */
  canResolve(entityType: string): boolean {
    const supportedTypes = ['block', 'account', 'rollup', 'validator'];
    return supportedTypes.includes(entityType);
  }

  /**
   * Private helper methods
   */
  private groupDependenciesByType(dependencies: MissingDependency[]): Record<string, MissingDependency[]> {
    return dependencies.reduce((groups, dep) => {
      if (!groups[dep.entityType]) {
        groups[dep.entityType] = [];
      }
      groups[dep.entityType].push(dep);
      return groups;
    }, {} as Record<string, MissingDependency[]>);
  }

  private async resolveGroupConcurrently(
    entityType: string,
    dependencies: MissingDependency[],
    maxConcurrent: number,
  ): Promise<(BlockResolution | AccountResolution | RollupResolution)[]> {
    const results: (BlockResolution | AccountResolution | RollupResolution)[] = [];
    
    // Process in chunks to respect concurrency limits
    for (let i = 0; i < dependencies.length; i += maxConcurrent) {
      const chunk = dependencies.slice(i, i + maxConcurrent);
      const chunkPromises = chunk.map(dep => this.resolveSingleDependency(dep));
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  private async resolveSingleDependency(
    dependency: MissingDependency,
  ): Promise<BlockResolution | AccountResolution | RollupResolution> {
    try {
      switch (dependency.entityType) {
      case 'block':
        return await this.resolveBlock(parseInt(dependency.entityId, 10));
      case 'account':
        return await this.resolveAccount(dependency.entityId);
      case 'rollup':
        return await this.resolveRollup(parseInt(dependency.entityId, 10));
      case 'validator':
        return await this.resolveAccount(dependency.entityId); // Validators are accounts
      default:
        throw new Error(`Unsupported entity type: ${dependency.entityType}`);
      }
    } catch (error) {
      logError(error as Error, {
        component: 'missing-data-resolver',
        action: 'resolveSingleDependency',
        entityType: dependency.entityType,
        entityId: dependency.entityId,
      });
      
      // Return failed resolution
      return {
        resolved: false,
        resolutionTime: 0,
        error: (error as Error).message,
      } as any;
    }
  }

  private updateBatchMetrics(totalTime: number, resolved: number, failed: number, efficiency: number): void {
    this.metrics.resolutionTime = totalTime;
    this.metrics.successRate = (resolved / (resolved + failed)) * 100;
    this.metrics.failureRate = (failed / (resolved + failed)) * 100;
    this.metrics.batchEfficiency = efficiency;
    this.metrics.totalDependenciesProcessed += resolved + failed;
    
    // Update average resolution time
    const totalProcessed = this.metrics.totalDependenciesProcessed || 1;
    this.metrics.averageResolutionTime = 
      (this.metrics.averageResolutionTime * (totalProcessed - resolved - failed) + totalTime) / totalProcessed;
  }

  /**
   * Get current metrics
   */
  getMetrics(): DependencyMetrics {
    return { ...this.metrics };
  }
}

// Factory function for dependency injection
export const createMissingDataResolver = (
  config: DependencyConfig,
  serviceFactory: any,
): MissingDataResolverService => {
  return new MissingDataResolverService(config, serviceFactory);
}; 