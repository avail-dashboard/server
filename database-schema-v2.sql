-- Avail Explorer Database Schema Extensions v2
-- Additional tables for full scope implementation

-- ==========================================
-- VALIDATORS AND STAKING TABLES
-- ==========================================

-- Validators table - Core validator information
CREATE TABLE IF NOT EXISTS validators (
  address VARCHAR(48) PRIMARY KEY,
  name VARCHAR(100),
  commission_rate DECIMAL(8,6), -- Commission as decimal (e.g., 0.05 for 5%)
  self_bonded BIGINT DEFAULT 0,
  total_bonded BIGINT DEFAULT 0,
  nominators_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT false,
  is_waiting BOOLEAN DEFAULT false,
  is_slashed BOOLEAN DEFAULT false,
  session_keys JSONB,
  last_seen_block BIGINT,
  first_seen_block BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for validators
CREATE INDEX IF NOT EXISTS idx_validators_active ON validators(is_active);
CREATE INDEX IF NOT EXISTS idx_validators_commission ON validators(commission_rate);
CREATE INDEX IF NOT EXISTS idx_validators_total_bonded ON validators(total_bonded);

-- Nominations table - Nominator-validator relationships
CREATE TABLE IF NOT EXISTS nominations (
  id SERIAL PRIMARY KEY,
  nominator_address VARCHAR(48) NOT NULL,
  validator_address VARCHAR(48) REFERENCES validators(address),
  bonded_amount BIGINT NOT NULL,
  era INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for nominations
CREATE INDEX IF NOT EXISTS idx_nominations_nominator ON nominations(nominator_address);
CREATE INDEX IF NOT EXISTS idx_nominations_validator ON nominations(validator_address);
CREATE INDEX IF NOT EXISTS idx_nominations_era ON nominations(era);

-- Nomination pools table
CREATE TABLE IF NOT EXISTS nomination_pools (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100),
  root_account VARCHAR(48),
  nominator_account VARCHAR(48),
  state_toggler_account VARCHAR(48),
  member_count INTEGER DEFAULT 0,
  total_bonded BIGINT DEFAULT 0,
  commission DECIMAL(8,6),
  max_members INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pool members table
CREATE TABLE IF NOT EXISTS pool_members (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER REFERENCES nomination_pools(id),
  member_address VARCHAR(48) NOT NULL,
  bonded_amount BIGINT NOT NULL,
  reward_pool_total_earnings BIGINT DEFAULT 0,
  unbonding_eras JSONB, -- Array of {era, amount} objects
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for pool members
CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_address ON pool_members(member_address);

-- ==========================================
-- DATA AVAILABILITY TABLES
-- ==========================================

-- Data submissions table - Enhanced for rollup tracking
CREATE TABLE IF NOT EXISTS data_submissions (
  id SERIAL PRIMARY KEY,
  extrinsic_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  extrinsic_index INTEGER NOT NULL,
  app_id INTEGER NOT NULL,
  rollup_name VARCHAR(100),
  data_size BIGINT NOT NULL,
  data_hash VARCHAR(66) NOT NULL,
  submitter VARCHAR(48) NOT NULL,
  timestamp BIGINT NOT NULL,
  success BOOLEAN DEFAULT true,
  blob_data BYTEA, -- Optional: store actual blob data
  kate_commitment VARCHAR(132), -- Kate commitment hash
  proof JSONB, -- DA proof data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for data submissions
CREATE INDEX IF NOT EXISTS idx_data_submissions_block ON data_submissions(block_number);
CREATE INDEX IF NOT EXISTS idx_data_submissions_app_id ON data_submissions(app_id);
CREATE INDEX IF NOT EXISTS idx_data_submissions_submitter ON data_submissions(submitter);
CREATE INDEX IF NOT EXISTS idx_data_submissions_timestamp ON data_submissions(timestamp);
CREATE INDEX IF NOT EXISTS idx_data_submissions_rollup ON data_submissions(rollup_name);

-- Rollups/App spaces table
CREATE TABLE IF NOT EXISTS rollups (
  app_id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  first_seen_block BIGINT,
  last_active_block BIGINT,
  total_submissions INTEGER DEFAULT 0,
  total_data_size BIGINT DEFAULT 0,
  total_fees_paid BIGINT DEFAULT 0,
  website VARCHAR(255),
  logo_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- EVENTS AND LOGS TABLES
-- ==========================================

-- Events table - Blockchain events from extrinsics
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  block_number BIGINT NOT NULL,
  extrinsic_index INTEGER,
  event_index INTEGER NOT NULL,
  module VARCHAR(50) NOT NULL,
  event_name VARCHAR(50) NOT NULL,
  data JSONB,
  topics VARCHAR(66)[], -- Array of topics/indexed parameters
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number);
CREATE INDEX IF NOT EXISTS idx_events_module ON events(module);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

-- Logs table - Runtime logs and system logs
CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  log_type VARCHAR(20) NOT NULL, -- 'PreRuntime', 'Consensus', 'Seal', etc.
  engine VARCHAR(20),
  data BYTEA,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for logs
CREATE INDEX IF NOT EXISTS idx_logs_block ON logs(block_number);
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type);

-- ==========================================
-- TRANSFERS AND REWARDS TABLES
-- ==========================================

-- Transfers table - AVAIL token transfers
CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  extrinsic_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  from_address VARCHAR(48) NOT NULL,
  to_address VARCHAR(48) NOT NULL,
  amount BIGINT NOT NULL,
  asset_id INTEGER DEFAULT 0, -- 0 for native AVAIL
  fee BIGINT,
  success BOOLEAN DEFAULT true,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transfers
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_transfers_block ON transfers(block_number);
CREATE INDEX IF NOT EXISTS idx_transfers_timestamp ON transfers(timestamp);

-- Rewards table - Staking rewards and payouts
CREATE TABLE IF NOT EXISTS rewards (
  id SERIAL PRIMARY KEY,
  era INTEGER NOT NULL,
  validator_address VARCHAR(48) NOT NULL,
  recipient_address VARCHAR(48) NOT NULL,
  reward_type VARCHAR(20) NOT NULL, -- 'validator', 'nominator', 'pool'
  amount BIGINT NOT NULL,
  block_number BIGINT,
  timestamp BIGINT,
  claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rewards
CREATE INDEX IF NOT EXISTS idx_rewards_era ON rewards(era);
CREATE INDEX IF NOT EXISTS idx_rewards_validator ON rewards(validator_address);
CREATE INDEX IF NOT EXISTS idx_rewards_recipient ON rewards(recipient_address);

-- Slashing events table
CREATE TABLE IF NOT EXISTS slashing_events (
  id SERIAL PRIMARY KEY,
  era INTEGER NOT NULL,
  validator_address VARCHAR(48) NOT NULL,
  slash_amount BIGINT NOT NULL,
  reason VARCHAR(50), -- 'offline', 'equivocation', etc.
  block_number BIGINT,
  timestamp BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for slashing events
CREATE INDEX IF NOT EXISTS idx_slashing_era ON slashing_events(era);
CREATE INDEX IF NOT EXISTS idx_slashing_validator ON slashing_events(validator_address);

-- ==========================================
-- ANALYTICS AND STATISTICS TABLES
-- ==========================================

-- Eras table - Era information and statistics
CREATE TABLE IF NOT EXISTS eras (
  era_index INTEGER PRIMARY KEY,
  start_block BIGINT,
  end_block BIGINT,
  start_timestamp BIGINT,
  end_timestamp BIGINT,
  total_stake BIGINT,
  total_reward BIGINT,
  validator_count INTEGER,
  nominator_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gas price history table
CREATE TABLE IF NOT EXISTS gas_price_history (
  id SERIAL PRIMARY KEY,
  block_number BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  gas_price BIGINT NOT NULL,
  gas_used BIGINT,
  gas_limit BIGINT,
  average_fee BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for gas price history
CREATE INDEX IF NOT EXISTS idx_gas_price_timestamp ON gas_price_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_gas_price_block ON gas_price_history(block_number);

-- Network statistics snapshots - Periodic network statistics
CREATE TABLE IF NOT EXISTS network_stats_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_time TIMESTAMP NOT NULL,
  block_number BIGINT NOT NULL,
  total_blocks BIGINT,
  total_extrinsics BIGINT,
  total_data_size BIGINT,
  total_fees BIGINT,
  active_validators INTEGER,
  total_staked BIGINT,
  inflation_rate DECIMAL(8,6),
  network_utilization DECIMAL(5,4), -- Percentage as decimal
  average_block_time DECIMAL(8,2), -- In seconds
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for network snapshots
CREATE INDEX IF NOT EXISTS idx_network_snapshots_time ON network_stats_snapshots(snapshot_time);
CREATE INDEX IF NOT EXISTS idx_network_snapshots_block ON network_stats_snapshots(block_number);

-- Rollup analytics snapshots - Daily/hourly rollup statistics
CREATE TABLE IF NOT EXISTS rollup_analytics (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  period_type VARCHAR(10) NOT NULL, -- 'hour', 'day', 'week', 'month'
  submission_count INTEGER DEFAULT 0,
  total_data_size BIGINT DEFAULT 0,
  total_fees BIGINT DEFAULT 0,
  unique_submitters INTEGER DEFAULT 0,
  average_submission_size BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rollup analytics
CREATE INDEX IF NOT EXISTS idx_rollup_analytics_app ON rollup_analytics(app_id);
CREATE INDEX IF NOT EXISTS idx_rollup_analytics_period ON rollup_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_rollup_analytics_type ON rollup_analytics(period_type);

-- ==========================================
-- USER FEATURES TABLES
-- ==========================================

-- Enhanced watchlists table
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  bookmark_type VARCHAR(20) NOT NULL, -- 'block', 'extrinsic', 'account', 'validator'
  entity_id VARCHAR(100) NOT NULL, -- Block number, extrinsic hash, address, etc.
  label VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_type ON user_bookmarks(bookmark_type);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(255) PRIMARY KEY,
  default_currency VARCHAR(10) DEFAULT 'USD',
  theme VARCHAR(10) DEFAULT 'light',
  notifications_enabled BOOLEAN DEFAULT true,
  preferred_time_zone VARCHAR(50) DEFAULT 'UTC',
  preferences JSONB, -- Additional flexible preferences
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

-- Grant permissions to the avail_user for all new tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO avail_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO avail_user;

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers for tables with updated_at columns
CREATE TRIGGER update_validators_updated_at BEFORE UPDATE ON validators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_nominations_updated_at BEFORE UPDATE ON nominations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_nomination_pools_updated_at BEFORE UPDATE ON nomination_pools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pool_members_updated_at BEFORE UPDATE ON pool_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rollups_updated_at BEFORE UPDATE ON rollups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookmarks_updated_at BEFORE UPDATE ON user_bookmarks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 