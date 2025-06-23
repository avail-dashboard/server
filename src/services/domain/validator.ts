import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { ValidatorRepository, ValidatorWithRelations, ValidatorFilters } from '../../database/repositories/ValidatorRepository';
import { NominationRepository } from '../../database/repositories/NominationRepository';
import { RewardRepository } from '../../database/repositories/RewardRepository';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { EraRepository } from '../../database/repositories/EraRepository';
import { PrismaClient } from '@prisma/client';

type Validator = any;
type Nomination = any;
type Reward = any;
type Block = any;
type Era = any;
import { BaseService, ServiceHealth } from '../types/service';
import { SelfHealingProcessor, ExtractedEntity, ENTITY_TYPES, DependencyResolver } from '../types/self-healing';
import { BlockData, ExtrinsicData } from '../types/blockchain';

// Service interfaces
export interface ValidatorWithDetails extends Validator {
  nominatorCount: number;
  totalNominated: bigint;
  recentBlocks: Block[];
  currentEra?: Era;
  performance: ValidatorPerformance;
}

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

export interface ValidatorStats {
  totalValidators: number;
  activeValidators: number;
  totalStaked: bigint;
  averageCommission: number;
  topValidators: Validator[];
}

export interface NominatorList {
  nominators: Nomination[];
  total: number;
  totalNominated: bigint;
}

export interface RewardList {
  rewards: Reward[];
  total: number;
  totalAmount: bigint;
}

export interface BlockList {
  blocks: Block[];
  total: number;
}

export interface ValidatorPerformance {
  blocksProduced: number;
  expectedBlocks: number;
  performance: number; // percentage
  uptime: number; // percentage
  averageBlockTime: number; // seconds
  lastBlockProduced: number | null;
  eraPoints: number;
}

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

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

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

/**
 * ValidatorService - Manages validator data and staking operations
 * 
 * Responsibilities:
 * - Fetch validator details and statistics
 * - Get validator nominators and rewards
 * - Track validator performance metrics
 * - Provide staking overview and analytics
 * - Support validator discovery and filtering
 */
