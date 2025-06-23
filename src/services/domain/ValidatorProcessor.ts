import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { EraRepository } from '../../database/repositories/EraRepository';
import { BlockData } from '../types/blockchain';

export interface ValidatorInfo {
  stashAddress: string;
  controllerAddress?: string;
  rewardAddress?: string;
  commission: number;
  selfBonded: bigint;
  totalBonded: bigint;
  nominatorCount: number;
  sessionKeys?: any;
  identityName?: string;
  identityInfo?: any;
  isActive: boolean;
}

export interface EraInfo {
  number: number;
  startBlock: number;
  endBlock?: number;
  totalStaked: bigint;
  validatorCount: number;
  active: boolean;
}

export interface IValidatorProcessor {
  processBlockValidator(blockData: BlockData): Promise<void>;
  processEraChange(blockData: BlockData): Promise<void>;
  updateValidatorStats(validatorAddress: string, blockNumber: number): Promise<void>;
  fetchValidatorInfo(validatorAddress: string): Promise<ValidatorInfo | null>;
  getCurrentEra(): Promise<number>;
}

/**
 * ValidatorProcessor - Processes validator and staking data from blocks
 * 
 * Responsibilities:
 * - Extract block author (validator) information
 * - Fetch and store validator details from staking pallet
 * - Track era changes and staking statistics
 * - Update validator statistics (blocks produced, etc.)
 * - Process validator identity information
 */
export class ValidatorProcessor implements IValidatorProcessor {
  private blockchain: AvailBlockchainService;
  private validatorRepository: ValidatorRepository;
  private eraRepository: EraRepository;
  private currentEra: number | null = null;
  private validatorCache = new Map<string, ValidatorInfo>();

  constructor(
    blockchain: AvailBlockchainService,
    validatorRepository: ValidatorRepository,
    eraRepository: EraRepository,
  ) {
    this.blockchain = blockchain;
    this.validatorRepository = validatorRepository;
    this.eraRepository = eraRepository;
  }

  /**
   * Process validator information from a block
   */
  async processBlockValidator(blockData: BlockData): Promise<void> {
    try {
      // Extract block author from block header
      const blockAuthor = this.extractBlockAuthor(blockData);
      
      if (!blockAuthor) {
        logger.debug('ValidatorProcessor: No block author found', {
          component: 'validator-processor',
          blockNumber: blockData.number,
        });
        return;
      }

      logger.debug('ValidatorProcessor: Processing block validator', {
        component: 'validator-processor',
        blockNumber: blockData.number,
        blockAuthor,
      });

      // Update validator statistics
      await this.updateValidatorStats(blockAuthor, blockData.number);

      logger.debug('ValidatorProcessor: Block validator processed', {
        component: 'validator-processor',
        blockNumber: blockData.number,
        validatorAddress: blockAuthor,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'processBlockValidator',
        blockNumber: blockData.number,
      });
      // Don't throw - validator processing shouldn't fail block processing
    }
  }

