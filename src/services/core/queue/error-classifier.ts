import { ErrorClassification } from './types';

/**
 * Error Classification Framework - John's Implementation
 * Used by all job processors for consistent error handling
 */
export class ErrorClassifier {
  static classifyError(error: Error, _jobType: string): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    // Network-related errors (retryable)
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('connection') || 
        errorMessage.includes('network') ||
        errorMessage.includes('econnreset')) {
      return {
        isRetryable: true,
        retryDelay: 5000,
        category: 'network',
        alertLevel: 'medium',
      };
    }
    
    // Service unavailable errors (retryable with backoff)
    if (errorMessage.includes('service unavailable') ||
        errorMessage.includes('temporarily unavailable') ||
        errorMessage.includes('rate limit')) {
      return {
        isRetryable: true,
        retryDelay: 10000,
        category: 'service',
        alertLevel: 'medium',
      };
    }
    
    // Data validation errors (not retryable)
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid data') ||
        errorMessage.includes('malformed')) {
      return {
        isRetryable: false,
        category: 'data',
        alertLevel: 'high',
      };
    }
    
    // System errors (analyze further)
    if (errorMessage.includes('out of memory') ||
        errorMessage.includes('disk full')) {
      return {
        isRetryable: false,
        category: 'system',
        alertLevel: 'critical',
      };
    }
    
    // Default: retryable with caution
    return {
      isRetryable: true,
      retryDelay: 3000,
      category: 'system',
      alertLevel: 'medium',
    };
  }
}