export class ValidatorService implements BaseService, IValidatorService, SelfHealingProcessor {
  private blockchain: AvailBlockchainService;
  private validatorRepository: ValidatorRepository;
  private nominationRepository: NominationRepository;
  private rewardRepository: RewardRepository;
  private blockRepository: BlockRepository;
  private eraRepository: EraRepository;
  private dependencyResolver: DependencyResolver;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    validatorRepository: ValidatorRepository,
    nominationRepository: NominationRepository,
    rewardRepository: RewardRepository,
    blockRepository: BlockRepository,
    eraRepository: EraRepository,
    dependencyResolver: DependencyResolver,
  ) {
    this.blockchain = blockchain;
    this.validatorRepository = validatorRepository;
    this.nominationRepository = nominationRepository;
    this.rewardRepository = rewardRepository;
    this.blockRepository = blockRepository;
    this.eraRepository = eraRepository;
    this.dependencyResolver = dependencyResolver;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    logger.info('ValidatorService: Starting service', { component: 'validator-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('ValidatorService: Stopping service', { component: 'validator-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'ValidatorService',
        version: '1.0.0',
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get validators with filtering and pagination
   */
  async getValidators(filters?: ValidatorFilters, pagination?: PaginationOptions): Promise<ValidatorList> {
    try {
      const { page = 1, limit = 20 } = pagination || {};

      logger.debug('ValidatorService: Getting validators', { 
        component: 'validator-service',
        filters,
        page,
        limit,
      });

      const result = await this.validatorRepository.findMany({
        page,
        limit,
        filters,
        orderBy: 'totalBonded',
        orderDirection: 'desc',
      });

      // Enhance validators with additional details
      const enhancedValidators = await Promise.all(
        result.validators.map(async (validator) => {
          const [nominatorCount, totalNominated, recentBlocks, performance] = await Promise.all([
            this.nominationRepository.countByValidator(validator.stashAddress),
            this.getTotalNominated(validator.stashAddress),
            this.getRecentBlocks(validator.stashAddress, 5),
            this.calculatePerformance(validator.stashAddress),
          ]);

          return {
            ...validator,
            nominatorCount,
            totalNominated,
            recentBlocks,
            performance,
          } as ValidatorWithDetails;
        })
      );

      const totalPages = Math.ceil(result.total / limit);
      const validatorList: ValidatorList = {
        validators: enhancedValidators,
        total: result.total,
        pagination: {
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };

      logger.debug('ValidatorService: Validators retrieved', { 
        component: 'validator-service',
        count: enhancedValidators.length,
        total: result.total,
        page,
      });

      return validatorList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidators',
        filters,
        pagination,
      });
      throw error;
    }
  }

  /**
   * Get specific validator details
   */
  async getValidator(address: string): Promise<ValidatorWithDetails> {
    try {
      logger.debug('ValidatorService: Getting validator details', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
      });

      const validator = await this.validatorRepository.findByStashAddress(address) ||
                       await this.validatorRepository.findByControllerAddress(address);

      if (!validator) {
        throw new Error(`Validator not found: ${address}`);
      }

      // Get additional validator details
      const [
        nominatorCount,
        totalNominated,
        recentBlocks,
        performance,
        currentEra
      ] = await Promise.all([
        this.nominationRepository.countByValidator(validator.stashAddress),
        this.getTotalNominated(validator.stashAddress),
        this.getRecentBlocks(validator.stashAddress, 10),
        this.calculatePerformance(validator.stashAddress),
        this.getCurrentEra(),
      ]);

      const validatorWithDetails: ValidatorWithDetails = {
        ...validator,
        nominatorCount,
        totalNominated,
        recentBlocks,
        currentEra: currentEra || undefined,
        performance,
      };

      logger.debug('ValidatorService: Validator details retrieved', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        nominatorCount,
        blocksProduced: validator.blocksProduced,
        totalBonded: validator.totalBonded.toString(),
      });

      return validatorWithDetails;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidator',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get validator statistics
   */
  async getValidatorStats(): Promise<ValidatorStats> {
    try {
      logger.debug('ValidatorService: Getting validator statistics', { component: 'validator-service' });

      const [allValidators, activeValidators] = await Promise.all([
        this.validatorRepository.findMany({ limit: 1000 }),
        this.validatorRepository.findActive(),
      ]);

      const totalStaked = allValidators.validators.reduce(
        (sum, validator) => sum + validator.totalBonded,
        BigInt(0)
      );

      const averageCommission = allValidators.validators.length > 0
        ? allValidators.validators.reduce((sum, validator) => sum + validator.commission, 0) / allValidators.validators.length
        : 0;

      const topValidators = allValidators.validators
        .sort((a, b) => Number(b.totalBonded - a.totalBonded))
        .slice(0, 10);

      const stats: ValidatorStats = {
        totalValidators: allValidators.total,
        activeValidators: activeValidators.length,
        totalStaked,
        averageCommission,
        topValidators,
      };

      logger.debug('ValidatorService: Validator statistics retrieved', { 
        component: 'validator-service',
        totalValidators: stats.totalValidators,
        activeValidators: stats.activeValidators,
        totalStaked: stats.totalStaked.toString(),
        averageCommission: stats.averageCommission,
      });

      return stats;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidatorStats',
      });
      throw error;
    }
  }

  /**
   * Get validator nominators
   */
  async getValidatorNominators(address: string, pagination?: PaginationOptions): Promise<NominatorList> {
    try {
      const { page = 1, limit = 20 } = pagination || {};

      logger.debug('ValidatorService: Getting validator nominators', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.nominationRepository.findByValidator(address, { page, limit });
      const totalNominated = result.nominations.reduce(
        (sum, nomination) => sum + nomination.amount,
        BigInt(0)
      );

      const nominatorList: NominatorList = {
        nominators: result.nominations,
        total: result.total,
        totalNominated,
      };

      logger.debug('ValidatorService: Validator nominators retrieved', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        count: result.nominations.length,
        total: result.total,
        totalNominated: totalNominated.toString(),
      });

      return nominatorList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidatorNominators',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get validator rewards
   */
  async getValidatorRewards(address: string, pagination?: PaginationOptions): Promise<RewardList> {
    try {
      const { page = 1, limit = 20 } = pagination || {};

      logger.debug('ValidatorService: Getting validator rewards', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.rewardRepository.findByValidator(address, { page, limit });
      const totalAmount = result.rewards.reduce(
        (sum, reward) => sum + reward.amount,
        BigInt(0)
      );

      const rewardList: RewardList = {
        rewards: result.rewards,
        total: result.total,
        totalAmount,
      };

      logger.debug('ValidatorService: Validator rewards retrieved', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        count: result.rewards.length,
        total: result.total,
        totalAmount: totalAmount.toString(),
      });

      return rewardList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidatorRewards',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get validator blocks
   */
  async getValidatorBlocks(address: string, pagination?: PaginationOptions): Promise<BlockList> {
    try {
      const { page = 1, limit = 20 } = pagination || {};

      logger.debug('ValidatorService: Getting validator blocks', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.blockRepository.findByValidator(address, { page, limit });

      const blockList: BlockList = {
        blocks: result.blocks,
        total: result.total,
      };

      logger.debug('ValidatorService: Validator blocks retrieved', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        count: result.blocks.length,
        total: result.total,
      });

      return blockList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidatorBlocks',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get validator performance
   */
  async getValidatorPerformance(address: string): Promise<ValidatorPerformance> {
    try {
      logger.debug('ValidatorService: Getting validator performance', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
      });

      const performance = await this.calculatePerformance(address);

      logger.debug('ValidatorService: Validator performance retrieved', { 
        component: 'validator-service', 
        address: address.substring(0, 10) + '...',
        blocksProduced: performance.blocksProduced,
        performance: performance.performance,
        uptime: performance.uptime,
      });

      return performance;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getValidatorPerformance',
        address: address.substring(0, 10) + '...',
      });
      throw error;
    }
  }

  /**
   * Get staking overview
   */
  async getStakingOverview(): Promise<StakingOverview> {
    try {
      logger.debug('ValidatorService: Getting staking overview', { component: 'validator-service' });

      const [
        allValidators,
        activeValidators,
        currentEra,
        chainInfo
      ] = await Promise.all([
        this.validatorRepository.findMany({ limit: 1000 }),
        this.validatorRepository.findActive(),
        this.getCurrentEra(),
        this.getChainInfo(),
      ]);

      const totalStaked = allValidators.validators.reduce(
        (sum, validator) => sum + validator.totalBonded,
        BigInt(0)
      );

      const averageCommission = allValidators.validators.length > 0
        ? allValidators.validators.reduce((sum, validator) => sum + validator.commission, 0) / allValidators.validators.length
        : 0;

      const waitingValidators = allValidators.total - activeValidators.length;

      const overview: StakingOverview = {
        totalValidators: allValidators.total,
        activeValidators: activeValidators.length,
        waitingValidators: Math.max(0, waitingValidators),
        totalStaked: totalStaked.toString(),
        totalIssuance: chainInfo.totalIssuance,
        stakingRate: chainInfo.totalIssuance !== '0' 
          ? Number(totalStaked * BigInt(100) / BigInt(chainInfo.totalIssuance))
          : 0,
        averageCommission,
        currentEra: currentEra?.number || 0,
        sessionLength: chainInfo.sessionLength,
        eraLength: chainInfo.eraLength,
        minNominatorBond: chainInfo.minNominatorBond,
        minValidatorBond: chainInfo.minValidatorBond,
      };

      logger.debug('ValidatorService: Staking overview retrieved', { 
        component: 'validator-service',
        totalValidators: overview.totalValidators,
        activeValidators: overview.activeValidators,
        totalStaked: overview.totalStaked,
        stakingRate: overview.stakingRate,
        currentEra: overview.currentEra,
      });

      return overview;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getStakingOverview',
      });
      throw error;
    }
  }

  // Private helper methods

  private async getTotalNominated(validatorAddress: string): Promise<bigint> {
    try {
      const nominations = await this.nominationRepository.findByValidator(validatorAddress, { limit: 1000 });
      return nominations.nominations.reduce(
        (sum, nomination) => sum + nomination.amount,
        BigInt(0)
      );
    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getTotalNominated',
        validatorAddress: validatorAddress.substring(0, 10) + '...',
      });
      return BigInt(0);
    }
  }

  private async getRecentBlocks(validatorAddress: string, limit: number): Promise<Block[]> {
    try {
      const result = await this.blockRepository.findByValidator(validatorAddress, { 
        page: 1, 
        limit,
      });
      return result.blocks;
    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getRecentBlocks',
        validatorAddress: validatorAddress.substring(0, 10) + '...',
      });
      return [];
    }
  }

  private async calculatePerformance(validatorAddress: string): Promise<ValidatorPerformance> {
    try {
      const validator = await this.validatorRepository.findByStashAddress(validatorAddress);
      if (!validator) {
        return this.getDefaultPerformance();
      }

      const recentBlocks = await this.getRecentBlocks(validatorAddress, 100);
      const blocksProduced = validator.blocksProduced || 0;
      
      // Calculate average block time
      let averageBlockTime = 12; // Default 12 seconds
      if (recentBlocks.length > 1) {
        const blockTimes = recentBlocks
          .slice(0, -1)
          .map((block, index) => {
            const nextBlock = recentBlocks[index + 1];
            return (nextBlock.timestamp.getTime() - block.timestamp.getTime()) / 1000;
          })
          .filter(time => time > 0 && time < 60); // Filter out unrealistic times

        if (blockTimes.length > 0) {
          averageBlockTime = blockTimes.reduce((sum, time) => sum + time, 0) / blockTimes.length;
        }
      }

      // Estimate expected blocks (simplified calculation)
      const hoursActive = validator.updatedAt 
        ? (Date.now() - validator.updatedAt.getTime()) / (1000 * 60 * 60)
        : 24;
      const expectedBlocks = Math.floor(hoursActive * 3600 / averageBlockTime / 100); // Assuming 1% of blocks

      const performance = expectedBlocks > 0 ? (blocksProduced / expectedBlocks) * 100 : 0;
      const uptime = Math.min(100, performance); // Simplified uptime calculation

      return {
        blocksProduced,
        expectedBlocks: Math.max(expectedBlocks, blocksProduced),
        performance: Math.min(100, Math.max(0, performance)),
        uptime: Math.min(100, Math.max(0, uptime)),
        averageBlockTime,
        lastBlockProduced: validator.lastBlockProduced,
        eraPoints: 0, // TODO: Implement era points calculation
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'calculatePerformance',
        validatorAddress: validatorAddress.substring(0, 10) + '...',
      });
      return this.getDefaultPerformance();
    }
  }

  private getDefaultPerformance(): ValidatorPerformance {
    return {
      blocksProduced: 0,
      expectedBlocks: 0,
      performance: 0,
      uptime: 0,
      averageBlockTime: 12,
      lastBlockProduced: null,
      eraPoints: 0,
    };
  }

  private async getCurrentEra(): Promise<Era | null> {
    try {
      const eras = await this.eraRepository.findMany({ 
        page: 1, 
        limit: 1,
        orderBy: 'number',
        orderDirection: 'desc',
      });
      return eras.eras.length > 0 ? eras.eras[0] : null;
    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getCurrentEra',
      });
      return null;
    }
  }

  private async getChainInfo(): Promise<{
    totalIssuance: string;
    sessionLength: number;
    eraLength: number;
    minNominatorBond: string;
    minValidatorBond: string;
  }> {
    try {
      const api = await this.blockchain.getApi();
      
      // Get chain constants and runtime info
      const [
        totalIssuance,
        sessionLength,
        sessionsPerEra,
        minNominatorBond,
        minValidatorBond
      ] = await Promise.all([
        api.query.balances.totalIssuance(),
        api.consts.babe?.epochDuration || api.consts.timestamp?.minimumPeriod || 200,
        api.consts.staking?.sessionsPerEra || 6,
        api.consts.staking?.minNominatorBond || 0,
        api.consts.staking?.minValidatorBond || 0,
      ]);

      return {
        totalIssuance: totalIssuance.toString(),
        sessionLength: Number(sessionLength),
        eraLength: Number(sessionLength) * Number(sessionsPerEra),
        minNominatorBond: minNominatorBond.toString(),
        minValidatorBond: minValidatorBond.toString(),
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-service', 
        action: 'getChainInfo',
      });
      
      // Return fallback values
      return {
        totalIssuance: '0',
        sessionLength: 200,
        eraLength: 1200,
        minNominatorBond: '0',
        minValidatorBond: '0',
      };
    }
  }

  // Self-Healing Helper Methods

  /**
   * Create or update validator in database
   * Similar to AccountService.getOrCreateAccount pattern
   */
  private async getOrCreateValidator(stashAddress: string, blockNumber: number): Promise<Validator> {
    try {
      // Try to get existing validator
      let validator = await this.validatorRepository.findByStashAddress(stashAddress);

      if (validator) {
        // Update existing validator with block production stats
        validator = await this.validatorRepository.updateStats(stashAddress, {
          blocksProduced: (validator.blocksProduced || 0) + 1,
          lastBlockProduced: blockNumber,
        });
        
        logger.debug('ValidatorService: Updated existing validator', {
          component: 'validator-service',
          stashAddress: stashAddress.substring(0, 20) + '...',
          blockNumber,
        });
      } else {
        // Create new validator with defaults
        validator = await this.validatorRepository.create({
          stashAddress,
          commission: 0, // Default commission
          selfBonded: BigInt(0),
          totalBonded: BigInt(0),
          nominatorCount: 0,
          status: 'active',
          blocksProduced: 1,
          lastBlockProduced: blockNumber,
        });
        
        logger.debug('ValidatorService: Created new validator', {
          component: 'validator-service',
          stashAddress: stashAddress.substring(0, 20) + '...',
          blockNumber,
        });
      }

      return validator;
    } catch (error) {
      logError(error as Error, {
        component: 'validator-service',
        action: 'getOrCreateValidator',
        stashAddress: stashAddress.substring(0, 20) + '...',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Check if an extrinsic is a staking operation
   */
  private isStakingExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'staking' &&
           ['bond', 'bondExtra', 'validate', 'nominate', 'setController', 'setSessionKey'].includes(extrinsic.method.method);
  }

  /**
   * Extract validator address from staking extrinsic
   */
  private extractValidatorFromStakingExtrinsic(extrinsic: ExtrinsicData): string | null {
    try {
      const args = extrinsic.method.args;
      
      // Different staking methods have different patterns
      switch (extrinsic.method.method) {
        case 'validate':
          // validate() call means the signer is becoming a validator
          return extrinsic.signer || null;
          
        case 'bond':
          // bond(controller, value, payee) - signer is the stash
          return extrinsic.signer || null;
          
        case 'setSessionKey':
          // setSessionKey(keys, proof) - signer is the validator
          return extrinsic.signer || null;
          
        default:
          return null;
      }
    } catch (error) {
      logger.warn('ValidatorService: Failed to extract validator from staking extrinsic', {
        component: 'validator-service',
        extrinsicHash: extrinsic.hash,
        method: extrinsic.method.method,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Validate if address looks like a valid validator address
   * Uses same validation as AccountService for consistency
   */
  private isValidValidatorAddress(address: string): boolean {
    try {
      if (!address || typeof address !== 'string') {
        return false;
      }
      
      // Avail addresses typically start with '5' and are 47-48 characters long
      if (address.length < 40 || address.length > 50) {
        return false;
      }
      
      if (!address.startsWith('5')) {
        return false;
      }
      
      // Basic character validation (base58 characters)
      const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]+$/;
      return base58Regex.test(address);
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Public method for other services to ensure validator exists
   * Part of the dependency resolver pattern
   */
  async ensureValidatorExists(stashAddress: string, blockNumber: number = 0): Promise<Validator> {
    return this.getOrCreateValidator(stashAddress, blockNumber);
  }

  // Self-Healing Processor Methods
  // Phase 3: Validator extraction and processing implementation

  /**
   * Extract validator information from block data
   * 
   * Extracts validators from:
   * - Block author (validator who produced this block)
   * - Staking extrinsics (validators mentioned in staking operations)
   * - Session key updates and validator registrations
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    const validators = new Set<string>();
    
    try {
      logger.debug('ValidatorService: Extracting validators from block', {
        component: 'validator-service',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      // 1. Extract block author (validator who produced this block)
      if (blockData.validator && this.isValidValidatorAddress(blockData.validator)) {
        validators.add(blockData.validator);
        logger.debug('ValidatorService: Added block author validator', {
          component: 'validator-service',
          blockNumber: blockData.number,
          validator: blockData.validator.substring(0, 20) + '...',
        });
      }

      // 2. Extract validators from staking extrinsics
      blockData.extrinsics.forEach((extrinsic, index) => {
        try {
          if (this.isStakingExtrinsic(extrinsic)) {
            const validatorAddress = this.extractValidatorFromStakingExtrinsic(extrinsic);
            if (validatorAddress && this.isValidValidatorAddress(validatorAddress)) {
              validators.add(validatorAddress);
              
              logger.debug('ValidatorService: Added validator from staking extrinsic', {
                component: 'validator-service',
                blockNumber: blockData.number,
                extrinsicIndex: index,
                method: extrinsic.method.method,
                validator: validatorAddress.substring(0, 20) + '...',
              });
            }
          }
        } catch (error) {
          logger.warn('ValidatorService: Failed to extract validator from extrinsic', {
            component: 'validator-service',
            blockNumber: blockData.number,
            extrinsicIndex: index,
            error: (error as Error).message,
          });
          // Continue processing other extrinsics
        }
      });

      // Convert to ExtractedEntity array
      const entities: ExtractedEntity[] = Array.from(validators).map(stashAddress => ({
        type: ENTITY_TYPES.VALIDATOR,
        id: stashAddress,
        data: {
          stashAddress,
          blockNumber: blockData.number,
          extractedFrom: 'block_processing',
          action: blockData.validator === stashAddress ? 'block_production' : 'staking_operation',
        },
        dependencies: [
          {
            service: 'account',
            entityType: 'account',
            entityId: stashAddress,
            required: true,
          },
        ],
      }));

      logger.debug('ValidatorService: Validator extraction complete', {
        component: 'validator-service',
        blockNumber: blockData.number,
        validatorCount: entities.length,
      });

      return entities;

    } catch (error) {
      logger.error('ValidatorService: Failed to extract validators from block', {
        component: 'validator-service',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      
      // Return empty array on error - don't fail the entire block processing
      return [];
    }
  }

  /**
   * Process extracted validator entities
   * 
   * For each extracted validator, ensure dependencies exist and create/update validator records
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<Validator[]> {
    const results: Validator[] = [];
    
    try {
      logger.debug('ValidatorService: Processing extracted validator entities', {
        component: 'validator-service',
        entityCount: entities.length,
      });

      for (const entity of entities) {
        try {
          // Ensure dependencies are resolved first (accounts)
          await this.ensureDependencies(entity);
          
          // Process the validator entity
          const validator = await this.getOrCreateValidator(
            entity.data.stashAddress,
            entity.data.blockNumber
          );
          results.push(validator);
          
          logger.debug('ValidatorService: Validator processed successfully', {
            component: 'validator-service',
            stashAddress: entity.data.stashAddress.substring(0, 20) + '...',
            entityType: entity.type,
            blockNumber: entity.data.blockNumber,
            action: entity.data.action,
          });

        } catch (error) {
          logger.error('ValidatorService: Failed to process validator entity', {
            component: 'validator-service',
            entityId: entity.id,
            entityType: entity.type,
            error: (error as Error).message,
          });
          // Continue processing other entities - don't fail the entire batch
        }
      }

      logger.debug('ValidatorService: Validator entity processing complete', {
        component: 'validator-service',
        totalEntities: entities.length,
        successfullyProcessed: results.length,
        failed: entities.length - results.length,
      });

      return results;

    } catch (error) {
      logger.error('ValidatorService: Failed to process extracted entities', {
        component: 'validator-service',
        entityCount: entities.length,
        error: (error as Error).message,
      });
      
      // Return partial results on error
      return results;
    }
  }

  /**
   * Ensure validator dependencies exist
   * 
   * Validators depend on accounts - ensure the stash account exists before creating validator
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    try {
      logger.debug('ValidatorService: Ensuring validator dependencies', {
        component: 'validator-service',
        entityType: entity.type,
        entityId: entity.id.substring(0, 20) + '...',
        dependencyCount: entity.dependencies.length,
      });

      // Process each dependency
      for (const dependency of entity.dependencies) {
        if (dependency.service === 'account' && dependency.entityType === 'account') {
          // Ensure the account exists using the dependency resolver
          await this.dependencyResolver.ensureAccount(dependency.entityId);
          
          logger.debug('ValidatorService: Account dependency resolved', {
            component: 'validator-service',
            accountAddress: dependency.entityId.substring(0, 20) + '...',
            required: dependency.required,
          });
        }
      }

      logger.debug('ValidatorService: All dependencies resolved', {
        component: 'validator-service',
        entityId: entity.id.substring(0, 20) + '...',
      });

    } catch (error) {
      logger.error('ValidatorService: Failed to resolve dependencies', {
        component: 'validator-service',
        entityId: entity.id,
        entityType: entity.type,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// Factory function
export const createValidatorService = (
  blockchain: AvailBlockchainService,
  validatorRepository: ValidatorRepository,
  nominationRepository: NominationRepository,
  rewardRepository: RewardRepository,
  blockRepository: BlockRepository,
  eraRepository: EraRepository,
  dependencyResolver: DependencyResolver,
): ValidatorService => {
  return new ValidatorService(
    blockchain,
    validatorRepository,
    nominationRepository,
    rewardRepository,
    blockRepository,
    eraRepository,
    dependencyResolver,
  );
};