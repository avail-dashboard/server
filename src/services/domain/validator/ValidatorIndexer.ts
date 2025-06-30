import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { ValidatorRepository } from '../../../database/repositories/ValidatorRepository';
import { ValidatorInfo } from '../../types/blockchain';

/**
 * ValidatorIndexer - Fetches validator data from blockchain and stores it
 * 
 * Responsibilities:
 * - Fetch validator information from blockchain
 * - Store validator data, staking info, commission rates
 * - Handle validator session changes
 * - Return indexing results with success/error status
 */

export interface IValidatorIndexer {
  indexValidator(validatorId: string): Promise<ValidatorIndexingResult>;
  indexValidatorsBatch(validatorIds: string[]): Promise<ValidatorIndexingResult[]>;
}

export interface ValidatorIndexingResult {
  validatorData: ValidatorData;
  success: boolean;
  error?: string;
}

export interface ValidatorData {
  accountId: string;
  stash: string;
  controller?: string;
  commission: string;
  blocked: boolean;
  identity?: {
    display?: string;
    legal?: string;
    web?: string;
    riot?: string;
    email?: string;
    twitter?: string;
  };
  stake: {
    total: string;
    own: string;
    others: string;
  };
  nominators: string[];
  prefs: {
    commission: number;
    blocked: boolean;
  };
}

export class ValidatorIndexer implements IValidatorIndexer {
  private validatorRepository: ValidatorRepository;
  private blockchain: AvailBlockchainService;
  private queueService?: any;

  constructor(
    validatorRepository: ValidatorRepository,
    blockchain: AvailBlockchainService,
    queueService?: any,
  ) {
    this.validatorRepository = validatorRepository;
    this.blockchain = blockchain;
    this.queueService = queueService;
  }

