import { DataSubmissionApiResponse } from '../types/database';
import { PrismaClient } from '@prisma/client';
import { getBlockTimestamp, getBlockTimestamps } from '../utils/timestamp';

export interface IDataSubmissionMapper {
  toApiResponse(submission: any, realTimestamp?: string): DataSubmissionApiResponse;
  toApiResponseArray(submissions: any[]): Promise<DataSubmissionApiResponse[]>;
}

/**
 * Mapper for converting DataSubmission entities to API response format
 * Handles both Prisma camelCase and legacy snake_case field names
 */
export class DataSubmissionMapper implements IDataSubmissionMapper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Convert a single DataSubmission to DataSubmissionApiResponse
   * Uses real timestamp from centralized timestamp service
   */
  toApiResponse(submission: any, realTimestamp?: string): DataSubmissionApiResponse {
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
      timestamp: realTimestamp || submission.timestamp || new Date().toISOString(), // Use real timestamp with fallbacks
      success: submission.success !== undefined ? submission.success : true,
      blob_data: undefined, // Not stored in this database
      kate_commitment: undefined, // Not in data_submissions table
      proof: submission.proofData,
      created_at: new Date().toISOString(), // No created_at in DB
    };
  }

  /**
   * Convert an array of DataSubmissions to DataSubmissionApiResponse array
   * Efficiently gets real timestamps for all submissions
   */
  async toApiResponseArray(submissions: any[]): Promise<DataSubmissionApiResponse[]> {
    if (submissions.length === 0) return [];

    // Get real timestamps for all submissions efficiently
    const blockNumbers = submissions.map(submission => Number(submission.blockNumber));
    const timestampMap = await getBlockTimestamps(this.prisma, blockNumbers);

    return submissions.map(submission => {
      const realTimestamp = timestampMap.get(submission.blockNumber.toString());
      return this.toApiResponse(submission, realTimestamp || undefined);
    });
  }
} 