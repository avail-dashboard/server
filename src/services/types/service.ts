// Common service interfaces and types

export interface ServiceHealth {
  healthy: boolean;
  lastCheck: Date;
  error?: string;
  details?: Record<string, any>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialFactor: number;
  jitterEnabled: boolean;
}

export interface ServiceConfig {
  retryConfig: RetryConfig;
  healthCheckInterval: number;
  timeout: number;
}

export interface BaseService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): Promise<ServiceHealth>;
  isHealthy(): boolean;
}

export interface ConnectionProvider {
  url: string;
  type: 'http' | 'ws';
  priority: number;
  region?: string;
  provider: string;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

export interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  uptime: number;
}

export type ServiceStatus = 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';

export interface ServiceLifecycle {
  status: ServiceStatus;
  startedAt?: Date;
  stoppedAt?: Date;
  restartCount: number;
} 