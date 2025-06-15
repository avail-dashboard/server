import { DataSubmissionApiResponse } from '../types/database';

export interface IDataSubmissionMapper {
  toApiResponse(submission: any): DataSubmissionApiResponse;
  toApiResponseArray(submissions: any[]): DataSubmissionApiResponse[];
}

/**
 * Mapper for converting DataSubmission entities to API response format
 * Handles both Prisma camelCase and legacy snake_case field names
 */
export class DataSubmissionMapper implements IDataSubmissionMapper {
  /**
   * Convert a single DataSubmission to DataSubmissionApiResponse
   * Handles Prisma object with camelCase fields
   */
  toApiResponse(submission: any): DataSubmissionApiResponse {
    return {
      id: submission.id,
      extrinsic_hash: submission.extrinsicHash || submission.extrinsic_hash,
      block_number: submission.blockNumber || submission.block_number,
      extrinsic_index: submission.extrinsicIndex || submission.extrinsic_index,
      app_id: submission.appId || submission.app_id,
      rollup_name: submission.rollupName || submission.rollup_name || undefined,
      data_size: submission.dataSize || submission.data_size,
      data_hash: submission.dataHash || submission.data_hash,
      submitter: submission.submitter,
      timestamp: submission.timestamp ? new Date(submission.timestamp).toISOString() : new Date().toISOString(),
      success: submission.success !== undefined ? submission.success : true,
      blob_data: submission.blobData || submission.blob_data || undefined,
      kate_commitment: submission.kateCommitment || submission.kate_commitment || undefined,
      proof: submission.proof || undefined,
      created_at: submission.createdAt ? new Date(submission.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Convert an array of DataSubmissions to DataSubmissionApiResponse array
   */
  toApiResponseArray(submissions: any[]): DataSubmissionApiResponse[] {
    return submissions.map(submission => this.toApiResponse(submission));
  }
} 