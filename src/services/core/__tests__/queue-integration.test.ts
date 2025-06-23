/**
 * QueueService Integration Tests
 * Tests John's service integration architecture and processor implementations
 */

import { QueueService } from '../queue';
import { JobType } from '../../types/service';

// Mock services for testing
const mockSelfHealingBlockProcessor = {
  processBlock: jest.fn().mockResolvedValue(undefined),
};

const mockBlockService = {
  indexBlock: jest.fn().mockResolvedValue({
    extrinsics: [{ id: '1' }, { id: '2' }],
  }),
};

const mockAvailBlockchain = {
  getBlockByNumber: jest.fn().mockResolvedValue({
    number: 12345,
    hash: '0x123abc',
    extrinsics: [{ id: '1' }, { id: '2' }],
    timestamp: new Date(),
  }),
};

const mockAnalyticsService = {
  getChainStats: jest.fn().mockResolvedValue({
    totalBlocks: 1000,
    totalExtrinsics: 5000,
  }),
  getNetworkActivity: jest.fn().mockResolvedValue({
    blocksPerHour: 300,
    transactionsPerHour: 1500,
  }),
};

const mockServiceFactory = {
  get: jest.fn((serviceName: string) => {
    switch (serviceName) {
    case 'selfHealingBlockProcessor':
      return mockSelfHealingBlockProcessor;
    case 'blockService':
      return mockBlockService;
    case 'availBlockchain':
      return mockAvailBlockchain;
    case 'analyticsService':
      return mockAnalyticsService;
    default:
      throw new Error(`Unknown service: ${serviceName}`);
    }
  }),
};

