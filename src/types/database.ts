// Database type definitions for Avail DA Explorer
// Corresponds to the database schema extensions

// ==========================================
// VALIDATORS AND STAKING TYPES
// ==========================================

export interface Validator {
  address: string;
  name?: string;
  commission_rate?: number;
  self_bonded: number;
  total_bonded: number;
  nominators_count: number;
  is_active: boolean;
  is_waiting: boolean;
  is_slashed: boolean;
  session_keys?: object;
  last_seen_block?: number;
  first_seen_block?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Nomination {
  id: number;
  nominator_address: string;
  validator_address: string;
  bonded_amount: number;
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
  total_bonded: number;
  commission?: number;
  max_members?: number;
  created_at: Date;
  updated_at: Date;
}

export interface PoolMember {
  id: number;
  pool_id: number;
  member_address: string;
  bonded_amount: number;
  reward_pool_total_earnings: number;
  unbonding_eras?: Array<{ era: number; amount: number }>;
  joined_at: Date;
  updated_at: Date;
}

// ==========================================
// DATA AVAILABILITY TYPES
// ==========================================

export interface DataSubmission {
  id: number;
  extrinsic_hash: string;
  block_number: number;
  extrinsic_index: number;
  app_id: number;
  rollup_name?: string;
  data_size: number;
  data_hash: string;
  submitter: string;
  timestamp: Date;
  success: boolean;
  blob_data?: Buffer;
  kate_commitment?: string;
  proof?: object;
  created_at: Date;
}

// API Response DataSubmission type (with serialized timestamps)
export interface DataSubmissionApiResponse {
  id: number;
  extrinsic_hash: string;
  block_number: number;
  extrinsic_index: number;
  app_id: number;
  rollup_name?: string;
  data_size: number;
  data_hash: string;
  submitter: string;
  timestamp: string; // ISO string instead of Date
  success: boolean;
  blob_data?: Buffer;
  kate_commitment?: string;
  proof?: object;
  created_at: string; // ISO string instead of Date
}

export interface Rollup {
  app_id: number;
  name: string;
  description?: string;
  first_seen_block?: number;
  last_active_block?: number;
  total_submissions: number;
  total_data_size: number;
  total_fees_paid: number;
  website?: string;
  logo_url?: string;
  created_at: Date;
  updated_at: Date;
}

// API Response Rollup type (with serialized timestamps)
export interface RollupApiResponse {
  app_id: number;
  name: string;
  description?: string;
  first_seen_block?: number;
  last_active_block?: number;
  total_submissions: number;
  total_data_size: number;
  total_fees_paid: number;
  website?: string;
  logo_url?: string;
  created_at: string; // ISO string instead of Date
  updated_at: string; // ISO string instead of Date
}

// ==========================================
// EVENTS AND LOGS TYPES
// ==========================================

export interface Event {
  id: number;
  block_number: number;
  extrinsic_index?: number;
  event_index: number;
  module: string;
  event_name: string;
  data?: object;
  topics?: string[];
  timestamp: Date;
  created_at: Date;
}

export interface Log {
  id: number;
  block_number: number;
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
  block_number: number;
  from_address: string;
  to_address: string;
  amount: number;
  asset_id: number;
  fee?: number;
  success: boolean;
  timestamp: Date;
  created_at: Date;
}

export interface Reward {
  id: number;
  era: number;
  validator_address: string;
  recipient_address: string;
  reward_type: 'validator' | 'nominator' | 'pool';
  amount: number;
  block_number?: number;
  timestamp?: Date;
  claimed: boolean;
  claimed_at?: Date;
  created_at: Date;
}

export interface SlashingEvent {
  id: number;
  era: number;
  validator_address: string;
  slash_amount: number;
  reason?: string;
  block_number?: number;
  timestamp?: Date;
  created_at: Date;
}

// ==========================================
// ANALYTICS AND STATISTICS TYPES
// ==========================================

export interface Era {
  era_index: number;
  start_block?: number;
  end_block?: number;
  start_timestamp?: Date;
  end_timestamp?: Date;
  total_stake?: number;
  total_reward?: number;
  validator_count?: number;
  nominator_count?: number;
  created_at: Date;
}

export interface GasPriceHistory {
  id: number;
  block_number: number;
  timestamp: Date;
  gas_price: number;
  gas_used?: number;
  gas_limit?: number;
  average_fee?: number;
  created_at: Date;
}

export interface NetworkStatsSnapshot {
  id: number;
  snapshot_time: Date;
  block_number: number;
  total_blocks?: number;
  total_extrinsics?: number;
  total_data_size?: number;
  total_fees?: number;
  active_validators?: number;
  total_staked?: number;
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
  total_data_size: number;
  total_fees: number;
  unique_submitters: number;
  average_submission_size: number;
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

// API Response Block type (with serialized timestamps)
export interface BlockApiResponse {
  number: number;
  hash: string;
  parent_hash?: string;
  state_root?: string;
  extrinsics_root?: string; // Add missing extrinsics root
  timestamp: string; // ISO string instead of Date
  extrinsics_count: number;
  created_at: string; // ISO string instead of Date
}

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

// Enhanced Block API Response type (for API responses with metadata)
export interface BlockWithMetadataApiResponse {
  number: number;
  hash: string;
  parent_hash?: string;
  state_root?: string;
  extrinsics_root?: string; // Add missing extrinsics root
  timestamp: string; // ISO string instead of Date
  extrinsics_count: number;
  created_at: string; // ISO string instead of Date
  events?: Event[];
  logs?: Log[];
  data_submissions?: DataSubmission[];
  transfers?: Transfer[];
  validator_info?: {
    validator_address?: string;
    validator_name?: string;
  };
}

// API Response Extrinsic type (with serialized timestamps)
export interface ExtrinsicApiResponse {
  id: number;
  hash: string;
  block_number: number;
  extrinsic_index?: number;
  module?: string;
  call?: string;
  success?: boolean;
  timestamp?: string; // ISO string instead of Date
  signer?: string;
  fee?: number;
  created_at: string; // ISO string instead of Date
}

// Enhanced Extrinsic type (extending existing)
export interface ExtrinsicWithMetadata extends Extrinsic {
  events?: Event[];
  transfers?: Transfer[];
  data_submission?: DataSubmission;
  gas_info?: {
    gas_used?: number;
    gas_limit?: number;
    gas_price?: number;
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
    data_size: number;
  }>;
}

export interface StakingOverviewResponse {
  total_staked: number;
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
  start_timestamp?: number;
  end_timestamp?: number;
  min_size?: number;
  max_size?: number;
  success?: boolean;
}

export interface ValidatorFilters {
  is_active?: boolean;
  is_waiting?: boolean;
  is_slashed?: boolean;
  min_commission?: number;
  max_commission?: number;
  min_total_bonded?: number;
  has_name?: boolean;
}

export interface EventFilters {
  module?: string;
  event_name?: string;
  block_number?: number;
  start_timestamp?: number;
  end_timestamp?: number;
}

export interface TransferFilters {
  from_address?: string;
  to_address?: string;
  asset_id?: number;
  min_amount?: number;
  max_amount?: number;
  start_timestamp?: number;
  end_timestamp?: number;
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
  number: number;
  hash: string;
  parent_hash?: string;
  state_root?: string;
  extrinsics_root?: string;
  timestamp: Date;
  extrinsics_count: number;
  validator_address?: string; // Add validator address field
  created_at: Date;
}

export interface Extrinsic {
  id: number;
  hash: string;
  block_number: number;
  extrinsic_index?: number;
  module?: string;
  call?: string;
  success?: boolean;
  timestamp?: Date;
  signer?: string;
  fee?: number;
  created_at: Date;
}

export interface Account {
  address: string;
  balance?: number;
  nonce?: number;
  last_updated: Date;
}

// ==========================================
// SYNC STATE TYPES
// ==========================================

export interface SyncState {
  id: number;
  last_synced_block: number;
  target_block?: number;
  sync_status: 'idle' | 'syncing' | 'paused' | 'error' | 'completed';
  sync_mode: 'full' | 'incremental' | 'live';
  blocks_per_minute?: number;
  estimated_completion?: Date;
  error_count: number;
  last_error?: string;
  last_error_block?: number;
  started_at?: Date;
  paused_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SyncProgress {
  current_block: number;
  target_block: number;
  progress_percentage: number;
  blocks_remaining: number;
  estimated_time_remaining?: number; // seconds
  current_speed: number; // blocks per minute
}

export interface SyncMetrics {
  total_blocks_synced: number;
  total_errors: number;
  average_blocks_per_minute: number;
  sync_duration: number; // seconds
  last_successful_block: number;
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