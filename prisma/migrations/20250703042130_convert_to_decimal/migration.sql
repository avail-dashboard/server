/*
  Warnings:

  - The `current_balance` column on the `accounts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reserved_balance` column on the `accounts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `frozen_balance` column on the `accounts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `data_submissions_size` on the `blocks` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(65,18),
DROP COLUMN "current_balance",
ADD COLUMN     "current_balance" DECIMAL(65,18),
DROP COLUMN "reserved_balance",
ADD COLUMN     "reserved_balance" DECIMAL(65,18),
DROP COLUMN "frozen_balance",
ADD COLUMN     "frozen_balance" DECIMAL(65,18);

-- AlterTable
ALTER TABLE "blocks" ALTER COLUMN "total_fees" SET DATA TYPE DECIMAL(65,18),
ALTER COLUMN "data_submissions_size" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "eras" ALTER COLUMN "total_staked" SET DATA TYPE DECIMAL(65,18);

-- AlterTable
ALTER TABLE "extrinsics" ALTER COLUMN "fee" SET DATA TYPE DECIMAL(65,18),
ALTER COLUMN "tip" SET DATA TYPE DECIMAL(65,18),
ALTER COLUMN "actual_fee" SET DATA TYPE DECIMAL(65,18);

-- AlterTable
ALTER TABLE "nominations" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,18);

-- AlterTable
ALTER TABLE "rewards" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,18);

-- AlterTable
ALTER TABLE "transfers" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,18),
ALTER COLUMN "fees" SET DATA TYPE DECIMAL(65,18);

-- AlterTable
ALTER TABLE "validators" ALTER COLUMN "self_bonded" SET DATA TYPE DECIMAL(65,18),
ALTER COLUMN "total_bonded" SET DATA TYPE DECIMAL(65,18);

-- CreateIndex
CREATE INDEX "idx_accounts_current_balance" ON "accounts"("current_balance");
