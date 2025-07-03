import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { ValidatorRepository, ValidatorWithRelations, ValidatorFilters } from '../../../database/repositories/ValidatorRepository';
import { NominationRepository } from '../../../database/repositories/NominationRepository';
import { RewardRepository } from '../../../database/repositories/RewardRepository';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { EraRepository } from '../../../database/repositories/EraRepository';
import { BaseService, ServiceHealth } from '../../types/service';
import {
  ValidatorWithDetails,
  ValidatorList,
  ValidatorStats,
  NominatorList,
  RewardList,
  BlockList,
  ValidatorPerformance,
  StakingOverview,
  PaginationOptions,
  IValidatorService,
} from './ValidatorInterfaces';

// Type definitions for entities
type Validator = any;
type Block = any;
type Era = any;

/**
 * ValidatorApiService - Handles validator API operations and complex staking calculations
 * 
 * Responsibilities:
 * - Fetch validator details and statistics
 * - Get validator nominators and rewards
 * - Track validator performance metrics
 * - Provide staking overview and analytics
 * - Support validator discovery and filtering
 */
export class ValidatorApiService implements BaseService, IValidatorService {
  private blockchain: AvailBlockchainService;
  private validatorRepository: ValidatorRepository;
  private nominationRepository: NominationRepository;
  private rewardRepository: RewardRepository;
  private blockRepository: BlockRepository;
  private eraRepository: EraRepository;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    validatorRepository: ValidatorRepository,
    nominationRepository: NominationRepository,
    rewardRepository: RewardRepository,
    blockRepository: BlockRepository,
    eraRepository: EraRepository,
  ) {
    this.blockchain = blockchain;
    this.validatorRepository = validatorRepository;
    this.nominationRepository = nominationRepository;
    this.rewardRepository = rewardRepository;
    this.blockRepository = blockRepository;
    this.eraRepository = eraRepository;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    logger.info('ValidatorApiService: Starting service', { component: 'validator-api-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('ValidatorApiService: Stopping service', { component: 'validator-api-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'ValidatorApiService',
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

      logger.debug('ValidatorApiService: Getting validators', { 
        component: 'validator-api-service',
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

      logger.debug('ValidatorApiService: Validators retrieved', { 
        component: 'validator-api-service',
        count: enhancedValidators.length,
        total: result.total,
        page,
      });

      return validatorList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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
      logger.debug('ValidatorApiService: Getting validator details', { 
        component: 'validator-api-service', 
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
        performance,
        currentEra,
      };

      logger.debug('ValidatorApiService: Validator details retrieved', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        nominatorCount,
        recentBlockCount: recentBlocks.length,
        performance: performance.performance,
      });

      return validatorWithDetails;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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
      logger.debug('ValidatorApiService: Getting validator stats', { component: 'validator-api-service' });

      const [allValidators, activeValidators] = await Promise.all([
        this.validatorRepository.findMany({ limit: 1000 }),
        this.validatorRepository.findActive(),
      ]);

      const totalStaked = allValidators.validators.reduce(
        (sum, validator) => sum + Number(validator.totalBonded),
        0
      );

      const averageCommission = allValidators.validators.length > 0
        ? allValidators.validators.reduce((sum, validator) => sum + validator.commission, 0) / allValidators.validators.length
        : 0;

      const topValidators = allValidators.validators
        .sort((a, b) => Number(b.totalBonded) - Number(a.totalBonded))
        .slice(0, 10);

      const stats: ValidatorStats = {
        totalValidators: allValidators.total,
        activeValidators: activeValidators.length,
        totalStaked,
        averageCommission,
        topValidators,
      };

      logger.debug('ValidatorApiService: Validator stats retrieved', { 
        component: 'validator-api-service',
        totalValidators: stats.totalValidators,
        activeValidators: stats.activeValidators,
        totalStaked: stats.totalStaked.toString(),
        averageCommission: stats.averageCommission,
      });

      return stats;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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

      logger.debug('ValidatorApiService: Getting validator nominators', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.nominationRepository.findByValidator(address, { page, limit });
      const totalNominated = result.nominations.reduce(
        (sum, nomination) => sum + Number(nomination.amount),
        0
      );

      const nominatorList: NominatorList = {
        nominators: result.nominations,
        total: result.total,
        totalNominated,
      };

      logger.debug('ValidatorApiService: Validator nominators retrieved', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        count: result.nominations.length,
        total: result.total,
        totalNominated: totalNominated.toString(),
      });

      return nominatorList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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

      logger.debug('ValidatorApiService: Getting validator rewards', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.rewardRepository.findByValidator(address, { page, limit });
      const totalAmount = result.rewards.reduce(
        (sum, reward) => sum + reward.amount,
        0
      );

      const rewardList: RewardList = {
        rewards: result.rewards,
        total: result.total,
        totalAmount,
      };

      logger.debug('ValidatorApiService: Validator rewards retrieved', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        count: result.rewards.length,
        total: result.total,
        totalAmount: totalAmount.toString(),
      });

      return rewardList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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

      logger.debug('ValidatorApiService: Getting validator blocks', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        page,
        limit,
      });

      const result = await this.blockRepository.findByValidator(address, { page, limit });

      const blockList: BlockList = {
        blocks: result.blocks,
        total: result.total,
      };

      logger.debug('ValidatorApiService: Validator blocks retrieved', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        count: result.blocks.length,
        total: result.total,
      });

      return blockList;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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
      logger.debug('ValidatorApiService: Getting validator performance', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
      });

      const performance = await this.calculatePerformance(address);

      logger.debug('ValidatorApiService: Validator performance retrieved', { 
        component: 'validator-api-service', 
        address: address.substring(0, 10) + '...',
        blocksProduced: performance.blocksProduced,
        performance: performance.performance,
        uptime: performance.uptime,
      });

      return performance;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
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
      logger.debug('ValidatorApiService: Getting staking overview', { component: 'validator-api-service' });

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
        (sum, validator) => sum + Number(validator.totalBonded),
        0
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
          ? Number(totalStaked * 100 / parseInt(chainInfo.totalIssuance))
          : 0,
        averageCommission,
        currentEra: currentEra?.number || 0,
        sessionLength: chainInfo.sessionLength,
        eraLength: chainInfo.eraLength,
        minNominatorBond: chainInfo.minNominatorBond,
        minValidatorBond: chainInfo.minValidatorBond,
      };

      logger.debug('ValidatorApiService: Staking overview retrieved', { 
        component: 'validator-api-service',
        totalValidators: overview.totalValidators,
        activeValidators: overview.activeValidators,
        totalStaked: overview.totalStaked,
        stakingRate: overview.stakingRate,
        currentEra: overview.currentEra,
      });

      return overview;

    } catch (error) {
      logError(error as Error, { 
        component: 'validator-api-service', 
        action: 'getStakingOverview',
      });
      throw error;
    }
  }

  // Private helper methods

  private async getTotalNominated(validatorAddress: string): Promise<number> {
    try {
      const nominations = await this.nominationRepository.findByValidator(validatorAddress, { limit: 1000 });
      return nominations.nominations.reduce(
        (sum, nomination) => sum + nomination.amount,
        0
      );
    } catch (error) {
      logger.warn('ValidatorApiService: Failed to get total nominated', {
        component: 'validator-api-service',
        validator: validatorAddress.substring(0, 20) + '...',
        error: (error as Error).message,
      });
      return 0;
    }
  }

  private async getRecentBlocks(validatorAddress: string, limit: number = 10): Promise<Block[]> {
    try {
      const result = await this.blockRepository.findByValidator(validatorAddress, { page: 1, limit });
      return result.blocks;
    } catch (error) {
      logger.warn('ValidatorApiService: Failed to get recent blocks', {
        component: 'validator-api-service',
        validator: validatorAddress.substring(0, 20) + '...',
        error: (error as Error).message,
      });
      return [];
    }
  }

  private async calculatePerformance(validatorAddress: string): Promise<ValidatorPerformance> {
    try {
      // Get validator's blocks from last 24 hours for performance calculation
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentBlocksResult = await this.blockRepository.findByValidator(validatorAddress, { 
        page: 1, 
        limit: 144
      });
      const recentBlocks = recentBlocksResult.blocks || [];
      
      // Get the current era info
      const currentEra = await this.getCurrentEra();
      const currentEraNumber = currentEra?.number || 0;
      
      // Calculate expected blocks based on era and validator active status
      const validator = await this.validatorRepository.findByStashAddress(validatorAddress);
      const expectedBlocks = validator?.status === 'active' ? 144 : 0; // Assuming ~10 second block times, 144 blocks per day for active validators
      
      const blocksProduced = recentBlocks.length;
      const performance = expectedBlocks > 0 ? (blocksProduced / expectedBlocks) * 100 : 0;
      const uptime = Math.min(performance, 100); // Uptime can't exceed 100%
      
      // Calculate average block time
      let averageBlockTime = 0;
      if (recentBlocks.length > 1) {
        const blockTimes = recentBlocks
          .slice(0, -1)
          .map((block: any, index: number) => {
            const currentBlockTime = new Date(block.timestamp).getTime();
            const nextBlockTime = new Date(recentBlocks[index + 1].timestamp).getTime();
            return (nextBlockTime - currentBlockTime) / 1000; // Convert to seconds
          })
          .filter((time: number) => time > 0 && time < 300); // Filter out unrealistic times (0-5 minutes)
        
        if (blockTimes.length > 0) {
          averageBlockTime = blockTimes.reduce((sum: number, time: number) => sum + time, 0) / blockTimes.length;
        }
      }
      
      const lastBlockProduced = recentBlocks.length > 0 
        ? new Date(recentBlocks[0].timestamp).getTime()
        : null;
      
      // Get era points (simplified - would need actual era points from chain)
      const eraPoints = (validator as any)?.eraPoints || 0;

      return {
        blocksProduced,
        expectedBlocks,
        performance: Math.round(performance * 100) / 100,
        uptime: Math.round(uptime * 100) / 100,
        averageBlockTime: Math.round(averageBlockTime * 100) / 100,
        lastBlockProduced,
        eraPoints,
      };
    } catch (error) {
      logger.warn('ValidatorApiService: Failed to calculate performance', {
        component: 'validator-api-service',
        validator: validatorAddress.substring(0, 20) + '...',
        error: (error as Error).message,
      });
      
      // Return default performance metrics on error
      return {
        blocksProduced: 0,
        expectedBlocks: 0,
        performance: 0,
        uptime: 0,
        averageBlockTime: 0,
        lastBlockProduced: null,
        eraPoints: 0,
      };
    }
  }

  private async getCurrentEra(): Promise<Era | null> {
    try {
      return await this.eraRepository.findCurrent();
    } catch (error) {
      logger.warn('ValidatorApiService: Failed to get current era', {
        component: 'validator-api-service',
        error: (error as Error).message,
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
      // Default values if blockchain service is not available
      const defaultInfo = {
        totalIssuance: '0',
        sessionLength: 600, // 10 minutes in seconds
        eraLength: 21600, // 6 hours in seconds  
        minNominatorBond: '1000000000000000000', // 1 token
        minValidatorBond: '10000000000000000000', // 10 tokens
      };

      if (!(this.blockchain as any).isConnected()) {
        logger.warn('ValidatorApiService: Blockchain not connected, using default chain info', {
          component: 'validator-api-service',
        });
        return defaultInfo;
      }

      // Get chain info from blockchain (using fallback methods)
      const [totalIssuance, sessionLength, eraLength] = await Promise.allSettled([
        (this.blockchain as any).getTotalIssuance?.() || Promise.resolve('0'),
        (this.blockchain as any).getSessionLength?.() || Promise.resolve(600),
        (this.blockchain as any).getEraLength?.() || Promise.resolve(21600),
      ]);

      return {
        totalIssuance: totalIssuance.status === 'fulfilled' ? totalIssuance.value.toString() : defaultInfo.totalIssuance,
        sessionLength: sessionLength.status === 'fulfilled' ? sessionLength.value : defaultInfo.sessionLength,
        eraLength: eraLength.status === 'fulfilled' ? eraLength.value : defaultInfo.eraLength,
        minNominatorBond: defaultInfo.minNominatorBond,
        minValidatorBond: defaultInfo.minValidatorBond,
      };
    } catch (error) {
      logger.warn('ValidatorApiService: Failed to get chain info', {
        component: 'validator-api-service',
        error: (error as Error).message,
      });
      
      // Return defaults on error
      return {
        totalIssuance: '0',
        sessionLength: 600,
        eraLength: 21600,
        minNominatorBond: '1000000000000000000',
        minValidatorBond: '10000000000000000000',
      };
    }
  }
}

/**
 * Factory function to create ValidatorApiService instance
 */
export function createValidatorApiService(
  blockchain: AvailBlockchainService,
  validatorRepository: ValidatorRepository,
  nominationRepository: NominationRepository,
  rewardRepository: RewardRepository,
  blockRepository: BlockRepository,
  eraRepository: EraRepository,
): ValidatorApiService {
  return new ValidatorApiService(
    blockchain,
    validatorRepository,
    nominationRepository,
    rewardRepository,
    blockRepository,
    eraRepository,
  );
}