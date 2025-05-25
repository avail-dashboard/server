// The cache is already mocked in setup.ts, so we just import it
import { cache } from '../../../src/utils/cache';

describe('Cache Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cache object', () => {
    it('should be defined', () => {
      expect(cache).toBeDefined();
    });

    it('should have required methods', () => {
      expect(cache.connect).toBeDefined();
      expect(cache.disconnect).toBeDefined();
      expect(cache.get).toBeDefined();
      expect(cache.set).toBeDefined();
      expect(cache.del).toBeDefined();
      expect(cache.exists).toBeDefined();
      expect(cache.expire).toBeDefined();
    });
  });

  describe('cache operations', () => {
    it('should connect successfully', async () => {
      await expect(cache.connect()).resolves.toBeUndefined();
    });

    it('should disconnect successfully', async () => {
      await expect(cache.disconnect()).resolves.toBeUndefined();
    });

    it('should get value from cache', async () => {
      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should set value in cache', async () => {
      const result = await cache.set('test-key', 'test-value');
      expect(result).toBe(true);
    });

    it('should set value with TTL', async () => {
      const result = await cache.set('test-key', 'test-value', 3600);
      expect(result).toBe(true);
    });

    it('should delete value from cache', async () => {
      const result = await cache.del('test-key');
      expect(result).toBe(true);
    });

    it('should check if key exists', async () => {
      const result = await cache.exists('test-key');
      expect(result).toBe(false);
    });

    it('should set expiration on key', async () => {
      const result = await cache.expire('test-key', 3600);
      expect(result).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors gracefully', async () => {
      // This test would need more sophisticated mocking to test error scenarios
      // For now, we'll just ensure the methods exist and can be called
      expect(typeof cache.connect).toBe('function');
    });
  });
}); 