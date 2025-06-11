// Service Layer Entry Point
// Simple service factory and dependency injection

// Core Services
export { BlockchainService } from './core/blockchain';
export { ConnectionManager } from './core/connection-manager';
export { QueueService, queueService } from './core/queue';

// Integration Services
// (No integration services currently)

// Domain Services
export { 
  BlockService, 
  ExtrinsicService, 
  DataAvailabilityService,
  createBlockService,
  createExtrinsicService,
  createDataAvailabilityService,
} from './domain';

// Service Types
export * from './types/service';
export * from './types/blockchain';

// Core services imports
import { connectionManager } from './core/connection-manager';
import { blockchainService } from './core/blockchain';
import { queueService } from './core/queue';

// Domain services factory functions
import { 
  createBlockService,
  createExtrinsicService,
  createDataAvailabilityService,
} from './domain';

// Database import
import db from '../utils/database';

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

  // Get a service instance
  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      console.error(`❌ Service '${name}' not found. Available services:`, Array.from(this.services.keys()));
      throw new Error(`Service '${name}' not found. Make sure it's registered.`);
    }
    return service;
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
      
      // Create domain services using factory functions directly
      const blockService = createBlockService(db, blockchainService);
      const extrinsicService = createExtrinsicService(db, blockchainService);
      const dataAvailabilityService = createDataAvailabilityService(db, blockchainService);
      
      // Register domain services
      this.register('blockService', blockService);
      this.register('extrinsicService', extrinsicService);
      this.register('dataAvailabilityService', dataAvailabilityService);
      
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
      const blockchain = this.get<typeof blockchainService>('blockchain');
      healthStatus.blockchain = await blockchain.getHealth();
    }

    if (this.has('connectionManager')) {
      const connMgr = this.get<typeof connectionManager>('connectionManager');
      healthStatus.connectionManager = await connMgr.getHealth();
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

    metrics.initialized = this.initialized;
    metrics.registeredServices = this.getRegisteredServices();

    if (this.has('blockchain')) {
      const blockchain = this.get<typeof blockchainService>('blockchain');
      metrics.blockchain = {
        connection: blockchain.getConnectionMetrics(),
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