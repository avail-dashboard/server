/**
 * TASK-008: Comprehensive Monitoring System Tests
 * Testing all monitoring, health check, management, and reporting services
 * 
 * Adam's Implementation - Validating complete monitoring system
 */

import { DependencyMetricsService } from '../dependencyMetrics';
import { DependencyReportingService } from '../dependencyReporting';
import { QueueService } from '../../core/queue';
import { DependencyDetectionEngineService } from '../dependencyDetectionEngine';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../core/queue');
jest.mock('../dependencyDetectionEngine');

describe('TASK-008: Dependency Monitoring System', () => {
  let mockQueueService: jest.Mocked<QueueService>;
  let mockDependencyEngine: jest.Mocked<DependencyDetectionEngineService>;
  let metricsService: DependencyMetricsService;
  let reportingService: DependencyReportingService;

  beforeEach(() => {
    // Setup mocks
    mockQueueService = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockResolvedValue({
        healthy: true,
        lastCheck: new Date(),
        details: {},
      }),
      getStats: jest.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      }),
    } as any;

    mockDependencyEngine = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockResolvedValue({
        healthy: true,
        lastCheck: new Date(),
        details: {},
      }),
      getMetrics: jest.fn().mockReturnValue({
        totalDetections: 50,
        successfulDetections: 48,
      }),
    } as any;

    // Initialize services
    metricsService = new DependencyMetricsService(
      mockQueueService,
      mockDependencyEngine,
      { enabled: true, collectionInterval: 1000 },
    );

    reportingService = new DependencyReportingService(
      metricsService,
      { enabled: true, autoGenerate: false },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('DependencyMetricsService', () => {
    test('should initialize with correct configuration', () => {
      expect(metricsService).toBeDefined();
      expect(metricsService.isHealthy()).toBe(false); // Not started yet
    });

    test('should start and stop service correctly', async () => {
      await metricsService.start();
      expect(metricsService.isHealthy()).toBe(true);

      await metricsService.stop();
      expect(metricsService.isHealthy()).toBe(false);
    });

    test('should record detection events', async () => {
      await metricsService.start();
      
      // Record some detection events
      metricsService.recordDetection('block', 1500, true);
      metricsService.recordDetection('extrinsic', 2000, true);
      metricsService.recordDetection('transfer', 3000, false);

      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics.detectionMetrics.totalDetections).toBe(3);
      expect(metrics.detectionMetrics.detectionSuccessRate).toBe(66.67); // 2/3 * 100

      await metricsService.stop();
    });

    test('should record resolution events', async () => {
      await metricsService.start();
      
      // Record some resolution events
      metricsService.recordResolution('block-dependency', 5000, true);
      metricsService.recordResolution('extrinsic-dependency', 8000, true);
      metricsService.recordResolution('transfer-dependency', 15000, false, true);

      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics.resolutionMetrics.totalResolutions).toBe(3);
      expect(metrics.resolutionMetrics.resolutionSuccessRate).toBe(66.67); // 2/3 * 100
      expect(metrics.resolutionMetrics.timeoutResolutions).toBe(1);

      await metricsService.stop();
    });

    test('should collect comprehensive metrics', async () => {
      await metricsService.start();
      
      // Record some events
      metricsService.recordDetection('block', 1500, true);
      metricsService.recordResolution('block-dependency', 5000, true);

      const metrics = await metricsService.getCurrentMetrics();
      
      // Verify metrics structure
      expect(metrics).toHaveProperty('detectionMetrics');
      expect(metrics).toHaveProperty('resolutionMetrics');
      expect(metrics).toHaveProperty('queueMetrics');
      expect(metrics).toHaveProperty('systemHealth');
      expect(metrics).toHaveProperty('collectionTimestamp');
      expect(metrics).toHaveProperty('metricsVersion');

      // Verify system health calculation
      expect(metrics.systemHealth.overallHealthScore).toBeGreaterThan(0);
      expect(metrics.systemHealth.systemStatus).toMatch(/healthy|degraded|unhealthy/);

      await metricsService.stop();
    });

    test('should maintain metrics history', async () => {
      await metricsService.start();
      
      // Record events and collect metrics
      metricsService.recordDetection('block', 1500, true);
      await metricsService.getCurrentMetrics();
      
      // Wait a bit and collect again
      await new Promise(resolve => setTimeout(resolve, 100));
      metricsService.recordDetection('extrinsic', 2000, true);
      await metricsService.getCurrentMetrics();

      const history = metricsService.getMetricsHistory(1);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('collectionTimestamp');

      await metricsService.stop();
    });

    test('should handle service health checks', async () => {
      const health = await metricsService.getHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('details');
    });
  });

  describe('DependencyReportingService', () => {
    beforeEach(async () => {
      await metricsService.start();
      // Generate some test data
      metricsService.recordDetection('block', 1500, true);
      metricsService.recordDetection('extrinsic', 2000, true);
      metricsService.recordResolution('block-dependency', 5000, true);
      metricsService.recordResolution('extrinsic-dependency', 8000, false);
    });

    afterEach(async () => {
      await metricsService.stop();
    });

    test('should initialize with correct configuration', () => {
      expect(reportingService).toBeDefined();
      expect(reportingService.isHealthy()).toBe(false); // Not started yet
    });

    test('should start and stop service correctly', async () => {
      await reportingService.start();
      expect(reportingService.isHealthy()).toBe(true);

      await reportingService.stop();
      expect(reportingService.isHealthy()).toBe(false);
    });

    test('should generate performance reports', async () => {
      await reportingService.start();
      
      const report = await reportingService.generateReport(1);
      
      // Verify report structure
      expect(report).toHaveProperty('reportId');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('timeRange');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('trends');
      expect(report).toHaveProperty('insights');
      expect(report).toHaveProperty('recommendations');

      // Verify summary data
      expect(report.summary).toHaveProperty('totalDependencyOperations');
      expect(report.summary).toHaveProperty('averageDetectionTime');
      expect(report.summary).toHaveProperty('averageResolutionTime');
      expect(report.summary).toHaveProperty('overallSuccessRate');
      expect(report.summary).toHaveProperty('performanceScore');

      // Verify trends data
      expect(report.trends).toHaveProperty('detectionPerformance');
      expect(report.trends).toHaveProperty('resolutionPerformance');
      expect(report.trends).toHaveProperty('successRates');
      expect(report.trends).toHaveProperty('queueMetrics');
      expect(report.trends).toHaveProperty('systemHealth');

      await reportingService.stop();
    });

    test('should generate actionable insights', async () => {
      await reportingService.start();
      
      const report = await reportingService.generateReport(1);
      
      expect(Array.isArray(report.insights)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
      
      // Insights should be strings
      report.insights.forEach(insight => {
        expect(typeof insight).toBe('string');
        expect(insight.length).toBeGreaterThan(0);
      });

      // Recommendations should be strings
      report.recommendations.forEach(recommendation => {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      });

      await reportingService.stop();
    });

    test('should maintain report history', async () => {
      await reportingService.start();
      
      // Generate multiple reports
      await reportingService.generateReport(1);
      await reportingService.generateReport(1);
      
      const history = reportingService.getReportHistory(5);
      expect(history.length).toBe(2);
      
      const latestReport = reportingService.getLatestReport();
      expect(latestReport).toBeDefined();
      expect(latestReport?.reportId).toBeDefined();

      await reportingService.stop();
    });

    test('should export reports as JSON', async () => {
      await reportingService.start();
      
      const report = await reportingService.generateReport(1);
      const exportedJSON = reportingService.exportReportAsJSON(report.reportId);
      
      expect(exportedJSON).toBeDefined();
      expect(typeof exportedJSON).toBe('string');
      
      // Should be valid JSON
      const parsed = JSON.parse(exportedJSON!);
      expect(parsed.reportId).toBe(report.reportId);

      await reportingService.stop();
    });

    test('should handle service health checks', async () => {
      const health = await reportingService.getHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('lastCheck');
      expect(health).toHaveProperty('details');
    });
  });

  describe('Integration Tests', () => {
    test('should integrate metrics and reporting services', async () => {
      // Start both services
      await metricsService.start();
      await reportingService.start();

      // Generate test data
      metricsService.recordDetection('block', 1200, true);
      metricsService.recordDetection('extrinsic', 1800, true);
      metricsService.recordDetection('transfer', 2500, false);
      
      metricsService.recordResolution('block-dependency', 4000, true);
      metricsService.recordResolution('extrinsic-dependency', 6000, true);
      metricsService.recordResolution('transfer-dependency', 12000, false, true);

      // Collect current metrics
      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics.detectionMetrics.totalDetections).toBe(3);
      expect(metrics.resolutionMetrics.totalResolutions).toBe(3);

      // Generate report based on metrics
      const report = await reportingService.generateReport(1);
      expect(report.summary.totalDependencyOperations).toBeGreaterThan(0);
      expect(report.insights.length).toBeGreaterThan(0);

      // Verify performance scoring
      expect(report.summary.performanceScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.performanceScore).toBeLessThanOrEqual(100);

      // Stop services
      await reportingService.stop();
      await metricsService.stop();
    });

    test('should handle high-volume metrics collection', async () => {
      await metricsService.start();

      // Generate high volume of events
      const eventCount = 100;
      for (let i = 0; i < eventCount; i++) {
        metricsService.recordDetection('bulk-test', 1000 + i, i % 10 !== 0); // 90% success rate
        metricsService.recordResolution('bulk-dependency', 5000 + i, i % 5 !== 0); // 80% success rate
      }

      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics.detectionMetrics.totalDetections).toBe(eventCount);
      expect(metrics.resolutionMetrics.totalResolutions).toBe(eventCount);
      
      // Verify success rates are calculated correctly
      expect(metrics.detectionMetrics.detectionSuccessRate).toBeCloseTo(90, 1);
      expect(metrics.resolutionMetrics.resolutionSuccessRate).toBeCloseTo(80, 1);

      await metricsService.stop();
    });

    test('should maintain performance under load', async () => {
      await metricsService.start();
      
      const startTime = Date.now();
      
      // Simulate load
      for (let i = 0; i < 50; i++) {
        metricsService.recordDetection('load-test', 1000, true);
        metricsService.recordResolution('load-dependency', 5000, true);
      }
      
      // Collect metrics multiple times
      for (let i = 0; i < 10; i++) {
        await metricsService.getCurrentMetrics();
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (under 1 second)
      expect(duration).toBeLessThan(1000);
      
      await metricsService.stop();
    });
  });

  describe('Error Handling', () => {
    test('should handle service startup failures gracefully', async () => {
      // Mock a service failure
      mockQueueService.getHealth.mockRejectedValue(new Error('Queue service unavailable'));
      
      await metricsService.start();
      
      // Should still collect metrics despite queue service error
      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.systemHealth.systemStatus).toBe('unhealthy');
      
      await metricsService.stop();
    });

    test('should handle report generation failures', async () => {
      await reportingService.start();
      
      // Mock metrics service failure
      jest.spyOn(metricsService, 'getCurrentMetrics').mockRejectedValue(new Error('Metrics unavailable'));
      
      // Should throw error but not crash
      await expect(reportingService.generateReport()).rejects.toThrow('Metrics unavailable');
      
      await reportingService.stop();
    });

    test('should handle invalid metrics data', async () => {
      await metricsService.start();
      
      // Record invalid events (should not crash)
      metricsService.recordDetection('', -1, true);
      metricsService.recordResolution('', 0, false);
      
      const metrics = await metricsService.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.detectionMetrics.totalDetections).toBe(2);
      
      await metricsService.stop();
    });
  });
});

/**
 * TASK-008: Test Summary
 * 
 * This test suite validates:
 * ✅ DependencyMetricsService functionality
 * ✅ DependencyReportingService functionality  
 * ✅ Service integration and data flow
 * ✅ Performance under load
 * ✅ Error handling and resilience
 * ✅ Metrics collection accuracy
 * ✅ Report generation and insights
 * ✅ Service lifecycle management
 * ✅ Health check functionality
 * ✅ Historical data management
 */ 