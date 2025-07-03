import { logger, logError } from '../../../utils/logger';
import { ValidatorRepository } from '../../../database/repositories/ValidatorRepository';
import { SelfHealingProcessor, ExtractedEntity, ENTITY_TYPES, DependencyResolver } from '../../types/self-healing';
import { BlockData, ExtrinsicData } from '../../types/blockchain';

// Type definitions for entities
type Validator = any;

/**
 * ValidatorProcessor - Handles validator detection and processing from blockchain data
 * 
 * Responsibilities:
 * - Extract validator information from block data
 * - Process staking extrinsics to identify validators
 * - Create/update validator records in database
 * - Manage validator dependencies (accounts)
 * - Track block production statistics
 */
export class ValidatorProcessor implements SelfHealingProcessor {
  private validatorRepository: ValidatorRepository;
  private dependencyResolver: DependencyResolver;

  constructor(
    validatorRepository: ValidatorRepository,
    dependencyResolver: DependencyResolver,
  ) {
    this.validatorRepository = validatorRepository;
    this.dependencyResolver = dependencyResolver;
  }

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
      logger.debug('ValidatorProcessor: Extracting validators from block', {
        component: 'validator-processor',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      // 1. Extract block author (validator who produced this block)
      if (blockData.validator && this.isValidValidatorAddress(blockData.validator)) {
        validators.add(blockData.validator);
        logger.debug('ValidatorProcessor: Added block author validator', {
          component: 'validator-processor',
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
              
              logger.debug('ValidatorProcessor: Added validator from staking extrinsic', {
                component: 'validator-processor',
                blockNumber: blockData.number,
                extrinsicIndex: index,
                method: extrinsic.method.method,
                validator: validatorAddress.substring(0, 20) + '...',
              });
            }
          }
        } catch (error) {
          logger.warn('ValidatorProcessor: Failed to extract validator from extrinsic', {
            component: 'validator-processor',
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

      logger.debug('ValidatorProcessor: Validator extraction complete', {
        component: 'validator-processor',
        blockNumber: blockData.number,
        validatorCount: entities.length,
      });

      return entities;

    } catch (error) {
      logger.error('ValidatorProcessor: Failed to extract validators from block', {
        component: 'validator-processor',
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
      logger.debug('ValidatorProcessor: Processing extracted validator entities', {
        component: 'validator-processor',
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
          
          logger.debug('ValidatorProcessor: Validator processed successfully', {
            component: 'validator-processor',
            stashAddress: entity.data.stashAddress.substring(0, 20) + '...',
            entityType: entity.type,
            blockNumber: entity.data.blockNumber,
            action: entity.data.action,
          });

        } catch (error) {
          logger.error('ValidatorProcessor: Failed to process validator entity', {
            component: 'validator-processor',
            entityId: entity.id,
            entityType: entity.type,
            error: (error as Error).message,
          });
          // Continue processing other entities - don't fail the entire batch
        }
      }

      logger.debug('ValidatorProcessor: Validator entity processing complete', {
        component: 'validator-processor',
        totalEntities: entities.length,
        successfullyProcessed: results.length,
        failed: entities.length - results.length,
      });

      return results;

    } catch (error) {
      logger.error('ValidatorProcessor: Failed to process extracted entities', {
        component: 'validator-processor',
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
      logger.debug('ValidatorProcessor: Ensuring validator dependencies', {
        component: 'validator-processor',
        entityType: entity.type,
        entityId: entity.id.substring(0, 20) + '...',
        dependencyCount: entity.dependencies.length,
      });

      // Process each dependency
      for (const dependency of entity.dependencies) {
        if (dependency.service === 'account' && dependency.entityType === 'account') {
          // Ensure the account exists using the dependency resolver
          await this.dependencyResolver.ensureAccount(dependency.entityId);
          
          logger.debug('ValidatorProcessor: Account dependency resolved', {
            component: 'validator-processor',
            accountAddress: dependency.entityId.substring(0, 20) + '...',
            required: dependency.required,
          });
        }
      }

      logger.debug('ValidatorProcessor: All dependencies resolved', {
        component: 'validator-processor',
        entityId: entity.id.substring(0, 20) + '...',
      });

    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
        action: 'ensureDependencies',
        entityId: entity.id.substring(0, 20) + '...',
      });
      throw error;
    }
  }

  /**
   * Public method for other services to ensure validator exists
   * Part of the dependency resolver pattern
   */
  async ensureValidatorExists(stashAddress: string, blockNumber: number = 0): Promise<Validator> {
    return this.getOrCreateValidator(stashAddress, blockNumber);
  }

  // Private helper methods

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
        
        logger.debug('ValidatorProcessor: Updated existing validator', {
          component: 'validator-processor',
          stashAddress: stashAddress.substring(0, 20) + '...',
          blockNumber,
        });
      } else {
        // Create new validator with defaults
        validator = await this.validatorRepository.create({
          stashAddress,
          commission: 0, // Default commission
          selfBonded: 0,
          totalBonded: 0,
          nominatorCount: 0,
          status: 'active',
          blocksProduced: 1,
          lastBlockProduced: blockNumber,
        });
        
        logger.debug('ValidatorProcessor: Created new validator', {
          component: 'validator-processor',
          stashAddress: stashAddress.substring(0, 20) + '...',
          blockNumber,
        });
      }

      return validator;
    } catch (error) {
      logError(error as Error, {
        component: 'validator-processor',
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
      logger.warn('ValidatorProcessor: Failed to extract validator from staking extrinsic', {
        component: 'validator-processor',
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
}

/**
 * Factory function to create ValidatorProcessor instance
 */
export function createValidatorProcessor(
  validatorRepository: ValidatorRepository,
  dependencyResolver: DependencyResolver,
): ValidatorProcessor {
  return new ValidatorProcessor(validatorRepository, dependencyResolver);
}