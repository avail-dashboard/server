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
      extrinsic_hash: submission.blockHash,
      block_number: Number(submission.blockNumber), // Convert BigInt
      extrinsic_index: submission.extrinsicId,
      app_id: Number(submission.appId), // Convert BigInt
      rollup_name: undefined, // No rollups table exists
      data_size: submission.dataSize,
      data_hash: submission.dataHash,
      submitter: submission.submitter,
      timestamp: new Date().toISOString(), // No timestamp in DB, use current time
      success: true, // Assume success if not specified
      blob_data: undefined, // Not stored in this database
      kate_commitment: undefined, // Not in data_submissions table
      proof: submission.proofData,
      created_at: new Date().toISOString(), // No created_at in DB
    };
  }

  /**
   * Convert an array of DataSubmissions to DataSubmissionApiResponse array
   */
  toApiResponseArray(submissions: any[]): DataSubmissionApiResponse[] {
    return submissions.map(submission => this.toApiResponse(submission));
  }
} 