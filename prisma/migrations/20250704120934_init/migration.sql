-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('idle', 'syncing', 'paused', 'error', 'completed');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('full', 'incremental', 'live');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('regular', 'validator', 'nominator', 'pool_member');

-- CreateEnum
CREATE TYPE "ValidatorStatus" AS ENUM ('active', 'waiting', 'inactive', 'slashed');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('success', 'failed');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('validator', 'nominator', 'slash');

-- CreateTable
CREATE TABLE "blocks" (
    "number" INTEGER NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "parent_hash" VARCHAR(66),
    "state_root" VARCHAR(66),
    "extrinsics_root" VARCHAR(66),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "extrinsics_count" INTEGER NOT NULL DEFAULT 0,
    "events_count" INTEGER NOT NULL DEFAULT 0,
    "validator_address" VARCHAR(64),
    "validator_name" VARCHAR(255),
    "spec_version" INTEGER,
    "total_fees" DECIMAL(65,18),
    "transfer_count" INTEGER,
    "data_submissions_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "extrinsics" (
    "id" SERIAL NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66),
    "block_timestamp" TIMESTAMP(3),
    "extrinsic_index" INTEGER,
    "module" VARCHAR(50),
    "call" VARCHAR(50),
    "success" BOOLEAN,
    "timestamp" TIMESTAMP(3),
    "signer" VARCHAR(64),
    "fee" DECIMAL(65,18),
    "nonce" INTEGER,
    "lifetime" JSONB,
    "parameters" JSONB,
    "signature_info" JSONB,
    "tip" DECIMAL(65,18),
    "actual_fee" DECIMAL(65,18),
    "transfer_count" INTEGER,
    "method_object" JSONB,
    "method_args" JSONB,
    "extrinsic_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extrinsics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "address" VARCHAR(64) NOT NULL,
    "balance" DECIMAL(65,18),
    "nonce" INTEGER,
    "current_balance" DECIMAL(65,18),
    "reserved_balance" DECIMAL(65,18),
    "frozen_balance" DECIMAL(65,18),
    "account_type" "AccountType" NOT NULL DEFAULT 'regular',
    "identity_name" VARCHAR(255),
    "identity_info" JSONB,
    "first_seen_block" INTEGER,
    "last_activity_block" INTEGER,
    "transaction_count" INTEGER DEFAULT 0,
    "transfer_count" INTEGER DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66),
    "block_timestamp" TIMESTAMP(3),
    "extrinsic_index" INTEGER,
    "event_index" INTEGER,
    "module" VARCHAR(50),
    "event_name" VARCHAR(50),
    "data" JSONB,
    "timestamp" TIMESTAMP(3),
    "phase" JSONB,
    "phase_type" VARCHAR(50),
    "method_object" JSONB,
    "event_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255),
    "address" VARCHAR(64),
    "label" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" SERIAL NOT NULL,
    "last_synced_block" INTEGER NOT NULL DEFAULT 0,
    "target_block" INTEGER,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'idle',
    "sync_mode" "SyncMode" NOT NULL DEFAULT 'incremental',
    "blocks_per_minute" INTEGER,
    "estimated_completion" TIMESTAMP(3),
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_error_block" INTEGER,
    "started_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_submissions" (
    "id" SERIAL NOT NULL,
    "extrinsic_hash" VARCHAR(66) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66),
    "block_timestamp" TIMESTAMP(3),
    "extrinsic_index" INTEGER,
    "app_id" INTEGER NOT NULL,
    "rollup_name" VARCHAR(255),
    "data_size" INTEGER NOT NULL,
    "data_hash" VARCHAR(66) NOT NULL,
    "submitter" VARCHAR(64) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "blob_data" BYTEA,
    "kate_commitment" TEXT,
    "proof" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rollups" (
    "app_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "first_seen_block" INTEGER,
    "last_active_block" INTEGER,
    "total_submissions" INTEGER NOT NULL DEFAULT 0,
    "total_data_size" INTEGER NOT NULL DEFAULT 0,
    "total_fees_paid" INTEGER NOT NULL DEFAULT 0,
    "website" VARCHAR(255),
    "logo_url" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rollups_pkey" PRIMARY KEY ("app_id")
);

