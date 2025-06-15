import { RollupApiResponse } from '../types/database';

export interface IRollupMapper {
  toApiResponse(rollup: any): RollupApiResponse;
  toApiResponseArray(rollups: any[]): RollupApiResponse[];
}

/**
 * Mapper for converting Rollup entities to API response format
 * Handles both Prisma camelCase and legacy snake_case field names
 */
export class RollupMapper implements IRollupMapper {
  /**
   * Convert a single Rollup to RollupApiResponse
   * Handles Prisma object with camelCase fields
   */
  toApiResponse(rollup: any): RollupApiResponse {
    return {
      app_id: rollup.appId || rollup.app_id,
      name: rollup.name,
      description: rollup.description || undefined,
      first_seen_block: rollup.firstSeenBlock || rollup.first_seen_block || undefined,
      last_active_block: rollup.lastActiveBlock || rollup.last_active_block || undefined,
      total_submissions: rollup.totalSubmissions || rollup.total_submissions || 0,
      total_data_size: rollup.totalDataSize || rollup.total_data_size || 0,
      total_fees_paid: rollup.totalFeesPaid || rollup.total_fees_paid || 0,
      website: rollup.website || undefined,
      logo_url: rollup.logoUrl || rollup.logo_url || undefined,
      created_at: rollup.createdAt ? new Date(rollup.createdAt).toISOString() : new Date().toISOString(),
      updated_at: rollup.updatedAt ? new Date(rollup.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of Rollups to RollupApiResponse array
   */
  toApiResponseArray(rollups: any[]): RollupApiResponse[] {
    return rollups.map(rollup => this.toApiResponse(rollup));
  }
} 