  /**
   * Index a single validator by fetching from blockchain
   */
  async indexValidator(validatorId: string): Promise<ValidatorIndexingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Indexing validator from blockchain', {
        component: 'validator-indexer',
        action: 'indexValidator',
        validatorId,
      });

      // Fetch validator data from blockchain
      const validatorInfo = await this.fetchValidatorFromBlockchain(validatorId);
      
      if (!validatorInfo) {
        return {
          validatorData: {} as ValidatorData,
          success: false,
          error: `Validator ${validatorId} not found on blockchain`,
        };
      }

      // Convert ValidatorInfo to ValidatorData
      const validatorData: ValidatorData = {
        accountId: validatorInfo.accountId,
        stash: validatorInfo.stash,
        controller: validatorInfo.controller,
        commission: validatorInfo.commission,
        blocked: validatorInfo.blocked,
        identity: validatorInfo.identity,
        stake: validatorInfo.stake,
        nominators: validatorInfo.nominators,
        prefs: validatorInfo.prefs,
      };

      // Create validator entity for database
      const validatorEntity = {
        stashAddress: validatorData.accountId,
        controllerAddress: validatorData.controller || null,
        commission: parseFloat(validatorData.commission) || 0,
        selfBonded: BigInt(validatorData.stake.own || '0'),
        totalBonded: BigInt(validatorData.stake.total || '0'),
        nominatorCount: validatorData.nominators.length,
        status: validatorData.blocked ? 'inactive' as const : 'active' as const,
        identityName: validatorData.identity?.display || null,
        identityInfo: validatorData.identity ? JSON.stringify(validatorData.identity) : null,
      };

      // Check if validator already exists
      const existingValidator = await this.validatorRepository.findByStashAddress(validatorData.accountId);
      if (existingValidator) {
        logger.debug('Validator already exists, updating', {
          component: 'validator-indexer',
          validatorId,
        });
        await this.validatorRepository.update(validatorData.accountId, {
          controllerAddress: validatorEntity.controllerAddress,
          commission: validatorEntity.commission,
          selfBonded: validatorEntity.selfBonded,
          totalBonded: validatorEntity.totalBonded,
          nominatorCount: validatorEntity.nominatorCount,
          status: validatorEntity.status,
          identityName: validatorEntity.identityName,
          identityInfo: validatorEntity.identityInfo,
        });
      } else {
        await this.validatorRepository.create(validatorEntity);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Validator indexed successfully', {
        component: 'validator-indexer',
        action: 'indexValidator',
        validatorId,
        validatorName: validatorData.identity?.display || 'Unknown',
        commission: validatorData.commission,
        nominatorCount: validatorData.nominators.length,
        duration,
      });

      // Queue cross-domain account indexing jobs
      await this.queueAccountDependencies(validatorData);

      return {
        validatorData,
        success: true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'validator-indexer',
        action: 'indexValidator',
        validatorId,
        duration,
      });

      return {
        validatorData: {} as ValidatorData,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index multiple validators in batch
   */
  async indexValidatorsBatch(validatorIds: string[]): Promise<ValidatorIndexingResult[]> {
    logger.info('Indexing validators batch', {
      component: 'validator-indexer',
      action: 'indexValidatorsBatch',
      validatorCount: validatorIds.length,
    });

    const results: ValidatorIndexingResult[] = [];
    
    // Process validators in parallel with controlled concurrency
    const batchSize = 5; // Process 5 validators at a time
    for (let i = 0; i < validatorIds.length; i += batchSize) {
      const batch = validatorIds.slice(i, i + batchSize);
      const batchPromises = batch.map(validatorId => this.indexValidator(validatorId));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    logger.info('Validator batch indexing completed', {
      component: 'validator-indexer',
      totalValidators: results.length,
      successCount,
      failureCount: results.length - successCount,
    });

    return results;
  }

  /**
   * Queue account indexing jobs for validator dependencies
   */
  private async queueAccountDependencies(validatorData: ValidatorData): Promise<void> {
    if (!this.queueService) {
      logger.debug('Queue service not available, skipping cross-domain job queuing', {
        component: 'validator-indexer',
        validatorId: validatorData.accountId,
      });
      return;
    }

    try {
      const accountsToQueue = new Set<string>();

      // Add stash address (main validator account)
      accountsToQueue.add(validatorData.stash);

      // Add controller address if different from stash
      if (validatorData.controller && validatorData.controller !== validatorData.stash) {
        accountsToQueue.add(validatorData.controller);
      }

      // Add all nominator addresses
      validatorData.nominators.forEach(nominator => {
        accountsToQueue.add(nominator);
      });

      // Queue account indexing jobs with DB-first checking
      let queuedCount = 0;
      for (const accountAddress of accountsToQueue) {
        try {
          await this.queueService.addJob('INDEX_ACCOUNT', { accountAddress });
          queuedCount++;
          logger.debug('Queued account indexing job', {
            component: 'validator-indexer',
            accountAddress,
            triggeredBy: validatorData.accountId,
          });
        } catch (error) {
          logger.warn('Failed to queue account indexing job', {
            component: 'validator-indexer',
            accountAddress,
            error: (error as Error).message,
          });
        }
      }

      logger.info('Cross-domain account jobs queued from validator indexing', {
        component: 'validator-indexer',
        validatorId: validatorData.accountId,
        totalAccounts: accountsToQueue.size,
        queuedJobs: queuedCount,
        nominators: validatorData.nominators.length,
      });

    } catch (error) {
      logger.error('Failed to queue cross-domain dependencies', {
        component: 'validator-indexer',
        validatorId: validatorData.accountId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Fetch validator information from blockchain
   */
  private async fetchValidatorFromBlockchain(validatorId: string): Promise<ValidatorInfo | null> {
    try {
      const api = await this.blockchain.getApi();
      
      // Fetch validator info using Substrate API
      const [
        validatorPrefs,
        stakingLedger,
        identity,
        exposure,
      ] = await Promise.all([
        api.query.staking.validators(validatorId),
        api.query.staking.ledger(validatorId),
        api.query.identity.identityOf(validatorId),
        api.query.staking.erasStakers.entries(),
      ]);

      // Parse validator preferences
      const prefs = validatorPrefs.toJSON() as any;
      
      // Parse identity information
      let identityInfo = undefined;
      if (identity.isSome) {
        const identityData = identity.unwrap().info;
        identityInfo = {
          display: identityData.display?.isRaw ? identityData.display.asRaw.toUtf8() : undefined,
          legal: identityData.legal?.isRaw ? identityData.legal.asRaw.toUtf8() : undefined,
          web: identityData.web?.isRaw ? identityData.web.asRaw.toUtf8() : undefined,
          riot: identityData.riot?.isRaw ? identityData.riot.asRaw.toUtf8() : undefined,
          email: identityData.email?.isRaw ? identityData.email.asRaw.toUtf8() : undefined,
          twitter: identityData.twitter?.isRaw ? identityData.twitter.asRaw.toUtf8() : undefined,
        };
      }

      // Find exposure for this validator in current era
      let stakeInfo = {
        total: '0',
        own: '0',
        others: '0',
      };
      let nominators: string[] = [];

      // Parse exposure data to get stake information
      for (const [key, exposureOpt] of exposure) {
        if (exposureOpt.isSome) {
          const exposureData = exposureOpt.unwrap();
          const [, validator] = key.args; // era not used, validator is the important part
          
          if (validator.toString() === validatorId) {
            stakeInfo = {
              total: exposureData.total.toString(),
              own: exposureData.own.toString(),
              others: exposureData.others.reduce((sum: bigint, nom: any) => sum + nom.value.toBigInt(), 0n).toString(),
            };
            nominators = exposureData.others.map((nom: any) => nom.who.toString());
            break;
          }
        }
      }

      return {
        accountId: validatorId,
        stash: validatorId, // In most cases, stash and accountId are the same
        controller: stakingLedger.isSome ? stakingLedger.unwrap().stash.toString() : undefined,
        commission: prefs.commission ? (prefs.commission / 10000000).toString() : '0', // Convert from Perbill
        blocked: prefs.blocked || false,
        identity: identityInfo,
        stake: stakeInfo,
        nominators,
        prefs: {
          commission: prefs.commission ? prefs.commission / 10000000 : 0,
          blocked: prefs.blocked || false,
        },
      };

    } catch (error) {
      logger.warn('Failed to fetch validator from blockchain', {
        component: 'validator-indexer',
        validatorId,
        error: (error as Error).message,
      });
      return null;
    }
  }
}

/**
 * Factory function to create ValidatorIndexer instance
 */
export const createValidatorIndexer = (
  validatorRepository: ValidatorRepository,
  blockchain: AvailBlockchainService,
  queueService?: any,
): ValidatorIndexer => {
  return new ValidatorIndexer(validatorRepository, blockchain, queueService);
}; 