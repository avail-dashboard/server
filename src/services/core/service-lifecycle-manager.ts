import { logger, logError } from '../../utils/logger';
import {
  BaseService,
  ServiceHealth,
  ServiceMetrics,
  ServiceLifecycle,
} from '../types/service';

export interface LifecycleManagerOptions {
  healthCheckInterval?: number;
  maxRestartAttempts?: number;
  restartDelay?: number;
}

/**
 * ServiceLifecycleManager - Manages service lifecycle, health checks, and metrics
 * 
 * Responsibilities:
 * - Handle service start/stop/restart lifecycle
 * - Periodic health checks with monitoring
 * - Metrics collection and aggregation  
 * - Auto-restart on failures (optional)
 * - Service state management
 */
export class ServiceLifecycleManager implements BaseService {
  private lifecycle: ServiceLifecycle;
  private metrics: ServiceMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private options: Required<LifecycleManagerOptions>;
  private managedServices: Map<string, BaseService> = new Map();

  constructor(options: LifecycleManagerOptions = {}) {
    this.options = {
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      maxRestartAttempts: options.maxRestartAttempts || 3,
      restartDelay: options.restartDelay || 5000, // 5 seconds
    };

    this.lifecycle = {
      status: 'STOPPED',
      restartCount: 0,
    };

    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      uptime: 0,
    };
  }

  /**
   * Start the lifecycle manager
   */
  async start(): Promise<void> {
    try {
      this.lifecycle.status = 'STARTING';
      this.lifecycle.startedAt = new Date();
      
      logger.info('ServiceLifecycleManager: Starting lifecycle manager', { 
        component: 'service-lifecycle-manager',
      });
      
      // Start health check monitoring
      this.startHealthChecking();
      
      this.lifecycle.status = 'RUNNING';
      logger.info('ServiceLifecycleManager: Lifecycle manager started', { 
        component: 'service-lifecycle-manager',
      });
      
    } catch (error) {
      this.lifecycle.status = 'ERROR';
      logError(error as Error, { 
        component: 'service-lifecycle-manager', 
        action: 'start',
      });
      throw error;
    }
  }

  /**
   * Stop the lifecycle manager
   */
  async stop(): Promise<void> {
    try {
      this.lifecycle.status = 'STOPPING';
      
      logger.info('ServiceLifecycleManager: Stopping lifecycle manager', { 
        component: 'service-lifecycle-manager',
      });
      
      // Stop health check monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      // Stop all managed services
      await this.stopAllManagedServices();
      
      this.lifecycle.status = 'STOPPED';
      this.lifecycle.stoppedAt = new Date();
      
      logger.info('ServiceLifecycleManager: Lifecycle manager stopped', { 
        component: 'service-lifecycle-manager',
      });
      
    } catch (error) {
      this.lifecycle.status = 'ERROR';
      logError(error as Error, { 
        component: 'service-lifecycle-manager', 
        action: 'stop',
      });
      throw error;
    }
  }

  /**
   * Get health status of the lifecycle manager
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Calculate uptime
      const uptime = this.lifecycle.startedAt 
        ? now.getTime() - this.lifecycle.startedAt.getTime()
        : 0;

      // Check health of managed services
      const serviceHealthChecks = await Promise.allSettled(
        Array.from(this.managedServices.entries()).map(async ([name, service]) => {
          try {
            const health = await service.getHealth();
            return { name, health };
          } catch (error) {
            return { 
              name, 
              health: { 
                healthy: false, 
                lastCheck: now, 
                error: (error as Error).message,
              },
            };
          }
        }),
      );

      const managedServiceHealth = serviceHealthChecks.map(result => 
        result.status === 'fulfilled' ? result.value : null,
      ).filter(Boolean);

      const unhealthyServices = managedServiceHealth.filter(s => !s!.health.healthy);

      return {
        healthy: this.lifecycle.status === 'RUNNING' && unhealthyServices.length === 0,
        lastCheck: now,
        details: {
          status: this.lifecycle.status,
          uptime,
          managedServices: managedServiceHealth.length,
          unhealthyServices: unhealthyServices.length,
          serviceHealth: managedServiceHealth.reduce((acc, s) => {
            acc[s!.name] = s!.health;
            return acc;
          }, {} as Record<string, ServiceHealth>),
          metrics: this.metrics,
          restartCount: this.lifecycle.restartCount,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          status: this.lifecycle.status,
          metrics: this.metrics,
        },
      };
    }
  }

  /**
   * Check if the lifecycle manager is healthy
   */
  isHealthy(): boolean {
    return this.lifecycle.status === 'RUNNING';
  }

  /**
   * Register a service to be managed
   */
  registerService(name: string, service: BaseService): void {
    this.managedServices.set(name, service);
    logger.info('ServiceLifecycleManager: Service registered', {
      component: 'service-lifecycle-manager',
      serviceName: name,
      totalServices: this.managedServices.size,
    });
  }

  /**
   * Unregister a managed service
   */
  unregisterService(name: string): void {
    this.managedServices.delete(name);
    logger.info('ServiceLifecycleManager: Service unregistered', {
      component: 'service-lifecycle-manager',
      serviceName: name,
      totalServices: this.managedServices.size,
    });
  }

  /**
   * Start a specific managed service
   */
  async startService(name: string): Promise<void> {
    const service = this.managedServices.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    try {
      await service.start();
      logger.info('ServiceLifecycleManager: Service started', {
        component: 'service-lifecycle-manager',
        serviceName: name,
      });
    } catch (error) {
      logError(error as Error, {
        component: 'service-lifecycle-manager',
        action: 'startService',
        serviceName: name,
      });
      throw error;
    }
  }

  /**
   * Stop a specific managed service
   */
  async stopService(name: string): Promise<void> {
    const service = this.managedServices.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    try {
      await service.stop();
      logger.info('ServiceLifecycleManager: Service stopped', {
        component: 'service-lifecycle-manager',
        serviceName: name,
      });
    } catch (error) {
      logError(error as Error, {
        component: 'service-lifecycle-manager',
        action: 'stopService',
        serviceName: name,
      });
      throw error;
    }
  }

  /**
   * Restart a specific managed service
   */
  async restartService(name: string): Promise<void> {
    const service = this.managedServices.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    try {
      await service.stop();
      await new Promise(resolve => setTimeout(resolve, this.options.restartDelay));
      await service.start();
      
      this.lifecycle.restartCount++;
      
      logger.info('ServiceLifecycleManager: Service restarted', {
        component: 'service-lifecycle-manager',
        serviceName: name,
        restartCount: this.lifecycle.restartCount,
      });
    } catch (error) {
      logError(error as Error, {
        component: 'service-lifecycle-manager',
        action: 'restartService',
        serviceName: name,
      });
      throw error;
    }
  }

  /**
   * Get lifecycle information
   */
  getLifecycle(): ServiceLifecycle {
    return { ...this.lifecycle };
  }

  /**
   * Get metrics
   */
  getMetrics(): ServiceMetrics {
    // Update uptime
    if (this.lifecycle.startedAt) {
      this.metrics.uptime = Date.now() - this.lifecycle.startedAt.getTime();
    }
    return { ...this.metrics };
  }

  /**
   * Get status of all managed services
   */
  async getManagedServicesStatus(): Promise<Record<string, { healthy: boolean; status?: string }>> {
    const statusPromises = Array.from(this.managedServices.entries()).map(async ([name, service]) => {
      try {
        const health = await service.getHealth();
        return [name, { healthy: health.healthy, status: health.details?.status }];
      } catch (error) {
        return [name, { healthy: false, error: (error as Error).message }];
      }
    });

    const results = await Promise.allSettled(statusPromises);
    return Object.fromEntries(
      results.map((result, index) => 
        result.status === 'fulfilled' 
          ? result.value as [string, any]
          : [Array.from(this.managedServices.keys())[index], { healthy: false }],
      ),
    );
  }

  // Private methods

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logError(error as Error, { 
          component: 'service-lifecycle-manager', 
          action: 'healthCheck',
        });
      }
    }, this.options.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check all managed services
      const healthResults = await Promise.allSettled(
        Array.from(this.managedServices.entries()).map(async ([name, service]) => {
          const health = await service.getHealth();
          return { name, health };
        }),
      );

      // Log unhealthy services
      healthResults.forEach((result) => {
        if (result.status === 'fulfilled' && !result.value.health.healthy) {
          logger.warn('ServiceLifecycleManager: Unhealthy service detected', {
            component: 'service-lifecycle-manager',
            serviceName: result.value.name,
            error: result.value.health.error,
          });
        }
      });

      // Update metrics
      this.metrics.requestCount++;
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
        this.metrics.requestCount;
      this.metrics.lastRequestTime = new Date();
      
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  private async stopAllManagedServices(): Promise<void> {
    const stopPromises = Array.from(this.managedServices.entries()).map(async ([name, service]) => {
      try {
        await service.stop();
        logger.info('ServiceLifecycleManager: Managed service stopped', {
          component: 'service-lifecycle-manager',
          serviceName: name,
        });
      } catch (error) {
        logError(error as Error, {
          component: 'service-lifecycle-manager',
          action: 'stopManagedService',
          serviceName: name,
        });
      }
    });

    await Promise.allSettled(stopPromises);
  }
}

// Singleton instance
export const serviceLifecycleManager = new ServiceLifecycleManager(); 