-- CreateTable
CREATE TABLE "validators" (
    "stash_address" VARCHAR(64) NOT NULL,
    "controller_address" VARCHAR(64),
    "reward_address" VARCHAR(64),
    "commission" INTEGER NOT NULL,
    "self_bonded" DECIMAL(65,18) NOT NULL,
    "total_bonded" DECIMAL(65,18) NOT NULL,
    "nominator_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ValidatorStatus" NOT NULL DEFAULT 'inactive',
    "session_keys" JSONB,
    "identity_name" VARCHAR(255),
    "identity_info" JSONB,
    "blocks_produced" INTEGER NOT NULL DEFAULT 0,
    "last_block_produced" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validators_pkey" PRIMARY KEY ("stash_address")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "extrinsic_hash" VARCHAR(66) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66),
    "block_timestamp" TIMESTAMP(3),
    "extrinsic_index" INTEGER NOT NULL,
    "from_address" VARCHAR(64) NOT NULL,
    "to_address" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(65,18) NOT NULL,
    "token_type" VARCHAR(10) NOT NULL DEFAULT 'AVAIL',
    "fees" DECIMAL(65,18) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'success',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominations" (
    "id" TEXT NOT NULL,
    "nominator_address" VARCHAR(64) NOT NULL,
    "validator_address" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(65,18) NOT NULL,
    "era" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eras" (
    "number" INTEGER NOT NULL,
    "start_block" INTEGER NOT NULL,
    "end_block" INTEGER,
    "total_staked" DECIMAL(65,18) NOT NULL,
    "validator_count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eras_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "validator_address" VARCHAR(64),
    "amount" DECIMAL(65,18) NOT NULL,
    "era" INTEGER NOT NULL,
    "reward_type" "RewardType" NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66),
    "block_timestamp" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blocks_hash_key" ON "blocks"("hash");

-- CreateIndex
CREATE INDEX "idx_blocks_timestamp" ON "blocks"("timestamp");

-- CreateIndex
CREATE INDEX "idx_blocks_hash" ON "blocks"("hash");

-- CreateIndex
CREATE INDEX "idx_blocks_validator" ON "blocks"("validator_address");

-- CreateIndex
CREATE UNIQUE INDEX "extrinsics_hash_key" ON "extrinsics"("hash");

-- CreateIndex
CREATE INDEX "idx_extrinsics_block" ON "extrinsics"("block_number");

-- CreateIndex
CREATE INDEX "idx_extrinsics_hash" ON "extrinsics"("hash");

-- CreateIndex
CREATE INDEX "idx_extrinsics_signer" ON "extrinsics"("signer");

-- CreateIndex
CREATE INDEX "idx_extrinsics_timestamp" ON "extrinsics"("timestamp");

-- CreateIndex
CREATE INDEX "idx_extrinsics_block_order" ON "extrinsics"("block_number", "extrinsic_order");

-- CreateIndex
CREATE INDEX "idx_accounts_balance" ON "accounts"("balance");

-- CreateIndex
CREATE INDEX "idx_accounts_current_balance" ON "accounts"("current_balance");

-- CreateIndex
CREATE INDEX "idx_accounts_type" ON "accounts"("account_type");

-- CreateIndex
CREATE INDEX "idx_accounts_last_activity" ON "accounts"("last_activity_block");

-- CreateIndex
CREATE INDEX "idx_events_block" ON "events"("block_number");

-- CreateIndex
CREATE INDEX "idx_events_module" ON "events"("module");

-- CreateIndex
CREATE INDEX "idx_events_timestamp" ON "events"("timestamp");

