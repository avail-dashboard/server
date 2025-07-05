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
    return this.prisma.extrinsic.findUnique({
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
    const data = extrinsics.map(ext => ({
      hash: ext.hash,
      blockNumber: ext.blockNumber,
      extrinsicIndex: ext.extrinsicIndex,
      module: ext.module,
      call: ext.call,
      success: ext.success,
      timestamp: ext.timestamp,
      signer: ext.signer,
      fee: ext.fee,
    }));

    return this.prisma.extrinsic.createMany({
      data,
      skipDuplicates: true,
    });
  }

  /**
   * Update extrinsic
   */
  async update(hash: string, data: Partial<ExtrinsicCreateInput>): Promise<Extrinsic> {
    return this.prisma.extrinsic.update({
      where: { hash },
      data: {
        ...(data.blockNumber !== undefined && { blockNumber: data.blockNumber }),
        ...(data.extrinsicIndex !== undefined && { extrinsicIndex: data.extrinsicIndex }),
        ...(data.module !== undefined && { module: data.module }),
        ...(data.call !== undefined && { call: data.call }),
        ...(data.success !== undefined && { success: data.success }),
        ...(data.timestamp !== undefined && { timestamp: data.timestamp }),
        ...(data.signer !== undefined && { signer: data.signer }),
        ...(data.fee !== undefined && { fee: data.fee }),
      },
    });
  }

  /**
   * Delete extrinsic
   */
  async delete(hash: string): Promise<Extrinsic> {
    return this.prisma.extrinsic.delete({
      where: { hash },
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