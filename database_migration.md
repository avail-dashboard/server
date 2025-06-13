# Prisma Migration Plan - Avail Explorer Backend

## Overview
This plan outlines the migration from raw SQL to Prisma ORM for improved type safety, maintainability, and developer experience. The migration will be done incrementally to minimize risk and ensure zero downtime.

## Current State Analysis

### Existing Database Architecture
- **Raw SQL**: Direct queries using custom DatabaseService
- **Schema Management**: Manual SQL files (init.sql)
- **Type Safety**: Loose coupling between TypeScript interfaces and database schema
- **Migrations**: Manual scripts and schema changes

### Pain Points Addressed
1. **Schema Drift**: TypeScript interfaces don't match database schema
2. **Query Maintenance**: Raw SQL scattered across services
3. **Type Safety**: No compile-time checking of database operations
4. **Migration Management**: Manual and error-prone schema changes

## Migration Strategy

### **Phase 1: Prisma Foundation (Day 1-2)**
Set up Prisma alongside existing system without breaking changes.

### **Phase 2: Repository Pattern (Day 3-5)**
Implement repository pattern with Prisma while maintaining backward compatibility.

### **Phase 3: Service Migration (Day 6-8)**
Migrate services to use repositories instead of raw SQL.

### **Phase 4: Legacy Cleanup (Day 9-10)**
Remove raw SQL and legacy database utilities.

---

## Phase 1: Prisma Foundation

### **Step 1.1: Install Prisma**
```bash
npm install prisma @prisma/client
npm install -D prisma
```

### **Step 1.2: Initialize Prisma**
```bash
npx prisma init
```

### **Step 1.3: Create Schema from Existing Database**

