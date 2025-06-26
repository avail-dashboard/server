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

// Enhanced Job Options with Retry Strategy Support
export interface EnhancedJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  retryStrategy?: Partial<RetryConfig>;
  skipDeadLetter?: boolean;
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  backoff?: string | { type: string; delay?: number };
  repeat?: any;
  debounce?: any;
  jobId?: string;
  preventParsingData?: boolean;
}

// Dead Letter Queue Types
export interface DeadLetterJob {
  originalJobId: string;
  jobType: string;
  jobData: any;
  failureReason: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  retryStrategy: RetryConfig;
}

// Retry Strategy Type Alias (for compatibility with utils/retry.ts)
export type { RetryConfig as RetryStrategy };

// Job Priority Levels
export enum JobPriority {
  CRITICAL = 1,    // Dependencies, core data
  HIGH = 5,        // Block processing
  MEDIUM = 10,     // Standard processing  
  LOW = 15         // Analytics, cleanup
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
  // Phase 1: Queue Integration - New job type for block domain processing
  PROCESS_BLOCK_DOMAINS = 'process_block_domains',
  // Phase 2: Simplified Dependency Management Job Types - TASK-010 Implementation
  DEPENDENCY_DETECTION = 'dependency_detection',
  DEPENDENCY_RESOLUTION = 'dependency_resolution',
  DEPENDENCY_BATCH_RESOLUTION = 'dependency_batch_resolution',
  // Phase 3: TASK-012 Simple Dependency Creation Jobs
  ENSURE_BLOCK = 'ensure_block',
  ENSURE_ACCOUNT = 'ensure_account',
  ENSURE_ROLLUP = 'ensure_rollup',
  ENSURE_VALIDATOR = 'ensure_validator',
  // Note: Removed DEPENDENCY_GAP_ANALYSIS and DEPENDENCY_CONSISTENCY_CHECK 
  // as part of TASK-010 simplification - functionality consolidated into core processors
} 