// Service Layer Entry Point
// Simple service factory and dependency injection

// Core Services
export { AvailBlockchainService, createAvailBlockchainService } from './core/avail-blockchain';
export { AvailConnectionManager, createAvailConnectionManager } from './core/avail-connection-manager';
export { QueueService, createQueueService } from './core/queue';
export { SyncService, createSyncService } from './core/sync';
export { SimpleDependencyResolver, createDependencyResolver } from './core/dependency-resolver';

// Integration Services
// (No integration services currently)

// Domain Services
export { BlockService, createBlockService } from './domain/block';
export { ExtrinsicService, createExtrinsicService } from './domain/extrinsic';
export { DataAvailabilityService, createDataAvailabilityService } from './domain/dataAvailability';
export { BlockIndexerService, createBlockIndexerService } from './domain/indexer';
// Phase 6 Services (replacing DataProcessorService with SelfHealingBlockProcessor) 
export { SelfHealingBlockProcessor, createSelfHealingBlockProcessor } from './domain/selfHealingProcessor';
export { SearchService, createSearchService } from './domain/search';
// Phase 2 Services
export { AccountService, createAccountService } from './domain/account';
export { ValidatorService, createValidatorService } from './domain/validator';
// Phase 5 Services
export { DataSubmissionService, createDataSubmissionService } from './domain/dataSubmission';

// Mappers
export * from '../mappers';

// Service Types
export * from './types/service';
export * from './types/blockchain';

// Core services factory functions
import { createAvailConnectionManager, AvailConnectionManager } from './core/avail-connection-manager';
import { createAvailBlockchainService, AvailBlockchainService } from './core/avail-blockchain';
import { createQueueService, QueueService } from './core/queue';
import { createDependencyResolver } from './core/dependency-resolver';
import config from '../config';

// Domain services factory functions
import { createBlockService } from './domain/block';
import { createExtrinsicService } from './domain/extrinsic';
import { createDataAvailabilityService } from './domain/dataAvailability';
import { createSyncService } from './core/sync';
import { createBlockIndexerService } from './domain/indexer';
// Phase 6 Services (replacing DataProcessorService)
import { createSelfHealingBlockProcessor } from './domain/selfHealingProcessor';
import { createSearchService } from './domain/search';
// Phase 2 Services
import { createAccountService } from './domain/account';
import { createValidatorService } from './domain/validator';
import { createChainService } from './domain/chain';
import { createTransferService } from './domain/transfer';
import { createAnalyticsService } from '../services/analytics/analytics';
// Phase 5 Services
import { createDataSubmissionService } from './domain/dataSubmission';

// Mapper imports
import { 
  DataSubmissionMapper, 
  RollupMapper, 
  ExtrinsicMapper, 
  BlockMapper,
} from '../mappers';

// Database imports
import db from '../utils/database';
import { 
  blockRepository, 
  dataSubmissionRepository, 
  rollupRepository,
  extrinsicRepository,
  // Phase 2 repositories
  validatorRepository,
  transferRepository,
  nominationRepository,
  rewardRepository,
  eraRepository,
} from '../database/repositories';

// Phase 2: Dependency Management Services - John's Implementation
import { createDependencyDetectionEngine } from './domain/dependencyDetectionEngine';
import { createMissingDataResolver } from './domain/missingDataResolver';

