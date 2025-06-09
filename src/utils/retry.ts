import { logger } from './logger';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialFactor: number;
  jitterEnabled: boolean;
}

export type RetryableOperation<T> = () => Promise<T>;

export class RetryError extends Error {
  constructor(
    message: string,
    public attempts: number,
    public lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(
  operation: RetryableOperation<T>,
  config: RetryConfig,
  context: string = 'operation',
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 1) {
        logger.info(`Retry success: ${context} succeeded on attempt ${attempt}`, {
          component: 'retry',
          context,
          attempt,
          totalAttempts: config.maxRetries + 1,
        });
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // If this is the last attempt, throw the retry error
      if (attempt === config.maxRetries + 1) {
        const retryError = new RetryError(
          `Failed after ${config.maxRetries + 1} attempts: ${lastError.message}`,
          attempt,
          lastError,
        );
        
        logger.error(`Retry failed: ${context} failed after all attempts`, {
          component: 'retry',
          context,
          attempts: attempt,
          maxRetries: config.maxRetries,
          finalError: lastError.message,
          error: retryError,
        });
        
        throw retryError;
      }
      
      // Calculate delay with exponential backoff and optional jitter
      const baseDelay = Math.min(
        config.baseDelay * Math.pow(config.exponentialFactor, attempt - 1),
        config.maxDelay,
      );
      
      const delay = config.jitterEnabled 
        ? baseDelay + Math.random() * baseDelay * 0.1  // Add up to 10% jitter
        : baseDelay;
      
      logger.warn(`Retry attempt: ${context} failed, retrying in ${delay}ms`, {
        component: 'retry',
        context,
        attempt,
        maxRetries: config.maxRetries,
        delay,
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached due to the loop logic, but TypeScript requires it
  throw new Error('Unexpected retry loop completion');
}

// Simplified retry function for backward compatibility (similar to existing database.ts withRetry)
export async function withSimpleRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context: string = 'operation',
): Promise<T> {
  const config: RetryConfig = {
    maxRetries: maxRetries - 1, // Adjust for compatibility with existing logic
    baseDelay: delayMs,
    maxDelay: delayMs * 10,
    exponentialFactor: 1, // Linear delay for backward compatibility
    jitterEnabled: false,
  };
  
  return withRetry(operation, config, context);
}

// Predefined retry configurations for different use cases
export const retryConfigs = {
  // For critical blockchain operations
  blockchain: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialFactor: 2,
    jitterEnabled: true,
  } as RetryConfig,
  
  // For database operations (can replace existing database.ts withRetry)
  database: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    exponentialFactor: 2,
    jitterEnabled: true,
  } as RetryConfig,
  
  // For cache operations
  cache: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    exponentialFactor: 1.5,
    jitterEnabled: true,
  } as RetryConfig,
  
  // For less critical operations
  standard: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 5000,
    exponentialFactor: 2,
    jitterEnabled: true,
  } as RetryConfig,
  
  // For health checks and monitoring
  health: {
    maxRetries: 1,
    baseDelay: 1000,
    maxDelay: 3000,
    exponentialFactor: 1.5,
    jitterEnabled: false,
  } as RetryConfig,
  
  // For API calls and HTTP requests
  api: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 3000,
    exponentialFactor: 1.5,
    jitterEnabled: true,
  } as RetryConfig,
  
  // For queue operations
  queue: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    exponentialFactor: 2,
    jitterEnabled: true,
  } as RetryConfig,
}; 