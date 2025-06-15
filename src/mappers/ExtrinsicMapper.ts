import { ExtrinsicApiResponse } from '../types/database';

export interface IExtrinsicMapper {
  toApiResponse(extrinsic: any): ExtrinsicApiResponse;
  toApiResponseArray(extrinsics: any[]): ExtrinsicApiResponse[];
}

/**
 * Mapper for converting Extrinsic entities to API response format
 * Handles both Prisma camelCase and legacy snake_case field names
 */
export class ExtrinsicMapper implements IExtrinsicMapper {
  /**
   * Convert a single Extrinsic to ExtrinsicApiResponse
   * Handles Prisma object with camelCase fields
   */
  toApiResponse(extrinsic: any): ExtrinsicApiResponse {
    return {
      id: extrinsic.id,
      hash: extrinsic.hash,
      block_number: extrinsic.blockNumber || extrinsic.block_number,
      extrinsic_index: extrinsic.extrinsicIndex || extrinsic.extrinsic_index || undefined,
      module: extrinsic.module || undefined,
      call: extrinsic.call || undefined,
      success: extrinsic.success || undefined,
      timestamp: extrinsic.timestamp ? new Date(extrinsic.timestamp).toISOString() : undefined,
      signer: extrinsic.signer || undefined,
      fee: extrinsic.fee || undefined,
      created_at: extrinsic.createdAt ? new Date(extrinsic.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of Extrinsics to ExtrinsicApiResponse array
   */
  toApiResponseArray(extrinsics: any[]): ExtrinsicApiResponse[] {
    return extrinsics.map(extrinsic => this.toApiResponse(extrinsic));
  }
} 