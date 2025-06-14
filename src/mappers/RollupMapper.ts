import { Rollup, RollupApiResponse } from '../types/database';

export interface IRollupMapper {
  toApiResponse(rollup: Rollup): RollupApiResponse;
  toApiResponseArray(rollups: Rollup[]): RollupApiResponse[];
}

/**
 * Mapper for converting Rollup entities to API response format
 */
export class RollupMapper implements IRollupMapper {
  /**
   * Convert a single Rollup to RollupApiResponse
   */
  toApiResponse(rollup: Rollup): RollupApiResponse {
    return {
      app_id: rollup.app_id,
      name: rollup.name,
      description: rollup.description || undefined,
      first_seen_block: rollup.first_seen_block || undefined,
      last_active_block: rollup.last_active_block || undefined,
      total_submissions: rollup.total_submissions,
      total_data_size: rollup.total_data_size,
      total_fees_paid: rollup.total_fees_paid,
      website: rollup.website || undefined,
      logo_url: rollup.logo_url || undefined,
      created_at: rollup.created_at.toISOString(),
      updated_at: rollup.updated_at.toISOString(),
    };
  }

  /**
   * Convert an array of Rollups to RollupApiResponse array
   */
  toApiResponseArray(rollups: Rollup[]): RollupApiResponse[] {
    return rollups.map(rollup => this.toApiResponse(rollup));
  }
} 