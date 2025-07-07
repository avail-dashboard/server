/**
 * Transfer Domain Interfaces
 * 
 * Shared type definitions for the Transfer domain service
 * Used by both TransferApiService and TransferProcessor
 */

/**
 * Filter options for querying transfers
 */
export interface TransferFilters {
  fromAddress?: string;
  toAddress?: string;
  minAmount?: string;
  maxAmount?: string;
  startDate?: Date;
  endDate?: Date;
  blockNumber?: number;
  blockHash?: string;
}

/**
 * Enhanced transfer data with identity and block details
 */
export interface TransferWithDetails {
  id: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset_id: number;
  fee: string | null;
  success: boolean;
  blockNumber: number;
  blockHash: string;
  extrinsicIndex: number;
  timestamp: Date;
  // Enhanced details
  fromIdentity?: {
    display?: string;
    legal?: string;
    web?: string;
    twitter?: string;
  };
  toIdentity?: {
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
 * Paginated list of transfers with metadata
 */
export interface TransferList {
  transfers: TransferWithDetails[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Transfer statistics and analytics
 */
export interface TransferStats {
  totalTransfers: number;
  totalVolume: string;
  uniqueAddresses: number;
  averageAmount: string;
  transfersToday: number;
  volumeToday: string;
  topTransfersByAmount: Array<{
    hash: string;
    amount: string;
    fromAddress: string;
    toAddress: string;
    timestamp: Date;
  }>;
  mostActiveAddresses: Array<{
    address: string;
    transferCount: number;
    totalVolume: string;
    identity?: {
      display?: string;
      legal?: string;
    };
  }>;
}

/**
 * Pagination and sorting options for queries
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'timestamp' | 'amount' | 'blockNumber';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Transfer API Service interface
 */
export interface ITransferService {
  getTransfers(filters?: TransferFilters, options?: PaginationOptions): Promise<TransferList>;
  getTransfer(id: string): Promise<TransferWithDetails | null>;
  getTransferByHash(hash: string): Promise<TransferWithDetails | null>;
  getTransfersByBlock(blockNumber: number, options?: PaginationOptions): Promise<TransferList>;
  getTransfersByAccount(address: string, options?: PaginationOptions): Promise<TransferList>;
  getTransferStatistics(period?: string): Promise<TransferStats>;
} 