**File**: `prisma/schema.prisma`
```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Block {
  number          BigInt           @id
  hash            String           @unique @db.VarChar(66)
  parentHash      String?          @map("parent_hash") @db.VarChar(66)
  stateRoot       String?          @map("state_root") @db.VarChar(66)
  timestamp       BigInt
  extrinsicsCount Int              @default(0) @map("extrinsics_count")
  createdAt       DateTime         @default(now()) @map("created_at")
  
  // Relations
  extrinsics      Extrinsic[]
  events          Event[]
  dataSubmissions DataSubmission[]
  
  @@index([timestamp], name: "idx_blocks_timestamp")
  @@index([hash], name: "idx_blocks_hash")
  @@map("blocks")
}

model Extrinsic {
  id             Int      @id @default(autoincrement())
  hash           String   @unique @db.VarChar(66)
  blockNumber    BigInt   @map("block_number")
  extrinsicIndex Int?     @map("extrinsic_index")
  module         String?  @db.VarChar(50)
  call           String?  @db.VarChar(50)
  success        Boolean?
  timestamp      BigInt?
  signer         String?  @db.VarChar(48)
  fee            BigInt?
  createdAt      DateTime @default(now()) @map("created_at")
  
  // Relations
  block          Block    @relation(fields: [blockNumber], references: [number])
  events         Event[]
  
  @@index([blockNumber], name: "idx_extrinsics_block")
  @@index([hash], name: "idx_extrinsics_hash")
  @@index([signer], name: "idx_extrinsics_signer")
  @@index([timestamp], name: "idx_extrinsics_timestamp")
  @@map("extrinsics")
}

model Account {
  address     String   @id @db.VarChar(48)
  balance     BigInt?
  nonce       Int?
  lastUpdated DateTime @default(now()) @map("last_updated")
  
  @@index([balance], name: "idx_accounts_balance")
  @@map("accounts")
}

model Event {
  id             Int      @id @default(autoincrement())
  blockNumber    BigInt   @map("block_number")
  extrinsicIndex Int?     @map("extrinsic_index")
  eventIndex     Int?     @map("event_index")
  module         String?  @db.VarChar(50)
  eventName      String?  @map("event_name") @db.VarChar(50)
  data           Json?
  timestamp      BigInt?
  createdAt      DateTime @default(now()) @map("created_at")
  
  // Relations
  block          Block     @relation(fields: [blockNumber], references: [number])
  extrinsic      Extrinsic? @relation(fields: [blockNumber, extrinsicIndex], references: [blockNumber, extrinsicIndex])
  
  @@index([blockNumber], name: "idx_events_block")
  @@index([module], name: "idx_events_module")
  @@index([timestamp], name: "idx_events_timestamp")
  @@map("events")
}

model Watchlist {
  id        Int      @id @default(autoincrement())
  userId    String?  @map("user_id") @db.VarChar(255)
  address   String?  @db.VarChar(48)
  label     String?  @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at")
  
  @@index([userId], name: "idx_watchlists_user")
  @@map("watchlists")
}

model SyncState {
  id                  Int       @id @default(autoincrement())
  lastSyncedBlock     BigInt    @default(0) @map("last_synced_block")
  targetBlock         BigInt?   @map("target_block")
  syncStatus          SyncStatus @default(idle) @map("sync_status")
  syncMode            SyncMode   @default(incremental) @map("sync_mode")
  blocksPerMinute     Int?      @map("blocks_per_minute")
  estimatedCompletion DateTime? @map("estimated_completion")
  errorCount          Int       @default(0) @map("error_count")
  lastError           String?   @map("last_error")
  lastErrorBlock      BigInt?   @map("last_error_block")
  startedAt           DateTime? @map("started_at")
  pausedAt            DateTime? @map("paused_at")
  completedAt         DateTime? @map("completed_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at")
  
  @@index([syncStatus], name: "idx_sync_state_status")
  @@index([lastSyncedBlock], name: "idx_sync_state_last_synced")
  @@map("sync_state")
}

model DataSubmission {
  id             Int      @id @default(autoincrement())
  extrinsicHash  String   @unique @map("extrinsic_hash") @db.VarChar(66)
  blockNumber    BigInt   @map("block_number")
  extrinsicIndex Int?     @map("extrinsic_index")
  appId          Int      @map("app_id")
  rollupName     String?  @map("rollup_name") @db.VarChar(255)
  dataSize       BigInt   @map("data_size")
  dataHash       String   @map("data_hash") @db.VarChar(66)
  submitter      String   @db.VarChar(48)
  timestamp      BigInt
  success        Boolean  @default(true)
  blobData       Bytes?   @map("blob_data")
  kateCommitment String?  @map("kate_commitment") @db.VarChar(255)
  proof          Json?
  createdAt      DateTime @default(now()) @map("created_at")
  
  // Relations
  block          Block    @relation(fields: [blockNumber], references: [number])
  rollup         Rollup   @relation(fields: [appId], references: [appId])
  
  @@index([blockNumber], name: "idx_data_submissions_block")
  @@index([appId], name: "idx_data_submissions_app_id")
  @@index([submitter], name: "idx_data_submissions_submitter")
  @@index([timestamp], name: "idx_data_submissions_timestamp")
  @@index([extrinsicHash], name: "idx_data_submissions_hash")
  @@map("data_submissions")
}

model Rollup {
  appId             Int      @id @map("app_id")
  name              String   @db.VarChar(255)
  description       String?
  firstSeenBlock    BigInt?  @map("first_seen_block")
  lastActiveBlock   BigInt?  @map("last_active_block")
  totalSubmissions  Int      @default(0) @map("total_submissions")
  totalDataSize     BigInt   @default(0) @map("total_data_size")
  totalFeesPaid     BigInt   @default(0) @map("total_fees_paid")
  website           String?  @db.VarChar(255)
  logoUrl           String?  @map("logo_url") @db.VarChar(255)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at")
  
  // Relations
  dataSubmissions   DataSubmission[]
  
  @@index([name], name: "idx_rollups_name")
  @@index([lastActiveBlock], name: "idx_rollups_last_active")
  @@map("rollups")
}

enum SyncStatus {
  idle
  syncing
  paused
  error
  completed
}

enum SyncMode {
  full
  incremental
  live
}
```

### **Step 1.4: Generate Prisma Client**
```bash
npx prisma generate
```

### **Step 1.5: Introspect Existing Database**
```bash
npx prisma db pull
```

### **Step 1.6: Create Database Client**

**File**: `src/database/client.ts`
```typescript
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Global for Next.js hot reload (avoid multiple instances)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create Prisma client with proper configuration
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
  errorFormat: 'pretty',
});

// Log Prisma events
prisma.$on('warn', (e) => {
  logger.warn('Prisma warning:', e);
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

// Ensure single instance in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
```

