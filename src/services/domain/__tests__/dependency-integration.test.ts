/**
 * TASK-007: Dependency Integration Tests
 * Tests for self-healing processor dependency detection and resolution
 */

import { EnhancedProcessorService } from '../EnhancedProcessor';
import { SelfHealingBlockProcessor } from '../selfHealingProcessor';
import { QueueService } from '../../core/queue';
import { DependencyDetectionEngineService } from '../dependencyDetectionEngine';
import { DependencyReport } from '../../types/dependency';
import { BlockData } from '../../types/blockchain';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../utils/database');

describe('TASK-007: Dependency Integration', () => {
  let mockQueueService: jest.Mocked<QueueService>;
  let mockDependencyEngine: jest.Mocked<DependencyDetectionEngineService>;
  let mockBlockData: BlockData;

  beforeEach(() => {
    // Mock QueueService
    mockQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'test-job' }),
      getStats: jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
      }),
    } as any;

    // Mock DependencyDetectionEngine
    mockDependencyEngine = {
      detectMissingDependencies: jest.fn().mockResolvedValue({
        entityId: 'test-entity',
        missingDependencies: [],
        totalMissing: 0,
        criticalMissing: 0,
        resolutionRequired: false,
        estimatedResolutionTime: 0,
      } as DependencyReport),
    } as any;

    // Mock BlockData
    mockBlockData = {
      number: 12345,
      hash: '0xtest',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [],
      events: [],
    } as BlockData;
  });

  describe('EnhancedProcessor Dependency Integration', () => {
    it('should detect dependencies before processing', async () => {
      const processor = new EnhancedProcessorService(
        {} as any, // database
        {} as any, // blockchain
        {} as any, // validatorRepo
        {} as any, // transferRepo
        {} as any, // eraRepo
        mockQueueService,
        mockDependencyEngine,
      );

      const mockProcessingFn = jest.fn().mockResolvedValue('success');

      await processor.processWithDependencyCheck(
        'block',
        '12345',
        mockProcessingFn
      );

      expect(mockDependencyEngine.detectMissingDependencies).toHaveBeenCalledWith({
        id: '12345',
        type: 'block',
        blockNumber: 12345,
        data: {},
        timestamp: expect.any(Date),
      });

      expect(mockProcessingFn).toHaveBeenCalled();
    });

    it('should queue dependency resolution when dependencies are missing', async () => {
      // Setup missing dependencies scenario
      mockDependencyEngine.detectMissingDependencies.mockResolvedValue({
        entityId: 'test-entity',
        missingDependencies: [
          {
            entityType: 'account',
            entityId: 'test-account',
            requiredBy: 'test-entity',
            priority: 1,
            discoveredAt: new Date(),
          },
        ],
        totalMissing: 1,
        criticalMissing: 1,
        resolutionRequired: true,
        estimatedResolutionTime: 5000,
      });

      const processor = new EnhancedProcessorService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockQueueService,
        mockDependencyEngine,
      );

      const mockProcessingFn = jest.fn().mockResolvedValue('success');

      await processor.processWithDependencyCheck(
        'block',
        '12345',
        mockProcessingFn
      );

      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        'dependency_detection',
        {
          entityType: 'block',
          entityId: '12345',
          priority: 1, // Critical priority
          blockNumber: 12345,
          requiredBy: '12345',
        }
      );
    });

    it('should handle dependency resolution errors gracefully', async () => {
      mockDependencyEngine.detectMissingDependencies.mockRejectedValue(
        new Error('dependency detection failed')
      );

      const processor = new EnhancedProcessorService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockQueueService,
        mockDependencyEngine,
      );

      const mockProcessingFn = jest.fn().mockResolvedValue('success');

      // Should not throw and should continue processing
      await expect(
        processor.processWithDependencyCheck('block', '12345', mockProcessingFn)
      ).resolves.toBe('success');

      expect(mockProcessingFn).toHaveBeenCalled();
    });
  });

  describe('SelfHealingProcessor Dependency Integration', () => {
    it('should integrate dependency detection into block processing', async () => {
      const processor = new SelfHealingBlockProcessor(
        {} as any, // accountService
        {} as any, // validatorService
        {} as any, // transferService
        {} as any, // dataSubmissionService
        mockQueueService,
        mockDependencyEngine,
      );

      // Mock the private method by testing through processBlock
      jest.spyOn(processor as any, 'performBlockProcessing').mockResolvedValue(undefined);

      await processor.start();
      await processor.processBlock(mockBlockData);

      expect(mockDependencyEngine.detectMissingDependencies).toHaveBeenCalled();
    });

    it('should continue processing in self-healing mode even with dependency issues', async () => {
      mockDependencyEngine.detectMissingDependencies.mockResolvedValue({
        entityId: 'test-entity',
        missingDependencies: [
          {
            entityType: 'account',
            entityId: 'test-account',
            requiredBy: 'test-entity',
            priority: 1,
            discoveredAt: new Date(),
          },
        ],
        totalMissing: 1,
        criticalMissing: 1,
        resolutionRequired: true,
        estimatedResolutionTime: 5000,
      });

      const processor = new SelfHealingBlockProcessor(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockQueueService,
        mockDependencyEngine,
      );

      jest.spyOn(processor as any, 'performBlockProcessing').mockResolvedValue(undefined);

      await processor.start();
      
      // Should not throw even with missing dependencies
      await expect(processor.processBlock(mockBlockData)).resolves.not.toThrow();
      
      expect(mockQueueService.addJob).toHaveBeenCalled();
    });
  });

  describe('Dependency Resolution Strategy', () => {
    it('should respect waitForCritical strategy', async () => {
      const processor = new EnhancedProcessorService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockQueueService,
        mockDependencyEngine,
        {
          waitForCritical: true,
          continueWithPartial: false,
          maxWaitTime: 5000,
        }
      );

      mockDependencyEngine.detectMissingDependencies.mockResolvedValue({
        entityId: 'test-entity',
        missingDependencies: [],
        totalMissing: 0,
        criticalMissing: 0,
        resolutionRequired: false,
        estimatedResolutionTime: 0,
      });

      const mockProcessingFn = jest.fn().mockResolvedValue('success');

      const result = await processor.processWithDependencyCheck(
        'block',
        '12345',
        mockProcessingFn
      );

      expect(result).toBe('success');
      expect(mockProcessingFn).toHaveBeenCalled();
    });
  });
}); 