import { BlockApiResponse, BlockWithMetadataApiResponse } from '../types/database';
import { PrismaClient } from '@prisma/client';
import { getBlockTimestamp } from '../utils/timestamp';

export interface IBlockMapper {
  toApiResponse(block: any, realTimestamp?: string): BlockApiResponse;
  toApiResponseArray(blocks: any[]): Promise<BlockApiResponse[]>;
  toWithMetadataApiResponse(block: any, realTimestamp?: string): BlockWithMetadataApiResponse;
}

/**
 * Mapper for converting Block entities to API response format
 */
export class BlockMapper implements IBlockMapper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Convert a single Block to BlockApiResponse
   * Uses real timestamp from centralized timestamp service
   */
  toApiResponse(block: any, realTimestamp?: string): BlockApiResponse {
    return {
      number: Number(block.number), // Convert BigInt to number
      hash: block.hash,
      parent_hash: block.parentHash || block.parent_hash || undefined,
      state_root: block.stateRoot || block.state_root || undefined,
      extrinsics_root: block.extrinsicsRoot || block.extrinsics_root || undefined,
      timestamp: realTimestamp || new Date().toISOString(), // Use real timestamp or fallback
      extrinsics_count: block.extrinsicsCount || block.extrinsics_count || 0,
      events_count: block.eventsCount || block.events_count || 0,
      created_at: block.createdAt ? new Date(block.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of Blocks to BlockApiResponse array
   * Efficiently gets real timestamps for all blocks
   */
  async toApiResponseArray(blocks: any[]): Promise<BlockApiResponse[]> {
    if (blocks.length === 0) return [];

    // Get real timestamps for all blocks efficiently
    const blockNumbers = blocks.map(block => Number(block.number));
    const { getBlockTimestamps } = await import('../utils/timestamp');
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);

    return blocks.map(block => {
      const realTimestamp = timestampMap.get(block.number.toString());
      return this.toApiResponse(block, realTimestamp || undefined);
    });
  }

  /**
   * Convert a single Block to BlockWithMetadataApiResponse
   * Uses real timestamp from centralized timestamp service
   */
  toWithMetadataApiResponse(block: any, realTimestamp?: string): BlockWithMetadataApiResponse {
    return {
      number: Number(block.number), // Convert BigInt to number
      hash: block.hash,
      parent_hash: block.parentHash || block.parent_hash || undefined,
      state_root: block.stateRoot || block.state_root || undefined,
      extrinsics_root: block.extrinsicsRoot || block.extrinsics_root || undefined,
      timestamp: realTimestamp || new Date().toISOString(), // Use real timestamp or fallback
      extrinsics_count: block.extrinsicsCount || block.extrinsics_count || 0,
      events_count: block.eventsCount || block.events_count || 0,
      created_at: block.createdAt ? new Date(block.createdAt).toISOString() : new Date().toISOString(),
      events: [],
      logs: [],
      data_submissions: [],
      transfers: [],
    };
  }
} 