-- CreateIndex
CREATE INDEX "idx_events_phase_type" ON "events"("phase_type");

-- CreateIndex
CREATE INDEX "idx_events_block_order" ON "events"("block_number", "event_order");

-- CreateIndex
CREATE INDEX "idx_watchlists_user" ON "watchlists"("user_id");

-- CreateIndex
CREATE INDEX "idx_sync_state_status" ON "sync_state"("sync_status");

-- CreateIndex
CREATE INDEX "idx_sync_state_last_synced" ON "sync_state"("last_synced_block");

-- CreateIndex
CREATE UNIQUE INDEX "data_submissions_extrinsic_hash_key" ON "data_submissions"("extrinsic_hash");

-- CreateIndex
CREATE INDEX "idx_data_submissions_block" ON "data_submissions"("block_number");

-- CreateIndex
CREATE INDEX "idx_data_submissions_app_id" ON "data_submissions"("app_id");

-- CreateIndex
CREATE INDEX "idx_data_submissions_submitter" ON "data_submissions"("submitter");

-- CreateIndex
CREATE INDEX "idx_data_submissions_timestamp" ON "data_submissions"("timestamp");

-- CreateIndex
CREATE INDEX "idx_data_submissions_hash" ON "data_submissions"("extrinsic_hash");

-- CreateIndex
CREATE INDEX "idx_rollups_name" ON "rollups"("name");

-- CreateIndex
CREATE INDEX "idx_rollups_last_active" ON "rollups"("last_active_block");

-- CreateIndex
CREATE UNIQUE INDEX "validators_controller_address_key" ON "validators"("controller_address");

-- CreateIndex
CREATE UNIQUE INDEX "validators_reward_address_key" ON "validators"("reward_address");

-- CreateIndex
CREATE INDEX "idx_validators_status" ON "validators"("status");

-- CreateIndex
CREATE INDEX "idx_validators_total_bonded" ON "validators"("total_bonded");

-- CreateIndex
CREATE INDEX "idx_validators_commission" ON "validators"("commission");

-- CreateIndex
CREATE INDEX "idx_validators_last_block" ON "validators"("last_block_produced");

-- CreateIndex
CREATE INDEX "idx_transfers_block" ON "transfers"("block_number");

-- CreateIndex
CREATE INDEX "idx_transfers_extrinsic" ON "transfers"("extrinsic_hash");

-- CreateIndex
CREATE INDEX "idx_transfers_from" ON "transfers"("from_address");

-- CreateIndex
CREATE INDEX "idx_transfers_to" ON "transfers"("to_address");

-- CreateIndex
CREATE INDEX "idx_transfers_timestamp" ON "transfers"("timestamp");

-- CreateIndex
CREATE INDEX "idx_transfers_amount" ON "transfers"("amount");

-- CreateIndex
CREATE INDEX "idx_nominations_nominator" ON "nominations"("nominator_address");

-- CreateIndex
CREATE INDEX "idx_nominations_validator" ON "nominations"("validator_address");

-- CreateIndex
CREATE INDEX "idx_nominations_era" ON "nominations"("era");

-- CreateIndex
CREATE INDEX "idx_nominations_active" ON "nominations"("active");

-- CreateIndex
CREATE INDEX "idx_eras_start_block" ON "eras"("start_block");

-- CreateIndex
CREATE INDEX "idx_eras_active" ON "eras"("active");

-- CreateIndex
CREATE INDEX "idx_rewards_address" ON "rewards"("address");

-- CreateIndex
CREATE INDEX "idx_rewards_validator" ON "rewards"("validator_address");

-- CreateIndex
CREATE INDEX "idx_rewards_era" ON "rewards"("era");

-- CreateIndex
CREATE INDEX "idx_rewards_type" ON "rewards"("reward_type");

-- CreateIndex
CREATE INDEX "idx_rewards_block" ON "rewards"("block_number");
