/**
 * Account Domain Interfaces
 * 
 * This module defines all TypeScript interfaces and types used by the Account domain.
 * Accounts are the base entity in the Avail blockchain explorer - they represent 
 * addresses that can sign transactions, receive transfers, and participate as validators.
 */

import { Account, Extrinsic, Validator, Reward } from '@prisma/client';
import { TransferWithRelations } from '../../../database/repositories/TransferRepository';

/**
 * Account balance information from blockchain RPC
 * 
 * Represents the real-time balance state of an account as retrieved from
 * the Avail blockchain's `system.account` storage.
 */
export interface AccountBalance {
  /** The account address */
  address: string;
  /** Free balance (can be used for transfers) */
  free: string;
  /** Reserved balance (locked for staking, governance, etc.) */
  reserved: string;
  /** Frozen balance (temporarily locked) */
  frozen: string;
  /** Total balance (free + reserved) */
  total: string;
  /** Transferable balance (free - frozen) */
  transferable: string;
  /** Account nonce (transaction count) */
  nonce: number;
}

/**
 * Enhanced account information with computed statistics
 * 
 * Extends the base Account database record with additional computed fields
 * including validator information, transaction counts, and transfer totals.
 * This is the primary response type for account detail endpoints.
 */
export interface AccountWithDetails extends Account {
  /** Validator information if this account is a validator */
  validator?: Validator;
  /** Total number of transfers involving this account */
  transferCount: number;
  /** Total number of extrinsics signed by this account */
  extrinsicCount: number;
  /** Total amount transferred out by this account */
  totalTransferred: bigint;
  /** Total amount received by this account */
  totalReceived: bigint;
}

/**
 * Account activity history across multiple data types
 * 
 * Aggregates different types of blockchain activity for an account
 * including transfers, extrinsics, and validator rewards.
 */
export interface AccountActivity {
  /** Transfer history with full relationship data */
  transfers: TransferWithRelations[];
  /** Extrinsic history signed by this account */
  extrinsics: Extrinsic[];
  /** Validator rewards earned by this account */
  rewards: Reward[];
  /** Total count of all activities (for pagination) */
  totalActivities: number;
}

/**
 * Statistical summary of account activity
 * 
 * Provides aggregate statistics about an account's blockchain activity
 * over its entire lifetime, used for analytics and summary displays.
 */
export interface AccountStats {
  /** Total number of transfers */
  totalTransfers: number;
  /** Total number of extrinsics */
  totalExtrinsics: number;
  /** Total number of validator rewards */
  totalRewards: number;
  /** Date of first recorded activity */
  firstActivity: Date | null;
  /** Date of most recent activity */
  lastActivity: Date | null;
  /** Total amount sent in transfers */
  totalSent: bigint;
  /** Total amount received in transfers */
  totalReceived: bigint;
}

/**
 * Standard pagination options
 * 
 * Used across all paginated endpoints for consistent pagination behavior.
 */
export interface PaginationOptions {
  /** Page number (1-based, defaults to 1) */
  page?: number;
  /** Items per page (defaults to 20, max 100) */
  limit?: number;
}

/**
 * Extended pagination options for account history
 * 
 * Includes filtering options specific to account activity history,
 * allowing users to filter by activity type and date range.
 */
export interface HistoryOptions extends PaginationOptions {
  /** Filter by activity type */
  type?: 'all' | 'transfers' | 'extrinsics' | 'rewards';
  /** Start date filter */
  startDate?: Date;
  /** End date filter */
  endDate?: Date;
}

/**
 * Account API Service Interface
 * 
 * Defines the contract for account-related API operations.
 * This interface represents the public API for account functionality,
 * focusing on data retrieval and presentation logic.
 */
export interface IAccountService {
  /**
   * Get comprehensive account details
   * @param address - The account address
   * @returns Account with statistics and validator information
   */
  getAccount(address: string): Promise<AccountWithDetails>;

  /**
   * Get real-time account balance from blockchain
   * @param address - The account address
   * @returns Current balance information
   */
  getAccountBalance(address: string): Promise<AccountBalance>;

  /**
   * Get paginated list of account's extrinsics
   * @param address - The account address
   * @param options - Pagination options
   * @returns Paginated extrinsic list
   */
  getAccountExtrinsics(address: string, options: PaginationOptions): Promise<{ extrinsics: Extrinsic[]; total: number }>;

  /**
   * Get paginated list of account's transfers
   * @param address - The account address
   * @param options - Pagination options
   * @returns Paginated transfer list with relationships
   */
  getAccountTransfers(address: string, options: PaginationOptions): Promise<{ transfers: TransferWithRelations[]; total: number }>;

  /**
   * Get comprehensive account activity history
   * @param address - The account address
   * @param options - History filtering and pagination options
   * @returns Combined activity history
   */
  getAccountHistory(address: string, options: HistoryOptions): Promise<AccountActivity>;

  /**
   * Update account identity from blockchain
   * @param address - The account address
   */
  updateAccountIdentity(address: string): Promise<void>;

  /**
   * Get statistical summary of account activity
   * @param address - The account address
   * @returns Account activity statistics
   */
  getAccountStatistics(address: string): Promise<AccountStats>;

  /**
   * Discover sample addresses for testing
   * @returns Array of active account addresses
   */
  discoverSampleAddresses(): Promise<string[]>;
} 