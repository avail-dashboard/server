-- CreateIndex
DROP INDEX IF EXISTS "extrinsics_hash_key";

-- AlterTable
ALTER TABLE "extrinsics" ALTER COLUMN "extrinsic_index" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "unique_block_extrinsic" ON "extrinsics"("block_number", "extrinsic_index");

-- CreateIndex  
CREATE INDEX "idx_extrinsics_hash_block" ON "extrinsics"("hash", "block_number");