import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

// Namespace for correlation context
const CORRELATION_NAMESPACE = 'correlation-context';
const CORRELATION_ID_KEY = 'correlationId';

// Create the namespace
let correlationNamespace: Namespace;

/**
 * Initialize the correlation ID namespace
 * This should be called once at application startup
 */
export const initializeCorrelationId = (): void => {
  correlationNamespace = createNamespace(CORRELATION_NAMESPACE);
};

/**
 * Get the current correlation ID from the context
 * Returns undefined if no correlation ID is set
 */
export const getCorrelationId = (): string | undefined => {
  const namespace = getNamespace(CORRELATION_NAMESPACE);
  return namespace?.get(CORRELATION_ID_KEY);
};

/**
 * Set a correlation ID in the current context
 */
export const setCorrelationId = (correlationId: string): void => {
  const namespace = getNamespace(CORRELATION_NAMESPACE);
  namespace?.set(CORRELATION_ID_KEY, correlationId);
};

/**
 * Generate a new correlation ID
 */
export const generateCorrelationId = (): string => {
  return uuidv4();
};

/**
 * Express middleware to handle correlation IDs
 * - Extracts correlation ID from X-Correlation-ID header if present
 * - Generates a new one if not present
 * - Sets it in the response header
 * - Stores it in the correlation context
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!correlationNamespace) {
    throw new Error('Correlation namespace not initialized. Call initializeCorrelationId() first.');
  }

  correlationNamespace.run(() => {
    // Extract correlation ID from header or generate new one
    const correlationId = req.get('X-Correlation-ID') || generateCorrelationId();
    
    // Set in context
    setCorrelationId(correlationId);
    
    // Add to response headers
    res.set('X-Correlation-ID', correlationId);
    
    // Add to request object for easy access
    (req as any).correlationId = correlationId;
    
    next();
  });
};

/**
 * Run a function within a correlation context
 * Useful for background tasks or async operations
 */
export const runWithCorrelationId = <T>(
  correlationId: string,
  fn: () => T | Promise<T>,
): T | Promise<T> => {
  if (!correlationNamespace) {
    throw new Error('Correlation namespace not initialized. Call initializeCorrelationId() first.');
  }

  return correlationNamespace.runAndReturn(() => {
    setCorrelationId(correlationId);
    return fn();
  });
};

/**
 * Create a child correlation ID for sub-operations
 * Format: parentId.childId
 */
export const createChildCorrelationId = (suffix?: string): string => {
  const parentId = getCorrelationId();
  const childSuffix = suffix || uuidv4().split('-')[0]; // Use first part of UUID for brevity
  
  if (parentId) {
    return `${parentId}.${childSuffix}`;
  }
  
  return generateCorrelationId();
};

/**
 * Bind a correlation ID to a callback function
 * Useful for preserving context across async boundaries
 */
export const bindCorrelationId = <T extends (...args: any[]) => any>(
  fn: T,
  correlationId?: string,
): T => {
  if (!correlationNamespace) {
    throw new Error('Correlation namespace not initialized. Call initializeCorrelationId() first.');
  }

  const id = correlationId || getCorrelationId();
  if (!id) {
    return fn; // No correlation ID to bind
  }

  return correlationNamespace.bind(fn, { [CORRELATION_ID_KEY]: id }) as T;
};

/**
 * Get correlation metadata for logging
 */
export const getCorrelationMetadata = (): { correlationId?: string } => {
  const correlationId = getCorrelationId();
  return correlationId ? { correlationId } : {};
}; 