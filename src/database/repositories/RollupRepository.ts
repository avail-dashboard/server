import { Rollup } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type RollupCreateInput = {
  appId: number;
  name: string;
  description?: string | null;
  firstSeenBlock?: number | null;
  lastActiveBlock?: number | null;
  totalSubmissions?: number;
  totalDataSize?: number;
  totalFeesPaid?: number;
  website?: string | null;
  logoUrl?: string | null;
};

export class RollupRepository extends BaseRepository {
  /**
   * Find rollup by app ID
   */
  async findByAppId(appId: number | bigint): Promise<Rollup | null> {
    try {
      // Convert BigInt to number safely
      const numericAppId = typeof appId === 'bigint' ? Number(appId) : appId;
      
      return await this.prisma.rollup.findUnique({
        where: { appId: numericAppId },
      });
    } catch (error) {
      // Handle various rollup table related errors gracefully
      const err = error as any;
      if (err.code === 'P2021' || err.code === 'P1001' || 
          err.message?.includes('table') || 
          err.message?.includes('rollup')) {
        // Table doesn't exist or other rollup-related error, return null
        return null;
      }
      throw error;
    }
  }

  /**
   * Find rollup by name (exact match)
   */
  async findByName(name: string): Promise<Rollup[]> {
    const rollup = await this.prisma.rollup.findFirst({
      where: { name },
    });
    return rollup ? [rollup] : [];
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
    totalDataSize?: number;
    totalFeesPaid?: number;
    lastActiveBlock?: number;
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
    dataSizeIncrement?: number;
    feesIncrement?: number;
  }): Promise<Rollup> {
    const { submissionsIncrement = 0, dataSizeIncrement = 0, feesIncrement = 0 } = increments;
    
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
    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    
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