import { DataSubmission, Rollup, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';

export type DataSubmissionWithRollup = DataSubmission;

export type DataSubmissionCreateInput = {
  extrinsicHash: string;
  blockNumber: number;
  blockHash?: string | null;
  blockTimestamp?: Date | null;
  extrinsicIndex?: number | null;
  appId: number;
  rollupName?: string | null;
  dataSize: number;
  dataHash: string;
  submitter: string;
  timestamp: Date;
  success?: boolean;
  blobData?: Buffer | null;
  kateCommitment?: string | null;
  proof?: any;
};

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
   * Find data submission by extrinsic hash
   */
  async findByExtrinsicHash(hash: string): Promise<DataSubmission | null> {
    return this.prisma.dataSubmission.findUnique({
      where: { extrinsicHash: hash },
    });
  }

  /**
   * Check if data submission exists by ID or extrinsic hash
   */
  async exists(submissionId: string): Promise<boolean> {
    try {
      const result = await this.prisma.dataSubmission.findFirst({
        where: { 
          OR: [
            { id: parseInt(submissionId, 10) || 0 },
            { extrinsicHash: submissionId },
          ],
        },
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
   * Find data submission by data hash
   */
  async findByHash(dataHash: string): Promise<DataSubmission | null> {
    return this.prisma.dataSubmission.findFirst({
      where: { dataHash },
    });
  }

  /**
   * Get data submissions for a block
   */
  async findByBlock(blockNumber: number): Promise<DataSubmission[]> {
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
      totalDataSize: totalDataSize._sum.dataSize || 0,
      uniqueSubmitters: uniqueSubmitters.length,
      uniqueRollups: uniqueRollups.length,
    };
  }

  /**
   * Update data submission
   */
  async update(extrinsicHash: string, data: Partial<DataSubmissionCreateInput>): Promise<DataSubmission> {
    return this.prisma.dataSubmission.update({
      where: { extrinsicHash },
      data,
    });
  }

  /**
   * Delete data submission
   */
  async delete(extrinsicHash: string): Promise<DataSubmission> {
    return this.prisma.dataSubmission.delete({
      where: { extrinsicHash },
    });
  }

  /**
   * Get data submission count
   */
  async count(filters: DataSubmissionFilters = {}): Promise<number> {
    const where: Prisma.DataSubmissionWhereInput = {};
    
    if (filters.appId !== undefined) where.appId = filters.appId;
    if (filters.submitter) where.submitter = filters.submitter;
    if (filters.success !== undefined) where.success = filters.success;
    
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
   * Get count of unique app IDs
   */
  async getUniqueAppCount(): Promise<number> {
    const result = await this.prisma.dataSubmission.groupBy({
      by: ['appId'],
      _count: { appId: true },
    });
    return result.length;
  }

  /**
   * Get count of submissions since a specific date
   */
  async getCountSince(date: Date): Promise<number> {
    return this.prisma.dataSubmission.count({
      where: {
        timestamp: {
          gte: date,
        },
      },
    });
  }
}