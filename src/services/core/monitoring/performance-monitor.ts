import { logger } from '../../../utils/logger';

export interface DomainPerformanceMetrics {
  domain: string;
  averageProcessingTime: number;
  throughput: number;
  errorRate: number;
  successRate: number;
  totalOperations: number;
  lastOperationTime: number;
  peakThroughput: number;
  trends: {
    processingTime: number[];
    throughput: number[];
    errorRate: number[];
  };
}

export interface SystemPerformanceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    percentage: number;
  };
  queueMetrics: {
    depth: number;
    processing: number;
    completed: number;
    failed: number;
  };
  networkMetrics: {
    inbound: number;
    outbound: number;
    connections: number;
  };
}

export interface AlertThreshold {
  metric: string;
  threshold: number;
  comparison: 'gt' | 'lt' | 'eq';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Phase 4: Performance Monitor
 * 
 * Provides comprehensive monitoring and observability:
 * - Real-time domain-specific performance tracking
 * - System resource monitoring
 * - Intelligent alerting with thresholds
 * - Performance trend analysis
 * - Automated anomaly detection
 */
export class PerformanceMonitor {
  private domainMetrics: Map<string, DomainPerformanceMetrics>;
  private systemMetrics: SystemPerformanceMetrics;
  private alertThresholds: AlertThreshold[];
  private metricsHistory: Map<string, DomainPerformanceMetrics[]>;
  private isMonitoring: boolean;

  constructor() {
    this.domainMetrics = new Map();
    this.systemMetrics = this.initializeSystemMetrics();
    this.alertThresholds = this.getDefaultAlertThresholds();
    this.metricsHistory = new Map();
    this.isMonitoring = false;

    this.startMonitoring();
  }

  /**
   * Record operation metrics for a specific domain
   */
  recordOperation(
    domain: string,
    operation: string,
    duration: number,
    success: boolean,
  ): void {
    const metrics = this.getOrCreateDomainMetrics(domain);
    
    // Update basic metrics
    metrics.totalOperations++;
    metrics.lastOperationTime = Date.now();
    
    // Update processing time
    const currentAvg = metrics.averageProcessingTime;
    const totalOps = metrics.totalOperations;
    metrics.averageProcessingTime = 
      (currentAvg * (totalOps - 1) + duration) / totalOps;
    
    // Update success/error rates
    if (success) {
      const successCount = Math.round(metrics.successRate * (totalOps - 1));
      metrics.successRate = (successCount + 1) / totalOps;
    } else {
      const errorCount = Math.round(metrics.errorRate * (totalOps - 1));
      metrics.errorRate = (errorCount + 1) / totalOps;
    }
    
    // Update throughput (operations per minute)
    this.updateThroughput(metrics);
    
    // Add to trends
    this.updateTrends(metrics);
    
    // Check for alerts
    this.checkAlerts(domain, metrics);
    
    logger.debug('Performance metrics recorded', {
      domain,
      operation,
      duration,
      success,
      metrics: {
        averageProcessingTime: metrics.averageProcessingTime,
        throughput: metrics.throughput,
        errorRate: metrics.errorRate,
      },
    });
  }

  /**
   * Get performance metrics for a specific domain
   */
  getDomainMetrics(domain: string): DomainPerformanceMetrics | null {
    return this.domainMetrics.get(domain) || null;
  }

  /**
   * Get all domain metrics
   */
  getAllDomainMetrics(): DomainPerformanceMetrics[] {
    return Array.from(this.domainMetrics.values());
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemPerformanceMetrics {
    return { ...this.systemMetrics };
  }

  /**
   * Get performance summary for dashboard
   */
  getPerformanceSummary(): {
    domains: DomainPerformanceMetrics[];
    system: SystemPerformanceMetrics;
    alerts: any[];
    uptime: number;
  } {
    return {
      domains: this.getAllDomainMetrics(),
      system: this.getSystemMetrics(),
      alerts: this.getActiveAlerts(),
      uptime: process.uptime(),
    };
  }

  /**
   * Detect performance anomalies using trend analysis
   */
  detectAnomalies(domain: string): {
    hasAnomalies: boolean;
    anomalies: string[];
  } {
    const metrics = this.getDomainMetrics(domain);
    if (!metrics) {
      return { hasAnomalies: false, anomalies: [] };
    }

    const anomalies: string[] = [];
    
    // Check processing time anomalies
    if (this.isProcessingTimeAnomaly(metrics)) {
      anomalies.push('Processing time spike detected');
    }
    
    // Check throughput anomalies
    if (this.isThroughputAnomaly(metrics)) {
      anomalies.push('Throughput drop detected');
    }
    
    // Check error rate anomalies
    if (this.isErrorRateAnomaly(metrics)) {
      anomalies.push('Error rate spike detected');
    }

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
    };
  }