  /**
   * Process era changes
   */
  async processEraChange(blockData: BlockData): Promise<void> {
    try {
      const currentEra = await this.getCurrentEra();
      
      if (this.currentEra === null) {
        this.currentEra = currentEra;
        logger.info('ValidatorProcessor: Initial era detected', {
          component: 'validator-processor',
          era: currentEra,
          blockNumber: blockData.number,
        });
      }

      // Check if era has changed
      if (currentEra !== this.currentEra) {
        logger.info('ValidatorProcessor: Era change detected', {
          component: 'validator-processor',
          oldEra: this.currentEra,
          newEra: currentEra,
          blockNumber: blockData.number,
        });

        // Finalize previous era
        if (this.currentEra !== null) {
          await this.finalizeEra(this.currentEra, blockData.number - 1);
        }

        // Start new era
        await this.startNewEra(currentEra, blockData.number);
        this.currentEra = currentEra;

        // Clear validator cache on era change
        this.validatorCache.clear();
      }

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'processEraChange',
        blockNumber: blockData.number,
      });
      // Don't throw - era processing shouldn't fail block processing
    }
  }

  /**
   * Update validator statistics
   */
  async updateValidatorStats(validatorAddress: string, blockNumber: number): Promise<void> {
    try {
      const existingValidator = await this.validatorRepository.findByStashAddress(validatorAddress);
      
      if (existingValidator) {
        await this.validatorRepository.updateStats(validatorAddress, {
          blocksProduced: (existingValidator.blocksProduced || 0) + 1,
          lastBlockProduced: blockNumber,
        });
      } else {
        // Create basic validator record if it doesn't exist
        await this.validatorRepository.create({
          stashAddress: validatorAddress,
          commission: 0,
          selfBonded: BigInt(0),
          totalBonded: BigInt(0),
          nominatorCount: 0,
          status: 'active',
          blocksProduced: 1,
          lastBlockProduced: blockNumber,
        });
      }

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'updateValidatorStats',
        validatorAddress,
        blockNumber,
      });
    }
  }

  /**
   * Fetch validator information from blockchain (simplified)
   */
  async fetchValidatorInfo(validatorAddress: string): Promise<ValidatorInfo | null> {
    try {
      // Check cache first
      const cached = this.validatorCache.get(validatorAddress);
      if (cached) {
        return cached;
      }

      logger.debug('ValidatorProcessor: Fetching validator info from blockchain', {
        component: 'validator-processor',
        validatorAddress,
      });

      // For now, return basic validator info
      // TODO: Implement actual blockchain queries when API types are fixed
      const validatorInfo: ValidatorInfo = {
        stashAddress: validatorAddress,
        commission: 0,
        selfBonded: BigInt(0),
        totalBonded: BigInt(0),
        nominatorCount: 0,
        isActive: true,
      };

      // Cache the result
      this.validatorCache.set(validatorAddress, validatorInfo);

      return validatorInfo;

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'fetchValidatorInfo',
        validatorAddress,
      });
      return null;
    }
  }

  /**
   * Get current era number (simplified)
   */
  async getCurrentEra(): Promise<number> {
    try {
      // For now, return a default era
      // TODO: Implement actual era fetching when API types are fixed
      return 1;

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'getCurrentEra',
      });
      return 0;
    }
  }

  /**
   * Extract block author from block data
   */
  private extractBlockAuthor(blockData: BlockData): string | null {
    try {
      // Try to extract from block data
      // For now, return null since BlockData structure needs to be checked
      // TODO: Implement proper block author extraction
      return null;

    } catch (error) {
      logger.debug('ValidatorProcessor: Could not extract block author', {
        component: 'validator-processor',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Finalize an era
   */
  private async finalizeEra(eraNumber: number, endBlock: number): Promise<void> {
    try {
      await this.eraRepository.update(eraNumber, {
        endBlock,
        active: false,
      });

      logger.info('ValidatorProcessor: Era finalized', {
        component: 'validator-processor',
        era: eraNumber,
        endBlock,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'finalizeEra',
        era: eraNumber,
        endBlock,
      });
    }
  }

  /**
   * Start a new era
   */
  private async startNewEra(eraNumber: number, startBlock: number): Promise<void> {
    try {
      const eraInfo: EraInfo = {
        number: eraNumber,
        startBlock,
        totalStaked: BigInt(0),
        validatorCount: 0,
        active: true,
      };

      await this.eraRepository.create(eraInfo);

      logger.info('ValidatorProcessor: New era started', {
        component: 'validator-processor',
        era: eraNumber,
        startBlock,
        totalStaked: eraInfo.totalStaked.toString(),
        validatorCount: eraInfo.validatorCount,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'startNewEra',
        era: eraNumber,
        startBlock,
      });
    }
  }
}

export const createValidatorProcessor = (
  blockchain: AvailBlockchainService,
  validatorRepository: ValidatorRepository,
  eraRepository: EraRepository,
): ValidatorProcessor => {
  return new ValidatorProcessor(blockchain, validatorRepository, eraRepository);
}; 