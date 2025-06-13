// Service Layer Entry Point
// Simple service factory and dependency injection

// Core Services
export { BlockchainService, createBlockchainService } from './core/blockchain';
export { ConnectionManager, createConnectionManager } from './core/connection-manager';
export { QueueService, createQueueService } from './core/queue';
export { SyncService, createSyncService } from './core/sync';

// Integration Services
// (No integration services currently)

// Domain Services
export { BlockService, createBlockService } from './domain/block';
export { ExtrinsicService, createExtrinsicService } from './domain/extrinsic';
export { DataAvailabilityService, createDataAvailabilityService } from './domain/dataAvailability';
export { BlockIndexerService, createBlockIndexerService } from './domain/indexer';
export { DataProcessorService, createDataProcessorService } from './domain/processor';

// Service Types
export * from './types/service';
export * from './types/blockchain';

// Core services factory functions
import { createConnectionManager, ConnectionManager } from './core/connection-manager';
import { createBlockchainService, BlockchainService } from './core/blockchain';
import { createQueueService, QueueService } from './core/queue';

// Domain services factory functions
import { createBlockService } from './domain/block';
import { createExtrinsicService } from './domain/extrinsic';
import { createDataAvailabilityService } from './domain/dataAvailability';
import { createSyncService } from './core/sync';
import { createBlockIndexerService } from './domain/indexer';
import { createDataProcessorService } from './domain/processor';

// Database imports
import db from '../utils/database';
import { 
  blockRepository, 
  dataSubmissionRepository, 
  rollupRepository 
} from '../database/repositories';

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
      const connectionManager = createConnectionManager();
      const blockchainService = createBlockchainService();
      const queueService = createQueueService();
      
      // Register core services
      this.register('connectionManager', connectionManager);
      this.register('blockchain', blockchainService);
      this.register('queue', queueService);

      // Start core services
      await blockchainService.start();
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
      const blockchainService = this.get<BlockchainService>('blockchain');
      const queueService = this.get<QueueService>('queue');
      
      // Create domain services using factory functions with dependencies
      const blockService = createBlockService(blockRepository, blockchainService);
      const extrinsicService = createExtrinsicService(db, blockchainService);
      const dataAvailabilityService = createDataAvailabilityService(
        dataSubmissionRepository,
        rollupRepository, 
        blockchainService
      );
      
      // Create new sync services
      const syncService = createSyncService(db, blockchainService, queueService);
      const blockIndexerService = createBlockIndexerService(db, blockchainService);
      const dataProcessorService = createDataProcessorService(db, blockchainService);
      
      // Register domain services
      this.register('blockService', blockService);
      this.register('extrinsicService', extrinsicService);
      this.register('dataAvailabilityService', dataAvailabilityService);
      
      // Register new sync services
      this.register('syncService', syncService);
      this.register('blockIndexerService', blockIndexerService);
      this.register('dataProcessorService', dataProcessorService);
      
      // Start sync services
      await syncService.start();
      await blockIndexerService.start();
      await dataProcessorService.start();
      
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
      
      const shutdownPromises: Promise<void>[] = [];

      // Stop blockchain service (will stop its internal managers)
      if (this.has('blockchain')) {
        const blockchain = this.get<BlockchainService>('blockchain');
        shutdownPromises.push(blockchain.stop());
      }

      // Stop queue service
      if (this.has('queue')) {
        const queue = this.get<QueueService>('queue');
        shutdownPromises.push(queue.stop());
      }

      await Promise.all(shutdownPromises);
      this.services.clear();
      this.initialized = false;
      
      console.log('✅ All services shutdown completed');
    } catch (error) {
      console.error('❌ Error during service shutdown:', error);
      throw error;
    }
  }

  // Get health status of all services
  async getHealthStatus(): Promise<Record<string, any>> {
    const healthStatus: Record<string, any> = {};

    healthStatus.initialized = this.initialized;
    healthStatus.registeredServices = this.getRegisteredServices();

    if (this.has('blockchain')) {
      const blockchain = this.get<BlockchainService>('blockchain');
      healthStatus.blockchain = await blockchain.getHealth();
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<ConnectionManager>('connectionManager');
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

    if (this.has('blockchain')) {
      const blockchain = this.get<BlockchainService>('blockchain');
      metrics.blockchain = {
        connection: blockchain.getConnectionMetrics(),
      };
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<ConnectionManager>('connectionManager');
      metrics.connectionManager = connMgr.getMetrics();
    }

    return metrics;
  }
}

// Export singleton instance
export const serviceFactory = ServiceFactory.getInstance(); 