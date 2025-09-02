import { ExtrinsicApiResponse } from '../types/database';
import { PrismaClient } from '@prisma/client';
import { getBlockTimestamp, getBlockTimestamps } from '../utils/timestamp';

export interface IExtrinsicMapper {
  toApiResponse(extrinsic: any, realTimestamp?: string): ExtrinsicApiResponse;
  toApiResponseArray(extrinsics: any[]): Promise<ExtrinsicApiResponse[]>;
}

/**
 * Mapper for converting Extrinsic entities to API response format
 * Handles both Prisma camelCase and legacy snake_case field names
 */
export class ExtrinsicMapper implements IExtrinsicMapper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Convert a single Extrinsic to ExtrinsicApiResponse
   * Uses real timestamp from centralized timestamp service
   */
  toApiResponse(extrinsic: any, realTimestamp?: string): ExtrinsicApiResponse {
    return {
      id: extrinsic.id,
      hash: extrinsic.hash,
      block_number: extrinsic.blockNumber || extrinsic.block_number,
      extrinsic_index: extrinsic.extrinsicIndex || extrinsic.extrinsic_index || undefined,
      module: extrinsic.module || undefined,
      call: extrinsic.call || undefined,
      success: extrinsic.success || undefined,
      timestamp: realTimestamp || (extrinsic.timestamp ? new Date(extrinsic.timestamp).toISOString() : undefined),
      signer: extrinsic.signer || undefined,
      fee: extrinsic.fee || undefined,
      created_at: extrinsic.createdAt ? new Date(extrinsic.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of Extrinsics to ExtrinsicApiResponse array
   * Efficiently gets real timestamps for all extrinsics
   */
  async toApiResponseArray(extrinsics: any[]): Promise<ExtrinsicApiResponse[]> {
    if (extrinsics.length === 0) return [];

    // Get real timestamps for all extrinsics efficiently
    const blockNumbers = extrinsics.map(extrinsic => Number(extrinsic.blockNumber || extrinsic.block_number));
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);

    return extrinsics.map(extrinsic => {
      const blockNumber = extrinsic.blockNumber || extrinsic.block_number;
      const realTimestamp = timestampMap.get(blockNumber.toString());
      return this.toApiResponse(extrinsic, realTimestamp || undefined);
    });
  }
} 