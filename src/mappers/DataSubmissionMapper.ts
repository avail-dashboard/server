import { DataSubmission, DataSubmissionApiResponse } from '../types/database';

export interface IDataSubmissionMapper {
  toApiResponse(submission: DataSubmission): DataSubmissionApiResponse;
  toApiResponseArray(submissions: DataSubmission[]): DataSubmissionApiResponse[];
}

/**
 * Mapper for converting DataSubmission entities to API response format
 */
export class DataSubmissionMapper implements IDataSubmissionMapper {
  /**
   * Convert a single DataSubmission to DataSubmissionApiResponse
   */
  toApiResponse(submission: DataSubmission): DataSubmissionApiResponse {
    return {
      id: submission.id,
      extrinsic_hash: submission.extrinsic_hash,
      block_number: submission.block_number,
      extrinsic_index: submission.extrinsic_index,
      app_id: submission.app_id,
      rollup_name: submission.rollup_name || undefined,
      data_size: submission.data_size,
      data_hash: submission.data_hash,
      submitter: submission.submitter,
      timestamp: submission.timestamp.toISOString(),
      success: submission.success,
      blob_data: submission.blob_data || undefined,
      kate_commitment: submission.kate_commitment || undefined,
      proof: submission.proof || undefined,
      created_at: submission.created_at.toISOString(),
    };
  }

  /**
   * Convert an array of DataSubmissions to DataSubmissionApiResponse array
   */
  toApiResponseArray(submissions: DataSubmission[]): DataSubmissionApiResponse[] {
    return submissions.map(submission => this.toApiResponse(submission));
  }
} 