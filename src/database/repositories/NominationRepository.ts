import { BaseRepository } from './BaseRepository';

// These types will be available after database migration and client regeneration
export type NominationCreateInput = {
  id: string;
  nominatorAddress: string;
  validatorAddress: string;
  amount: bigint;
  era?: number | null;
  active?: boolean;
};

export type NominationFilters = {
  nominatorAddress?: string;
  validatorAddress?: string;
  era?: number;
  active?: boolean;
};

export class NominationRepository extends BaseRepository {
  /**
   * Find nomination by ID
   */
  async findById(id: string): Promise<any | null> {
    return this.prisma.nomination.findUnique({
      where: { id },
    });
  }

  /**
   * Find nominations by nominator address
   */
  async findByNominator(nominatorAddress: string): Promise<any[]> {
    return this.prisma.nomination.findMany({
      where: { nominatorAddress },
      include: {
        validator: {
          select: {
            stashAddress: true,
            identityName: true,
            commission: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Find nominations by validator address with pagination
   */
  async findByValidator(validatorAddress: string, params: {
    page?: number;
    limit?: number;
  } = {}): Promise<{ nominations: any[]; total: number }> {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [nominations, total] = await Promise.all([
      this.prisma.nomination.findMany({
        where: { validatorAddress },
        skip,
        take: limit,
        include: {
          nominator: {
            select: {
              address: true,
              identityName: true,
            },
          },
        },
        orderBy: { amount: 'desc' },
      }),
      this.prisma.nomination.count({
        where: { validatorAddress },
      }),
    ]);

    return { nominations, total };
  }

  /**
   * Count nominations by validator
   */
  async countByValidator(validatorAddress: string): Promise<number> {
    return this.prisma.nomination.count({
      where: { validatorAddress },
    });
  }

  /**
   * Get nominations with filters and pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    filters?: NominationFilters;
    orderBy?: 'amount' | 'era' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
  }): Promise<{ nominations: any[]; total: number }> {
    const { 
      page = 1, 
      limit = 20, 
      filters = {}, 
      orderBy = 'amount',
      orderDirection = 'desc' 
    } = params;
    
    const skip = (page - 1) * limit;
    
    const whereClause: any = {};
    
    if (filters.nominatorAddress) {
      whereClause.nominatorAddress = filters.nominatorAddress;
    }
    
    if (filters.validatorAddress) {
      whereClause.validatorAddress = filters.validatorAddress;
    }
    
    if (filters.era !== undefined) {
      whereClause.era = filters.era;
    }
    
    if (filters.active !== undefined) {
      whereClause.active = filters.active;
    }

    const [nominations, total] = await Promise.all([
      this.prisma.nomination.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
      }),
      this.prisma.nomination.count({ where: whereClause }),
    ]);

    return { nominations, total };
  }

  /**
   * Create new nomination
   */
  async create(data: NominationCreateInput): Promise<any> {
    return this.prisma.nomination.create({
      data,
    });
  }

  /**
   * Create multiple nominations efficiently
   */
  async createMany(nominations: NominationCreateInput[]): Promise<{ count: number }> {
    return this.prisma.nomination.createMany({
      data: nominations,
      skipDuplicates: true,
    });
  }

  /**
   * Update nomination
   */
  async update(id: string, data: Partial<NominationCreateInput>): Promise<any> {
    return this.prisma.nomination.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Upsert nomination (create or update)
   */
  async upsert(id: string, data: NominationCreateInput): Promise<any> {
    return this.prisma.nomination.upsert({
      where: { id },
      create: data,
      update: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get active nominations for an era
   */
  async findActiveByEra(era: number): Promise<any[]> {
    return this.prisma.nomination.findMany({
      where: {
        era,
        active: true,
      },
      include: {
        validator: true,
        nominator: true,
      },
    });
  }

  /**
   * Count nominations by era
   */
  async countByEra(era: number): Promise<number> {
    return this.prisma.nomination.count({
      where: { era },
    });
  }

  /**
   * Delete nomination
   */
  async delete(id: string): Promise<any> {
    return this.prisma.nomination.delete({
      where: { id },
    });
  }
} 