/**
 * Block Domain Interfaces
 * 
 * Shared type definitions for the Block domain service
 * Used by both BlockApiService and BlockProcessor
 */

import { 
  BlockWithMetadataApiResponse,
  BlockApiResponse,
  PaginatedResponse,
  PaginationParams,
  SortParams,
} from '../../../types/database';
import { BlockData } from '../../types/blockchain';

/**
 * Core Block Service interface for API operations
 */
export interface IBlockService {
  getBlock(hashOrNumber: string | number): Promise<BlockWithMetadataApiResponse>;
  getLatestBlock(): Promise<BlockWithMetadataApiResponse>;
  getBlocks(pagination?: PaginationParams, sort?: SortParams): Promise<PaginatedResponse<BlockApiResponse>>;
  getBlockByNumber(blockNumber: number): Promise<BlockWithMetadataApiResponse | null>;
}

/**
 * Block Processing interface for indexing and creation operations
 */
export interface IBlockProcessor {
  createBlock(blockData: BlockData): Promise<void>;
  indexBlock(blockData: BlockData): Promise<void>;
  processBlock(blockData: BlockData): Promise<void>;
}

/**
 * Block creation/indexing options
 */
export interface BlockProcessingOptions {
  skipValidation?: boolean;
  updateIfExists?: boolean;
  includeMetadata?: boolean;
}

/**
 * Block processing result
 */
export interface BlockProcessingResult {
  success: boolean;
  blockNumber: number;
  blockHash: string;
  created: boolean;
  indexed: boolean;
  duration: number;
  metadata?: {
    extrinsicsCount?: number;
    eventsCount?: number;
    timestamp?: Date;
  };
}

/**
 * Block validation result
 */
export interface BlockValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} 