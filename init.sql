-- Avail Explorer Database Schema
-- PostgreSQL initialization script

-- Blocks table
CREATE TABLE IF NOT EXISTS blocks (
  number BIGINT PRIMARY KEY,
  hash VARCHAR(66) UNIQUE NOT NULL,
  parent_hash VARCHAR(66),
  state_root VARCHAR(66),
  timestamp BIGINT NOT NULL,
  extrinsics_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for blocks table
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);
CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);

-- Extrinsics table
CREATE TABLE IF NOT EXISTS extrinsics (
  id SERIAL PRIMARY KEY,
  hash VARCHAR(66) UNIQUE NOT NULL,
  block_number BIGINT REFERENCES blocks(number),
  extrinsic_index INTEGER,
  module VARCHAR(50),
  call VARCHAR(50),
  success BOOLEAN,
  timestamp BIGINT,
  signer VARCHAR(48),
  fee BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for extrinsics table
CREATE INDEX IF NOT EXISTS idx_extrinsics_block ON extrinsics(block_number);
CREATE INDEX IF NOT EXISTS idx_extrinsics_hash ON extrinsics(hash);
CREATE INDEX IF NOT EXISTS idx_extrinsics_signer ON extrinsics(signer);
CREATE INDEX IF NOT EXISTS idx_extrinsics_timestamp ON extrinsics(timestamp);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  address VARCHAR(48) PRIMARY KEY,
  balance BIGINT,
  nonce INTEGER,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for accounts table
CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts(balance);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  block_number BIGINT REFERENCES blocks(number),
  extrinsic_index INTEGER,
  event_index INTEGER,
  module VARCHAR(50),
  event_name VARCHAR(50),
  data JSONB,
  timestamp BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_block ON events(block_number);
CREATE INDEX IF NOT EXISTS idx_events_module ON events(module);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

-- Watchlists table
CREATE TABLE IF NOT EXISTS watchlists (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  address VARCHAR(48),
  label VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for watchlists table
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);

-- Grant permissions to the avail_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO avail_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO avail_user;

-- Sync State table for tracking blockchain synchronization
CREATE TABLE IF NOT EXISTS sync_state (
  id SERIAL PRIMARY KEY,
  last_synced_block BIGINT NOT NULL DEFAULT 0,
  target_block BIGINT,
  sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'paused', 'error', 'completed')),
  sync_mode VARCHAR(20) DEFAULT 'incremental' CHECK (sync_mode IN ('full', 'incremental', 'live')),
  blocks_per_minute INTEGER,
  estimated_completion TIMESTAMP,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_block BIGINT,
  started_at TIMESTAMP,
  paused_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for sync_state table
CREATE INDEX IF NOT EXISTS idx_sync_state_status ON sync_state(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_state_last_synced ON sync_state(last_synced_block);

-- Insert initial sync state record
INSERT INTO sync_state (last_synced_block, sync_status, sync_mode) 
VALUES (0, 'idle', 'incremental') 
ON CONFLICT DO NOTHING; 