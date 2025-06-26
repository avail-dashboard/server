import { logger } from '../../../utils/logger';
import { QueueService } from './index';
import { JobType } from '../../types/service';

/**
 * Queue Health Monitor
 * Phase 3: Enhanced Queue Features - Advanced Queue Monitoring
 * 
 * Provides comprehensive monitoring and health assessment for the queue system
 */
export class QueueHealthMonitor {
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private healthHistory: HealthSnapshot[] = [];
  private readonly maxHistorySize = 100;

  constructor(private queueService: QueueService) {
    // Ensure cleanup on process exit to prevent memory leaks
    process.on('beforeExit', () => {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = undefined;
      }
    });
  }

  /**
   * Start continuous health monitoring
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('⚠️ MONITOR: Health monitoring already running', {
        component: 'queue-health-monitor',
        operation: 'start',
        status: 'already_running',
      });
      return;
    }

    const config = await import('../../../config');
    const monitoringConfig = config.default.queueProcessing.blockDomains.monitoring;

    if (!monitoringConfig.enableHealthMonitoring) {
      logger.info('ℹ️ MONITOR: Health monitoring disabled in configuration', {
        component: 'queue-health-monitor',
        operation: 'start',
        status: 'disabled',
      });
      return;
    }

    logger.info('🚀 MONITOR: Starting queue health monitoring', {
      component: 'queue-health-monitor',
      operation: 'start',
      interval: 30000, // 30 seconds
    });

    this.isMonitoring = true;
    
    // Initial health check
    await this.performHealthCheck();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('❌ MONITOR: Health check failed', {
          component: 'queue-health-monitor',
          operation: 'periodicHealthCheck',
          error: (error as Error).message,
        });
      }
    }, 30000); // Check every 30 seconds

    logger.info('✅ MONITOR: Queue health monitoring started', {
      component: 'queue-health-monitor',
      operation: 'start',
      status: 'running',
    });
  }

  /**
   * Stop health monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    logger.info('🔄 MONITOR: Stopping queue health monitoring', {
      component: 'queue-health-monitor',
      operation: 'stop',
    });

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('✅ MONITOR: Queue health monitoring stopped', {
      component: 'queue-health-monitor',
      operation: 'stop',
      status: 'stopped',
    });
  }

  /**
   * Get comprehensive health report
   */
  async getHealthReport(): Promise<HealthReport> {
    const startTime = Date.now();
    
    logger.debug('🔍 MONITOR: Generating health report', {
      component: 'queue-health-monitor',
      operation: 'getHealthReport',
    });

    try {
      const queueStats = await this.queueService.getStats();
      const queueHealth = await this.queueService.getHealth();
      const queueLength = await this.queueService.getBullQueue()?.count() || 0;
      
      // Calculate processing metrics
      const processingMetrics = await this.calculateProcessingMetrics();
      
      // Get system load
      const systemLoad = this.getSystemLoad();
      
      // Generate alerts
      const alerts = await this.generateAlerts(queueStats, processingMetrics, systemLoad);
      
      // Calculate overall health score
      const healthScore = this.calculateHealthScore(queueStats, processingMetrics, alerts);
      
      // Performance trends
      const trends = this.calculateTrends();
      
      const report: HealthReport = {
        timestamp: new Date(),
        healthScore,
        status: this.getHealthStatus(healthScore),
        queueStats,
        processingMetrics,
        systemLoad,
        alerts,
        trends,
        recommendations: this.generateRecommendations(queueStats, processingMetrics, alerts),
      };

      const duration = Date.now() - startTime;
      
      logger.debug('✅ MONITOR: Health report generated', {
        component: 'queue-health-monitor',
        operation: 'getHealthReport',
        healthScore,
        status: report.status,
        alertCount: alerts.length,
        duration,
      });

      return report;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('❌ MONITOR: Failed to generate health report', {
        component: 'queue-health-monitor',
        operation: 'getHealthReport',
        error: (error as Error).message,
        duration,
      });
      
      throw error;
    }
  }

  /**
   * Perform periodic health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const report = await this.getHealthReport();
      
      // Store in history
      const snapshot: HealthSnapshot = {
        timestamp: report.timestamp,
        healthScore: report.healthScore,
        queueLength: report.queueStats.waiting + report.queueStats.active,
        processingRate: report.processingMetrics.processingRate,
        failureRate: report.processingMetrics.failureRate,
        memoryUsage: report.systemLoad.memory.used,
        alertCount: report.alerts.length,
      };
      
      this.addToHistory(snapshot);
      
      // Log health summary
      logger.info('📊 MONITOR: Health check completed', {
        component: 'queue-health-monitor',
        operation: 'performHealthCheck',
        healthScore: report.healthScore,
        status: report.status,
        queueLength: snapshot.queueLength,
        processingRate: report.processingMetrics.processingRate,
        alertCount: report.alerts.length,
      });

      // Log alerts if any
      if (report.alerts.length > 0) {
        logger.warn('⚠️ MONITOR: Health alerts detected', {
          component: 'queue-health-monitor',
          operation: 'performHealthCheck',
          alerts: report.alerts,
          recommendations: report.recommendations,
        });
      }
      
    } catch (error) {
      logger.error('❌ MONITOR: Health check failed', {
        component: 'queue-health-monitor',
        operation: 'performHealthCheck',
        error: (error as Error).message,
      });
    }
  }

  /**
   * Calculate processing metrics
   */
  private async calculateProcessingMetrics(): Promise<ProcessingMetrics> {
    const stats = await this.queueService.getStats();
    const totalJobs = stats.completed + stats.failed;
    
    const processingRate = totalJobs > 0 ? (stats.completed / totalJobs) * 60 : 0;
    const failureRate = totalJobs > 0 ? stats.failed / totalJobs : 0;
    
    // Calculate average processing time from recent history
    const avgProcessingTime = this.calculateAverageProcessingTime();
    
    // Calculate throughput (jobs per minute)
    const throughput = this.calculateThroughput();
    
    return {
      processingRate,
      failureRate,
      avgProcessingTime,
      throughput,
      totalProcessed: stats.completed,
      totalFailed: stats.failed,
      activeJobs: stats.active,
      waitingJobs: stats.waiting,
    };
  }

  /**
   * Get system load metrics
   */
  private getSystemLoad(): SystemLoad {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
    };
  }

  /**
   * Generate alerts based on thresholds
   */
  private async generateAlerts(
    queueStats: any,
    processingMetrics: ProcessingMetrics,
    systemLoad: SystemLoad
  ): Promise<Alert[]> {
    const config = await import('../../../config');
    const thresholds = config.default.queueProcessing.blockDomains.monitoring.alertThresholds;
    const alerts: Alert[] = [];

    // Queue backlog alert
    const queueLength = queueStats.waiting + queueStats.active;
    if (queueLength > thresholds.queueBacklog) {
      alerts.push({
        type: 'queue_backlog',
        severity: queueLength > thresholds.queueBacklog * 2 ? 'critical' : 'warning',
        message: `Queue backlog high: ${queueLength} jobs`,
        value: queueLength,
        threshold: thresholds.queueBacklog,
        recommendation: 'Consider increasing concurrency or adding more workers',
      });
    }

    // Failure rate alert
    if (processingMetrics.failureRate > thresholds.failureRate) {
      alerts.push({
        type: 'failure_rate',
        severity: processingMetrics.failureRate > thresholds.failureRate * 2 ? 'critical' : 'warning',
        message: `Failure rate high: ${(processingMetrics.failureRate * 100).toFixed(2)}%`,
        value: processingMetrics.failureRate,
        threshold: thresholds.failureRate,
        recommendation: 'Investigate recent failures and consider improving error handling',
      });
    }

    // Processing time alert
    if (processingMetrics.avgProcessingTime > thresholds.avgProcessingTime) {
      alerts.push({
        type: 'processing_time',
        severity: processingMetrics.avgProcessingTime > thresholds.avgProcessingTime * 2 ? 'critical' : 'warning',
        message: `Average processing time high: ${processingMetrics.avgProcessingTime}ms`,
        value: processingMetrics.avgProcessingTime,
        threshold: thresholds.avgProcessingTime,
        recommendation: 'Optimize block processing logic or increase system resources',
      });
    }

    // Memory usage alert
    const memoryUsagePercent = systemLoad.memory.used / systemLoad.memory.total;
    if (memoryUsagePercent > 0.8) {
      alerts.push({
        type: 'memory_usage',
        severity: memoryUsagePercent > 0.9 ? 'critical' : 'warning',
        message: `Memory usage high: ${(memoryUsagePercent * 100).toFixed(1)}%`,
        value: memoryUsagePercent,
        threshold: 0.8,
        recommendation: 'Monitor for memory leaks and consider increasing available memory',
      });
    }

    return alerts;
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(
    queueStats: any,
    processingMetrics: ProcessingMetrics,
    alerts: Alert[]
  ): number {
    let score = 100;

    // Deduct points for queue backlog
    const queueLength = queueStats.waiting + queueStats.active;
    if (queueLength > 500) score -= 20;
    else if (queueLength > 100) score -= 10;

    // Deduct points for failure rate
    if (processingMetrics.failureRate > 0.1) score -= 30;
    else if (processingMetrics.failureRate > 0.05) score -= 15;

    // Deduct points for alerts
    alerts.forEach(alert => {
      if (alert.severity === 'critical') score -= 20;
      else if (alert.severity === 'warning') score -= 10;
    });

    // Bonus points for good performance
    if (processingMetrics.failureRate < 0.01) score += 5;
    if (queueLength < 10) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get health status based on score
   */
  private getHealthStatus(healthScore: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (healthScore >= 90) return 'excellent';
    if (healthScore >= 80) return 'good';
    if (healthScore >= 60) return 'fair';
    if (healthScore >= 40) return 'poor';
    return 'critical';
  }

  /**
   * Calculate trends from historical data
   */
  private calculateTrends(): Trends {
    if (this.healthHistory.length < 2) {
      return {
        healthScore: 'stable',
        queueLength: 'stable',
        processingRate: 'stable',
        failureRate: 'stable',
      };
    }

    const recent = this.healthHistory.slice(-10); // Last 10 snapshots
    const older = this.healthHistory.slice(-20, -10); // Previous 10 snapshots

    const recentAvg = (data: number[]) => data.reduce((a, b) => a + b, 0) / data.length;
    const olderAvg = (data: number[]) => data.reduce((a, b) => a + b, 0) / data.length;

    const getTrend = (recentVal: number, olderVal: number): 'improving' | 'stable' | 'declining' => {
      const change = ((recentVal - olderVal) / olderVal) * 100;
      if (Math.abs(change) < 5) return 'stable';
      return change > 0 ? 'improving' : 'declining';
    };

    return {
      healthScore: getTrend(
        recentAvg(recent.map(h => h.healthScore)),
        olderAvg(older.map(h => h.healthScore))
      ),
      queueLength: getTrend(
        recentAvg(recent.map(h => h.queueLength)),
        olderAvg(older.map(h => h.queueLength))
      ),
      processingRate: getTrend(
        recentAvg(recent.map(h => h.processingRate)),
        olderAvg(older.map(h => h.processingRate))
      ),
      failureRate: getTrend(
        recentAvg(recent.map(h => h.failureRate)),
        olderAvg(older.map(h => h.failureRate))
      ),
    };
  }

  /**
   * Generate recommendations based on current state
   */
  private generateRecommendations(
    queueStats: any,
    processingMetrics: ProcessingMetrics,
    alerts: Alert[]
  ): string[] {
    const recommendations: string[] = [];

    if (alerts.some(a => a.type === 'queue_backlog')) {
      recommendations.push('Increase queue concurrency settings');
      recommendations.push('Consider scaling horizontally with more workers');
    }

    if (alerts.some(a => a.type === 'failure_rate')) {
      recommendations.push('Review error logs for common failure patterns');
      recommendations.push('Improve error handling and retry logic');
    }

    if (alerts.some(a => a.type === 'processing_time')) {
      recommendations.push('Profile block processing performance');
      recommendations.push('Optimize database queries and service calls');
    }

    if (alerts.some(a => a.type === 'memory_usage')) {
      recommendations.push('Monitor for memory leaks in processing logic');
      recommendations.push('Implement more aggressive garbage collection');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well, continue monitoring');
    }

    return recommendations;
  }

  /**
   * Add snapshot to history
   */
  private addToHistory(snapshot: HealthSnapshot): void {
    this.healthHistory.push(snapshot);
    
    // Keep only recent history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Calculate average processing time (placeholder)
   */
  private calculateAverageProcessingTime(): number {
    // TODO: Implement based on job completion history
    return 0;
  }

  /**
   * Calculate throughput (placeholder)
   */
  private calculateThroughput(): number {
    // TODO: Implement based on job completion rate
    return 0;
  }

  /**
   * Get health history for analysis
   */
  getHealthHistory(): HealthSnapshot[] {
    return [...this.healthHistory];
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

// Type definitions
interface HealthReport {
  timestamp: Date;
  healthScore: number;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  queueStats: any;
  processingMetrics: ProcessingMetrics;
  systemLoad: SystemLoad;
  alerts: Alert[];
  trends: Trends;
  recommendations: string[];
}

interface ProcessingMetrics {
  processingRate: number;
  failureRate: number;
  avgProcessingTime: number;
  throughput: number;
  totalProcessed: number;
  totalFailed: number;
  activeJobs: number;
  waitingJobs: number;
}

interface SystemLoad {
  memory: {
    used: number;
    total: number;
    external: number;
    rss: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  uptime: number;
}

interface Alert {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  recommendation: string;
}

interface Trends {
  healthScore: 'improving' | 'stable' | 'declining';
  queueLength: 'improving' | 'stable' | 'declining';
  processingRate: 'improving' | 'stable' | 'declining';
  failureRate: 'improving' | 'stable' | 'declining';
}

interface HealthSnapshot {
  timestamp: Date;
  healthScore: number;
  queueLength: number;
  processingRate: number;
  failureRate: number;
  memoryUsage: number;
  alertCount: number;
}

export const createQueueHealthMonitor = (queueService: QueueService): QueueHealthMonitor => {
  return new QueueHealthMonitor(queueService);
};