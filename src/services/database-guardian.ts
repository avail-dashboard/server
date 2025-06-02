import { logError } from '../utils/logger';

interface ErrorAnalysis {
  severity: 'CRITICAL' | 'SEVERE' | 'MODERATE' | 'MINOR';
  category: 'CONNECTION' | 'AUTHENTICATION' | 'QUERY' | 'INFRASTRUCTURE' | 'APPLICATION';
  isRetryable: boolean;
  maxRetries: number;
  backoffMs: number;
  shouldExit: boolean;
  description: string;
}

interface ErrorState {
  errorCount: number;
  lastErrorTime: number;
  consecutiveErrors: number;
  circuitBreakerOpen: boolean;
}

export class DatabaseGuardian {
  private static errorState: Map<string, ErrorState> = new Map();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private static readonly ERROR_WINDOW = 60000; // 1 minute

  // PostgreSQL error codes and patterns
  private static readonly ERROR_PATTERNS = {
    // CRITICAL - Immediate exit (permanent failures)
    CRITICAL: [
      /password authentication failed/i,
      /database .* does not exist/i,
      /role .* does not exist/i,
      /permission denied for database/i,
      /pool was terminated/i,
      /pool is ending/i,
      /PostgreSQL pool not initialized/i,
    ],
    
    // SEVERE - Retry with backoff, then exit (likely infrastructure issues)
    SEVERE: [
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /EHOSTUNREACH/i,
      /could not connect to server/i,
      /server closed the connection unexpectedly/i,
      /connection terminated unexpectedly/i,
      /too many connections/i,
      /database system is starting up/i,
      /database system is shutting down/i,
    ],
    
    // MODERATE - Retry without exit (transient issues)
    MODERATE: [
      /ETIMEDOUT/i,
      /ECONNRESET/i,
      /EPIPE/i,
      /timeout acquiring client from pool/i,
      /connection terminated/i,
      /connection reset by peer/i,
      /deadlock detected/i,
      /lock timeout/i,
    ],
    
    // MINOR - Log and continue (application errors)
    MINOR: [
      /syntax error/i,
      /column .* does not exist/i,
      /table .* does not exist/i,
      /constraint .* violated/i,
      /duplicate key value/i,
      /invalid input syntax/i,
      /client has already been released/i,
    ],
  };

  /**
   * Analyze an error and determine appropriate response
   */
  private static analyzeError(error: Error, context: string): ErrorAnalysis {
    const errorMessage = error.message;
    const errorCode = (error as any).code;

    // Check error code first (more reliable)
    if (errorCode) {
      switch (errorCode) {
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
      case 'EHOSTUNREACH':
        return {
          severity: 'SEVERE',
          category: 'CONNECTION',
          isRetryable: true,
          maxRetries: context === 'startup' ? 3 : 5,
          backoffMs: 2000,
          shouldExit: true,
          description: `Connection error: ${errorCode}`,
        };
        
      case 'ETIMEDOUT':
      case 'ECONNRESET':
      case 'EPIPE':
        return {
          severity: 'MODERATE',
          category: 'CONNECTION',
          isRetryable: true,
          maxRetries: 3,
          backoffMs: 1000,
          shouldExit: false,
          description: `Transient connection error: ${errorCode}`,
        };
      }
    }

    // Check error message patterns
    for (const [severity, patterns] of Object.entries(this.ERROR_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(errorMessage)) {
          return this.createErrorAnalysis(severity as keyof typeof this.ERROR_PATTERNS, errorMessage, context);
        }
      }
    }

