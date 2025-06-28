import { Job } from 'bull';
import { logger } from '../../../utils/logger';
import { JobType } from '../../types/service';

export interface QueuePerformanceMetrics {
  averageProcessingTime: number;
  throughput: number;
  errorRate: number;
  queueDepth: number;
  concurrencyUtilization: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface AdaptiveConfig {
  minConcurrency: number;
  maxConcurrency: number;
  targetLatency: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
}

export interface QueuePriorityConfig {
  [JobType.BLOCK_INDEXING]: number;
  [JobType.INDEX_VALIDATOR]: number;
  [JobType.INDEX_ACCOUNT]: number;
  [JobType.INDEX_TRANSFER]: number;
  [JobType.INDEX_DATA_SUBMISSION]: number;
  [JobType.DATA_SYNC]: number;
  [JobType.HEALTH_CHECK]: number;
}

/**
 * Phase 4: Advanced Queue Manager
 * 
 * Provides intelligent queue management with:
 * - Adaptive concurrency based on system performance
 * - Dynamic priority adjustment based on load
 * - Intelligent job routing and load balancing
 * - Real-time performance monitoring
 */
export class AdvancedQueueManager {
  private performanceMetrics: QueuePerformanceMetrics;
  private adaptiveConfig: AdaptiveConfig;
  private priorityConfig: QueuePriorityConfig;
  private currentConcurrency: number;
  private metricsHistory: QueuePerformanceMetrics[];
  private lastOptimization: number;

