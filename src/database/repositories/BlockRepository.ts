import { Block } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type BlockWithExtrinsics = Block & {
  extrinsics: Array<{
    id: number;
    hash: string;
    success: boolean | null;
  }>;
};

export type BlockCreateInput = Omit<Block, 'createdAt'>;

export class BlockRepository extends BaseRepository {
  /**
   * Find block by number with cache support
   */
  async findByNumber(blockNumber: number, useCache: boolean = true): Promise<Block | null> {
    const query = {
      where: { number: blockNumber },
    };

    return this.prisma.block.findUnique(
      this.buildCachedQuery(query, useCache, 3600) // 1 hour cache for immutable blocks
    );
  }

  /**
   * Find block by number - force fresh data
   */
  async findByNumberFresh(blockNumber: number): Promise<Block | null> {
    return this.findByNumber(blockNumber, false);
  }

  /**
   * Check if block exists by number with cache support
   */
  async exists(blockNumber: number, useCache: boolean = true): Promise<boolean> {
    const query = {
      where: { number: blockNumber },
      select: { number: true },
    };

    const result = await this.prisma.block.findFirst(
      this.buildCachedQuery(query, useCache, 3600, `block-exists:${blockNumber}`)
    );
    return result !== null;
  }

  /**
   * Find block by hash with cache support
   */
  async findByHash(hash: string, useCache: boolean = true): Promise<Block | null> {
    const query = {
      where: { hash },
    };

    return this.prisma.block.findUnique(
      this.buildCachedQuery(query, useCache, 3600) // 1 hour cache for immutable blocks
    );
  }

  /**
   * Get latest block with shorter cache TTL
   */
  async getLatest(useCache: boolean = true): Promise<Block | null> {
    const query = {
      orderBy: { number: 'desc' as const },
    };

    return this.prisma.block.findFirst(
      this.buildCachedQuery(query, useCache, 60, 'latest-block') // 1 minute cache for latest block
    );
  }

  /**
   * Get blocks with pagination and cache support
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
    useCache?: boolean;
  }): Promise<{ blocks: Block[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc', useCache = true } = params;
    const skip = (page - 1) * limit;

    const cacheKey = `blocks-page:${page}:${limit}:${orderBy}`;

    const blocksQuery = {
      skip,
      take: limit,
      orderBy: { number: orderBy },
    };

    const countQuery = {};

    const [blocks, total] = await Promise.all([
      this.prisma.block.findMany(
        this.buildCachedQuery(blocksQuery, useCache, 300, cacheKey) // 5 minutes for paginated results
      ),
      this.prisma.block.count(
        this.buildCachedQuery(countQuery, useCache, 300, 'blocks-total-count') // 5 minutes for count
      ),
    ]);

    return { blocks, total };
  }

  /**
   * Create new block
   */
  async create(data: BlockCreateInput): Promise<Block> {
    return this.prisma.block.create({
      data,
    });
  }

  /**
   * Create multiple blocks efficiently
   */
  async createMany(blocks: BlockCreateInput[]): Promise<{ count: number }> {
    return this.prisma.block.createMany({
      data: blocks,
      skipDuplicates: true,
    });
  }

  /**
   * Get block with related data (simplified - no relations)
   */
  async findWithRelations(blockNumber: number): Promise<Block | null> {
    return this.prisma.block.findUnique({
      where: { number: blockNumber },
    });
  }

  /**
   * Get blocks in range
   */
  async findInRange(fromBlock: number, toBlock: number): Promise<Block[]> {
    return this.prisma.block.findMany({
      where: {
        number: {
          gte: fromBlock,
          lte: toBlock,
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  /**
   * Find blocks by validator address
   * TODO: Fix after Prisma client regeneration
   */
  async findByValidator(_validatorAddress: string, _params: {
    page?: number;
    limit?: number;
  } = {}): Promise<{ blocks: Block[]; total: number }> {
    // Temporary implementation - return empty results until Prisma client is updated
    return { blocks: [], total: 0 };
  }

  /**
   * Get block count
   */
  async count(): Promise<number> {
    return this.prisma.block.count();
  }

  /**
   * Update block
   */
  async update(blockNumber: number, data: Partial<BlockCreateInput>): Promise<Block> {
    return this.prisma.block.update({
      where: { number: blockNumber },
      data,
    });
  }

  /**
   * Delete block
   */
  async delete(blockNumber: number): Promise<Block> {
    return this.prisma.block.delete({
      where: { number: blockNumber },
    });
  }
}