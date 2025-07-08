import { Era } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type EraCreateInput = {
  number: number;
  startBlock: number;
  endBlock?: number | null;
  totalStaked: string | number; // Decimal can be string or number
  validatorCount: number;
  active?: boolean;
};

export class EraRepository extends BaseRepository {
  /**
   * Find era by number with cache support
   */
  async findByNumber(number: number, useCache: boolean = true): Promise<Era | null> {
    const query = {
      where: { number },
    };

    return this.prisma.era.findUnique(
      this.buildCachedQuery(query, useCache, 1800) // 30 minutes cache for era data
    );
  }

  /**
   * Find era by number - force fresh data
   */
  async findByNumberFresh(number: number): Promise<Era | null> {
    return this.findByNumber(number, false);
  }

  /**
   * Get current active era with cache support
   */
  async getCurrentEra(useCache: boolean = true): Promise<Era | null> {
    const query = {
      where: { active: true },
      orderBy: { number: 'desc' as const },
    };

    return this.prisma.era.findFirst(
      this.buildCachedQuery(query, useCache, 300, 'current-era') // 5 minutes cache for current era
    );
  }

  /**
   * Find current era (alias for getCurrentEra)
   */
  async findCurrent(useCache: boolean = true): Promise<Era | null> {
    return this.getCurrentEra(useCache);
  }

  /**
   * Get eras with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'number' | 'startBlock' | 'totalStaked';
    orderDirection?: 'asc' | 'desc';
  }): Promise<{ eras: Era[]; total: number }> {
    const { 
      page = 1, 
      limit = 20, 
      orderBy = 'number',
      orderDirection = 'desc' 
    } = params;
    
    const skip = (page - 1) * limit;

    const [eras, total] = await Promise.all([
      this.prisma.era.findMany({
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
      }),
      this.prisma.era.count(),
    ]);

    return { eras, total };
  }

  /**
   * Create new era
   */
  async create(data: EraCreateInput): Promise<Era> {
    return this.prisma.era.create({
      data,
    });
  }

  /**
   * Update era
   */
  async update(number: number, data: Partial<EraCreateInput>): Promise<Era> {
    return this.prisma.era.update({
      where: { number },
      data,
    });
  }

  /**
   * End current era and start new one
   */
  async endEraAndStartNew(currentEraNumber: number, endBlock: number, newEraData: EraCreateInput): Promise<Era> {
    return this.transaction(async (tx: any) => {
      // End current era
      await tx.era.update({
        where: { number: currentEraNumber },
        data: { 
          endBlock,
          active: false,
        },
      });

      // Start new era
      return tx.era.create({
        data: newEraData,
      });
    });
  }

  /**
   * Get era statistics with cache support
   */
  async getStats(useCache: boolean = true): Promise<{
    totalEras: number;
    currentEra: number | null;
    averageValidatorCount: number;
    totalStakeHistory: number;
  }> {
    const [total, current, aggregates] = await Promise.all([
      this.prisma.era.count(
        this.buildCachedQuery({}, useCache, 600, 'era-total-count') // 10 minutes
      ),
      this.prisma.era.findFirst(
        this.buildCachedQuery({
          where: { active: true },
          select: { number: true },
        }, useCache, 300, 'era-current-number') // 5 minutes
      ),
      this.prisma.era.aggregate(
        this.buildCachedQuery({
          _avg: { validatorCount: true },
          _sum: { totalStaked: true },
        }, useCache, 1800, 'era-aggregates') // 30 minutes
      ),
    ]);

    return {
      totalEras: total,
      currentEra: current?.number || null,
      averageValidatorCount: aggregates._avg?.validatorCount || 0,
      totalStakeHistory: Number(aggregates._sum?.totalStaked) || 0,
    };
  }
} 