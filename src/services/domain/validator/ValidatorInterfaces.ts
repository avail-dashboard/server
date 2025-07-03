import { ValidatorFilters } from '../../../database/repositories/ValidatorRepository';

// Type definitions for entities
type Validator = any;
type Nomination = any;
type Reward = any;
type Block = any;
type Era = any;

/**
 * Validator with enhanced details including performance metrics and relationships
 */
export interface ValidatorWithDetails extends Validator {
  nominatorCount: number;
  totalNominated: number;
  recentBlocks: Block[];
  currentEra?: Era;
  performance: ValidatorPerformance;
}

/**
 * Paginated list of validators with enhanced details
 */
export interface ValidatorList {
  validators: ValidatorWithDetails[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Validator network statistics
 */
export interface ValidatorStats {
  totalValidators: number;
  activeValidators: number;
  totalStaked: number;
  averageCommission: number;
  topValidators: Validator[];
}

/**
 * Nominator list for a specific validator
 */
export interface NominatorList {
  nominators: Nomination[];
  total: number;
  totalNominated: number;
}

/**
 * Reward list for a specific validator
 */
export interface RewardList {
  rewards: Reward[];
  total: number;
  totalAmount: number;
}

/**
 * Block list for a specific validator
 */
export interface BlockList {
  blocks: Block[];
  total: number;
}

/**
 * Comprehensive performance metrics for a validator
 */
export interface ValidatorPerformance {
  blocksProduced: number;
  expectedBlocks: number;
  performance: number; // percentage
  uptime: number; // percentage
  averageBlockTime: number; // seconds
  lastBlockProduced: number | null;
  eraPoints: number;
}

/**
 * Comprehensive staking overview for the entire network
 */
export interface StakingOverview {
  totalValidators: number;
  activeValidators: number;
  waitingValidators: number;
  totalStaked: string;
  totalIssuance: string;
  stakingRate: number; // percentage
  averageCommission: number;
  currentEra: number;
  sessionLength: number;
  eraLength: number;
  minNominatorBond: string;
  minValidatorBond: string;
}

/**
 * Pagination options for validator-related queries
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * Service interface for validator operations
 */
export interface IValidatorService {
  getValidators(filters?: ValidatorFilters, pagination?: PaginationOptions): Promise<ValidatorList>;
  getValidator(address: string): Promise<ValidatorWithDetails>;
  getValidatorStats(): Promise<ValidatorStats>;
  getValidatorNominators(address: string, pagination?: PaginationOptions): Promise<NominatorList>;
  getValidatorRewards(address: string, pagination?: PaginationOptions): Promise<RewardList>;
  getValidatorBlocks(address: string, pagination?: PaginationOptions): Promise<BlockList>;
  getValidatorPerformance(address: string): Promise<ValidatorPerformance>;
  getStakingOverview(): Promise<StakingOverview>;
}