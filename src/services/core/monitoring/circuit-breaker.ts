import { logger } from '../../../utils/logger';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  averageResponseTime: number;
  state: CircuitBreakerState;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Phase 4: Circuit Breaker for Error Resilience
 * 
 * Provides protection against cascading failures by:
 * - Monitoring service health and failure rates
 * - Opening circuit when failure threshold is exceeded
 * - Providing graceful degradation during outages
 * - Automatic recovery testing with half-open state
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private metrics: CircuitBreakerMetrics;
  private config: CircuitBreakerConfig;
  private lastFailureTime: number;
  private halfOpenCallCount: number;
  private recentCalls: boolean[]; // true for success, false for failure

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = {
      failureThreshold: 0.5, // 50% failure rate
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
      halfOpenMaxCalls: 3,
      ...config,
    };

    this.state = CircuitBreakerState.CLOSED;
    this.metrics = this.initializeMetrics();
    this.lastFailureTime = 0;
    this.halfOpenCallCount = 0;
    this.recentCalls = [];

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async executeWithBreaker<T>(
    domain: string,
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      this.metrics.rejectedCalls++;
      
      logger.warn('Circuit breaker is open, rejecting call', {
        circuitBreaker: this.name,
        domain,
        operation,
        state: this.state,
      });
      
      throw new Error(`Circuit breaker is open for ${this.name}`);
    }

    // Check if we should transition to half-open
    if (this.shouldTransitionToHalfOpen()) {
      this.transitionToHalfOpen();
    }

    // Limit calls in half-open state
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCallCount >= this.config.halfOpenMaxCalls) {
        this.metrics.rejectedCalls++;
        throw new Error(`Circuit breaker half-open call limit exceeded for ${this.name}`);
      }
      this.halfOpenCallCount++;
    }

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.recordSuccess(duration);
      
      // If half-open and successful, consider closing
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.transitionToClosed();
      }

      logger.debug('Circuit breaker call succeeded', {
        circuitBreaker: this.name,
        domain,
        operation,
        duration,
        state: this.state,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.recordFailure(duration);
      
      // Check if we should open the circuit
      if (this.shouldOpenCircuit()) {
        this.transitionToOpen();
      }

      logger.error('Circuit breaker call failed', {
        circuitBreaker: this.name,
        domain,
        operation,
        duration,
        state: this.state,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.transitionToClosed();
    this.metrics = this.initializeMetrics();
    this.recentCalls = [];
    
    logger.info('Circuit breaker manually reset', {
      circuitBreaker: this.name,
    });
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  private initializeMetrics(): CircuitBreakerMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      averageResponseTime: 0,
      state: this.state,
    };
  }

  private recordSuccess(duration: number): void {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls++;
    this.metrics.lastSuccessTime = Date.now();
    this.updateAverageResponseTime(duration);
    this.recentCalls.push(true);
    this.trimRecentCalls();
  }

  private recordFailure(duration: number): void {
    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    this.metrics.lastFailureTime = Date.now();
    this.lastFailureTime = Date.now();
    this.updateAverageResponseTime(duration);
    this.recentCalls.push(false);
    this.trimRecentCalls();
  }

  private updateAverageResponseTime(duration: number): void {
    const totalCalls = this.metrics.totalCalls;
    const currentAvg = this.metrics.averageResponseTime;
    
    this.metrics.averageResponseTime = 
      (currentAvg * (totalCalls - 1) + duration) / totalCalls;
  }

  private trimRecentCalls(): void {
    // Keep only calls from the monitoring period
    const maxCalls = Math.ceil(this.config.monitoringPeriod / 1000); // Estimate based on period
    if (this.recentCalls.length > maxCalls) {
      this.recentCalls = this.recentCalls.slice(-maxCalls);
    }
  }

  private shouldOpenCircuit(): boolean {
    if (this.recentCalls.length < 5) return false; // Need minimum calls
    
    const recentFailures = this.recentCalls.filter(call => !call).length;
    const failureRate = recentFailures / this.recentCalls.length;
    
    return failureRate >= this.config.failureThreshold;
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (this.state !== CircuitBreakerState.OPEN) return false;
    
    const timeSinceFailure = Date.now() - this.lastFailureTime;
    return timeSinceFailure >= this.config.resetTimeout;
  }

  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.metrics.state = this.state;
    
    logger.warn('Circuit breaker opened', {
      circuitBreaker: this.name,
      metrics: this.metrics,
    });
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.metrics.state = this.state;
    this.halfOpenCallCount = 0;
    
    logger.info('Circuit breaker transitioned to half-open', {
      circuitBreaker: this.name,
    });
  }

  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.metrics.state = this.state;
    this.halfOpenCallCount = 0;
    
    logger.info('Circuit breaker closed', {
      circuitBreaker: this.name,
    });
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update every 5 seconds
  }

  private updateMetrics(): void {
    this.metrics.state = this.state;
    
    // Log metrics periodically for monitoring
    if (this.metrics.totalCalls > 0) {
      logger.debug('Circuit breaker metrics', {
        circuitBreaker: this.name,
        metrics: this.metrics,
      });
    }
  }
} 