    // Default to application error if no patterns match
    return {
      severity: 'MINOR',
      category: 'APPLICATION',
      isRetryable: false,
      maxRetries: 0,
      backoffMs: 0,
      shouldExit: false,
      description: 'Unclassified application error',
    };
  }

  private static createErrorAnalysis(
    severity: keyof typeof this.ERROR_PATTERNS, 
    errorMessage: string, 
    context: string,
  ): ErrorAnalysis {
    const baseAnalysis = {
      CRITICAL: {
        severity: 'CRITICAL' as const,
        category: 'AUTHENTICATION' as const,
        isRetryable: false,
        maxRetries: 0,
        backoffMs: 0,
        shouldExit: true,
      },
      SEVERE: {
        severity: 'SEVERE' as const,
        category: 'CONNECTION' as const,
        isRetryable: true,
        maxRetries: context === 'startup' ? 3 : 5,
        backoffMs: 2000,
        shouldExit: true,
      },
      MODERATE: {
        severity: 'MODERATE' as const,
        category: 'CONNECTION' as const,
        isRetryable: true,
        maxRetries: 3,
        backoffMs: 1000,
        shouldExit: false,
      },
      MINOR: {
        severity: 'MINOR' as const,
        category: 'APPLICATION' as const,
        isRetryable: false,
        maxRetries: 0,
        backoffMs: 0,
        shouldExit: false,
      },
    };

    return {
      ...baseAnalysis[severity],
      description: `${severity}: ${errorMessage.substring(0, 100)}`,
    };
  }

  /**
   * Update error state for circuit breaker logic
   */
  private static updateErrorState(context: string): void {
    const now = Date.now();
    const state = this.errorState.get(context) || {
      errorCount: 0,
      lastErrorTime: 0,
      consecutiveErrors: 0,
      circuitBreakerOpen: false,
    };

    // Reset if outside error window
    if (now - state.lastErrorTime > this.ERROR_WINDOW) {
      state.errorCount = 0;
      state.consecutiveErrors = 0;
    }

    state.errorCount++;
    state.consecutiveErrors++;
    state.lastErrorTime = now;

    // Open circuit breaker if threshold exceeded
    if (state.consecutiveErrors >= this.CIRCUIT_BREAKER_THRESHOLD) {
      state.circuitBreakerOpen = true;
    }

    this.errorState.set(context, state);
  }

  /**
   * Check if circuit breaker should prevent operation
   */
  private static isCircuitBreakerOpen(context: string): boolean {
    const state = this.errorState.get(context);
    if (!state || !state.circuitBreakerOpen) {
      return false;
    }

    // Close circuit breaker after timeout
    if (Date.now() - state.lastErrorTime > this.CIRCUIT_BREAKER_TIMEOUT) {
      state.circuitBreakerOpen = false;
      state.consecutiveErrors = 0;
      this.errorState.set(context, state);
      return false;
    }

    return true;
  }

  /**
   * Main entry point for database error handling
   */
  static async handleDatabaseError(error: Error, context: string): Promise<never> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen(context)) {
      console.error(`CRITICAL: Circuit breaker open for ${context}. Exiting immediately.`);
      this.forceExit();
    }

    // Analyze the error
    const analysis = this.analyzeError(error, context);
    
    // Update error state
    this.updateErrorState(context);

    // Log the error with analysis
    logError(error, {
      component: 'database-guardian',
      context,
      severity: analysis.severity,
      category: analysis.category,
      isRetryable: analysis.isRetryable,
      shouldExit: analysis.shouldExit,
      description: analysis.description,
    });

    console.error(`Database Guardian: ${analysis.description}`);
    console.error(`Context: ${context}, Severity: ${analysis.severity}`);

    // Handle based on severity
    if (analysis.severity === 'CRITICAL' || analysis.shouldExit) {
      console.error(`CRITICAL: Database failure in ${context}. Exiting to ensure data integrity.`);
      console.error(`Error: ${error.message}`);
      await this.gracefulShutdown();
      this.forceExit();
    }

    // For non-critical errors, re-throw to allow normal error handling
    throw error;
  }

  /**
   * Legacy method for backward compatibility
   */
  static exitOnDatabaseFailure(error: Error, context: string): never {
    // Use the new sophisticated handler
    this.handleDatabaseError(error, context);
    // This line should never be reached due to the never return type above
    throw error;
  }

  /**
   * Improved database health check that doesn't rely on connection state
   */
  static async checkDatabaseHealth(): Promise<boolean> {
    try {
      // Import database service dynamically to avoid circular dependencies
      const { default: db } = await import('../utils/database');
      
      // Try to perform a simple query directly instead of relying on connection state
      await db.query('SELECT 1 as health_check');
      
      // Reset error state on successful health check
      this.errorState.delete('health-check');
      
      return true;
    } catch (error) {
      console.error('Database health check failed:', (error as Error).message);
      
      // Analyze the error but don't exit on health check failures
      const analysis = this.analyzeError(error as Error, 'health-check');
      
      // Only exit if it's a critical error
      if (analysis.severity === 'CRITICAL') {
        console.error('CRITICAL: Database health check failed with critical error. Exiting.');
        await this.gracefulShutdown();
        this.forceExit();
      }
      
      return false;
    }
  }

  /**
   * Check if an error is database-related
   */
  static isDatabaseError(error: Error): boolean {
    const analysis = this.analyzeError(error, 'classification');
    return analysis.category !== 'APPLICATION';
  }

  /**
   * Graceful shutdown of services before exit
   */
  private static async gracefulShutdown(): Promise<void> {
    try {
      console.log('Database Guardian: Initiating graceful shutdown...');
      
      // Close Redis connections if available
      try {
        const { default: cache } = await import('../utils/cache');
        await cache.disconnect();
        console.log('Database Guardian: Redis connections closed');
      } catch (error) {
        // Redis might not be available, continue shutdown
      }

      // Close database connections if available
      try {
        const { default: db } = await import('../utils/database');
        await db.disconnect();
        console.log('Database Guardian: Database connections closed');
      } catch (error) {
        // Database might already be disconnected
      }

      // Give services time to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('Database Guardian: Graceful shutdown completed');
    } catch (error) {
      console.error('Database Guardian: Error during graceful shutdown:', error);
    }
  }

  /**
   * Force exit the process
   */
  private static forceExit(): never {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }

  /**
   * Get error statistics for monitoring
   */
  static getErrorStats(): Record<string, ErrorState> {
    return Object.fromEntries(this.errorState);
  }

  /**
   * Reset error state (useful for testing)
   */
  static resetErrorState(): void {
    this.errorState.clear();
  }
} 