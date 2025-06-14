import { Extrinsic, ExtrinsicApiResponse } from '../types/database';

export interface IExtrinsicMapper {
  toApiResponse(extrinsic: Extrinsic): ExtrinsicApiResponse;
  toApiResponseArray(extrinsics: Extrinsic[]): ExtrinsicApiResponse[];
}

/**
 * Mapper for converting Extrinsic entities to API response format
 */
export class ExtrinsicMapper implements IExtrinsicMapper {
  /**
   * Convert a single Extrinsic to ExtrinsicApiResponse
   */
  toApiResponse(extrinsic: Extrinsic): ExtrinsicApiResponse {
    return {
      id: extrinsic.id,
      hash: extrinsic.hash,
      block_number: extrinsic.block_number,
      extrinsic_index: extrinsic.extrinsic_index || undefined,
      module: extrinsic.module || undefined,
      call: extrinsic.call || undefined,
      success: extrinsic.success || undefined,
      timestamp: extrinsic.timestamp?.toISOString(),
      signer: extrinsic.signer || undefined,
      fee: extrinsic.fee || undefined,
      created_at: extrinsic.created_at.toISOString(),
    };
  }

  /**
   * Convert an array of Extrinsics to ExtrinsicApiResponse array
   */
  toApiResponseArray(extrinsics: Extrinsic[]): ExtrinsicApiResponse[] {
    return extrinsics.map(extrinsic => this.toApiResponse(extrinsic));
  }
} 