  constructor() {
    this.performanceMetrics = this.initializeMetrics();
    this.adaptiveConfig = this.getDefaultAdaptiveConfig();
    this.priorityConfig = this.getDefaultPriorityConfig();
    this.currentConcurrency = this.adaptiveConfig.minConcurrency;
    this.metricsHistory = [];
    this.lastOptimization = Date.now();

    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  /**
   * Calculate optimal concurrency based on system metrics
   */
  calculateOptimalConcurrency(systemMetrics: QueuePerformanceMetrics): number {
    const currentLatency = systemMetrics.averageProcessingTime;
    const targetLatency = this.adaptiveConfig.targetLatency;
    const utilizationRate = systemMetrics.concurrencyUtilization;

    // Scale up if latency is good and utilization is high
    if (currentLatency < targetLatency && utilizationRate > this.adaptiveConfig.scaleUpThreshold) {
      const newConcurrency = Math.min(
        this.currentConcurrency + Math.ceil(this.currentConcurrency * 0.2),
        this.adaptiveConfig.maxConcurrency,
      );
      
      logger.debug('Scaling up queue concurrency', {
        currentConcurrency: this.currentConcurrency,
        newConcurrency,
        currentLatency,
        targetLatency,
        utilizationRate,
      });
      
      return newConcurrency;
    }

    // Scale down if latency is high or utilization is low
    if (currentLatency > targetLatency || utilizationRate < this.adaptiveConfig.scaleDownThreshold) {
      const newConcurrency = Math.max(
        this.currentConcurrency - Math.ceil(this.currentConcurrency * 0.1),
        this.adaptiveConfig.minConcurrency,
      );
      
      logger.debug('Scaling down queue concurrency', {
        currentConcurrency: this.currentConcurrency,
        newConcurrency,
        currentLatency,
        targetLatency,
        utilizationRate,
      });
      
      return newConcurrency;
    }

    return this.currentConcurrency;
  }

  /**
   * Dynamically adjust job priorities based on system load
   */
  calculateDynamicPriority(jobType: JobType, queueDepth: number): number {
    const basePriority = this.priorityConfig[jobType];
    
    // Increase priority for critical jobs when queue is deep
    if (queueDepth > 100) {
      switch (jobType) {
        case JobType.BLOCK_INDEXING:
          return basePriority + 50; // Highest priority for blocks
        case JobType.HEALTH_CHECK:
          return basePriority + 30; // High priority for health checks
        default:
          return basePriority;
      }
    }

    // Boost data processing jobs when queue is shallow
    if (queueDepth < 20) {
      switch (jobType) {
        case JobType.INDEX_VALIDATOR:
        case JobType.INDEX_ACCOUNT:
          return basePriority + 20; // Boost domain indexing
        default:
          return basePriority;
      }
    }

    return basePriority;
  }

  /**
   * Intelligent job routing based on job characteristics
   */
  routeJob(job: Job): string {
    const jobType = job.data.jobType || JobType.DATA_SYNC;
    
    // Route based on job type and current system load
    switch (jobType) {
      case JobType.BLOCK_INDEXING:
        return this.selectOptimalWorker('block-worker', job);
      
      case JobType.INDEX_VALIDATOR:
        return this.selectOptimalWorker('validator-worker', job);
      
      case JobType.INDEX_ACCOUNT:
        return this.selectOptimalWorker('account-worker', job);
      
      case JobType.DATA_SYNC:
        return this.selectOptimalWorker('sync-worker', job);
      
      default:
        return this.selectOptimalWorker('general-worker', job);
    }
  }

  /**
   * Update concurrency settings based on performance
   */
  async updateConcurrencySettings(): Promise<void> {
    const now = Date.now();
    
    // Only optimize every 30 seconds to avoid thrashing
    if (now - this.lastOptimization < 30000) {
      return;
    }

    const optimalConcurrency = this.calculateOptimalConcurrency(this.performanceMetrics);
    
    if (optimalConcurrency !== this.currentConcurrency) {
      this.currentConcurrency = optimalConcurrency;
      this.lastOptimization = now;
      
      // Apply new concurrency settings to queues
      await this.applyConcurrencySettings(optimalConcurrency);
      
      logger.info('Queue concurrency updated', {
        newConcurrency: optimalConcurrency,
        metrics: this.performanceMetrics,
      });
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): QueuePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get performance history for analysis
   */
  getPerformanceHistory(): QueuePerformanceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Update performance metrics
   */
  updateMetrics(metrics: Partial<QueuePerformanceMetrics>): void {
    this.performanceMetrics = {
      ...this.performanceMetrics,
      ...metrics,
    };

    // Keep history for trend analysis
    this.metricsHistory.push({ ...this.performanceMetrics });
    
    // Keep only last 100 entries
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }
  }

  private initializeMetrics(): QueuePerformanceMetrics {
    return {
      averageProcessingTime: 0,
      throughput: 0,
      errorRate: 0,
      queueDepth: 0,
      concurrencyUtilization: 0,
      memoryUsage: 0,
      cpuUsage: 0,
    };
  }

  private getDefaultAdaptiveConfig(): AdaptiveConfig {
    return {
      minConcurrency: 2,
      maxConcurrency: 20,
      targetLatency: 5000, // 5 seconds
      scaleUpThreshold: 0.8, // 80% utilization
      scaleDownThreshold: 0.3, // 30% utilization
    };
  }

  private getDefaultPriorityConfig(): QueuePriorityConfig {
    return {
      [JobType.BLOCK_INDEXING]: 100,
      [JobType.INDEX_VALIDATOR]: 70,
      [JobType.INDEX_ACCOUNT]: 60,
      [JobType.INDEX_TRANSFER]: 50,
      [JobType.INDEX_DATA_SUBMISSION]: 40,
      [JobType.DATA_SYNC]: 30,
      [JobType.HEALTH_CHECK]: 90,
    };
  }

  private selectOptimalWorker(workerType: string, job: Job): string {
    // Simple round-robin for now, can be enhanced with load balancing
    const workerId = `${workerType}-${Date.now() % 3}`;
    
    logger.debug('Routing job to worker', {
      jobId: job.id,
      jobType: job.data.jobType,
      workerId,
      workerType,
    });
    
    return workerId;
  }

  private async applyConcurrencySettings(concurrency: number): Promise<void> {
    // This would integrate with the actual queue implementation
    // For now, just log the change
    logger.info('Applying new concurrency settings', {
      concurrency,
      timestamp: new Date().toISOString(),
    });
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance every 10 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.updateConcurrencySettings();
    }, 10000);
  }

  private collectSystemMetrics(): void {
    // Collect real system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.updateMetrics({
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
    });
  }
} 