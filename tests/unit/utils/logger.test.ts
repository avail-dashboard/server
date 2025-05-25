import { logger, logError } from '../../../src/utils/logger';

describe('Logger Utility', () => {
  beforeEach(() => {
    // Clear any previous logs
    jest.clearAllMocks();
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have required methods', () => {
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('should log info messages', () => {
      // In test environment, winston doesn't output to console
      // We just verify the method exists and can be called
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      logger.error('Test error message');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log with metadata', () => {
      // In test environment, winston doesn't output to console
      // We just verify the method exists and can be called with metadata
      expect(() => logger.info('Test message with metadata', { userId: '123', action: 'test' })).not.toThrow();
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');
      const context = { component: 'test', action: 'testing' };
      
      logError(error, context);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle error without context', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');
      
      logError(error);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = 'String error';
      
      logError(error as any);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
}); 