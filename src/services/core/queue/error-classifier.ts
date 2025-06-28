import { ErrorClassification } from './types';
import { JobType } from '../../types/service';

/**
 * Error Classification Framework - Phase 2 Enhanced
 * Used by all job processors for consistent error handling
 * Now includes job-specific error patterns
 */
export class ErrorClassifier {
  static classifyError(error: Error, jobType: string): ErrorClassification {
    // Job-specific error classification
    switch (jobType) {
    case JobType.INDEX_VALIDATOR:
      return this.classifyValidatorError(error);
    case JobType.INDEX_ACCOUNT:
      return this.classifyAccountError(error);
    case JobType.INDEX_TRANSFER:
      return this.classifyTransferError(error);
    case JobType.INDEX_DATA_SUBMISSION:
      return this.classifyDataSubmissionError(error);
    default:
      return this.classifyGenericError(error);
    }
  }

  private static classifyValidatorError(error: Error): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('validator not found')) {
      return {
        isRetryable: false,
        category: 'data',
        alertLevel: 'low',
      };
    }
    
    if (errorMessage.includes('staking info unavailable')) {
      return {
        isRetryable: true,
        retryDelay: 5000,
        category: 'service',
        alertLevel: 'medium',
      };
    }
    
    return this.classifyGenericError(error);
  }

  private static classifyAccountError(error: Error): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('account not found')) {
      return {
        isRetryable: false,
        category: 'data',
        alertLevel: 'low',
      };
    }
    
    if (errorMessage.includes('balance query failed')) {
      return {
        isRetryable: true,
        retryDelay: 3000,
        category: 'service',
        alertLevel: 'medium',
      };
    }
    
    return this.classifyGenericError(error);
  }

  private static classifyTransferError(error: Error): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('no transfers found')) {
      return {
        isRetryable: false,
        category: 'data',
        alertLevel: 'low',
      };
    }
    
    if (errorMessage.includes('block data missing')) {
      return {
        isRetryable: true,
        retryDelay: 5000,
        category: 'data',
        alertLevel: 'high',
      };
    }
    
    return this.classifyGenericError(error);
  }

  private static classifyDataSubmissionError(error: Error): ErrorClassification {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('submission data unavailable')) {
      return {
        isRetryable: true,
        retryDelay: 10000,
        category: 'service',
        alertLevel: 'medium',
      };
    }
    
    return this.classifyGenericError(error);
  }

  private static classifyGenericError(error: Error): ErrorClassification {
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