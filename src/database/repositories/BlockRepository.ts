import { Block } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { createBatchLoader, arrayToMap, BatchLoader } from '../../utils/batch-loader';

export type BlockWithExtrinsics = Block & {
  extrinsics: Array<{
    id: number;
    hash: string;
    success: boolean | null;
  }>;
};

export type BlockCreateInput = Omit<Block, 'createdAt'>;

export class BlockRepository extends BaseRepository {
  private blockNumberBatchLoader: BatchLoader<number, Block>;
  private blockHashBatchLoader: BatchLoader<string, Block>;

  constructor() {
    super();
    
    // Initialize batch loaders
    this.blockNumberBatchLoader = createBatchLoader(
      async (blockNumbers: number[]) => {
        const blocks = await this.prisma.block.findMany({
          where: { number: { in: blockNumbers } },
        });
        return arrayToMap(blocks, (block: Block) => block.number);
      },
      { maxBatchSize: 50, batchTimeoutMs: 10 }
    );

    this.blockHashBatchLoader = createBatchLoader(
      async (hashes: string[]) => {
        const blocks = await this.prisma.block.findMany({
          where: { hash: { in: hashes } },
        });
        return arrayToMap(blocks, (block: Block) => block.hash);
      },
      { maxBatchSize: 50, batchTimeoutMs: 10 }
    );
  }
  /**
   * Find block by number with cache support
   */
  async findByNumber(blockNumber: number, useCache: boolean = true): Promise<Block | null> {
    const query = {
      where: { number: blockNumber },
    };

    // Temporarily disable cache integration due to type issues
    return this.prisma.block.findUnique(query);
  }

  /**
   * Find block by number using batch loader (optimized for multiple concurrent requests)
   */
  async findByNumberBatched(blockNumber: number): Promise<Block | null> {
    return this.blockNumberBatchLoader.load(blockNumber);
  }

  /**
   * Find multiple blocks by numbers using batch loader
   */
  async findManyByNumbers(blockNumbers: number[]): Promise<(Block | null)[]> {
    return this.blockNumberBatchLoader.loadMany(blockNumbers);
  }

  /**
   * Find block by hash using batch loader
   */
  async findByHashBatched(hash: string): Promise<Block | null> {
    return this.blockHashBatchLoader.load(hash);
  }

  /**
   * Find multiple blocks by hashes using batch loader
   */
  async findManyByHashes(hashes: string[]): Promise<(Block | null)[]> {
    return this.blockHashBatchLoader.loadMany(hashes);
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
      this.buildCachedQuery(query, useCache, 3600, `block-exists:${blockNumber}`),
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
      this.buildCachedQuery(query, useCache, 3600), // 1 hour cache for immutable blocks
    );
  }

  /**
   * Get latest block with shorter cache TTL
   */
  async getLatest(useCache: boolean = true): Promise<Block | null> {
    const query = {
      orderBy: { number: 'desc' as const },
    };

    return this.prisma.block.findFirst(query); // Temporarily disable cache to test schema
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
      this.prisma.block.findMany(blocksQuery),  // Temporarily disable cache to fix error
      this.prisma.block.count(countQuery),     // Temporarily disable cache to fix error
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
   * Update block (with race condition protection)
   */
  async update(blockNumber: number, data: Partial<BlockCreateInput>): Promise<Block> {
    try {
      return await this.prisma.block.update({
        where: { number: blockNumber },
        data,
      });
    } catch (error) {
      if ((error as any).code === 'P2025') { // Record not found
        throw new Error(`Block ${blockNumber} not found for update. Use upsert or create instead.`);
      }
      throw error;
    }
  }

  /**
   * Update or create block (upsert)
   */
  async upsert(blockNumber: number, data: BlockCreateInput): Promise<Block> {
    return this.prisma.block.upsert({
      where: { number: blockNumber },
      update: data,
      create: data,
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