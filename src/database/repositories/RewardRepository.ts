import { BaseRepository } from './BaseRepository';

export type RewardCreateInput = {
  id: string;
  address: string;
  validatorAddress?: string | null;
  amount: bigint;
  era: number;
  rewardType: 'validator' | 'nominator' | 'slash';
  blockNumber: number;
  timestamp: Date;
};

export class RewardRepository extends BaseRepository {
  /**
   * Find reward by ID
   */
  async findById(id: string): Promise<any | null> {
    return this.prisma.reward.findUnique({
      where: { id },
    });
  }

  /**
   * Find rewards by address
   */
  async findByAddress(address: string, params: {
    page?: number;
    limit?: number;
    era?: number;
    rewardType?: string;
  } = {}): Promise<{ rewards: any[]; total: number }> {
    const { page = 1, limit = 20, era, rewardType } = params;
    const skip = (page - 1) * limit;

    const whereClause: any = { address };
    
    if (era !== undefined) {
      whereClause.era = era;
    }
    
    if (rewardType) {
      whereClause.rewardType = rewardType;
    }

    const [rewards, total] = await Promise.all([
      this.prisma.reward.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          validator: {
            select: {
              stashAddress: true,
              identityName: true,
            },
          },
          eraInfo: {
            select: {
              number: true,
              startBlock: true,
              endBlock: true,
            },
          },
        },
      }),
      this.prisma.reward.count({ where: whereClause }),
    ]);

    return { rewards, total };
  }

  /**
   * Find rewards by era
   */
  async findByEra(era: number): Promise<any[]> {
    return this.prisma.reward.findMany({
      where: { era },
      orderBy: { amount: 'desc' },
    });
  }

  /**
   * Find rewards by validator
   */
  async findByValidator(validatorAddress: string, params: {
    page?: number;
    limit?: number;
    era?: number;
  } = {}): Promise<{ rewards: any[]; total: number }> {
    const { page = 1, limit = 20, era } = params;
    const skip = (page - 1) * limit;

    const whereClause: any = { validatorAddress };
    
    if (era !== undefined) {
      whereClause.era = era;
    }

    const [rewards, total] = await Promise.all([
      this.prisma.reward.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.reward.count({ where: whereClause }),
    ]);

    return { rewards, total };
  }

  /**
   * Create new reward
   */
  async create(data: RewardCreateInput): Promise<any> {
    return this.prisma.reward.create({
      data,
    });
  }

  /**
   * Create multiple rewards efficiently
   */
  async createMany(rewards: RewardCreateInput[]): Promise<{ count: number }> {
    return this.prisma.reward.createMany({
      data: rewards,
      skipDuplicates: true,
    });
  }

  /**
   * Get reward statistics for an address
   */
  async getAddressStats(address: string, params: {
    fromEra?: number;
    toEra?: number;
  } = {}): Promise<{
    totalRewards: bigint;
    rewardCount: number;
    averageReward: number;
    rewardsByType: Record<string, { amount: bigint; count: number }>;
  }> {
    const { fromEra, toEra } = params;
    
    const whereClause: any = { address };
    
    if (fromEra !== undefined || toEra !== undefined) {
      whereClause.era = {};
      if (fromEra !== undefined) {
        whereClause.era.gte = fromEra;
      }
      if (toEra !== undefined) {
        whereClause.era.lte = toEra;
      }
    }

    const [aggregates, rewardsByType] = await Promise.all([
      this.prisma.reward.aggregate({
        where: whereClause,
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true },
      }),
      this.prisma.reward.groupBy({
        by: ['rewardType'],
        where: whereClause,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const rewardsByTypeMap: Record<string, { amount: bigint; count: number }> = {};
    rewardsByType.forEach(item => {
      rewardsByTypeMap[item.rewardType] = {
        amount: item._sum.amount || BigInt(0),
        count: item._count,
      };
    });

    return {
      totalRewards: aggregates._sum.amount || BigInt(0),
      rewardCount: aggregates._count,
      averageReward: aggregates._avg.amount || 0,
      rewardsByType: rewardsByTypeMap,
    };
  }

  /**
   * Get era reward summary
   */
  async getEraRewardSummary(era: number): Promise<{
    totalDistributed: bigint;
    validatorRewards: bigint;
    nominatorRewards: bigint;
    slashAmount: bigint;
    rewardCount: number;
  }> {
    const [aggregates, typeBreakdown] = await Promise.all([
      this.prisma.reward.aggregate({
        where: { era },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.reward.groupBy({
        by: ['rewardType'],
        where: { era },
        _sum: { amount: true },
      }),
    ]);

    const breakdown = typeBreakdown.reduce((acc, item) => {
      acc[item.rewardType] = item._sum.amount || BigInt(0);
      return acc;
    }, {} as Record<string, bigint>);

    return {
      totalDistributed: aggregates._sum.amount || BigInt(0),
      validatorRewards: breakdown.validator || BigInt(0),
      nominatorRewards: breakdown.nominator || BigInt(0),
      slashAmount: breakdown.slash || BigInt(0),
      rewardCount: aggregates._count,
    };
  }
} 