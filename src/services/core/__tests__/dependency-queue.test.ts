import { QueueService } from '../queue';
import { JobType } from '../../types/service';

// Mock dependencies
const mockDependencyDetectionEngine = {
  detectMissingDependencies: jest.fn(),
  validateDependency: jest.fn(),
};

const mockMissingDataResolver = {
  resolveBlock: jest.fn(),
  resolveAccount: jest.fn(),
  resolveRollup: jest.fn(),
  resolveBatch: jest.fn(),
};

const mockServiceFactory = {
  get: jest.fn(),
};

describe('QueueService - Dependency Integration', () => {
  let queueService: QueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueService = new QueueService();
    
    // Mock service factory responses
    mockServiceFactory.get.mockImplementation((serviceName: string) => {
      switch (serviceName) {
      case 'dependencyDetectionEngine':
        return mockDependencyDetectionEngine;
      case 'missingDataResolver':
        return mockMissingDataResolver;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
      }
    });

    // Initialize dependencies
    queueService.initializeDependencies({
      serviceFactory: mockServiceFactory,
      dependencyDetectionEngine: mockDependencyDetectionEngine,
      missingDataResolver: mockMissingDataResolver,
    });
  });

  describe('Job Type Registration', () => {
    test('should have all 5 new dependency job types registered', () => {
      expect(JobType.DEPENDENCY_DETECTION).toBe('dependency_detection');
      expect(JobType.DEPENDENCY_RESOLUTION).toBe('dependency_resolution');
      expect(JobType.DEPENDENCY_BATCH_RESOLUTION).toBe('dependency_batch_resolution');
      expect(JobType.DEPENDENCY_GAP_ANALYSIS).toBe('dependency_gap_analysis');
      expect(JobType.DEPENDENCY_CONSISTENCY_CHECK).toBe('dependency_consistency_check');
    });

    test('should have processors registered for all dependency job types', () => {
      const processors = queueService['jobProcessors'];
      
      expect(processors.has(JobType.DEPENDENCY_DETECTION)).toBe(true);
      expect(processors.has(JobType.DEPENDENCY_RESOLUTION)).toBe(true);
      expect(processors.has(JobType.DEPENDENCY_BATCH_RESOLUTION)).toBe(true);
      expect(processors.has(JobType.DEPENDENCY_GAP_ANALYSIS)).toBe(true);
      expect(processors.has(JobType.DEPENDENCY_CONSISTENCY_CHECK)).toBe(true);
    });
  });

  describe('DEPENDENCY_DETECTION Processor', () => {
    test('should process dependency detection job successfully', async () => {
      const mockDependencyReport = {
        entityId: 'block-123',
        missingDependencies: [
          {
            entityType: 'account',
            entityId: 'test-account',
            requiredBy: 'block-123',
            priority: 2,
            discoveredAt: new Date(),
          },
        ],
        totalMissing: 1,
        criticalMissing: 0,
        resolutionRequired: true,
        estimatedResolutionTime: 5000,
      };

      mockDependencyDetectionEngine.detectMissingDependencies.mockResolvedValue(mockDependencyReport);

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_DETECTION);
      const mockJob = {
        id: 'test-job-1',
        data: {
          entityType: 'block',
          entityId: '123',
          priority: 1,
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.dependencyReport).toEqual(mockDependencyReport);
      expect(result.data.resolutionJobsQueued).toBe(1);
      expect(mockDependencyDetectionEngine.detectMissingDependencies).toHaveBeenCalledWith({
        id: '123',
        type: 'block',
        data: { entityType: 'block', entityId: '123' },
        timestamp: expect.any(Date),
      });
    });

    test('should handle dependency detection errors', async () => {
      mockDependencyDetectionEngine.detectMissingDependencies.mockRejectedValue(
        new Error('Detection service unavailable'),
      );

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_DETECTION);
      const mockJob = {
        id: 'test-job-1',
        data: {
          entityType: 'block',
          entityId: '123',
          priority: 1,
        },
      };

      await expect(processor!(mockJob as any)).rejects.toThrow('Detection service unavailable');
    });
  });

  describe('DEPENDENCY_RESOLUTION Processor', () => {
    test('should resolve block dependency successfully', async () => {
      const mockResolution = {
        blockNumber: 123,
        resolved: true,
        resolutionTime: 2000,
        blockData: { hash: 'test-hash' },
      };

      mockMissingDataResolver.resolveBlock.mockResolvedValue(mockResolution);

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_RESOLUTION);
      const mockJob = {
        id: 'test-job-2',
        data: {
          dependencyType: 'block',
          dependencyId: '123',
          entityType: 'block',
          entityId: 'parent-block',
          priority: 1,
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.result).toEqual(mockResolution);
      expect(mockMissingDataResolver.resolveBlock).toHaveBeenCalledWith(123);
    });

    test('should resolve account dependency successfully', async () => {
      const mockResolution = {
        address: 'test-address',
        resolved: true,
        resolutionTime: 1500,
        accountData: { balance: '1000' },
      };

      mockMissingDataResolver.resolveAccount.mockResolvedValue(mockResolution);

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_RESOLUTION);
      const mockJob = {
        id: 'test-job-3',
        data: {
          dependencyType: 'account',
          dependencyId: 'test-address',
          entityType: 'block',
          entityId: 'block-456',
          priority: 2,
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.result).toEqual(mockResolution);
      expect(mockMissingDataResolver.resolveAccount).toHaveBeenCalledWith('test-address');
    });

    test('should handle resolution failure', async () => {
      mockMissingDataResolver.resolveBlock.mockResolvedValue({
        blockNumber: 123,
        resolved: false,
        resolutionTime: 1000,
        error: 'Block not found on blockchain',
      });

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_RESOLUTION);
      const mockJob = {
        id: 'test-job-4',
        data: {
          dependencyType: 'block',
          dependencyId: '123',
          entityType: 'block',
          entityId: 'parent-block',
          priority: 1,
        },
      };

      await expect(processor!(mockJob as any)).rejects.toThrow('Failed to resolve dependency: Block not found on blockchain');
    });

    test('should handle unsupported dependency type', async () => {
      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_RESOLUTION);
      const mockJob = {
        id: 'test-job-5',
        data: {
          dependencyType: 'unsupported',
          dependencyId: '123',
          entityType: 'block',
          entityId: 'parent-block',
          priority: 1,
        },
      };

      await expect(processor!(mockJob as any)).rejects.toThrow('Unsupported dependency type: unsupported');
    });
  });

  describe('DEPENDENCY_BATCH_RESOLUTION Processor', () => {
    test('should process batch resolution successfully', async () => {
      const mockBatchResolution = {
        batchId: 'batch-123',
        totalDependencies: 3,
        resolvedCount: 2,
        failedCount: 1,
        resolutions: [],
        totalTime: 5000,
        efficiency: 66.67,
      };

      mockMissingDataResolver.resolveBatch.mockResolvedValue(mockBatchResolution);

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_BATCH_RESOLUTION);
      const mockJob = {
        id: 'test-job-6',
        data: {
          dependencies: [
            { dependencyType: 'block', dependencyId: '123', entityType: 'block', entityId: 'parent' },
            { dependencyType: 'account', dependencyId: 'addr1', entityType: 'block', entityId: 'parent' },
            { dependencyType: 'rollup', dependencyId: '1', entityType: 'block', entityId: 'parent' },
          ],
          batchSize: 10,
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.batchResolution).toEqual(mockBatchResolution);
      expect(result.data.processedCount).toBe(3);
      expect(mockMissingDataResolver.resolveBatch).toHaveBeenCalledWith([
        {
          entityType: 'block',
          entityId: '123',
          requiredBy: 'parent',
          priority: 2,
          discoveredAt: expect.any(Date),
        },
        {
          entityType: 'account',
          entityId: 'addr1',
          requiredBy: 'parent',
          priority: 2,
          discoveredAt: expect.any(Date),
        },
        {
          entityType: 'rollup',
          entityId: '1',
          requiredBy: 'parent',
          priority: 2,
          discoveredAt: expect.any(Date),
        },
      ]);
    });
  });

  describe('DEPENDENCY_GAP_ANALYSIS Processor', () => {
    test('should analyze dependency gaps successfully', async () => {
      // Mock dependency reports for different blocks
      mockDependencyDetectionEngine.detectMissingDependencies
        .mockResolvedValueOnce({
          entityId: 'block-100',
          missingDependencies: [],
          totalMissing: 0,
          criticalMissing: 0,
          resolutionRequired: false,
          estimatedResolutionTime: 0,
        })
        .mockResolvedValueOnce({
          entityId: 'block-101',
          missingDependencies: [{ entityType: 'account', entityId: 'addr1' }],
          totalMissing: 1,
          criticalMissing: 1,
          resolutionRequired: true,
          estimatedResolutionTime: 3000,
        })
        .mockResolvedValueOnce({
          entityId: 'block-102',
          missingDependencies: [],
          totalMissing: 0,
          criticalMissing: 0,
          resolutionRequired: false,
          estimatedResolutionTime: 0,
        });

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_GAP_ANALYSIS);
      const mockJob = {
        id: 'test-job-7',
        data: {
          startBlock: 100,
          endBlock: 102,
          entityType: 'block',
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.blocksAnalyzed).toBe(3);
      expect(result.data.gapsFound).toHaveLength(1);
      expect(result.data.gapsFound[0].blockNumber).toBe(101);
      expect(result.data.gapPercentage).toBeCloseTo(33.33, 1);
    });
  });

  describe('DEPENDENCY_CONSISTENCY_CHECK Processor', () => {
    test('should perform basic consistency check successfully', async () => {
      mockDependencyDetectionEngine.validateDependency
        .mockResolvedValueOnce(true)  // entity1 exists
        .mockResolvedValueOnce(false) // entity2 missing
        .mockResolvedValueOnce(true); // entity3 exists

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_CONSISTENCY_CHECK);
      const mockJob = {
        id: 'test-job-8',
        data: {
          entityType: 'account',
          entityIds: ['entity1', 'entity2', 'entity3'],
          checkLevel: 'basic',
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.entitiesChecked).toBe(3);
      expect(result.data.inconsistencies).toHaveLength(1);
      expect(result.data.inconsistencies[0]).toEqual({
        entityType: 'account',
        entityId: 'entity2',
        issue: 'entity_missing',
        severity: 'critical',
      });
      expect(result.data.consistencyRate).toBeCloseTo(66.67, 1);
    });

    test('should perform deep consistency check successfully', async () => {
      mockDependencyDetectionEngine.validateDependency.mockResolvedValue(true);
      mockDependencyDetectionEngine.detectMissingDependencies.mockResolvedValue({
        entityId: 'entity1',
        missingDependencies: [{ entityType: 'block', entityId: '123' }],
        totalMissing: 1,
        criticalMissing: 1,
        resolutionRequired: true,
        estimatedResolutionTime: 2000,
      });

      const processor = queueService['jobProcessors'].get(JobType.DEPENDENCY_CONSISTENCY_CHECK);
      const mockJob = {
        id: 'test-job-9',
        data: {
          entityType: 'account',
          entityIds: ['entity1'],
          checkLevel: 'deep',
        },
      };

      const result = await processor!(mockJob as any);

      expect(result.success).toBe(true);
      expect(result.data.entitiesChecked).toBe(1);
      expect(result.data.inconsistencies).toHaveLength(1);
      expect(result.data.inconsistencies[0].issue).toBe('missing_dependencies');
      expect(result.data.inconsistencies[0].severity).toBe('critical');
    });
  });

  describe('Convenience Methods', () => {
    test('should have convenience methods for all dependency job types', () => {
      expect(typeof queueService.scheduleDependencyDetection).toBe('function');
      expect(typeof queueService.scheduleDependencyResolution).toBe('function');
      expect(typeof queueService.scheduleDependencyBatchResolution).toBe('function');
      expect(typeof queueService.scheduleDependencyGapAnalysis).toBe('function');
      expect(typeof queueService.scheduleDependencyConsistencyCheck).toBe('function');
    });
  });

  describe('Error Classification', () => {
    test('should classify errors correctly', () => {
      const classifyError = queueService['classifyError'];
      
      // Network error
      const networkError = new Error('Connection timeout');
      const networkClassification = classifyError(networkError, JobType.DEPENDENCY_DETECTION);
      expect(networkClassification.isRetryable).toBe(true);
      expect(networkClassification.category).toBe('network');
      expect(networkClassification.alertLevel).toBe('medium');

      // Validation error
      const validationError = new Error('Invalid data format');
      const validationClassification = classifyError(validationError, JobType.DEPENDENCY_RESOLUTION);
      expect(validationClassification.isRetryable).toBe(false);
      expect(validationClassification.category).toBe('data');
      expect(validationClassification.alertLevel).toBe('high');
    });
  });
}); 