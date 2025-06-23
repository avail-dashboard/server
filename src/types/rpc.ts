// RPC types for Avail blockchain using avail-js-sdk

// Connection Management Types
export interface RPCConnection {
  id: string;
  provider: any;
  api: any;
  endpoint: string;
  isConnected: boolean;
  isHealthy: boolean;
  lastHealthCheck: Date;
  connectionAttempts: number;
  lastError?: Error;
  metrics: ConnectionMetrics;
}

export interface ConnectionMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  uptime: number;
  reconnections: number;
}

export interface RPCConnectionConfig {
  endpoints: string[];
  reconnectAttempts: number;
  timeout: number;
  maxConnections: number;
  healthCheckInterval: number;
  subscriptionTimeout: number;
  batchSize: number;
  retryDelay: number;
  maxRetryDelay: number;
  connectionPoolSize: number;
}

// RPC Method Types
export interface RPCMethodCall {
  method: string;
  params: any[];
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'normal' | 'high';
}

export interface RPCMethodResponse<T = any> {
  success: boolean;
  data?: T;
  error?: RPCError;
  metadata: {
    method: string;
    duration: number;
    endpoint: string;
    cached: boolean;
    timestamp: Date;
  };
}

export interface RPCError {
  code: number;
  message: string;
  data?: any;
  endpoint?: string;
}

// Avail-Specific Types
export interface AvailBlock {
  header: AvailBlockHeader;
  extrinsics: AvailExtrinsic[];
  justifications?: any;
}

export interface AvailBlockHeader {
  parentHash: string;
  number: string;
  stateRoot: string;
  extrinsicsRoot: string;
  digest: {
    logs: any[];
  };
  extension: {
    rows: number;
    cols: number;
    dataRoot: string;
    commitments: string[];
    appLookup: {
      size: number;
      index: AppDataIndex[];
    };
  };
}

export interface AppDataIndex {
  appId: number;
  start: number;
  end: number;
}

export interface AvailExtrinsic {
  method: {
    section: string;
    method: string;
    args: any;
  };
  signature?: {
    signer: string;
    signature: string;
    era: any;
    nonce: string;
    tip: string;
  };
  isSigned: boolean;
  hash: string;
}

export interface DataAvailabilityProof {
  proof: string[];
  numberOfLeaves: number;
  leafIndex: number;
  leaf: string;
}

export interface ApplicationData {
  appId: number;
  data: string;
  extrinsicIndex: number;
}

// Subscription Types
export interface RPCSubscription {
  id: string;
  method: string;
  params: any[];
  callback: (data: any) => void;
  errorCallback?: (error: Error) => void;
  isActive: boolean;
  subscriptionId?: string;
  createdAt: Date;
  lastUpdate?: Date;
}

export interface SubscriptionManager {
  subscriptions: Map<string, RPCSubscription>;
  subscribe<T>(
    method: string,
    params: any[],
    callback: (data: T) => void,
    errorCallback?: (error: Error) => void
  ): Promise<string>;
  unsubscribe(id: string): Promise<boolean>;
  unsubscribeAll(): Promise<void>;
  getActiveSubscriptions(): RPCSubscription[];
}

// Chain State Types
export interface ChainState {
  blockNumber: number;
  blockHash: string;
  finalizedBlockNumber: number;
  finalizedBlockHash: string;
  peers: number;
  isSyncing: boolean;
  syncState: SyncState;
}

export interface SyncState {
  startingBlock: number;
  currentBlock: number;
  highestBlock: number;
}

// Validator Types
export interface ValidatorInfo {
  accountId: string;
  validatorPrefs: {
    commission: string;
    blocked: boolean;
  };
  exposure: {
    total: string;
    own: string;
    others: NominatorInfo[];
  };
  identity?: IdentityInfo;
  nextKeys?: string;
  queuedKeys?: string;
}

export interface NominatorInfo {
  who: string;
  value: string;
}

