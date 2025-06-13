import { Block, Prisma } from '@prisma/client';
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
   * Find block by number
   */
  async findByNumber(blockNumber: bigint): Promise<Block | null> {
    return this.prisma.block.findUnique({
      where: { number: blockNumber },
    });
  }

  /**
   * Find block by hash
   */
  async findByHash(hash: string): Promise<Block | null> {
    return this.prisma.block.findUnique({
      where: { hash },
    });
  }

  /**
   * Get latest block
   */
  async getLatest(): Promise<Block | null> {
    return this.prisma.block.findFirst({
      orderBy: { number: 'desc' },
    });
  }

  /**
   * Get blocks with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  }): Promise<{ blocks: Block[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [blocks, total] = await Promise.all([
      this.prisma.block.findMany({
        skip,
        take: limit,
        orderBy: { number: orderBy },
      }),
      this.prisma.block.count(),
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
   * Get block with related data
   */
  async findWithRelations(blockNumber: bigint): Promise<BlockWithExtrinsics | null> {
    return this.prisma.block.findUnique({
      where: { number: blockNumber },
      include: {
        extrinsics: {
          select: {
            id: true,
            hash: true,
            success: true,
          },
        },
      },
    });
  }

  /**
   * Get blocks in range
   */
  async findInRange(fromBlock: bigint, toBlock: bigint): Promise<Block[]> {
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
   * Get block count
   */
  async count(): Promise<number> {
    return this.prisma.block.count();
  }

  /**
   * Update block
   */
  async update(blockNumber: bigint, data: Partial<BlockCreateInput>): Promise<Block> {
    return this.prisma.block.update({
      where: { number: blockNumber },
      data,
    });
  }

  /**
   * Delete block
   */
  async delete(blockNumber: bigint): Promise<Block> {
    return this.prisma.block.delete({
      where: { number: blockNumber },
    });
  }
}