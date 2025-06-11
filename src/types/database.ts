// Database type definitions for Avail DA Explorer
// Corresponds to the database schema extensions

// ==========================================
// VALIDATORS AND STAKING TYPES
// ==========================================

export interface Validator {
  address: string;
  name?: string;
  commission_rate?: number;
  self_bonded: bigint;
  total_bonded: bigint;
  nominators_count: number;
  is_active: boolean;
  is_waiting: boolean;
  is_slashed: boolean;
  session_keys?: object;
  last_seen_block?: bigint;
  first_seen_block?: bigint;
  created_at: Date;
  updated_at: Date;
}

export interface Nomination {
  id: number;
  nominator_address: string;
  validator_address: string;
  bonded_amount: bigint;
  era: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface NominationPool {
  id: number;
  name?: string;
  root_account?: string;
  nominator_account?: string;
  state_toggler_account?: string;
  member_count: number;
  total_bonded: bigint;
  commission?: number;
  max_members?: number;
  created_at: Date;
  updated_at: Date;
}

export interface PoolMember {
  id: number;
  pool_id: number;
  member_address: string;
  bonded_amount: bigint;
  reward_pool_total_earnings: bigint;
  unbonding_eras?: Array<{ era: number; amount: bigint }>;
  joined_at: Date;
  updated_at: Date;
}

// ==========================================
// DATA AVAILABILITY TYPES
// ==========================================

export interface DataSubmission {
  id: number;
  extrinsic_hash: string;
  block_number: bigint;
  extrinsic_index: number;
  app_id: number;
  rollup_name?: string;
  data_size: bigint;
  data_hash: string;
  submitter: string;
  timestamp: bigint;
  success: boolean;
  blob_data?: Buffer;
  kate_commitment?: string;
  proof?: object;
  created_at: Date;
}

export interface Rollup {
  app_id: number;
  name: string;
  description?: string;
  first_seen_block?: bigint;
  last_active_block?: bigint;
  total_submissions: number;
  total_data_size: bigint;
  total_fees_paid: bigint;
  website?: string;
  logo_url?: string;
  created_at: Date;
  updated_at: Date;
}

// ==========================================
// EVENTS AND LOGS TYPES
// ==========================================

export interface Event {
  id: number;
  block_number: bigint;
  extrinsic_index?: number;
  event_index: number;
  module: string;
  event_name: string;
  data?: object;
  topics?: string[];
  timestamp: bigint;
  created_at: Date;
}

export interface Log {
  id: number;
  block_number: bigint;
  log_index: number;
  log_type: string;
  engine?: string;
  data?: Buffer;
  created_at: Date;
}

// ==========================================
// TRANSFERS AND REWARDS TYPES
// ==========================================

export interface Transfer {
  id: number;
  extrinsic_hash: string;
  block_number: bigint;
  from_address: string;
  to_address: string;
  amount: bigint;
  asset_id: number;
  fee?: bigint;
  success: boolean;
  timestamp: bigint;
  created_at: Date;
}

export interface Reward {
  id: number;
  era: number;
  validator_address: string;
  recipient_address: string;
  reward_type: 'validator' | 'nominator' | 'pool';
  amount: bigint;
  block_number?: bigint;
  timestamp?: bigint;
  claimed: boolean;
  claimed_at?: Date;
  created_at: Date;
}

export interface SlashingEvent {
  id: number;
  era: number;
  validator_address: string;
  slash_amount: bigint;
  reason?: string;
  block_number?: bigint;
  timestamp?: bigint;
  created_at: Date;
}

// ==========================================
// ANALYTICS AND STATISTICS TYPES
// ==========================================

export interface Era {
  era_index: number;
  start_block?: bigint;
  end_block?: bigint;
  start_timestamp?: bigint;
  end_timestamp?: bigint;
  total_stake?: bigint;
  total_reward?: bigint;
  validator_count?: number;
  nominator_count?: number;
  created_at: Date;
}

export interface GasPriceHistory {
  id: number;
  block_number: bigint;
  timestamp: bigint;
  gas_price: bigint;
  gas_used?: bigint;
  gas_limit?: bigint;
  average_fee?: bigint;
  created_at: Date;
}

export interface NetworkStatsSnapshot {
  id: number;
  snapshot_time: Date;
  block_number: bigint;
  total_blocks?: bigint;
  total_extrinsics?: bigint;
  total_data_size?: bigint;
  total_fees?: bigint;
  active_validators?: number;
  total_staked?: bigint;
  inflation_rate?: number;
  network_utilization?: number;
  average_block_time?: number;
  created_at: Date;
}

export interface RollupAnalytics {
  id: number;
  app_id: number;
  period_start: Date;
  period_end: Date;
  period_type: 'hour' | 'day' | 'week' | 'month';
  submission_count: number;
  total_data_size: bigint;
  total_fees: bigint;
  unique_submitters: number;
  average_submission_size: bigint;
  created_at: Date;
}

// ==========================================
// USER FEATURES TYPES
// ==========================================

export interface UserBookmark {
  id: number;
  user_id: string;
  bookmark_type: 'block' | 'extrinsic' | 'account' | 'validator';
  entity_id: string;
  label?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferences {
  user_id: string;
  default_currency: string;
  theme: 'light' | 'dark';
  notifications_enabled: boolean;
  preferred_time_zone: string;
  preferences?: object;
  created_at: Date;
  updated_at: Date;
}

// ==========================================
// ENHANCED EXISTING TYPES
// ==========================================

// Enhanced Block type (extending existing)
export interface BlockWithMetadata extends Block {
  events?: Event[];
  logs?: Log[];
  data_submissions?: DataSubmission[];
  transfers?: Transfer[];
  validator_info?: {
    validator_address?: string;
    validator_name?: string;
  };
}

// Enhanced Extrinsic type (extending existing)
export interface ExtrinsicWithMetadata extends Extrinsic {
  events?: Event[];
  transfers?: Transfer[];
  data_submission?: DataSubmission;
  gas_info?: {
    gas_used?: bigint;
    gas_limit?: bigint;
    gas_price?: bigint;
  };
}

// Enhanced Account type (extending existing)
export interface AccountWithHistory extends Account {
  transfer_history?: Transfer[];
  reward_history?: Reward[];
  nomination_history?: Nomination[];
  bookmarks?: UserBookmark[];
  validator_info?: Validator;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface ValidatorListResponse {
  validators: Validator[];
  total_count: number;
  active_count: number;
  waiting_count: number;
  slashed_count: number;
}

export interface RollupStatsResponse {
  rollup: Rollup;
  analytics: RollupAnalytics[];
  recent_submissions: DataSubmission[];
  total_contributors: number;
}

export interface NetworkAnalyticsResponse {
  current_stats: NetworkStatsSnapshot;
  historical_data: NetworkStatsSnapshot[];
  gas_price_trend: GasPriceHistory[];
  rollup_distribution: Array<{
    app_id: number;
    name: string;
    percentage: number;
    data_size: bigint;
  }>;
}

export interface StakingOverviewResponse {
  total_staked: bigint;
  active_validators: number;
  total_nominators: number;
  current_era: number;
  inflation_rate: number;
  average_commission: number;
  nomination_pools: NominationPool[];
}

// ==========================================
// FILTER AND QUERY TYPES
// ==========================================

export interface DataSubmissionFilters {
  app_id?: number;
  rollup_name?: string;
  submitter?: string;
  start_timestamp?: bigint;
  end_timestamp?: bigint;
  min_size?: bigint;
  max_size?: bigint;
  success?: boolean;
}

export interface ValidatorFilters {
  is_active?: boolean;
  is_waiting?: boolean;
  is_slashed?: boolean;
  min_commission?: number;
  max_commission?: number;
  min_total_bonded?: bigint;
  has_name?: boolean;
}

export interface EventFilters {
  module?: string;
  event_name?: string;
  block_number?: bigint;
  start_timestamp?: bigint;
  end_timestamp?: bigint;
}

export interface TransferFilters {
  from_address?: string;
  to_address?: string;
  asset_id?: number;
  min_amount?: bigint;
  max_amount?: bigint;
  start_timestamp?: bigint;
  end_timestamp?: bigint;
  success?: boolean;
}

// ==========================================
// PAGINATION AND SORTING TYPES
// ==========================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// ==========================================
// EXISTING TYPES (from original types file)
// ==========================================

// Re-export existing types if they exist
export interface Block {
  number: bigint;
  hash: string;
  parent_hash?: string;
  state_root?: string;
  timestamp: bigint;
  extrinsics_count: number;
  created_at: Date;
}

export interface Extrinsic {
  id: number;
  hash: string;
  block_number: bigint;
  extrinsic_index?: number;
  module?: string;
  call?: string;
  success?: boolean;
  timestamp?: bigint;
  signer?: string;
  fee?: bigint;
  created_at: Date;
}

export interface Account {
  address: string;
  balance?: bigint;
  nonce?: number;
  last_updated: Date;
}

// ==========================================
// SYNC STATE TYPES
// ==========================================

export interface SyncState {
  id: number;
  last_synced_block: bigint;
  target_block?: bigint;
  sync_status: 'idle' | 'syncing' | 'paused' | 'error' | 'completed';
  sync_mode: 'full' | 'incremental' | 'live';
  blocks_per_minute?: number;
  estimated_completion?: Date;
  error_count: number;
  last_error?: string;
  last_error_block?: bigint;
  started_at?: Date;
  paused_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SyncProgress {
  current_block: bigint;
  target_block: bigint;
  progress_percentage: number;
  blocks_remaining: bigint;
  estimated_time_remaining?: number; // seconds
  current_speed: number; // blocks per minute
}

export interface SyncMetrics {
  total_blocks_synced: bigint;
  total_errors: number;
  average_blocks_per_minute: number;
  sync_duration: number; // seconds
  last_successful_block: bigint;
  error_rate: number; // percentage
}

// ==========================================
// UTILITY TYPES
// ==========================================

export type DatabaseEntity = 
  | Validator 
  | Nomination 
  | NominationPool 
  | PoolMember
  | DataSubmission 
  | Rollup 
  | Event 
  | Log 
  | Transfer 
  | Reward 
  | SlashingEvent
  | Era 
  | GasPriceHistory 
  | NetworkStatsSnapshot 
  | RollupAnalytics
  | UserBookmark 
  | UserPreferences
  | Block 
  | Extrinsic 
  | Account
  | SyncState;

export type EntityType = 
  | 'validator' 
  | 'nomination' 
  | 'nomination_pool' 
  | 'pool_member'
  | 'data_submission' 
  | 'rollup' 
  | 'event' 
  | 'log' 
  | 'transfer' 
  | 'reward' 
  | 'slashing_event'
  | 'era' 
  | 'gas_price_history' 
  | 'network_stats_snapshot' 
  | 'rollup_analytics'
  | 'user_bookmark' 
  | 'user_preferences'
  | 'block' 
  | 'extrinsic' 
  | 'account'
  | 'sync_state'; 