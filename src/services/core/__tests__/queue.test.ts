import { QueueService, queueService } from '../queue';
import { JobType } from '../../types/service';

// Mock Redis and Bull for testing
jest.mock('ioredis');
jest.mock('bull');

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    service = new QueueService();
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
  });

  describe('Service Lifecycle', () => {
    it('should create a QueueService instance', () => {
      expect(service).toBeInstanceOf(QueueService);
    });

    it('should have singleton instance available', () => {
      expect(queueService).toBeInstanceOf(QueueService);
    });
  });

  describe('Job Types', () => {
    it('should have all required job types defined', () => {
      expect(JobType.BLOCK_INDEXING).toBe('block_indexing');
      expect(JobType.EXTRINSIC_PROCESSING).toBe('extrinsic_processing');
      expect(JobType.ANALYTICS_CALCULATION).toBe('analytics_calculation');
      expect(JobType.ROLLUP_STATISTICS).toBe('rollup_statistics');
      expect(JobType.DATA_SYNC).toBe('data_sync');
      expect(JobType.HEALTH_CHECK).toBe('health_check');
    });
  });

  describe('Service Interface', () => {
    it('should implement all required methods', () => {
      expect(typeof service.start).toBe('function');
      expect(typeof service.stop).toBe('function');
      expect(typeof service.addJob).toBe('function');
      expect(typeof service.getStats).toBe('function');
      expect(typeof service.getHealth).toBe('function');
      expect(typeof service.pauseQueue).toBe('function');
      expect(typeof service.resumeQueue).toBe('function');
      expect(typeof service.clearQueue).toBe('function');
    });

    it('should have convenience methods for common job types', () => {
      expect(typeof service.scheduleBlockIndexing).toBe('function');
      expect(typeof service.scheduleExtrinsicProcessing).toBe('function');
      expect(typeof service.scheduleAnalyticsCalculation).toBe('function');
      expect(typeof service.scheduleDataSync).toBe('function');
      expect(typeof service.scheduleHealthCheck).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when adding job without starting service', async () => {
      await expect(service.addJob('test', {})).rejects.toThrow('QueueService not started');
    });

    it('should throw error when getting stats without starting service', async () => {
      await expect(service.getStats()).rejects.toThrow('QueueService not started');
    });

    it('should return unhealthy status when service not started', async () => {
      const health = await service.getHealth();
      expect(health.status).toBe('unhealthy');
      expect(health.stats.waiting).toBe(0);
    });
  });
}); 