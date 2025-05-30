// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
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
  number: bigint;
  hash: string;
  parentHash: string;
  stateRoot: string;
  timestamp: bigint;
  extrinsicsCount: number;
  extrinsicsRoot?: string;
  authorId?: string;
  size?: number;
  weight?: string;
  spec?: number;
  finalized?: boolean;
}

export interface Extrinsic {
  id?: number;
  hash: string;
  blockNumber: bigint;
  extrinsicIndex: number;
  module: string;
  call: string;
  success: boolean;
  timestamp: bigint;
  signer: string;
  fee: bigint;
  args?: any;
  events?: ExtrinsicEvent[];
  tip?: bigint;
  signature?: string;
  isSigned?: boolean;
  isUserTransaction?: boolean;
}

export interface ExtrinsicEvent {
  extrinsicIndex?: number;
  eventIndex: number;
  module: string;
  event: string;
  phase: string;
  data?: any;
}

export interface Account {
  address: string;
  balance: bigint;
  nonce: number;
  lastUpdated?: Date;
  accountInfo?: {
    free: bigint;
    reserved: bigint;
    frozen: bigint;
    flags: bigint;
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
  selfStake?: bigint;
  totalStake?: bigint;
  active?: boolean;
  nominators?: number;
  ownStake?: bigint;
  othersStake?: bigint;
  prefs?: ValidatorPrefs;
}

export interface ValidatorPrefs {
  commission: string;
  blocked: boolean;
}

export interface ChainStats {
  blockHeight: bigint;
  blockTime: number;
  totalIssuance: bigint;
  activeValidators: number;
  nominators: number;
  minimumStake: bigint;
  averageStake: bigint;
  inflation: number;
  stakingRatio: number;
  lastUpdateTime: bigint;
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
  payload?: any;
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
  details?: any;
  source?: DataSource;
}

// Express Request Extensions
export interface RequestUser {
  id: string;
  address?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      startTime?: number;
    }
  }
}

// Database Models
export interface BlockModel {
  number: bigint;
  hash: string;
  parent_hash: string;
  state_root: string;
  timestamp: bigint;
  extrinsics_count: number;
  created_at: Date;
}

export interface ExtrinsicModel {
  id: number;
  hash: string;
  block_number: bigint;
  extrinsic_index: number;
  module: string;
  call: string;
  success: boolean;
  timestamp: bigint;
  signer: string;
  fee: bigint;
  created_at: Date;
}

export interface AccountModel {
  address: string;
  balance: bigint;
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
  balance: bigint;
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
  volume: bigint;
  uniqueAccounts: number;
}

export interface AnalyticsData {
  tokenDistribution: TokenDistribution[];
  blocksPerDay: BlocksPerDay[];
  transactionVolume: TransactionVolume[];
}

// Data Submission Types
export interface DataSubmission {
  extrinsicId: string;
  blockNumber: bigint;
  extrinsicIndex: number;
  appId: number;
  size: number; // in bytes
  dataHash: string;
  submitter: string;
  timestamp: bigint;
  success: boolean;
  data?: string; // optional raw data
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
  totalDataSize: number; // in bytes
  uniqueApps: number;
  uniqueSubmitters: number;
  averageSize: number;
  submissionsToday: number;
  dataSizeToday: number;
} 