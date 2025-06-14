import { Block, BlockApiResponse, BlockWithMetadataApiResponse } from '../types/database';

export interface IBlockMapper {
  toApiResponse(block: Block): BlockApiResponse;
  toApiResponseArray(blocks: Block[]): BlockApiResponse[];
  toWithMetadataApiResponse(block: Block): BlockWithMetadataApiResponse;
}

/**
 * Mapper for converting Block entities to API response format
 */
export class BlockMapper implements IBlockMapper {
  /**
   * Convert a single Block to BlockApiResponse
   */
  toApiResponse(block: Block): BlockApiResponse {
    return {
      number: block.number,
      hash: block.hash,
      parent_hash: block.parent_hash || undefined,
      state_root: block.state_root || undefined,
      timestamp: block.timestamp.toISOString(),
      extrinsics_count: block.extrinsics_count,
      created_at: block.created_at.toISOString(),
    };
  }

  /**
   * Convert an array of Blocks to BlockApiResponse array
   */
  toApiResponseArray(blocks: Block[]): BlockApiResponse[] {
    return blocks.map(block => this.toApiResponse(block));
  }

  /**
   * Convert a single Block to BlockWithMetadataApiResponse
   */
  toWithMetadataApiResponse(block: Block): BlockWithMetadataApiResponse {
    return {
      number: block.number,
      hash: block.hash,
      parent_hash: block.parent_hash || undefined,
      state_root: block.state_root || undefined,
      timestamp: block.timestamp.toISOString(),
      extrinsics_count: block.extrinsics_count,
      created_at: block.created_at.toISOString(),
      events: [],
      logs: [],
      data_submissions: [],
      transfers: [],
    };
  }
} 