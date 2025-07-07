import { BlockApiResponse, BlockWithMetadataApiResponse } from '../types/database';

export interface IBlockMapper {
  toApiResponse(block: any): BlockApiResponse;
  toApiResponseArray(blocks: any[]): BlockApiResponse[];
  toWithMetadataApiResponse(block: any): BlockWithMetadataApiResponse;
}

/**
 * Mapper for converting Block entities to API response format
 */
export class BlockMapper implements IBlockMapper {
  /**
   * Convert a single Block to BlockApiResponse
   * Handles Prisma object with camelCase fields
   */
  toApiResponse(block: any): BlockApiResponse {
    return {
      number: block.number,
      hash: block.hash,
      parent_hash: block.parentHash || block.parent_hash || undefined,
      state_root: block.stateRoot || block.state_root || undefined,
      extrinsics_root: block.extrinsicsRoot || block.extrinsics_root || undefined,
      timestamp: block.timestamp ? new Date(block.timestamp).toISOString() : new Date().toISOString(),
      extrinsics_count: block.extrinsicsCount || block.extrinsics_count || 0,
      events_count: block.eventsCount || block.events_count || 0,
      created_at: block.createdAt ? new Date(block.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of Blocks to BlockApiResponse array
   */
  toApiResponseArray(blocks: any[]): BlockApiResponse[] {
    return blocks.map(block => this.toApiResponse(block));
  }

  /**
   * Convert a single Block to BlockWithMetadataApiResponse
   * Handles Prisma object with camelCase fields
   */
  toWithMetadataApiResponse(block: any): BlockWithMetadataApiResponse {
    return {
      number: block.number,
      hash: block.hash,
      parent_hash: block.parentHash || block.parent_hash || undefined,
      state_root: block.stateRoot || block.state_root || undefined,
      extrinsics_root: block.extrinsicsRoot || block.extrinsics_root || undefined,
      timestamp: block.timestamp ? new Date(block.timestamp).toISOString() : new Date().toISOString(),
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