describe('QueueService Integration - John\'s Architecture', () => {
  let queueService: QueueService;

  beforeEach(() => {
    queueService = new QueueService();
    
    // Initialize dependencies using John's architecture
    queueService.initializeDependencies({
      selfHealingBlockProcessor: mockSelfHealingBlockProcessor,
      analyticsService: mockAnalyticsService,
      blockService: mockBlockService,
      serviceFactory: mockServiceFactory,
    });

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Service Integration Architecture', () => {
    test('should initialize dependencies correctly', () => {
      expect(mockServiceFactory.get).not.toHaveBeenCalled();
      
      // Dependencies should be available for processors
      expect(queueService['dependencies']).toEqual({
        selfHealingBlockProcessor: mockSelfHealingBlockProcessor,
        analyticsService: mockAnalyticsService,
        blockService: mockBlockService,
        serviceFactory: mockServiceFactory,
      });
    });

    test('should provide getService method for processors', async () => {
      const serviceInstance = await queueService['getService']('blockService');
      expect(serviceInstance).toBe(mockBlockService);
      expect(mockServiceFactory.get).toHaveBeenCalledWith('blockService');
    });

    test('should handle missing service gracefully', async () => {
      mockServiceFactory.get.mockImplementation(() => {
        throw new Error('Service not found');
      });

      await expect(queueService['getService']('unknownService'))
        .rejects.toThrow('Service not found');
    });
  });

  describe('Error Classification Framework', () => {
    test('should classify network errors as retryable', () => {
      const networkError = new Error('Connection timeout');
      const classification = queueService['classifyError'](networkError, JobType.BLOCK_INDEXING);
      
      expect(classification.isRetryable).toBe(true);
      expect(classification.category).toBe('network');
      expect(classification.alertLevel).toBe('medium');
    });

    test('should classify validation errors as non-retryable', () => {
      const validationError = new Error('Invalid data format');
      const classification = queueService['classifyError'](validationError, JobType.DATA_SYNC);
      
      expect(classification.isRetryable).toBe(false);
      expect(classification.category).toBe('data');
      expect(classification.alertLevel).toBe('high');
    });

    test('should classify service unavailable as retryable with backoff', () => {
      const serviceError = new Error('Service temporarily unavailable');
      const classification = queueService['classifyError'](serviceError, JobType.ANALYTICS_CALCULATION);
      
      expect(classification.isRetryable).toBe(true);
      expect(classification.category).toBe('service');
      expect(classification.retryDelay).toBe(10000);
    });
  });

  describe('BLOCK_INDEXING Processor - John\'s Implementation', () => {
    test('should process block successfully with full pipeline', async () => {
      const jobData = { blockNumber: 12345 };
      const mockJob = {
        id: 'test-job-1',
        name: JobType.BLOCK_INDEXING,
        data: jobData,
      };

      // Mock the processor directly
      const blockProcessor = queueService['jobProcessors'].get(JobType.BLOCK_INDEXING);
      expect(blockProcessor).toBeDefined();

      const result = await blockProcessor!(mockJob as any);

      // Verify service calls
      expect(mockServiceFactory.get).toHaveBeenCalledWith('availBlockchain');
      expect(mockServiceFactory.get).toHaveBeenCalledWith('selfHealingBlockProcessor');
      expect(mockServiceFactory.get).toHaveBeenCalledWith('blockService');
      
      expect(mockAvailBlockchain.getBlockByNumber).toHaveBeenCalledWith(12345);
      expect(mockSelfHealingBlockProcessor.processBlock).toHaveBeenCalled();
      expect(mockBlockService.indexBlock).toHaveBeenCalled();

      // Verify result structure
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        blockNumber: 12345,
        blockHash: '0x123abc',
        extrinsicsCount: 2,
        timestamp: expect.any(Date),
      });
      expect(result.metrics).toEqual({
        duration: expect.any(Number),
        entitiesProcessed: 2,
        processingRate: expect.any(Number),
      });
    });

    test('should handle blockchain data not found', async () => {
      mockAvailBlockchain.getBlockByNumber.mockResolvedValueOnce(null);

      const jobData = { blockNumber: 99999 };
      const mockJob = {
        id: 'test-job-2',
        name: JobType.BLOCK_INDEXING,
        data: jobData,
      };

      const blockProcessor = queueService['jobProcessors'].get(JobType.BLOCK_INDEXING);
      
      await expect(blockProcessor!(mockJob as any))
        .rejects.toThrow('Block 99999 not found on blockchain');
    });

    test('should handle service errors with classification', async () => {
      mockSelfHealingBlockProcessor.processBlock.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const jobData = { blockNumber: 12345 };
      const mockJob = {
        id: 'test-job-3',
        name: JobType.BLOCK_INDEXING,
        data: jobData,
      };

      const blockProcessor = queueService['jobProcessors'].get(JobType.BLOCK_INDEXING);
      
      await expect(blockProcessor!(mockJob as any))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('Performance Metrics - John\'s Implementation', () => {
    test('should initialize metrics correctly', () => {
      const metrics = queueService.getPerformanceMetrics();
      
      expect(metrics.overview).toEqual({
        totalJobsProcessed: 0,
        totalJobsFailed: 0,
        overallSuccessRate: '0%',
        averageProcessingTime: 0,
      });
      expect(metrics.jobTypes).toEqual({});
    });

    test('should update metrics on job completion', () => {
      // Simulate job metrics update
      queueService['updateMetrics'](JobType.BLOCK_INDEXING, 1500, true);
      
      const metrics = queueService.getPerformanceMetrics();
      
      expect(metrics.overview.totalJobsProcessed).toBe(1);
      expect(metrics.overview.totalJobsFailed).toBe(0);
      expect(metrics.overview.overallSuccessRate).toBe('100.00%');
      expect(metrics.jobTypes[JobType.BLOCK_INDEXING]).toEqual({
        processed: 1,
        failed: 0,
        successRate: '100.00%',
        averageProcessingTime: 1500,
        failureRate: '0.00%',
      });
    });

    test('should track failure metrics correctly', () => {
      queueService['updateMetrics'](JobType.DATA_SYNC, 2000, true);
      queueService['updateMetrics'](JobType.DATA_SYNC, 1800, false);
      queueService['updateMetrics'](JobType.DATA_SYNC, 2200, true);
      
      const metrics = queueService.getPerformanceMetrics();
      
      expect(metrics.overview.totalJobsProcessed).toBe(3);
      expect(metrics.overview.totalJobsFailed).toBe(1);
      expect(metrics.overview.overallSuccessRate).toBe('66.67%');
      expect(metrics.jobTypes[JobType.DATA_SYNC]).toEqual({
        processed: 3,
        failed: 1,
        successRate: '66.67%',
        averageProcessingTime: 2000,
        failureRate: '33.33%',
      });
    });

    test('should reset metrics correctly', () => {
      queueService['updateMetrics'](JobType.BLOCK_INDEXING, 1000, true);
      queueService.resetMetrics();
      
      const metrics = queueService.getPerformanceMetrics();
      expect(metrics.overview.totalJobsProcessed).toBe(0);
      expect(metrics.jobTypes).toEqual({});
    });
  });

  describe('Production Readiness Features', () => {
    test('should provide comprehensive health status', async () => {
      const health = await queueService.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('stats');
      expect(health.stats).toHaveProperty('waiting');
      expect(health.stats).toHaveProperty('active');
      expect(health.stats).toHaveProperty('completed');
      expect(health.stats).toHaveProperty('failed');
    });

    test('should track processing statistics', () => {
      const metrics = queueService.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('overview');
      expect(metrics).toHaveProperty('jobTypes');
      expect(metrics).toHaveProperty('timestamp');
      expect(new Date(metrics.timestamp)).toBeInstanceOf(Date);
    });
  });
}); 