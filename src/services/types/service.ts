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

// Queue Service Types
export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority?: number;
  delay?: number;
  attempts?: number;
}

export interface QueueJobResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueServiceInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  addJob<T>(type: string, data: T, options?: any): Promise<QueueJob<T>>;
  getStats(): Promise<QueueStats>;
  getHealth(): Promise<{ status: string; stats: QueueStats }>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  clearQueue(): Promise<void>;
}

// Job Types
export enum JobType {
  BLOCK_INDEXING = 'block_indexing',
  EXTRINSIC_PROCESSING = 'extrinsic_processing',
  ANALYTICS_CALCULATION = 'analytics_calculation',
  ROLLUP_STATISTICS = 'rollup_statistics',
  DATA_SYNC = 'data_sync',
  HEALTH_CHECK = 'health_check',
  SYNC_BLOCK_RANGE = 'sync_block_range',
  PROCESS_BLOCK_DATA = 'process_block_data',
  UPDATE_SYNC_STATE = 'update_sync_state',
} 