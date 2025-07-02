-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_validator_address_fkey";

-- DropForeignKey
ALTER TABLE "data_submissions" DROP CONSTRAINT "data_submissions_app_id_fkey";

-- DropForeignKey
ALTER TABLE "data_submissions" DROP CONSTRAINT "data_submissions_block_number_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_block_number_fkey";

-- DropForeignKey
ALTER TABLE "extrinsics" DROP CONSTRAINT "extrinsics_block_number_fkey";

-- DropForeignKey
ALTER TABLE "nominations" DROP CONSTRAINT "nominations_nominator_address_fkey";

-- DropForeignKey
ALTER TABLE "nominations" DROP CONSTRAINT "nominations_validator_address_fkey";

-- DropForeignKey
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_address_fkey";

-- DropForeignKey
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_block_number_fkey";

-- DropForeignKey
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_era_fkey";

-- DropForeignKey
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_validator_address_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_block_number_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_extrinsic_hash_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_from_address_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_to_address_fkey";

-- DropForeignKey
ALTER TABLE "validators" DROP CONSTRAINT "validators_controller_address_fkey";

-- DropForeignKey
ALTER TABLE "validators" DROP CONSTRAINT "validators_reward_address_fkey";

-- DropForeignKey
ALTER TABLE "validators" DROP CONSTRAINT "validators_stash_address_fkey";

-- AlterTable
ALTER TABLE "data_submissions" ADD COLUMN     "block_hash" VARCHAR(66),
ADD COLUMN     "block_timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "block_hash" VARCHAR(66),
ADD COLUMN     "block_timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "extrinsics" ADD COLUMN     "block_hash" VARCHAR(66),
ADD COLUMN     "block_timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rewards" ADD COLUMN     "block_hash" VARCHAR(66),
ADD COLUMN     "block_timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "block_hash" VARCHAR(66),
ADD COLUMN     "block_timestamp" TIMESTAMP(3);
