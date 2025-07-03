import { Validator, ValidatorStatus } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

// Note: ValidatorWithRelations type is kept for backward compatibility
// but methods now return simplified Validator objects without relations
export type ValidatorWithRelations = Validator;

export type ValidatorCreateInput = {
  stashAddress: string;
  controllerAddress?: string | null;
  rewardAddress?: string | null;
  commission: number;
  selfBonded: number;
  totalBonded: number;
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
   */
  async findByStashAddress(stashAddress: string): Promise<Validator | null> {
    return this.prisma.validator.findUnique({
      where: { stashAddress },
    });
  }

  /**
   * Check if validator exists by stash address
   */
  async exists(stashAddress: string): Promise<boolean> {
    const result = await this.prisma.validator.findFirst({
      where: { stashAddress },
      select: { stashAddress: true },
    });
    return result !== null;
  }

  /**
   * Find validator without relations (simplified)
   */
  async findWithRelations(stashAddress: string): Promise<ValidatorWithRelations | null> {
    return this.prisma.validator.findUnique({
      where: { stashAddress },
    });
  }

  /**
   * Get all validators with filters and pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    filters?: ValidatorFilters;
    orderBy?: 'totalBonded' | 'commission' | 'blocksProduced' | 'lastBlockProduced';
    orderDirection?: 'asc' | 'desc';
  }): Promise<{ validators: Validator[]; total: number }> {
    const { 
      page = 1, 
      limit = 20, 
      filters = {}, 
      orderBy = 'totalBonded',
      orderDirection = 'desc' 
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
      this.prisma.validator.count({ where: whereClause }),
    ]);

    return { validators, total };
  }

  /**
   * Get active validators
   */
  async findActive(): Promise<Validator[]> {
    return this.prisma.validator.findMany({
      where: { status: 'active' },
      orderBy: { totalBonded: 'desc' },
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
    const { stashAddress: _, ...updateData } = data;
    
    // Build update object with only defined fields
    const updateObject: any = {
      updatedAt: new Date(),
    };

    if (updateData.status !== undefined) updateObject.status = updateData.status;
    if (updateData.controllerAddress !== undefined) updateObject.controllerAddress = updateData.controllerAddress;
    if (updateData.rewardAddress !== undefined) updateObject.rewardAddress = updateData.rewardAddress;
    if (updateData.commission !== undefined) updateObject.commission = updateData.commission;
    if (updateData.selfBonded !== undefined) updateObject.selfBonded = updateData.selfBonded;
    if (updateData.totalBonded !== undefined) updateObject.totalBonded = updateData.totalBonded;
    if (updateData.nominatorCount !== undefined) updateObject.nominatorCount = updateData.nominatorCount;
    if (updateData.sessionKeys !== undefined) updateObject.sessionKeys = updateData.sessionKeys;
    if (updateData.identityName !== undefined) updateObject.identityName = updateData.identityName;
    if (updateData.identityInfo !== undefined) updateObject.identityInfo = updateData.identityInfo;
    if (updateData.blocksProduced !== undefined) updateObject.blocksProduced = updateData.blocksProduced;
    if (updateData.lastBlockProduced !== undefined) updateObject.lastBlockProduced = updateData.lastBlockProduced;
    
    return this.prisma.validator.upsert({
      where: { stashAddress },
      create: data,
      update: updateObject,
    });
  }

  /**
   * Update validator statistics
   */
  async updateStats(stashAddress: string, stats: {
    blocksProduced?: number;
    lastBlockProduced?: number;
    totalBonded?: number;
    nominatorCount?: number;
  }): Promise<Validator> {
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
   */
  async getStats(): Promise<{
    totalValidators: number;
    activeValidators: number;
    totalStaked: number;
    averageCommission: number;
  }> {
    const [total, active, staking, commission] = await Promise.all([
      this.prisma.validator.count(),
      this.prisma.validator.count({ where: { status: 'active' } }),
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
      totalValidators: total,
      activeValidators: active,
      totalStaked: staking._sum.totalBonded || 0,
      averageCommission: commission._avg.commission || 0,
    };
  }

  /**
   * Find validators by controller address
   */
  async findByControllerAddress(controllerAddress: string): Promise<Validator | null> {
    return this.prisma.validator.findUnique({
      where: { controllerAddress },
    });
  }

  /**
   * Get top validators by total bonded
   */
  async getTopValidators(limit: number = 10): Promise<Validator[]> {
    return this.prisma.validator.findMany({
      where: { status: 'active' },
      orderBy: { totalBonded: 'desc' },
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