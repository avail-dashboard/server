import { Request, Response } from 'express';
import {
  initializeCorrelationId,
  getCorrelationId,
  generateCorrelationId,
  correlationIdMiddleware,
  runWithCorrelationId,
  createChildCorrelationId,
  getCorrelationMetadata,
} from '../../../src/utils/correlationId';

// Mock express objects
const mockRequest = (headers: Record<string, string> = {}) => ({
  get: (header: string) => headers[header],
}) as Request;

const mockResponse = () => {
  const res = {} as Response;
  res.set = jest.fn();
  return res;
};

// const mockNext = jest.fn() as NextFunction;

describe('CorrelationId Utils', () => {
  beforeAll(() => {
    // Initialize correlation ID namespace for tests
    initializeCorrelationId();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCorrelationId', () => {
    it('should generate a valid UUID', () => {
      const correlationId = generateCorrelationId();
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('correlation context', () => {
    it('should return undefined when no correlation ID is set', () => {
      const correlationId = getCorrelationId();
      expect(correlationId).toBeUndefined();
    });

    it('should store and retrieve correlation ID within context', (done) => {
      const testId = 'test-correlation-id';
      
      runWithCorrelationId(testId, () => {
        const retrievedId = getCorrelationId();
        expect(retrievedId).toBe(testId);
        done();
      });
    });

    it('should provide correlation metadata', (done) => {
      const testId = 'test-metadata-id';
      
      runWithCorrelationId(testId, () => {
        const metadata = getCorrelationMetadata();
        expect(metadata).toEqual({ correlationId: testId });
        done();
      });
    });

    it('should return empty metadata when no correlation ID', () => {
      const metadata = getCorrelationMetadata();
      expect(metadata).toEqual({});
    });
  });

  describe('correlationIdMiddleware', () => {
    it('should generate new correlation ID when none provided', (done) => {
      const req = mockRequest();
      const res = mockResponse();
      
      correlationIdMiddleware(req, res, () => {
        const correlationId = getCorrelationId();
        expect(correlationId).toBeDefined();
        expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(res.set).toHaveBeenCalledWith('X-Correlation-ID', correlationId);
        expect((req as any).correlationId).toBe(correlationId);
        done();
      });
    });

    it('should use provided correlation ID from header', (done) => {
      const providedId = 'provided-correlation-id';
      const req = mockRequest({ 'X-Correlation-ID': providedId });
      const res = mockResponse();
      
      correlationIdMiddleware(req, res, () => {
        const correlationId = getCorrelationId();
        expect(correlationId).toBe(providedId);
        expect(res.set).toHaveBeenCalledWith('X-Correlation-ID', providedId);
        expect((req as any).correlationId).toBe(providedId);
        done();
      });
    });
  });

  describe('createChildCorrelationId', () => {
    it('should create child ID with parent prefix', (done) => {
      const parentId = 'parent-id';
      
      runWithCorrelationId(parentId, () => {
        const childId = createChildCorrelationId('child');
        expect(childId).toBe('parent-id.child');
        done();
      });
    });

    it('should generate child ID with auto suffix when no suffix provided', (done) => {
      const parentId = 'parent-id';
      
      runWithCorrelationId(parentId, () => {
        const childId = createChildCorrelationId();
        expect(childId).toMatch(/^parent-id\.[0-9a-f]{8}$/);
        done();
      });
    });

    it('should generate new ID when no parent context', () => {
      const childId = createChildCorrelationId('child');
      expect(childId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('runWithCorrelationId', () => {
    it('should execute function within correlation context', (done) => {
      const testId = 'test-run-with-id';
      
      runWithCorrelationId(testId, () => {
        const currentId = getCorrelationId();
        expect(currentId).toBe(testId);
        return 'success';
      });
      
      // Outside the context, should be undefined
      const outsideId = getCorrelationId();
      expect(outsideId).toBeUndefined();
      done();
    });

    it('should handle async functions', async () => {
      const testId = 'test-async-id';
      
      const result = await runWithCorrelationId(testId, async () => {
        const currentId = getCorrelationId();
        expect(currentId).toBe(testId);
        
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const stillCurrentId = getCorrelationId();
        expect(stillCurrentId).toBe(testId);
        
        return 'async-success';
      });
      
      expect(result).toBe('async-success');
    });
  });

  describe('nested correlation contexts', () => {
    it('should handle nested correlation contexts correctly', (done) => {
      const parentId = 'parent';
      const childId = 'child';
      
      runWithCorrelationId(parentId, () => {
        expect(getCorrelationId()).toBe(parentId);
        
        runWithCorrelationId(childId, () => {
          expect(getCorrelationId()).toBe(childId);
        });
        
        // Should return to parent context
        expect(getCorrelationId()).toBe(parentId);
        done();
      });
    });
  });
}); 