export interface IdentityInfo {
  display?: string;
  legal?: string;
  web?: string;
  riot?: string;
  email?: string;
  pgpFingerprint?: string;
  image?: string;
  twitter?: string;
}

// Account Types
export interface AccountInfo {
  nonce: string;
  consumers: string;
  providers: string;
  sufficients: string;
  data: {
    free: string;
    reserved: string;
    miscFrozen: string;
    feeFrozen: string;
  };
}

export interface AccountBalance {
  free: string;
  reserved: string;
  miscFrozen: string;
  feeFrozen: string;
  total: string;
  transferable: string;
}

// Event Types
export interface ChainEvent {
  phase: {
    applyExtrinsic?: number;
    finalization?: boolean;
    initialization?: boolean;
  };
  event: {
    section: string;
    method: string;
    data: any[];
    index: string;
  };
  topics: string[];
}

// Runtime Types
export interface RuntimeVersion {
  specName: string;
  implName: string;
  authoringVersion: number;
  specVersion: number;
  implVersion: number;
  apis: [string, number][];
  transactionVersion: number;
  stateVersion: number;
}

export interface RuntimeMetadata {
  magicNumber: number;
  version: number;
  modules: RuntimeModule[];
}

export interface RuntimeModule {
  name: string;
  storage?: StorageMetadata;
  calls?: CallMetadata[];
  events?: EventMetadata[];
  constants?: ConstantMetadata[];
  errors?: ErrorMetadata[];
}

export interface StorageMetadata {
  prefix: string;
  items: StorageItem[];
}

export interface StorageItem {
  name: string;
  modifier: string;
  type: any;
  fallback: string;
  documentation: string[];
}

export interface CallMetadata {
  name: string;
  args: CallArg[];
  documentation: string[];
}

export interface CallArg {
  name: string;
  type: string;
}

export interface EventMetadata {
  name: string;
  args: string[];
  documentation: string[];
}

export interface ConstantMetadata {
  name: string;
  type: string;
  value: string;
  documentation: string[];
}

export interface ErrorMetadata {
  name: string;
  documentation: string[];
}

// Cache Types
export interface RPCCacheEntry<T = any> {
  data: T;
  timestamp: Date;
  ttl: number;
  method: string;
  params: any[];
  size: number;
}

export interface RPCCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSize: number;
  evictions: number;
}

// Batch Request Types
export interface BatchRequest {
  id: string;
  requests: RPCMethodCall[];
  priority: 'low' | 'normal' | 'high';
  timeout: number;
  createdAt: Date;
}

export interface BatchResponse {
  id: string;
  responses: RPCMethodResponse[];
  duration: number;
  completedAt: Date;
}

// Health Check Types
export interface HealthCheckResult {
  endpoint: string;
  isHealthy: boolean;
  responseTime: number;
  blockNumber?: number;
  error?: string;
  timestamp: Date;
}

// Performance Metrics
export interface RPCMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  activeConnections: number;
  activeSubscriptions: number;
  cacheStats: RPCCacheStats;
  connectionStats: ConnectionMetrics[];
  lastUpdated: Date;
}

// Configuration Types
export interface RPCServiceConfig {
  connection: RPCConnectionConfig;
  cache: {
    enabled: boolean;
    maxSize: number;
    defaultTTL: number;
    cleanupInterval: number;
  };
  batch: {
    enabled: boolean;
    maxSize: number;
    timeout: number;
    flushInterval: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

// RPC types for Avail blockchain

export interface AvailRpcConfig {
  endpoint: string;
  timeout: number;
  retries: number;
}

export interface RpcProvider {
  url: string;
  type: 'ws' | 'http';
  isConnected: boolean;
}

export interface RpcResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
  jsonrpc: string;
}

export interface RpcRequest {
  method: string;
  params?: any[];
  id: string | number;
  jsonrpc: string;
} 