  /**
   * Update alert thresholds
   */
  updateAlertThresholds(thresholds: AlertThreshold[]): void {
    this.alertThresholds = thresholds;
    
    logger.info('Alert thresholds updated', {
      thresholdCount: thresholds.length,
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    logger.info('Performance monitoring stopped');
  }

  private getOrCreateDomainMetrics(domain: string): DomainPerformanceMetrics {
    if (!this.domainMetrics.has(domain)) {
      const metrics: DomainPerformanceMetrics = {
        domain,
        averageProcessingTime: 0,
        throughput: 0,
        errorRate: 0,
        successRate: 0,
        totalOperations: 0,
        lastOperationTime: Date.now(),
        peakThroughput: 0,
        trends: {
          processingTime: [],
          throughput: [],
          errorRate: [],
        },
      };
      
      this.domainMetrics.set(domain, metrics);
      this.metricsHistory.set(domain, []);
    }
    
    return this.domainMetrics.get(domain)!;
  }

  private updateThroughput(metrics: DomainPerformanceMetrics): void {
    const now = Date.now();
    const timeWindow = 60000; // 1 minute window
    const recentOps = this.countRecentOperations(metrics.domain, timeWindow);
    
    metrics.throughput = recentOps;
    
    if (metrics.throughput > metrics.peakThroughput) {
      metrics.peakThroughput = metrics.throughput;
    }
  }

  private updateTrends(metrics: DomainPerformanceMetrics): void {
    const maxTrendLength = 60; // Keep last 60 data points
    
    // Add current values to trends
    metrics.trends.processingTime.push(metrics.averageProcessingTime);
    metrics.trends.throughput.push(metrics.throughput);
    metrics.trends.errorRate.push(metrics.errorRate);
    
    // Trim trends to max length
    if (metrics.trends.processingTime.length > maxTrendLength) {
      metrics.trends.processingTime.shift();
      metrics.trends.throughput.shift();
      metrics.trends.errorRate.shift();
    }
  }

  private countRecentOperations(domain: string, timeWindow: number): number {
    // This would count operations in the time window
    // For now, return a simple estimate
    const metrics = this.domainMetrics.get(domain);
    if (!metrics) return 0;
    
    const timeSinceLastOp = Date.now() - metrics.lastOperationTime;
    if (timeSinceLastOp > timeWindow) return 0;
    
    // Simple throughput calculation
    return Math.round(metrics.totalOperations / Math.max(1, timeSinceLastOp / 60000));
  }

  private checkAlerts(domain: string, metrics: DomainPerformanceMetrics): void {
    for (const threshold of this.alertThresholds) {
      const value = this.getMetricValue(metrics, threshold.metric);
      const shouldAlert = this.evaluateThreshold(value, threshold);
      
      if (shouldAlert) {
        this.triggerAlert(domain, threshold, value);
      }
    }
  }

  private getMetricValue(metrics: DomainPerformanceMetrics, metric: string): number {
    switch (metric) {
      case 'averageProcessingTime':
        return metrics.averageProcessingTime;
      case 'errorRate':
        return metrics.errorRate;
      case 'throughput':
        return metrics.throughput;
      default:
        return 0;
    }
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.comparison) {
      case 'gt':
        return value > threshold.threshold;
      case 'lt':
        return value < threshold.threshold;
      case 'eq':
        return value === threshold.threshold;
      default:
        return false;
    }
  }

  private triggerAlert(domain: string, threshold: AlertThreshold, value: number): void {
    logger.warn('Performance alert triggered', {
      domain,
      metric: threshold.metric,
      threshold: threshold.threshold,
      actualValue: value,
      severity: threshold.severity,
    });
  }

  private getActiveAlerts(): any[] {
    // Return active alerts for dashboard
    return [];
  }

  private isProcessingTimeAnomaly(metrics: DomainPerformanceMetrics): boolean {
    const trend = metrics.trends.processingTime;
    if (trend.length < 10) return false;
    
    const recent = trend.slice(-5);
    const baseline = trend.slice(-15, -5);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const baselineAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    
    return recentAvg > baselineAvg * 2; // 100% increase
  }

  private isThroughputAnomaly(metrics: DomainPerformanceMetrics): boolean {
    const trend = metrics.trends.throughput;
    if (trend.length < 10) return false;
    
    const recent = trend.slice(-5);
    const baseline = trend.slice(-15, -5);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const baselineAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    
    return recentAvg < baselineAvg * 0.5; // 50% decrease
  }

  private isErrorRateAnomaly(metrics: DomainPerformanceMetrics): boolean {
    return metrics.errorRate > 0.1; // 10% error rate
  }

  private initializeSystemMetrics(): SystemPerformanceMetrics {
    return {
      memoryUsage: { used: 0, total: 0, percentage: 0 },
      cpuUsage: { user: 0, system: 0, percentage: 0 },
      queueMetrics: { depth: 0, processing: 0, completed: 0, failed: 0 },
      networkMetrics: { inbound: 0, outbound: 0, connections: 0 },
    };
  }

  private getDefaultAlertThresholds(): AlertThreshold[] {
    return [
      {
        metric: 'averageProcessingTime',
        threshold: 10000, // 10 seconds
        comparison: 'gt',
        severity: 'high',
      },
      {
        metric: 'errorRate',
        threshold: 0.05, // 5%
        comparison: 'gt',
        severity: 'medium',
      },
      {
        metric: 'throughput',
        threshold: 1, // 1 operation per minute
        comparison: 'lt',
        severity: 'low',
      },
    ];
  }

  private startMonitoring(): void {
    this.isMonitoring = true;
    
    // Update system metrics every 10 seconds
    setInterval(() => {
      if (this.isMonitoring) {
        this.updateSystemMetrics();
      }
    }, 10000);
    
    // Save metrics history every minute
    setInterval(() => {
      if (this.isMonitoring) {
        this.saveMetricsHistory();
      }
    }, 60000);
    
    logger.info('Performance monitoring started');
  }

  private updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.systemMetrics.memoryUsage = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
    };
    
    this.systemMetrics.cpuUsage = {
      user: cpuUsage.user,
      system: cpuUsage.system,
      percentage: ((cpuUsage.user + cpuUsage.system) / 1000000) * 100,
    };
  }

  private saveMetricsHistory(): void {
    for (const [domain, metrics] of this.domainMetrics.entries()) {
      const history = this.metricsHistory.get(domain) || [];
      history.push({ ...metrics });
      
      // Keep only last 24 hours of history (1440 minutes)
      if (history.length > 1440) {
        history.shift();
      }
      
      this.metricsHistory.set(domain, history);
    }
  }
} 