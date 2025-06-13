import { Rollup, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type RollupCreateInput = {
  appId: number;
  name: string;
  description?: string | null;
  firstSeenBlock?: bigint | null;
  lastActiveBlock?: bigint | null;
  totalSubmissions?: number;
  totalDataSize?: bigint;
  totalFeesPaid?: bigint;
  website?: string | null;
  logoUrl?: string | null;
};

export class RollupRepository extends BaseRepository {
  /**
   * Find rollup by app ID
   */
  async findByAppId(appId: number): Promise<Rollup | null> {
    return this.prisma.rollup.findUnique({
      where: { appId },
    });
  }

  /**
   * Find rollup by name
   */
  async findByName(name: string): Promise<Rollup | null> {
    return this.prisma.rollup.findFirst({
      where: { name },
    });
  }

  /**
   * Get all rollups with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'name' | 'totalSubmissions' | 'lastActiveBlock';
    order?: 'asc' | 'desc';
  } = {}): Promise<{ rollups: Rollup[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'lastActiveBlock', order = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [rollups, total] = await Promise.all([
      this.prisma.rollup.findMany({
        skip,
        take: limit,
        orderBy: { [orderBy]: order },
      }),
      this.prisma.rollup.count(),
    ]);

    return { rollups, total };
  }

  /**
   * Create new rollup
   */
  async create(data: RollupCreateInput): Promise<Rollup> {
    return this.prisma.rollup.create({
      data,
    });
  }

  /**
   * Create multiple rollups efficiently
   */
  async createMany(rollups: RollupCreateInput[]): Promise<{ count: number }> {
    return this.prisma.rollup.createMany({
      data: rollups,
      skipDuplicates: true,
    });
  }

  /**
   * Update rollup
   */
  async update(appId: number, data: Partial<RollupCreateInput>): Promise<Rollup> {
    return this.prisma.rollup.update({
      where: { appId },
      data,
    });
  }

  /**
   * Update rollup statistics
   */
  async updateStats(appId: number, stats: {
    totalSubmissions?: number;
    totalDataSize?: bigint;
    totalFeesPaid?: bigint;
    lastActiveBlock?: bigint;
  }): Promise<Rollup> {
    return this.prisma.rollup.update({
      where: { appId },
      data: stats,
    });
  }

  /**
   * Increment rollup statistics
   */
  async incrementStats(appId: number, increments: {
    submissionsIncrement?: number;
    dataSizeIncrement?: bigint;
    feesIncrement?: bigint;
  }): Promise<Rollup> {
    const { submissionsIncrement = 0, dataSizeIncrement = 0n, feesIncrement = 0n } = increments;
    
    return this.prisma.rollup.update({
      where: { appId },
      data: {
        totalSubmissions: { increment: submissionsIncrement },
        totalDataSize: { increment: dataSizeIncrement },
        totalFeesPaid: { increment: feesIncrement },
      },
    });
  }

  /**
   * Delete rollup
   */
  async delete(appId: number): Promise<Rollup> {
    return this.prisma.rollup.delete({
      where: { appId },
    });
  }

  /**
   * Get active rollups (recently active)
   */
  async findActive(hoursBack: number = 24): Promise<Rollup[]> {
    const cutoffTime = BigInt(Date.now() - (hoursBack * 60 * 60 * 1000));
    
    return this.prisma.rollup.findMany({
      where: {
        lastActiveBlock: {
          gte: cutoffTime,
        },
      },
      orderBy: { lastActiveBlock: 'desc' },
    });
  }

  /**
   * Get rollup leaderboard by submissions
   */
  async getLeaderboard(limit: number = 10): Promise<Rollup[]> {
    return this.prisma.rollup.findMany({
      take: limit,
      orderBy: { totalSubmissions: 'desc' },
    });
  }

  /**
   * Get rollup count
   */
  async count(): Promise<number> {
    return this.prisma.rollup.count();
  }

  /**
   * Upsert rollup (create or update)
   */
  async upsert(appId: number, createData: RollupCreateInput, updateData?: Partial<RollupCreateInput>): Promise<Rollup> {
    return this.prisma.rollup.upsert({
      where: { appId },
      create: createData,
      update: updateData || {},
    });
  }
}