// Service Factory for dependency injection
export class ServiceFactory {
  private static instance: ServiceFactory;
  private services: Map<string, any> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  // Register a service instance
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
    console.log(`🔧 Service registered: ${name}`);
  }

  // Get a service instance with proper typing
  get<T = any>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      console.error(`❌ Service '${name}' not found. Available services:`, Array.from(this.services.keys()));
      throw new Error(`Service '${name}' not found. Make sure it's registered.`);
    }
    return service as T;
  }

  // Check if service is registered
  has(name: string): boolean {
    return this.services.has(name);
  }

  // Get list of registered services
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  // Initialize all core services
  async initializeCoreServices(): Promise<void> {
    try {
      console.log('🔧 Initializing core services...');
      
      // Create core service instances
      const providers = config.avail.rpc.endpoints.map((endpoint, index) => ({
        url: endpoint,
        provider: `Provider-${index + 1}`,
        type: 'ws' as const,
        priority: index + 1,
      }));
      const connectionManager = createAvailConnectionManager(providers);
      const availBlockchainService = createAvailBlockchainService(); // Use AvailBlockchainService for proper extrinsics extraction
      const queueService = createQueueService();
      
      // Register core services
      this.register('connectionManager', connectionManager);
      this.register('availBlockchain', availBlockchainService);
      this.register('queue', queueService);

      // Start core services
      await availBlockchainService.start();
      await queueService.start();
      
      console.log('✅ Core services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize core services:', error);
      throw error;
    }
  }

  // Initialize domain services (after core services are ready)
  async initializeDomainServices(): Promise<void> {
    try {
      console.log('🔧 Initializing domain services...');
      
      // Get core services from registry with proper typing
      const availBlockchainService = this.get<AvailBlockchainService>('availBlockchain');
      const queueService = this.get<QueueService>('queue');
      
      // Create mapper instances
      const dataSubmissionMapper = new DataSubmissionMapper();
      const rollupMapper = new RollupMapper();
      const extrinsicMapper = new ExtrinsicMapper();
      const blockMapper = new BlockMapper();
      
      // Register mappers
      this.register('dataSubmissionMapper', dataSubmissionMapper);
      this.register('rollupMapper', rollupMapper);
      this.register('extrinsicMapper', extrinsicMapper);
      this.register('blockMapper', blockMapper);
      
      // Create domain services using factory functions with dependencies
      const blockService = createBlockService(blockRepository, availBlockchainService, blockMapper);
      const extrinsicService = createExtrinsicService(extrinsicRepository, blockRepository, availBlockchainService, extrinsicMapper);
      const dataAvailabilityService = createDataAvailabilityService(
        dataSubmissionRepository,
        rollupRepository, 
        availBlockchainService,
        dataSubmissionMapper,
        rollupMapper,
      );
      
      // Create new sync services
      const syncService = createSyncService(db, availBlockchainService, queueService);
      const blockIndexerService = createBlockIndexerService(db, availBlockchainService);
      
      // Create search service
      const searchService = createSearchService(
        blockRepository,
        extrinsicRepository,
        rollupRepository,
        dataSubmissionRepository,
      );

      // Create dependency resolver
      const dependencyResolver = createDependencyResolver();

      // Create Phase 2 services
      const accountService = createAccountService(
        availBlockchainService,
        transferRepository,
        extrinsicRepository,
        validatorRepository,
        rewardRepository,
      );

      // Register account resolver before creating dependent services
      dependencyResolver.registerResolver('account', (address: string) => 
        accountService.ensureAccountExists(address),
      );

      // Register block resolver to ensure blocks exist before creating dependent entities
      dependencyResolver.registerResolver('block', async (blockNumber: string) => {
        const blockNum = parseInt(blockNumber);
        const existing = await blockRepository.findByNumber(blockNum);
        if (!existing) {
          // Get block data and create it
          const blockData = await availBlockchainService.getBlock(blockNum);
          if (blockData) {
            const blockMapper = this.get('blockMapper');
            const mappedBlock = blockMapper.mapFromBlockchainData(blockData);
            return await blockRepository.create(mappedBlock);
          }
          throw new Error(`Block ${blockNum} not found on blockchain`);
        }
        return existing;
      });

      const validatorService = createValidatorService(
        availBlockchainService,
        validatorRepository,
        nominationRepository,
        rewardRepository,
        blockRepository,
        eraRepository,
        dependencyResolver,
      );

      const chainService = createChainService(availBlockchainService);

      const transferService = createTransferService(
        availBlockchainService,
        transferRepository,
        blockRepository,
        dependencyResolver,
      );

      // Phase 5: DataSubmissionService
      const dataSubmissionService = createDataSubmissionService(
        availBlockchainService,
        dataSubmissionRepository,
        rollupRepository,
        dependencyResolver,
      );

      const analyticsService = createAnalyticsService(
        availBlockchainService,
        blockRepository,
        extrinsicRepository,
        transferRepository,
        validatorRepository,
        dataSubmissionRepository,
      );

      // ==================== Phase 2: Dependency Management Services - John's Implementation ====================
      
      // Create Phase 2 services with configuration
      const dependencyConfig = config.dependencyManagement;
      const dependencyDetectionEngine = createDependencyDetectionEngine(dependencyConfig, this);
      const missingDataResolver = createMissingDataResolver(dependencyConfig, this);
      
      // Register Phase 2 services
      this.register('dependencyDetectionEngine', dependencyDetectionEngine);
      this.register('missingDataResolver', missingDataResolver);
      
      // Start Phase 2 services
      await dependencyDetectionEngine.start();
      await missingDataResolver.start();
      
      // ==================== End Phase 2 Services ====================

      // Phase 6: Create SelfHealingBlockProcessor (replaces DataProcessorService)
      // Note: Now includes queueService and dependencyDetectionEngine for TASK-007 integration
      const selfHealingBlockProcessor = createSelfHealingBlockProcessor(
        accountService,
        validatorService,
        transferService,
        dataSubmissionService,
        queueService,
        dependencyDetectionEngine,
      );
      
      // Register domain services
      this.register('blockService', blockService);
      this.register('extrinsicService', extrinsicService);
      this.register('dataAvailabilityService', dataAvailabilityService);
      this.register('searchService', searchService);
      
      // Register Phase 2 services
      this.register('accountService', accountService);
      this.register('validatorService', validatorService);
      this.register('chainService', chainService);
      this.register('transferService', transferService);
      // Register Phase 5 services
      this.register('dataSubmissionService', dataSubmissionService);
      this.register('analyticsService', analyticsService);

      // Start Phase 2 services
      await accountService.start();
      await validatorService.start();
      await chainService.start();
      await transferService.start();
      // Start Phase 5 services
      await dataSubmissionService.start();
      await analyticsService.start();
      
      // Register new sync services
      this.register('syncService', syncService);
      this.register('blockIndexerService', blockIndexerService);
      // Phase 6: Register SelfHealingBlockProcessor instead of DataProcessorService
      this.register('selfHealingBlockProcessor', selfHealingBlockProcessor);
      
      // Start sync services
      await syncService.start();
      await blockIndexerService.start();
      
      // Initialize queue service dependencies (John's Service Integration Architecture)
      const queueServiceInstance = this.get<QueueService>('queue');
      queueServiceInstance.initializeDependencies({
        selfHealingBlockProcessor,
        analyticsService,
        blockService,
        serviceFactory: this,
        // Phase 2 dependencies
        dependencyDetectionEngine,
        missingDataResolver,
      });
      // Phase 6: Start SelfHealingBlockProcessor instead of DataProcessorService
      await selfHealingBlockProcessor.start();
      
      console.log('✅ Domain services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize domain services:', error);
      throw error;
    }
  }

  // Initialize all services (core + domain)
  async initializeAllServices(): Promise<void> {
    try {
      console.log('🚀 Starting service initialization...');
      
      await this.initializeCoreServices();
      await this.initializeDomainServices();
      
      this.initialized = true;
      console.log('✅ All services initialized successfully. Registered services:', this.getRegisteredServices());
    } catch (error) {
      console.error('❌ Failed to initialize all services:', error);
      this.initialized = false;
      throw error;
    }
  }

  // Check if services are initialized
  isInitialized(): boolean {
    return this.initialized;
  }

  // Shutdown all services
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 Shutting down services...');
      
      // Define the shutdown order (reverse of startup order for proper dependency cleanup)
      const shutdownOrder = [
        // Sync services (started last, should stop first)
        'selfHealingBlockProcessor',
        'blockIndexerService', 
        'syncService',
        
        // Domain services (Phase 2 & 5 services)
        'analyticsService',
        'dataSubmissionService',
        'transferService',
        'chainService',
        'validatorService',
        'accountService',
        
        // Core blockchain and queue services (started first, should stop last)
        'queue',
        'availBlockchain',
      ];
      
      const shutdownErrors: string[] = [];
      
      // Stop services in the defined order
      for (const serviceName of shutdownOrder) {
        if (this.has(serviceName)) {
          try {
            const service = this.get(serviceName);
            if (service && typeof service.stop === 'function') {
              console.log(`🔄 Stopping service: ${serviceName}`);
              await service.stop();
              console.log(`✅ Service stopped: ${serviceName}`);
            } else {
              console.log(`ℹ️  Service ${serviceName} has no stop() method, skipping`);
            }
          } catch (error) {
            const errorMsg = `Failed to stop ${serviceName}: ${(error as Error).message}`;
            console.error(`❌ ${errorMsg}`);
            shutdownErrors.push(errorMsg);
            // Continue with other services even if one fails
          }
        }
      }
      
      // Stop any remaining services that weren't in the explicit order
      const allServices = this.getRegisteredServices();
      const remainingServices = allServices.filter(name => !shutdownOrder.includes(name));
      
      if (remainingServices.length > 0) {
        console.log(`🔄 Stopping remaining services: ${remainingServices.join(', ')}`);
        
        for (const serviceName of remainingServices) {
          try {
            const service = this.get(serviceName);
            if (service && typeof service.stop === 'function') {
              console.log(`🔄 Stopping remaining service: ${serviceName}`);
              await service.stop();
              console.log(`✅ Remaining service stopped: ${serviceName}`);
            }
          } catch (error) {
            const errorMsg = `Failed to stop remaining service ${serviceName}: ${(error as Error).message}`;
            console.error(`❌ ${errorMsg}`);
            shutdownErrors.push(errorMsg);
          }
        }
      }
      
      // Clear the service registry
      this.services.clear();
      this.initialized = false;
      
      if (shutdownErrors.length > 0) {
        console.warn(`⚠️  Some services had shutdown errors: ${shutdownErrors.join('; ')}`);
        console.log('✅ Service shutdown completed with warnings');
      } else {
        console.log('✅ All services shutdown completed successfully');
      }
      
    } catch (error) {
      console.error('❌ Critical error during service shutdown:', error);
      // Even on critical error, try to clear the registry
      this.services.clear();
      this.initialized = false;
      throw error;
    }
  }

  // Get health status of all services
  async getHealthStatus(): Promise<Record<string, any>> {
    const healthStatus: Record<string, any> = {};

    healthStatus.initialized = this.initialized;
    healthStatus.registeredServices = this.getRegisteredServices();

    if (this.has('availBlockchain')) {
      const availBlockchain = this.get<AvailBlockchainService>('availBlockchain');
      healthStatus.availBlockchain = await availBlockchain.getHealth();
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<AvailConnectionManager>('connectionManager');
      healthStatus.connectionManager = await connMgr.getHealth();
    }

    if (this.has('queue')) {
      const queue = this.get<QueueService>('queue');
      healthStatus.queue = await queue.getHealth();
    }

    // Domain services don't have health checks yet, but we can check if they're registered
    healthStatus.domainServices = {
      blockService: this.has('blockService'),
      extrinsicService: this.has('extrinsicService'),
      dataAvailabilityService: this.has('dataAvailabilityService'),
    };

    return healthStatus;
  }

  // Get detailed metrics from all services
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    metrics.initialized = this.initialized;
    metrics.registeredServices = this.getRegisteredServices();

    if (this.has('availBlockchain')) {
      const availBlockchain = this.get<AvailBlockchainService>('availBlockchain');
      metrics.availBlockchain = {
        connection: availBlockchain.getConnectionMetrics(),
      };
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<AvailConnectionManager>('connectionManager');
      metrics.connectionManager = connMgr.getMetrics();
    }

    return metrics;
  }
}

// Export singleton instance
export const serviceFactory = ServiceFactory.getInstance(); 