import { Validator, ValidatorStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BaseRepository } from './BaseRepository';

// Note: ValidatorWithRelations type is kept for backward compatibility
// but methods now return simplified Validator objects without relations
export type ValidatorWithRelations = Validator;

export type ValidatorCreateInput = {
  stashAddress: string;
  controllerAddress?: string | null;
  rewardAddress?: string | null;
  commission: number;
  selfBonded: Decimal;
  totalBonded: Decimal;
  nominatorCount?: number;
  status?: ValidatorStatus;
  sessionKeys?: any;
  identityName?: string | null;
  identityInfo?: any;
  blocksProduced?: number;
  lastBlockProduced?: number | null;
};

export type ValidatorUpdateInput = Partial<Omit<Validator, 'stashAddress' | 'createdAt' | 'updatedAt'>>;

export type ValidatorFilters = {
  status?: ValidatorStatus;
  minTotalBonded?: number;
  maxTotalBonded?: number;
  hasIdentity?: boolean;
  isActive?: boolean;
};

export class ValidatorRepository extends BaseRepository {
  /**
   * Find validator by stash address
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async findByStashAddress(stashAddress: string, _useCache: boolean = true): Promise<Validator | null> {
    return this.prisma.validator.findUnique({
      where: { stashAddress },
    });
  }

  /**
   * Find validator by stash address - force fresh data
   */
  async findByStashAddressFresh(stashAddress: string): Promise<Validator | null> {
    return this.findByStashAddress(stashAddress, false);
  }

  /**
   * Check if validator exists by stash address
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async exists(stashAddress: string, _useCache: boolean = true): Promise<boolean> {
    const result = await this.prisma.validator.findFirst({
      where: { stashAddress },
      select: { stashAddress: true },
    });
    return result !== null;
  }

  /**
   * Find validator without relations (simplified)
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async findWithRelations(
    stashAddress: string,
    _useCache: boolean = true
  ): Promise<ValidatorWithRelations | null> {
    return this.prisma.validator.findUnique({
      where: { stashAddress },
    });
  }

  /**
   * Get all validators with filters and pagination
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    filters?: ValidatorFilters;
    orderBy?: 'totalBonded' | 'commission' | 'blocksProduced' | 'lastBlockProduced';
    orderDirection?: 'asc' | 'desc';
    useCache?: boolean;
  }): Promise<{ validators: Validator[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      filters = {},
      orderBy = 'totalBonded',
      orderDirection = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (filters.status) {
      whereClause.status = filters.status;
    }

    if (filters.minTotalBonded || filters.maxTotalBonded) {
      whereClause.totalBonded = {};
      if (filters.minTotalBonded) {
        whereClause.totalBonded.gte = filters.minTotalBonded;
      }
      if (filters.maxTotalBonded) {
        whereClause.totalBonded.lte = filters.maxTotalBonded;
      }
    }

    if (filters.hasIdentity !== undefined) {
      whereClause.identityName = filters.hasIdentity ? { not: null } : null;
    }

    if (filters.isActive !== undefined) {
      whereClause.status = filters.isActive ? 'active' : { not: 'active' };
    }

    const [validators, total] = await Promise.all([
      this.prisma.validator.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
      }),
      this.prisma.validator.count({
        where: whereClause,
      }),
    ]);

    return { validators, total };
  }

  /**
   * Get active validators
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async findActive(_useCache: boolean = true): Promise<Validator[]> {
    return this.prisma.validator.findMany({
      where: { status: 'active' as ValidatorStatus },
      orderBy: { totalBonded: 'desc' as const },
    });
  }

  /**
   * Create new validator
   */
  async create(data: ValidatorCreateInput): Promise<Validator> {
    return this.prisma.validator.create({
      data,
    });
  }

  /**
   * Create multiple validators efficiently
   */
  async createMany(validators: ValidatorCreateInput[]): Promise<{ count: number }> {
    return this.prisma.validator.createMany({
      data: validators,
      skipDuplicates: true,
    });
  }

  /**
   * Update validator
   */
  async update(stashAddress: string, data: ValidatorUpdateInput): Promise<Validator> {
    // Build update object with only defined fields
    const updateObject: any = {
      updatedAt: new Date(),
    };

    // Only include fields that are actually provided
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updateObject[key] = value;
      }
    });

    return this.prisma.validator.update({
      where: { stashAddress },
      data: updateObject,
    });
  }

  /**
   * Upsert validator (create or update)
   */
  async upsert(stashAddress: string, data: ValidatorCreateInput): Promise<Validator> {
    const updateData = { ...data };
    delete (updateData as any).stashAddress; // Remove stashAddress from update data

    return this.prisma.validator.upsert({
      where: { stashAddress },
      update: {
        ...updateData,
        updatedAt: new Date(),
      },
      create: data,
    });
  }

  /**
   * Update validator statistics
   */
  async updateStats(
    stashAddress: string,
    stats: {
      blocksProduced?: number;
      lastBlockProduced?: number;
      totalBonded?: number;
      nominatorCount?: number;
    }
  ): Promise<Validator> {
    return this.prisma.validator.update({
      where: { stashAddress },
      data: {
        ...stats,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get validator statistics
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async getStats(
    _useCache: boolean = true
  ): Promise<{
    totalValidators: number;
    activeValidators: number;
    totalStaked: number;
    averageCommission: number;
  }> {
    const [totalValidators, activeValidators, stakingAggregates, commissionAggregates] = await Promise.all([
      this.prisma.validator.count(),
      this.prisma.validator.count({
        where: { status: 'active' },
      }),
      this.prisma.validator.aggregate({
        _sum: { totalBonded: true },
        where: { status: 'active' },
      }),
      this.prisma.validator.aggregate({
        _avg: { commission: true },
        where: { status: 'active' },
      }),
    ]);

    return {
      totalValidators,
      activeValidators,
      totalStaked: Number(stakingAggregates._sum.totalBonded || 0),
      averageCommission: Number(commissionAggregates._avg.commission || 0),
    };
  }

  /**
   * Find validator by controller address
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async findByControllerAddress(
    controllerAddress: string,
    _useCache: boolean = true
  ): Promise<Validator | null> {
    return this.prisma.validator.findUnique({
      where: { controllerAddress },
    });
  }

  /**
   * Get top validators by total bonded
   * TODO: Re-enable caching once TypeScript compatibility is resolved
   */
  async getTopValidators(limit: number = 10, _useCache: boolean = true): Promise<Validator[]> {
    return this.prisma.validator.findMany({
      where: { status: 'active' as ValidatorStatus },
      orderBy: { totalBonded: 'desc' as const },
      take: limit,
    });
  }

  /**
   * Delete validator
   */
  async delete(stashAddress: string): Promise<Validator> {
    return this.prisma.validator.delete({
      where: { stashAddress },
    });
  }
}