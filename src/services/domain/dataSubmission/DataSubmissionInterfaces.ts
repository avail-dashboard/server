/**
 * DataSubmission Domain Interfaces
 * 
 * Shared type definitions for the DataSubmission domain service
 * Used by both DataSubmissionApiService and DataSubmissionProcessor
 */

import { DataSubmission, Rollup } from '@prisma/client';
import { DataSubmissionFilters } from '../../../types/database';
import { ExtractedEntity } from '../../types/self-healing';

/**
 * Core DataSubmission Service interface for API operations
 */
export interface IDataSubmissionService {
  getDataSubmissions(filters?: DataSubmissionFilters, options?: PaginationOptions): Promise<DataSubmissionList>;
  getDataSubmission(extrinsicHash: string): Promise<DataSubmissionWithDetails | null>;
  getDataSubmissionsByBlock(blockNumber: number, options?: PaginationOptions): Promise<DataSubmissionList>;
  getDataSubmissionsByApp(appId: number, options?: PaginationOptions): Promise<DataSubmissionList>;
  getDataSubmissionsBySubmitter(address: string, options?: PaginationOptions): Promise<DataSubmissionList>;
  getDataSubmissionStatistics(period?: string): Promise<DataSubmissionStats>;
  getRollupInfo(appId: number): Promise<Rollup | null>;
}

/**
 * DataSubmission Processing interface for self-healing operations
 */
export interface IDataSubmissionProcessor {
  extractFromBlock(blockData: any): Promise<ExtractedEntity[]>;
  processExtractedEntities(entities: ExtractedEntity[]): Promise<any[]>;
  ensureDependencies(entity: ExtractedEntity): Promise<void>;
  ensureDataSubmissionExists(extrinsicHash: string): Promise<any>;
}

/**
 * Enhanced data submission filters
 */
export interface DataSubmissionFilterOptions {
  appId?: number;
  submitter?: string;
  success?: boolean;
  minDataSize?: number;
  maxDataSize?: number;
  startDate?: Date;
  endDate?: Date;
  blockNumber?: number;
  rollupName?: string;
}

/**
 * Enhanced data submission data with identity and block details
 */
export interface DataSubmissionWithDetails extends DataSubmission {
  rollup?: Rollup;
  submitterIdentity?: {
    display?: string;
    legal?: string;
    web?: string;
    twitter?: string;
  };
  blockDetails?: {
    timestamp: Date;
    validator: string;
    validatorName?: string;
  };
}

/**
 * Paginated data submission list matching PaginatedResponse format
 */
export interface DataSubmissionList {
  data: DataSubmissionWithDetails[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

/**
 * Data submission statistics
 */
export interface DataSubmissionStats {
  totalSubmissions: number;
  totalDataSize: number;
  uniqueApps: number;
  uniqueSubmitters: number;
  submissionsToday: number;
  dataSizeToday: number;
  avgDataSize: number;
  submissionsLast24h: number;
  topAppsBySubmissions: Array<{
    appId: number;
    name: string;
    submissionCount: number;
    totalDataSize: number;
  }>;
  mostActiveSubmitters: Array<{
    address: string;
    submissionCount: number;
    totalDataSize: number;
    identity?: {
      display?: string;
      legal?: string;
    };
  }>;
}

/**
 * Pagination options for data submissions
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'timestamp' | 'dataSize' | 'blockNumber';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Data submission info extracted from blockchain
 */
export interface DataSubmissionInfo {
  appId: number;
  dataSize: number;
  dataHash: string;
  submitter: string;
  blobData?: Buffer;
  kateCommitment?: string;
}

/**
 * Data submission processing options
 */
export interface DataSubmissionProcessingOptions {
  skipValidation?: boolean;
  updateIfExists?: boolean;
  ensureDependencies?: boolean;
}

/**
 * Data submission processing result
 */
export interface DataSubmissionProcessingResult {
  success: boolean;
  extrinsicHash: string;
  appId: number;
  dataSize: number;
  created: boolean;
  updated: boolean;
  duration: number;
  errors?: string[];
} 