---

## Phase 2: Repository Pattern

### **Step 2.1: Create Base Repository**

**File**: `src/database/repositories/BaseRepository.ts`
```typescript
import { PrismaClient } from '@prisma/client';
import prisma from '../client';

export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Execute in transaction
   */
  async transaction<T>(callback: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  /**
   * Health check for repository
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

### **Step 2.2: Create Block Repository**

**File**: `src/database/repositories/BlockRepository.ts`
```typescript
import { Block, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type BlockWithExtrinsics = Block & {
  extrinsics: Array<{
    id: number;
    hash: string;
    success: boolean | null;
  }>;
};

export type BlockCreateInput = Omit<Block, 'id' | 'createdAt'>;

export class BlockRepository extends BaseRepository {
  /**
   * Find block by number
   */
  async findByNumber(blockNumber: bigint): Promise<Block | null> {
    return this.prisma.block.findUnique({
      where: { number: blockNumber },
    });
  }

  /**
   * Find block by hash
   */
  async findByHash(hash: string): Promise<Block | null> {
    return this.prisma.block.findUnique({
      where: { hash },
    });
  }

  /**
   * Get latest block
   */
  async getLatest(): Promise<Block | null> {
    return this.prisma.block.findFirst({
      orderBy: { number: 'desc' },
    });
  }

  /**
   * Get blocks with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  }): Promise<{ blocks: Block[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [blocks, total] = await Promise.all([
      this.prisma.block.findMany({
        skip,
        take: limit,
        orderBy: { number: orderBy },
      }),
      this.prisma.block.count(),
    ]);

    return { blocks, total };
  }

  /**
   * Create new block
   */
  async create(data: BlockCreateInput): Promise<Block> {
    return this.prisma.block.create({
      data,
    });
  }

  /**
   * Create multiple blocks efficiently
   */
  async createMany(blocks: BlockCreateInput[]): Promise<{ count: number }> {
    return this.prisma.block.createMany({
      data: blocks,
      skipDuplicates: true,
    });
  }

  /**
   * Get block with related data
   */
  async findWithRelations(blockNumber: bigint): Promise<BlockWithExtrinsics | null> {
    return this.prisma.block.findUnique({
      where: { number: blockNumber },
      include: {
        extrinsics: {
          select: {
            id: true,
            hash: true,
            success: true,
          },
        },
      },
    });
  }

  /**
   * Get blocks in range
   */
  async findInRange(fromBlock: bigint, toBlock: bigint): Promise<Block[]> {
    return this.prisma.block.findMany({
      where: {
        number: {
          gte: fromBlock,
          lte: toBlock,
        },
      },
      orderBy: { number: 'asc' },
    });
  }
}
```

### **Step 2.3: Create Data Submission Repository**

**File**: `src/database/repositories/DataSubmissionRepository.ts`
```typescript
import { DataSubmission, Rollup, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type DataSubmissionWithRollup = DataSubmission & {
  rollup: Rollup;
};

export type DataSubmissionCreateInput = Omit<DataSubmission, 'id' | 'createdAt'>;

export interface DataSubmissionFilters {
  appId?: number;
  submitter?: string;
  success?: boolean;
  fromTimestamp?: bigint;
  toTimestamp?: bigint;
  fromBlock?: bigint;
  toBlock?: bigint;
}

export class DataSubmissionRepository extends BaseRepository {
  /**
   * Find data submission by extrinsic hash
   */
  async findByExtrinsicHash(hash: string): Promise<DataSubmission | null> {
    return this.prisma.dataSubmission.findUnique({
      where: { extrinsicHash: hash },
    });
  }

  /**
   * Get data submissions for a block
   */
  async findByBlock(blockNumber: bigint): Promise<DataSubmission[]> {
    return this.prisma.dataSubmission.findMany({
      where: { blockNumber },
      orderBy: { extrinsicIndex: 'asc' },
    });
  }

  /**
   * Get data submissions for a rollup
   */
  async findByAppId(
    appId: number,
    params: { page?: number; limit?: number } = {}
  ): Promise<{ submissions: DataSubmissionWithRollup[]; total: number }> {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where: { appId },
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { rollup: true },
      }),
      this.prisma.dataSubmission.count({
        where: { appId },
      }),
    ]);

    return { submissions, total };
  }

  /**
   * Get paginated data submissions with filters
   */
  async findMany(
    filters: DataSubmissionFilters = {},
    params: { page?: number; limit?: number; orderBy?: 'asc' | 'desc' } = {}
  ): Promise<{ submissions: DataSubmissionWithRollup[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    // Build where clause from filters
    const where: Prisma.DataSubmissionWhereInput = {};
    
    if (filters.appId !== undefined) where.appId = filters.appId;
    if (filters.submitter) where.submitter = filters.submitter;
    if (filters.success !== undefined) where.success = filters.success;
    
    if (filters.fromTimestamp || filters.toTimestamp) {
      where.timestamp = {};
      if (filters.fromTimestamp) where.timestamp.gte = filters.fromTimestamp;
      if (filters.toTimestamp) where.timestamp.lte = filters.toTimestamp;
    }

    if (filters.fromBlock || filters.toBlock) {
      where.blockNumber = {};
      if (filters.fromBlock) where.blockNumber.gte = filters.fromBlock;
      if (filters.toBlock) where.blockNumber.lte = filters.toBlock;
    }

    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: orderBy },
        include: { rollup: true },
      }),
      this.prisma.dataSubmission.count({ where }),
    ]);

    return { submissions, total };
  }

  /**
   * Create new data submission
   */
  async create(data: DataSubmissionCreateInput): Promise<DataSubmission> {
    return this.prisma.dataSubmission.create({
      data,
    });
  }

  /**
   * Create multiple data submissions efficiently
   */
  async createMany(submissions: DataSubmissionCreateInput[]): Promise<{ count: number }> {
    return this.prisma.dataSubmission.createMany({
      data: submissions,
      skipDuplicates: true,
    });
  }

  /**
   * Get statistics for data submissions
   */
  async getStats(filters: DataSubmissionFilters = {}) {
    const where: Prisma.DataSubmissionWhereInput = {};
    
    if (filters.appId !== undefined) where.appId = filters.appId;
    if (filters.fromTimestamp || filters.toTimestamp) {
      where.timestamp = {};
      if (filters.fromTimestamp) where.timestamp.gte = filters.fromTimestamp;
      if (filters.toTimestamp) where.timestamp.lte = filters.toTimestamp;
    }

    const [
      totalCount,
      successCount,
      totalDataSize,
      uniqueSubmitters,
      uniqueRollups,
    ] = await Promise.all([
      this.prisma.dataSubmission.count({ where }),
      this.prisma.dataSubmission.count({ 
        where: { ...where, success: true } 
      }),
      this.prisma.dataSubmission.aggregate({
        where,
        _sum: { dataSize: true },
      }),
      this.prisma.dataSubmission.groupBy({
        by: ['submitter'],
        where,
        _count: { submitter: true },
      }),
      this.prisma.dataSubmission.groupBy({
        by: ['appId'],
        where,
        _count: { appId: true },
      }),
    ]);

    return {
      totalSubmissions: totalCount,
      successfulSubmissions: successCount,
      failedSubmissions: totalCount - successCount,
      totalDataSize: totalDataSize._sum.dataSize || 0n,
      uniqueSubmitters: uniqueSubmitters.length,
      uniqueRollups: uniqueRollups.length,
    };
  }
}
```

### **Step 2.4: Create Repository Index**

**File**: `src/database/repositories/index.ts`
```typescript
export { BaseRepository } from './BaseRepository';
export { BlockRepository } from './BlockRepository';
export { DataSubmissionRepository } from './DataSubmissionRepository';
export { RollupRepository } from './RollupRepository';

