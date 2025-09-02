import { DataSubmission, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';
import { getBlockTimestamp, getBlockTimestamps } from '../../utils/timestamp';

// DataSubmission with computed timestamp from block
export type DataSubmissionWithTimestamp = DataSubmission & {
  timestamp: string; // ISO string computed from block number
};

export type DataSubmissionCreateInput = Omit<DataSubmission, 'id'>;

export interface DataSubmissionFilters {
  appId?: number;
  submitter?: string;
  success?: boolean;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  fromBlock?: number;
  toBlock?: number;
  blockNumber?: number;
}

export class DataSubmissionRepository extends BaseRepository {
  /**
   * Find data submission by ID
   */
  async findById(id: number): Promise<DataSubmissionWithTimestamp | null> {
    const submission = await this.prisma.dataSubmission.findUnique({
      where: { id },
    });
    
    if (!submission) return null;
    
    const timestamp = await getBlockTimestamp(this.prisma, submission.blockNumber);
    return {
      ...submission,
      timestamp: timestamp || new Date().toISOString(),
    };
  }

  /**
   * Find data submission by extrinsic hash
   */
  async findByExtrinsicHash(extrinsicHash: string): Promise<DataSubmissionWithTimestamp | null> {
    // Join with extrinsic_data table to find by hash
    const result = await this.prisma.$queryRaw<DataSubmission[]>`
      SELECT ds.*
      FROM data_submissions ds
      JOIN extrinsic_data ed ON ds.extrinsic_id = ed.id
      WHERE ed.extrinsic_hash = ${extrinsicHash}
      LIMIT 1
    `;
    
    if (!result || result.length === 0) return null;
    
    const submission = result[0];
    const timestamp = await getBlockTimestamp(this.prisma, submission.blockNumber);
    return {
      ...submission,
      timestamp: timestamp || new Date().toISOString(),
    };
  }

  /**
   * Check if data submission exists by ID
   */
  async exists(submissionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.dataSubmission.findFirst({
        where: { id: parseInt(submissionId, 10) || 0 },
        select: { id: true },
      });
      return result !== null;
    } catch (error) {
      logger.error('Failed to check data submission existence', {
        component: 'data-submission-repository',
        submissionId,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get data submissions for a block
   */
  async findByBlock(blockNumber: number): Promise<DataSubmissionWithTimestamp[]> {
    const submissions = await this.prisma.dataSubmission.findMany({
      where: { blockNumber: BigInt(blockNumber) },
      orderBy: { id: 'asc' },
    });

    // Get timestamps for each submission efficiently
    const blockNumbers = submissions.map(s => s.blockNumber);
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);
    
    const submissionsWithTimestamp = submissions.map((submission) => {
      const timestamp = timestampMap.get(submission.blockNumber.toString());
      return {
        ...submission,
        timestamp: timestamp || new Date().toISOString(),
      };
    });

    return submissionsWithTimestamp;
  }

  /**
   * Get data submissions for an app/rollup
   */
  async findByAppId(
    appId: number,
    params: { page?: number; limit?: number } = {},
  ): Promise<{ submissions: DataSubmissionWithTimestamp[]; total: number }> {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where: { appId: BigInt(appId) },
        skip,
        take: limit,
        orderBy: { blockNumber: 'desc' },
      }),
      this.prisma.dataSubmission.count({
        where: { appId: BigInt(appId) },
      }),
    ]);

    // Get timestamps for each submission efficiently
    const blockNumbers = submissions.map(s => s.blockNumber);
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);
    
    const submissionsWithTimestamp = submissions.map((submission) => {
      const timestamp = timestampMap.get(submission.blockNumber.toString());
      return {
        ...submission,
        timestamp: timestamp || new Date().toISOString(),
      };
    });

    return { submissions: submissionsWithTimestamp, total };
  }

  /**
   * Get paginated data submissions with filters
   */
  async findMany(
    filters: DataSubmissionFilters = {},
    params: { page?: number; limit?: number; orderBy?: 'asc' | 'desc' } = {},
  ): Promise<{ submissions: DataSubmissionWithTimestamp[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    // Build where clause from filters
    const where: Prisma.DataSubmissionWhereInput = {};
    
    if (filters.appId !== undefined) {
      where.appId = BigInt(filters.appId);
    }
    if (filters.submitter) {
      where.submitter = filters.submitter;
    }
    if (filters.blockNumber !== undefined) {
      where.blockNumber = BigInt(filters.blockNumber);
    }

    if (filters.fromBlock || filters.toBlock) {
      where.blockNumber = {};
      if (filters.fromBlock) {where.blockNumber.gte = BigInt(filters.fromBlock);}
      if (filters.toBlock) {where.blockNumber.lte = BigInt(filters.toBlock);}
    }

    const total = await this.prisma.dataSubmission.count({ where });

    // Use raw query to join with extrinsic_data and get real timestamps
    // For now, keep it simple and use the simpler approach with individual timestamp lookups
    const submissions = await this.prisma.dataSubmission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { blockNumber: orderBy },
    });

    // Get timestamps for each submission efficiently using batch query
    const blockNumbers = submissions.map(s => s.blockNumber);
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);
    
    const submissionsWithTimestamp = submissions.map((submission) => {
      const timestamp = timestampMap.get(submission.blockNumber.toString());
      return {
        ...submission,
        timestamp: timestamp || new Date().toISOString(), // fallback if timestamp not found
      };
    });

    return { submissions: submissionsWithTimestamp, total };
  }

  /**
   * Create new data submission
   */
  async create(data: DataSubmissionCreateInput): Promise<DataSubmission> {
    return this.prisma.dataSubmission.create({ data });
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
    
    if (filters.appId !== undefined) {
      where.appId = BigInt(filters.appId);
    }
    if (filters.fromBlock || filters.toBlock) {
      where.blockNumber = {};
      if (filters.fromBlock) where.blockNumber.gte = BigInt(filters.fromBlock);
      if (filters.toBlock) where.blockNumber.lte = BigInt(filters.toBlock);
    }

    const [
      totalCount,
      totalDataSize,
      uniqueSubmitters,
      uniqueApps,
    ] = await Promise.all([
      this.prisma.dataSubmission.count({ where }),
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
      totalDataSize: totalDataSize._sum.dataSize || 0,
      uniqueSubmitters: uniqueSubmitters.length,
      uniqueApps: uniqueApps.length,
    };
  }

  /**
   * Update data submission by extrinsic hash
   */
  async update(extrinsicHash: string, data: Partial<DataSubmissionCreateInput>): Promise<DataSubmission> {
    // First find the submission to get its ID
    const submission = await this.findByExtrinsicHash(extrinsicHash);
    if (!submission) {
      throw new Error(`Data submission not found for extrinsic hash: ${extrinsicHash}`);
    }
    
    return this.prisma.dataSubmission.update({
      where: { id: submission.id },
      data,
    });
  }

  /**
   * Delete data submission by extrinsic hash
   */
  async delete(extrinsicHash: string): Promise<DataSubmission> {
    // First find the submission to get its ID
    const submission = await this.findByExtrinsicHash(extrinsicHash);
    if (!submission) {
      throw new Error(`Data submission not found for extrinsic hash: ${extrinsicHash}`);
    }
    
    return this.prisma.dataSubmission.delete({
      where: { id: submission.id },
    });
  }

  /**
   * Get data submission count
   */
  async count(filters: DataSubmissionFilters = {}): Promise<number> {
    const where: Prisma.DataSubmissionWhereInput = {};
    
    if (filters.appId !== undefined) {where.appId = filters.appId;}
    if (filters.submitter) {where.submitter = filters.submitter;}
    if (filters.success !== undefined) {where.success = filters.success;}
    
    return this.prisma.dataSubmission.count({ where });
  }

  /**
   * Get total count of all data submissions
   */
  async getTotalCount(): Promise<number> {
    return this.prisma.dataSubmission.count();
  }

  /**
   * Get total data size of all submissions
   */
  async getTotalDataSize(): Promise<number> {
    const result = await this.prisma.dataSubmission.aggregate({
      _sum: { dataSize: true },
    });
    return result._sum.dataSize || 0;
  }

  /**
   * Get unique app count
   */
  async getUniqueAppCount(): Promise<number> {
    const result = await this.prisma.dataSubmission.groupBy({
      by: ['appId'],
      _count: { appId: true },
    });
    return result.length;
  }

  /**
   * Get count since date (estimated using block time)
   */
  async getCountSince(date: Date): Promise<number> {
    // Since we don't have timestamps, we'll estimate based on block time
    const now = new Date();
    const hoursSince = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    const blocksSince = Math.floor(hoursSince * 300); // ~300 blocks per hour with 12s block time
    
    // Get current max block and subtract
    const maxBlock = await this.prisma.dataSubmission.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    });
    
    if (!maxBlock) return 0;
    
    const fromBlock = Number(maxBlock.blockNumber) - blocksSince;
    
    return this.prisma.dataSubmission.count({
      where: {
        blockNumber: { gte: BigInt(Math.max(fromBlock, 0)) },
      },
    });
  }
}