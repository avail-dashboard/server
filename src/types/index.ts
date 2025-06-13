// API Response Types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    cached?: boolean;
    source?: DataSource;
    period?: string;
    granularity?: string;
    note?: string;
    app_id?: string;
  };
}

export type DataSource = 'rpc' | 'cache' | 'database';

// Blockchain Data Types
export interface Block {
  hash: string;
  number: number;
  parentHash: string;
  stateRoot: string;
  timestamp: Date;
  extrinsicsCount: number;
  extrinsicsRoot?: string;
  authorId?: string;
  size?: number;
  weight?: string;
  spec?: number;
  finalized?: boolean;
}

export interface Extrinsic {
  hash: string;
  index: number;
  blockNumber: number;
  module: string;
  method: string;
  args: any[];
  timestamp: Date;
  signer?: string;
  fee: number;
  success: boolean;
  tip?: number;
  error?: string;
  events?: ExtrinsicEvent[];
}

export interface ExtrinsicEvent {
  extrinsicIndex?: number;
  eventIndex: number;
  module: string;
  event: string;
  phase: string;
  data?: Record<string, unknown>;
}

export interface Account {
  address: string;
  balance: number;
  nonce: number;
  lastUpdated?: Date;
  accountInfo?: {
    free: number;
    reserved: number;
    frozen: number;
    flags: number;
  };
}

export interface Validator {
  address: string;
  identity?: {
    display?: string;
    email?: string;
    web?: string;
    twitter?: string;
  };
  commission?: string;
  selfStake?: number;
  totalStake?: number;
  active?: boolean;
  nominators?: number;
  ownStake?: number;
  othersStake?: number;
  prefs?: ValidatorPrefs;
}

export interface ValidatorPrefs {
  commission: string;
  blocked: boolean;
}

export interface ChainStats {
  blockHeight: number;
  blockTime: number;
  totalIssuance: number;
  activeValidators: number;
  nominators: number;
  minimumStake: number;
  averageStake: number;
  inflation: number;
  stakingRatio: number;
  lastUpdateTime: Date;
}

// Configuration Types
export interface DataSourceConfig {
  rpc: {
    endpoint: string;
    reconnectAttempts: number;
    timeout: number;
  };
}

export interface CacheConfig {
  redis: {
    url: string;
    queueDb: number;
  };
  ttl: {
    blocks: number;
    blockByNumber: number;
    blockByHash: number;
    chainStats: number;
    accountBalance: number;
    validators: number;
    tokenPrice: number;
  };
}

// Query Parameters
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface BlocksQuery extends PaginationParams {
  from?: number;
  to?: number;
  orderBy?: 'number' | 'timestamp';
  order?: 'asc' | 'desc';
}

export interface ExtrinsicsQuery extends PaginationParams {
  blockNumber?: number;
  module?: string;
  call?: string;
  signer?: string;
  success?: boolean;
  from?: number;
  to?: number;
}

export interface SearchParams {
  q: string;
  type?: 'all' | 'block' | 'extrinsic' | 'account';
  limit?: number;
}

// WebSocket Types
export interface SocketEvents {
  newBlock: Block;
  newExtrinsic: Extrinsic;
  chainStats: ChainStats;
  priceUpdate: TokenPrice;
}

export interface TokenPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: Date;
}

// Background Job Types
export interface JobData {
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  delay?: number;
  attempts?: number;
}

export interface SyncJobData extends JobData {
  type: 'sync-latest-blocks' | 'sync-chain-stats' | 'sync-validators' | 'sync-token-price';
}

export interface CleanupJobData extends JobData {
  type: 'cleanup-old-cache' | 'cleanup-old-logs';
}

export interface AnalyticsJobData extends JobData {
  type: 'calculate-daily-stats' | 'update-search-index';
}

// Error Types
export interface APIError extends Error {
  code: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  source?: DataSource;
}

// Express Request Extensions
export interface RequestUser {
  id: string;
  address?: string;
}

// Extend Express Request interface
declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
    startTime?: number;
  }
}

// Database Models
export interface BlockModel {
  number: number;
  hash: string;
  parent_hash: string;
  state_root: string;
  timestamp: Date;
  extrinsics_count: number;
  created_at: Date;
}

export interface ExtrinsicModel {
  id: number;
  hash: string;
  block_number: number;
  extrinsic_index: number;
  module: string;
  call: string;
  success: boolean;
  timestamp: Date;
  signer: string;
  fee: number;
  created_at: Date;
}

export interface AccountModel {
  address: string;
  balance: number;
  nonce: number;
  last_updated: Date;
}

export interface WatchlistModel {
  id: number;
  user_id: string;
  address: string;
  label: string;
  created_at: Date;
}

// Analytics Types
export interface TokenDistribution {
  address: string;
  balance: number;
  percentage: number;
}