// Repository instances for dependency injection
export const blockRepository = new BlockRepository();
export const dataSubmissionRepository = new DataSubmissionRepository();
export const rollupRepository = new RollupRepository();
```

---

## Phase 3: Service Migration

### **Step 3.1: Update BlockService to Use Repository**

**File**: `src/services/domain/block.ts` (Updated)
```typescript
import { BlockchainService } from '../core/blockchain';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { Block } from '@prisma/client';

export class BlockService {
  constructor(
    private blockRepository: BlockRepository,
    private blockchainService: BlockchainService
  ) {}

  /**
   * Get latest block (database-first with blockchain fallback)
   */
  async getLatestBlock(): Promise<Block | null> {
    try {
      // Try database first
      const latestBlock = await this.blockRepository.getLatest();
      
      if (latestBlock) {
        return latestBlock;
      }

      // Fallback to blockchain
      const blockchainBlock = await this.blockchainService.getLatestBlock();
      if (blockchainBlock) {
        // Store in database for future queries
        return this.blockRepository.create({
          number: BigInt(blockchainBlock.number),
          hash: blockchainBlock.hash,
          parentHash: blockchainBlock.parentHash,
          stateRoot: blockchainBlock.stateRoot,
          timestamp: BigInt(blockchainBlock.timestamp),
          extrinsicsCount: blockchainBlock.extrinsics?.length || 0,
        });
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to get latest block: ${error}`);
    }
  }

  /**
   * Get block by number with database-first approach
   */
  async getBlockByNumber(blockNumber: bigint): Promise<Block | null> {
    try {
      // Try database first
      let block = await this.blockRepository.findByNumber(blockNumber);
      
      if (block) {
        return block;
      }

      // Fallback to blockchain
      const blockchainBlock = await this.blockchainService.getBlock(Number(blockNumber));
      if (blockchainBlock) {
        // Store in database for future queries
        block = await this.blockRepository.create({
          number: BigInt(blockchainBlock.number),
          hash: blockchainBlock.hash,
          parentHash: blockchainBlock.parentHash,
          stateRoot: blockchainBlock.stateRoot,
          timestamp: BigInt(blockchainBlock.timestamp),
          extrinsicsCount: blockchainBlock.extrinsics?.length || 0,
        });
      }

      return block;
    } catch (error) {
      throw new Error(`Failed to get block ${blockNumber}: ${error}`);
    }
  }

  /**
   * Get paginated blocks
   */
  async getBlocks(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  }) {
    return this.blockRepository.findMany(params);
  }
}

// Factory function with repositories
export const createBlockService = (
  blockRepository: BlockRepository,
  blockchainService: BlockchainService
): BlockService => {
  return new BlockService(blockRepository, blockchainService);
};
```

### **Step 3.2: Update DataAvailabilityService**

**File**: `src/services/domain/dataAvailability.ts` (Updated)
```typescript
import { BlockchainService } from '../core/blockchain';
import { DataSubmissionRepository } from '../../database/repositories/DataSubmissionRepository';
import { RollupRepository } from '../../database/repositories/RollupRepository';
import { DataSubmission } from '@prisma/client';

export class DataAvailabilityService {
  constructor(
    private dataSubmissionRepository: DataSubmissionRepository,
    private rollupRepository: RollupRepository,
    private blockchainService: BlockchainService
  ) {}

  /**
   * Get data submission by extrinsic hash
   */
  async getDataSubmission(extrinsicHash: string): Promise<DataSubmission | null> {
    try {
      // Try database first
      let submission = await this.dataSubmissionRepository.findByExtrinsicHash(extrinsicHash);
      
      if (submission) {
        return submission;
      }

      // Fallback to blockchain extraction
      const blockchainData = await this.extractDataSubmissionFromBlockchain(extrinsicHash);
      if (blockchainData) {
        submission = await this.dataSubmissionRepository.create(blockchainData);
      }

      return submission;
    } catch (error) {
      throw new Error(`Failed to get data submission: ${error}`);
    }
  }

  /**
   * Get paginated data submissions with filters
   */
  async getDataSubmissions(filters: any = {}, params: any = {}) {
    return this.dataSubmissionRepository.findMany(filters, params);
  }

  /**
   * Get data submissions for specific rollup
   */
  async getDataSubmissionsForRollup(appId: number, params: any = {}) {
    return this.dataSubmissionRepository.findByAppId(appId, params);
  }

  /**
   * Get data submission statistics
   */
  async getDataSubmissionStats(filters: any = {}) {
    return this.dataSubmissionRepository.getStats(filters);
  }

  /**
   * Process data submissions from a block
   */
  async processDataSubmissionsFromBlock(blockNumber: bigint): Promise<DataSubmission[]> {
    // Implementation for extracting data submissions from blockchain block
    // and storing them in database
    const submissions: any[] = []; // Extract from blockchain
    
    if (submissions.length > 0) {
      await this.dataSubmissionRepository.createMany(submissions);
    }

    return this.dataSubmissionRepository.findByBlock(blockNumber);
  }

  private async extractDataSubmissionFromBlockchain(extrinsicHash: string): Promise<any> {
    // Implement blockchain-specific data extraction
    // This will be specific to Avail's data availability layer
    return null;
  }
}

// Factory function with repositories
export const createDataAvailabilityService = (
  dataSubmissionRepository: DataSubmissionRepository,
  rollupRepository: RollupRepository,
  blockchainService: BlockchainService
): DataAvailabilityService => {
  return new DataAvailabilityService(
    dataSubmissionRepository,
    rollupRepository,
    blockchainService
  );
};
```

---

## Phase 4: Migration Benefits

### **Before (Raw SQL)**
```typescript
// Raw SQL with potential type mismatches
const result = await db.query(`
  SELECT ds.*, r.name as rollup_name 
  FROM data_submissions ds 
  LEFT JOIN rollups r ON ds.app_id = r.app_id 
  WHERE ds.block_number >= $1 AND ds.block_number <= $2
  ORDER BY ds.timestamp DESC
  LIMIT $3 OFFSET $4
`, [fromBlock, toBlock, limit, offset]);

// No type safety
const submissions = result.rows; // any[]
```

### **After (Prisma)**
```typescript
// Type-safe with intellisense
const { submissions } = await dataSubmissionRepository.findMany(
  {
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  },
  {
    page: 1,
    limit: 20,
    orderBy: 'desc'
  }
);

// Fully typed result
submissions.forEach(submission => {
  console.log(submission.rollup.name); // TypeScript knows this exists
});
```

## Implementation Timeline

### **Week 1 (Phase 1-2)**
- **Day 1**: Install Prisma, create schema
- **Day 2**: Generate client, create base repository
- **Day 3**: Create BlockRepository and DataSubmissionRepository
- **Day 4**: Create RollupRepository and other repositories
- **Day 5**: Test repositories in isolation

### **Week 2 (Phase 3-4)**
- **Day 6**: Update BlockService to use repositories
- **Day 7**: Update DataAvailabilityService to use repositories
- **Day 8**: Update remaining services
- **Day 9**: Remove legacy DatabaseService
- **Day 10**: Update tests and documentation

## Rollback Strategy

### **Safe Migration Approach**
1. **Parallel Systems**: Keep both Prisma and raw SQL running
2. **Feature Flags**: Use flags to switch between implementations
3. **Gradual Migration**: Migrate one service at a time
4. **Monitoring**: Compare query performance and results

### **Rollback Plan**
If issues arise:
1. **Immediate**: Switch feature flag back to raw SQL
2. **Short-term**: Fix Prisma issues while maintaining raw SQL
3. **Long-term**: Complete migration or abandon if performance issues

## Testing Strategy

### **Repository Testing**
```typescript
// test/repositories/BlockRepository.test.ts
describe('BlockRepository', () => {
  it('should create and retrieve blocks', async () => {
    const block = await blockRepository.create({
      number: 123n,
      hash: '0x123...',
      timestamp: BigInt(Date.now()),
    });
    
    expect(block.number).toBe(123n);
    
    const retrieved = await blockRepository.findByNumber(123n);
    expect(retrieved?.hash).toBe('0x123...');
  });
});
```

### **Integration Testing**
- Test service layer with repositories
- Compare results between old and new implementations
- Performance benchmarking

## Success Metrics

### **Developer Experience**
- ✅ Type safety in database operations
- ✅ Reduced SQL writing and maintenance
- ✅ Better IDE support and autocomplete
- ✅ Easier testing with typed interfaces

### **Maintainability**
- ✅ Single source of truth for schema
- ✅ Automated migrations
- ✅ Better error handling
- ✅ Consistent data access patterns

### **Performance**
- ✅ Query optimization through Prisma
- ✅ Connection pooling
- ✅ Efficient bulk operations
- ✅ Better caching opportunities

This migration plan provides a **safe, incremental approach** to adopting Prisma while maintaining the existing functionality. The repository pattern ensures clean separation of concerns and makes the codebase more maintainable for future data-submission indexing features.