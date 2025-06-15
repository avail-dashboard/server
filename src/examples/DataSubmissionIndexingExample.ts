/**
 * Example: Data Submission Indexing with Prisma
 * 
 * This file demonstrates how data-submission indexing would work
 * with the new Prisma ORM setup. This is much cleaner than raw SQL.
 */

import { 
  blockRepository, 
  dataSubmissionRepository, 
  rollupRepository,
  DataSubmissionCreateInput,
} from '../database';

export class DataSubmissionIndexingExample {
  
  /**
   * Example: Index data submissions from a block (clean Prisma version)
   */
  async indexDataSubmissionsForBlock(blockNumber: bigint): Promise<void> {
    console.log(`🔍 Indexing data submissions for block ${blockNumber}`);

    // 1. Get block data - convert bigint to number for repository
    const blockNumberInt = Number(blockNumber);
    const block = await blockRepository.findByNumber(blockNumberInt);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }

    // 2. Extract data submissions from blockchain (mock data for example)
    const mockDataSubmissions: DataSubmissionCreateInput[] = [
      {
        extrinsicHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        blockNumber: blockNumberInt,
        extrinsicIndex: 1,
        appId: 1,
        rollupName: 'Example Rollup',
        dataSize: Number(1024n),
        dataHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        timestamp: new Date(),
        success: true,
        kateCommitment: '0x987654321098765432109876543210987654321098765432109876543210',
        proof: { merkle_path: ['0x1', '0x2'] },
      },
    ];

    // 3. Store data submissions efficiently with batch insert
    if (mockDataSubmissions.length > 0) {
      const result = await dataSubmissionRepository.createMany(mockDataSubmissions);
      console.log(`✅ Indexed ${result.count} data submissions`);

      // 4. Update rollup statistics for each unique app_id
      const uniqueAppIds = [...new Set(mockDataSubmissions.map(ds => ds.appId))];
      
      for (const appId of uniqueAppIds) {
        const appSubmissions = mockDataSubmissions.filter(ds => ds.appId === appId);
        const totalDataSize = appSubmissions.reduce((sum, ds) => sum + ds.dataSize, 0);

        // Upsert rollup (create if doesn't exist, update stats if it does)
        await rollupRepository.upsert(
          appId,
          {
            appId,
            name: appSubmissions[0].rollupName || `Rollup ${appId}`,
            firstSeenBlock: blockNumberInt,
            lastActiveBlock: blockNumberInt,
            totalSubmissions: appSubmissions.length,
            totalDataSize: totalDataSize,
            totalFeesPaid: 0,
          },
          {
            lastActiveBlock: blockNumberInt,
          },
        );

        // Increment statistics
        await rollupRepository.incrementStats(appId, {
          submissionsIncrement: appSubmissions.length,
          dataSizeIncrement: totalDataSize,
        });
      }
    }
  }

  /**
   * Example: Get data submission analytics (clean Prisma version)
   */
  async getDataSubmissionAnalytics(appId?: number) {
    console.log(`📊 Getting analytics${appId ? ` for app ${appId}` : ' for all apps'}`);

    // Get basic stats
    const stats = await dataSubmissionRepository.getStats(
      appId ? { appId } : {},
    );

    // Get recent submissions with rollup data
    const { submissions } = await dataSubmissionRepository.findMany(
      appId ? { appId } : {},
      { limit: 10, orderBy: 'desc' },
    );

    // Get rollup leaderboard
    const topRollups = await rollupRepository.getLeaderboard(5);

    return {
      stats,
      recentSubmissions: submissions.map(sub => ({
        hash: sub.extrinsicHash,
        rollupName: sub.rollup.name,
        dataSize: sub.dataSize,
        timestamp: sub.timestamp,
        success: sub.success,
      })),
      topRollups: topRollups.map(rollup => ({
        appId: rollup.appId,
        name: rollup.name,
        totalSubmissions: rollup.totalSubmissions,
        totalDataSize: rollup.totalDataSize,
      })),
    };
  }

  /**
   * Example: Search data submissions (clean Prisma version)
   */
  async searchDataSubmissions(params: {
    submitter?: string;
    appId?: number;
    fromBlock?: bigint;
    toBlock?: bigint;
    page?: number;
    limit?: number;
  }) {
    console.log('🔎 Searching data submissions with filters:', params);

    const { submissions, total } = await dataSubmissionRepository.findMany(
      {
        submitter: params.submitter,
        appId: params.appId,
        fromBlock: params.fromBlock ? Number(params.fromBlock) : undefined,
        toBlock: params.toBlock ? Number(params.toBlock) : undefined,
      },
      {
        page: params.page || 1,
        limit: params.limit || 20,
        orderBy: 'desc',
      },
    );

    return {
      data: submissions.map(sub => ({
        extrinsicHash: sub.extrinsicHash,
        blockNumber: sub.blockNumber,
        rollupName: sub.rollup.name,
        dataSize: sub.dataSize,
        submitter: sub.submitter,
        timestamp: sub.timestamp,
        success: sub.success,
      })),
      pagination: {
        page: params.page || 1,
        limit: params.limit || 20,
        total,
        totalPages: Math.ceil(total / (params.limit || 20)),
      },
    };
  }

  /**
   * Example: Bulk data processing in transaction
   */
  async bulkProcessDataSubmissions(blockRange: { from: bigint; to: bigint }) {
    console.log(`🔄 Bulk processing blocks ${blockRange.from} to ${blockRange.to}`);

    // Use transaction for consistency
    return dataSubmissionRepository.transaction(async (_tx) => {
      const processedBlocks: bigint[] = [];
      
      for (let blockNum = blockRange.from; blockNum <= blockRange.to; blockNum++) {
        // Process each block (mock processing)
        await this.indexDataSubmissionsForBlock(blockNum);
        processedBlocks.push(blockNum);
      }

      return {
        processedBlocks,
        totalProcessed: processedBlocks.length,
      };
    });
  }
}

// Usage example:
export async function demonstrateDataSubmissionIndexing() {
  const indexer = new DataSubmissionIndexingExample();
  
  try {
    // Index data submissions for a block
    await indexer.indexDataSubmissionsForBlock(1000000n);
    
    // Get analytics
    const analytics = await indexer.getDataSubmissionAnalytics();
    console.log('Analytics:', analytics);
    
    // Search submissions
    const searchResults = await indexer.searchDataSubmissions({
      appId: 1,
      page: 1,
      limit: 5,
    });
    console.log('Search results:', searchResults);
    
  } catch (error) {
    console.error('Error demonstrating data submission indexing:', error);
  }
}

/**
 * Comparison: Before vs After
 * 
 * BEFORE (Raw SQL):
 * ```typescript
 * const result = await db.query(`
 *   INSERT INTO data_submissions 
 *   (extrinsic_hash, block_number, app_id, data_size, submitter, timestamp)
 *   VALUES ($1, $2, $3, $4, $5, $6)
 *   ON CONFLICT (extrinsic_hash) DO NOTHING
 * `, [hash, blockNumber, appId, dataSize, submitter, timestamp]);
 * ```
 * 
 * AFTER (Prisma):
 * ```typescript
 * const submission = await dataSubmissionRepository.create({
 *   extrinsicHash: hash,
 *   blockNumber,
 *   appId,
 *   dataSize,
 *   submitter,
 *   timestamp
 * });
 * ```
 * 
 * Benefits:
 * - ✅ Type safety
 * - ✅ Auto-completion
 * - ✅ Relationship handling
 * - ✅ Built-in pagination
 * - ✅ Complex filtering
 * - ✅ Transaction support
 * - ✅ Performance optimizations
 */