export interface BlocksPerDay {
  date: string;
  count: number;
  avgBlockTime: number;
}

export interface TransactionVolume {
  date: string;
  count: number;
  volume: number;
  uniqueAccounts: number;
}

export interface AnalyticsData {
  tokenDistribution: TokenDistribution[];
  blocksPerDay: BlocksPerDay[];
  transactionVolume: TransactionVolume[];
}

// Data Submission Types
export interface DataSubmission {
  id: number;
  extrinsicHash: string;
  blockNumber: number;
  appId: number;
  dataSize: number;
  dataHash: string;
  submitter: string;
  timestamp: Date;
  success: boolean;
}

export interface DataSubmissionQuery extends PaginationParams {
  appId?: number;
  submitter?: string;
  minSize?: number;
  maxSize?: number;
  from?: number;
  to?: number;
  orderBy?: 'timestamp' | 'size' | 'appId';
  order?: 'asc' | 'desc';
}

export interface DataSubmissionStats {
  totalSubmissions: number;
  totalDataSize: number;
  uniqueApps: number;
  uniqueSubmitters: number;
  averageSize: number;
  submissionsToday: number;
  dataSizeToday: number;
}

// New blockchain types
export interface AccountInfo {
  address: string;
  nonce: number;
  consumers: number;
  providers: number;
  sufficients: number;
  data: {
    free: number;
    reserved: number;
    frozen: number;
    flags: number;
  };
}

export interface AccountBalance {
  address: string;
  balance: number;
  nonce: number;
  free: number;
  reserved: number;
  frozen: number;
  flags: number;
}

export interface ValidatorInfo {
  address: string;
  commission: number;
  blocked: boolean;
  selfStake?: number;
  totalStake?: number;
  nominators: string[];
  ownStake?: number;
  othersStake?: number;
}

export interface StakingInfo {
  era: number;
  blockHeight: number;
  sessionIndex: number;
  totalIssuance: number;
  activeStake: number;
  minimumStake: number;
  averageStake: number;
  validatorCount: number;
  nominatorCount: number;
  lastUpdateTime: Date;
}

export interface Event {
  index: number;
  phase: string;
  section: string;
  method: string;
  data: any[];
  topics: string[];
}

export interface NetworkStats {
  totalBlocks: number;
  totalExtrinsics: number;
  totalAccounts: number;
  totalValidators: number;
  totalNominators: number;
  totalStaked: number;
  averageBlockTime: number;
  lastBlockTime: Date;
}

export interface Rollup {
  appId: number;
  name: string;
  description?: string;
  totalSubmissions: number;
  totalDataSize: number;
  lastActiveBlock?: number;
  firstSeenBlock?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SearchFilters {
  query?: string;
  type?: 'block' | 'extrinsic' | 'account' | 'validator';
  page?: number;
  limit?: number;
}

export interface BlockFilters {
  fromBlock?: number;
  toBlock?: number;
  fromDate?: Date;
  toDate?: Date;
}

export interface ExtrinsicFilters {
  blockNumber?: number;
  module?: string;
  method?: string;
  signer?: string;
  success?: boolean;
}

export interface DbBlock {
  number: number;
  hash: string;
  parentHash?: string;
  stateRoot?: string;
  timestamp: Date;
  extrinsicsCount: number;
  createdAt: Date;
}

export interface DbExtrinsic {
  id: number;
  hash: string;
  block_number: number;
  extrinsic_index?: number;
  module?: string;
  call?: string;
  success?: boolean;
  timestamp: Date;
  signer?: string;
  fee: number;
  created_at: Date;
}

export interface DbAccount {
  address: string;
  balance: number;
  nonce?: number;
  last_updated: Date;
}

export interface BlockMetrics {
  averageBlockTime: number;
  blocksPerHour: number;
  totalBlocks: number;
  latestBlock: number;
}

export interface ExtrinsicMetrics {
  totalExtrinsics: number;
  successRate: number;
  averageFee: number;
  volume: number;
  topModules: Array<{
    module: string;
    count: number;
  }>;
}

export interface DataAvailabilityMetrics {
  totalSubmissions: number;
  totalDataSize: number;
  averageSubmissionSize: number;
  topRollups: Array<{
    appId: number;
    name: string;
    submissions: number;
    dataSize: number;
  }>;
}

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: Date;
}

export interface NewBlockEvent extends WebSocketEvent {
  type: 'new_block';
  data: {
    blockNumber: number;
    blockHash: string;
    timestamp: Date;
    extrinsicsCount: number;
  };
}

export interface NewExtrinsicEvent extends WebSocketEvent {
  type: 'new_extrinsic';
  data: {
    hash: string;
    blockNumber: number;
    module: string;
    method: string;
    success: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ValidationError extends ApiError {
  field: string;
  value: any;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface BlockchainConfig {
  wsEndpoint: string;
  httpEndpoint?: string;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
} 