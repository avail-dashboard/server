// Service Layer Entry Point
// Simple service factory and dependency injection

// Core Services
export { BlockchainService, blockchainService, connectionManager, lifecycleManager } from './core/blockchain';
export { ConnectionManager } from './core/connection-manager';
export { ServiceLifecycleManager } from './core/service-lifecycle-manager';
export { QueueService, queueService } from './core/queue';

// Integration Services
// (No integration services currently)

import { blockchainService, connectionManager, lifecycleManager } from './core/blockchain';
import { queueService } from './core/queue';

// Domain Services
export { 
  BlockService, 
  ExtrinsicService, 
  DataAvailabilityService,
  DomainServiceFactory,
  domainServiceFactory,
  getBlockService,
  getExtrinsicService,
  getDataAvailabilityService,
} from './domain';

// Service Types
export * from './types/service';
export * from './types/blockchain';

// Service Factory for dependency injection
export class ServiceFactory {
  private static instance: ServiceFactory;
  private services: Map<string, any> = new Map();

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
  }

  // Get a service instance
  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found. Make sure it's registered.`);
    }
    return service;
  }

  // Check if service is registered
  has(name: string): boolean {
    return this.services.has(name);
  }

  // Initialize all core services
  async initializeCoreServices(): Promise<void> {
    // Register core services (using shared instances from blockchain service)
    this.register('connectionManager', connectionManager);
    this.register('lifecycleManager', lifecycleManager);
    this.register('blockchain', blockchainService);
    this.register('queue', queueService);

    // Start core services - blockchain service will start its internal managers
    await blockchainService.start();
    await queueService.start();
  }

  // Initialize domain services (after core services are ready)
  async initializeDomainServices(): Promise<void> {
    // Import domain services factory
    const { domainServiceFactory } = await import('./domain');
    
    // Register domain services
    this.register('blockService', domainServiceFactory.getBlockService());
    this.register('extrinsicService', domainServiceFactory.getExtrinsicService());
    this.register('dataAvailabilityService', domainServiceFactory.getDataAvailabilityService());
  }

  // Initialize all services (core + domain)
  async initializeAllServices(): Promise<void> {
    await this.initializeCoreServices();
    await this.initializeDomainServices();
  }

  // Shutdown all services
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    // Stop blockchain service (will stop its internal managers)
    if (this.has('blockchain')) {
      const blockchain = this.get<typeof blockchainService>('blockchain');
      shutdownPromises.push(blockchain.stop());
    }

    // Stop queue service
    if (this.has('queue')) {
      const queue = this.get<typeof queueService>('queue');
      shutdownPromises.push(queue.stop());
    }

    await Promise.all(shutdownPromises);
    this.services.clear();
  }

  // Get health status of all services
  async getHealthStatus(): Promise<Record<string, any>> {
    const healthStatus: Record<string, any> = {};

    if (this.has('blockchain')) {
      const blockchain = this.get<typeof blockchainService>('blockchain');
      healthStatus.blockchain = await blockchain.getHealth();
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<typeof connectionManager>('connectionManager');
      healthStatus.connectionManager = await connMgr.getHealth();
    }

    if (this.has('lifecycleManager')) {
      const lifecycleMgr = this.get<typeof lifecycleManager>('lifecycleManager');
      healthStatus.lifecycleManager = await lifecycleMgr.getHealth();
    }

    if (this.has('queue')) {
      const queue = this.get<typeof queueService>('queue');
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

    if (this.has('blockchain')) {
      const blockchain = this.get<typeof blockchainService>('blockchain');
      metrics.blockchain = {
        service: blockchain.getMetrics(),
        connection: blockchain.getConnectionMetrics(),
        lifecycle: blockchain.getLifecycle(),
      };
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<typeof connectionManager>('connectionManager');
      metrics.connectionManager = connMgr.getMetrics();
    }

    return metrics;
  }
}

// Export singleton instance
export const serviceFactory = ServiceFactory.getInstance(); 