import { Extrinsic } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type ExtrinsicCreateInput = {
  hash: string;
  blockNumber: number;
  blockHash?: string | null;
  blockTimestamp?: Date | null;
  extrinsicIndex?: number | null;
  module?: string | null;
  call?: string | null;
  success?: boolean | null;
  timestamp?: Date | null;
  signer?: string | null;
  fee?: number | null;
  nonce?: number | null;
  lifetime?: any | null;
  parameters?: any | null;
  signatureInfo?: any | null;
  tip?: number | null;
  actualFee?: number | null;
  transferCount?: number | null;
  methodObject?: any | null;
  methodArgs?: any | null;
  extrinsicOrder?: number | null;
};

export class ExtrinsicRepository extends BaseRepository {
  /**
   * Find extrinsic by hash
   */
  async findByHash(hash: string): Promise<Extrinsic | null> {
    return this.prisma.extrinsic.findFirst({
      where: { hash },
    });
  }

  /**
   * Find extrinsic by hash and block number
   */
  async findByHashAndBlock(hash: string, blockNumber: number): Promise<Extrinsic | null> {
    return this.prisma.extrinsic.findFirst({
      where: { 
        hash,
        blockNumber 
      },
    });
  }

  /**
   * Get extrinsics for a block
   */
  async findByBlock(blockNumber: number): Promise<Extrinsic[]> {
    return this.prisma.extrinsic.findMany({
      where: { blockNumber },
      orderBy: { extrinsicIndex: 'asc' },
    });
  }

  /**
   * Get extrinsics with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  }): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [extrinsics, total] = await Promise.all([
      this.prisma.extrinsic.findMany({
        skip,
        take: limit,
        orderBy: { id: orderBy },
      }),
      this.prisma.extrinsic.count(),
    ]);

    return { extrinsics, total };
  }

  /**
   * Create new extrinsic with enhanced fields
   */
  async create(data: ExtrinsicCreateInput): Promise<Extrinsic> {
    if (data.extrinsicIndex === null || data.extrinsicIndex === undefined) {
      throw new Error('extrinsicIndex is required');
    }
    return this.prisma.extrinsic.create({
      data: {
        hash: data.hash,
        blockNumber: data.blockNumber,
        blockHash: data.blockHash,
        blockTimestamp: data.blockTimestamp,
        extrinsicIndex: data.extrinsicIndex,
        module: data.module,
        call: data.call,
        success: data.success,
        timestamp: data.timestamp,
        signer: data.signer,
        fee: data.fee,
        nonce: data.nonce,
        lifetime: data.lifetime,
        parameters: data.parameters,
        signatureInfo: data.signatureInfo,
        tip: data.tip,
        actualFee: data.actualFee,
        transferCount: data.transferCount,
        methodObject: data.methodObject,
        methodArgs: data.methodArgs,
        extrinsicOrder: data.extrinsicOrder,
      },
    });
  }

  /**
   * Create multiple extrinsics efficiently
   */
  async createMany(extrinsics: ExtrinsicCreateInput[]): Promise<{ count: number }> {
    const data = extrinsics.map(ext => {
      if (ext.extrinsicIndex === null || ext.extrinsicIndex === undefined) {
        throw new Error('extrinsicIndex is required for all extrinsics');
      }
      return {
        hash: ext.hash,
        blockNumber: ext.blockNumber,
        extrinsicIndex: ext.extrinsicIndex,
        module: ext.module,
        call: ext.call,
        success: ext.success,
        timestamp: ext.timestamp,
        signer: ext.signer,
        fee: ext.fee,
      }
    });

    return this.prisma.extrinsic.createMany({
      data,
      skipDuplicates: true,
    });
  }

  /**
   * Update extrinsic
   */
  async update(blockNumber: number, extrinsicIndex: number, data: Partial<ExtrinsicCreateInput>): Promise<Extrinsic> {
    const updateData: any = {};
    if (data.blockNumber !== undefined) updateData.blockNumber = data.blockNumber;
    if (data.extrinsicIndex !== undefined) updateData.extrinsicIndex = data.extrinsicIndex;
    if (data.module !== undefined) updateData.module = data.module;
    if (data.call !== undefined) updateData.call = data.call;
    if (data.success !== undefined) updateData.success = data.success;
    if (data.timestamp !== undefined) updateData.timestamp = data.timestamp;
    if (data.signer !== undefined) updateData.signer = data.signer;
    if (data.fee !== undefined) updateData.fee = data.fee;

    return this.prisma.extrinsic.update({
      where: { 
        unique_block_extrinsic: {
          blockNumber,
          extrinsicIndex
        }
       },
      data: updateData,
    });
  }

  /**
   * Delete extrinsic
   */
  async delete(blockNumber: number, extrinsicIndex: number): Promise<Extrinsic> {
    return this.prisma.extrinsic.delete({
      where: { 
        unique_block_extrinsic: {
          blockNumber,
          extrinsicIndex
        }
       },
    });
  }

  /**
   * Get extrinsic count
   */
  async count(): Promise<number> {
    return this.prisma.extrinsic.count();
  }

  /**
   * Find extrinsics by signer
   */
  async findBySigner(signer: string, params: { page?: number; limit?: number } = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [extrinsics, total] = await Promise.all([
      this.prisma.extrinsic.findMany({
        where: { signer },
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.extrinsic.count({
        where: { signer },
      }),
    ]);

    return { extrinsics, total };
  }

  /**
   * Count extrinsics by signer
   */
  async countBySigner(signer: string): Promise<number> {
    return this.prisma.extrinsic.count({
      where: { signer },
    });
  }

  /**
   * Find successful extrinsics
   */
  async findSuccessful(params: { page?: number; limit?: number } = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [extrinsics, total] = await Promise.all([
      this.prisma.extrinsic.findMany({
        where: { success: true },
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.extrinsic.count({
        where: { success: true },
      }),
    ]);

    return { extrinsics, total };
  }
} 