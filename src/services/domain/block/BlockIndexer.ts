import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { BlockData } from '../../types/blockchain';
import { QueueService } from '../../core/queue';
import { JobType } from '../../types/service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * BlockIndexer - Fetches block data from blockchain and identifies dependencies
 * 
 * Responsibilities:
 * - Fetch block data from blockchain RPC
 * - Store block data in database
 * - Identify dependent entities (validators, accounts)
 * - Return indexing result with dependency metadata
 */

export interface IBlockIndexer {
  indexBlock(blockNumber: number): Promise<BlockIndexingResult>;
  indexBlockRange(startBlock: number, endBlock: number): Promise<BlockIndexingResult[]>;
}

export interface BlockIndexingResult {
  blockData: BlockData;
  dependentEntities: {
    validators: string[];
    accounts: string[];
    transfers: string[];
  };
  success: boolean;
  error?: string;
}

export class BlockIndexer implements IBlockIndexer {
  private blockRepository: BlockRepository;
  private blockchain: AvailBlockchainService;
  private queueService?: QueueService;

  constructor(
    blockRepository: BlockRepository,
    blockchain: AvailBlockchainService,
    queueService?: QueueService,
  ) {
    this.blockRepository = blockRepository;
    this.blockchain = blockchain;
    this.queueService = queueService;
  }

  /**
   * Index a single block by fetching from blockchain
   */
  async indexBlock(blockNumber: number): Promise<BlockIndexingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Indexing block from blockchain', {
        component: 'block-indexer',
        action: 'indexBlock',
        blockNumber,
      });

      // Fetch block data from blockchain
      const blockData = await this.blockchain.getBlock(blockNumber);
      
      // Get spec version from chain info
      let specVersion: number | null = null;
      try {
        const chainInfo = await this.blockchain.getChainInfo();
        specVersion = chainInfo.specVersion;
      } catch (error) {
        logger.debug('Failed to get spec version', {
          component: 'block-indexer',
          blockNumber,
          error: (error as Error).message,
        });
      }
      
      // Extract additional block data for more complete indexing
      const extractedTimestamp = this.extractTimestampFromExtrinsics(blockData);
      const transferCount = this.calculateTransferCount(blockData);
      const dataSubmissionsSize = this.calculateDataSubmissionsSize(blockData);
      const totalFees = this.calculateTotalFees(blockData);

      // Store block data in database
      const blockEntity = {
        number: blockData.number,
        hash: blockData.hash,
        parentHash: blockData.parentHash || null,
        stateRoot: blockData.stateRoot || null,
        extrinsicsRoot: blockData.extrinsicsRoot || null,
        timestamp: extractedTimestamp ? new Date(extractedTimestamp) : new Date(blockData.timestamp),
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
        validatorAddress: blockData.validator || null, // Extract from blockchain data
        validatorName: null, // Will be populated when validator is indexed
        specVersion: specVersion, // Extract from chain info
        totalFees: totalFees !== '0' ? new Decimal(totalFees) : null,
        transferCount: transferCount,
        dataSubmissionsSize: dataSubmissionsSize,
      };

      // Check if block already exists
      const existingBlock = await this.blockRepository.findByNumber(blockData.number);
      if (existingBlock) {
        logger.debug('Block already exists, updating', {
          component: 'block-indexer',
          blockNumber,
        });
        await this.blockRepository.update(blockData.number, blockEntity);
      } else {
        await this.blockRepository.create(blockEntity);
      }

      // Extract dependent entities
      const dependentEntities = this.extractDependentEntities(blockData);

      // Queue processor jobs for dependent entities
      if (this.queueService) {
        await this.queueDependentProcessorJobs(dependentEntities, blockData);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Block indexed successfully', {
        component: 'block-indexer',
        action: 'indexBlock',
        blockNumber,
        blockHash: blockData.hash,
        duration,
        dependentValidators: dependentEntities.validators.length,
        dependentAccounts: dependentEntities.accounts.length,
        dependentTransfers: dependentEntities.transfers.length,
      });

      return {
        blockData,
        dependentEntities,
        success: true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'block-indexer',
        action: 'indexBlock',
        blockNumber,
        duration,
      });

      return {
        blockData: {} as BlockData,
        dependentEntities: {
          validators: [],
          accounts: [],
          transfers: [],
        },
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index a range of blocks
   */
  async indexBlockRange(startBlock: number, endBlock: number): Promise<BlockIndexingResult[]> {
    logger.info('Indexing block range', {
      component: 'block-indexer',
      action: 'indexBlockRange',
      startBlock,
      endBlock,
      totalBlocks: endBlock - startBlock + 1,
    });

    const results: BlockIndexingResult[] = [];
    
    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      const result = await this.indexBlock(blockNumber);
      results.push(result);
      
      if (!result.success) {
        logger.warn('Block indexing failed in range', {
          component: 'block-indexer',
          blockNumber,
          error: result.error,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info('Block range indexing completed', {
      component: 'block-indexer',
      startBlock,
      endBlock,
      totalBlocks: results.length,
      successCount,
      failureCount: results.length - successCount,
    });

    return results;
  }

  /**
   * Queue processor jobs for dependent entities
   */
  private async queueDependentProcessorJobs(
    dependentEntities: { validators: string[], accounts: string[], transfers: string[] },
    blockData: BlockData,
  ): Promise<void> {
    if (!this.queueService) {
      return;
    }

    try {
      // Queue validator jobs with consistent structure
      for (const validatorAddress of dependentEntities.validators) {
        await this.queueService.addJob(JobType.INDEX_VALIDATOR, { 
          validatorAddress,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }
      
      // Queue account jobs with consistent structure
      for (const accountAddress of dependentEntities.accounts) {
        await this.queueService.addJob(JobType.INDEX_ACCOUNT, { 
          accountAddress,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }
      
      // Queue transfer jobs with consistent structure
      for (const transferId of dependentEntities.transfers) {
        await this.queueService.addJob(JobType.INDEX_TRANSFER, { 
          transferId,
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }
      
      // Queue extrinsic processing job with consistent structure
      if (blockData.extrinsics && blockData.extrinsics.length > 0) {
        await this.queueService.addJob(JobType.EXTRINSIC_PROCESSING, {
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }

      // Queue event processing job with consistent structure
      if (blockData.events && blockData.events.length > 0) {
        await this.queueService.addJob(JobType.INDEX_EVENT, {
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }

      // Queue era transition detection and processing
      await this.detectAndQueueEraTransition(blockData);

      // Queue data submission jobs if block has data availability extrinsics
      const hasDataSubmissions = blockData.extrinsics.some(ext => 
        ext.method.section === 'dataAvailability' && 
        (ext.method.method === 'submitData' || ext.method.method === 'createApplicationKey'),
      );
      
      if (hasDataSubmissions) {
        await this.queueService.addJob(JobType.INDEX_DATA_SUBMISSION, { 
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }

      logger.debug('Queued processor jobs', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        validatorJobs: dependentEntities.validators.length,
        accountJobs: dependentEntities.accounts.length,
        transferJobs: dependentEntities.transfers.length,
        eventJobs: blockData.events?.length > 0 ? 1 : 0,
        dataSubmissionJobs: hasDataSubmissions ? 1 : 0,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'block-indexer',
        action: 'queueDependentProcessorJobs',
        blockNumber: blockData.number,
      });
      // Don't throw - we don't want job queuing failures to break block indexing
    }
  }

  /**
   * Extract dependent entities from block data
   */
  private extractDependentEntities(blockData: BlockData): {
    validators: string[];
    accounts: string[];
    transfers: string[];
  } {
    const validators: Set<string> = new Set();
    const accounts: Set<string> = new Set();
    const transfers: string[] = [];

    // Add block validator
    if (blockData.validator) {
      validators.add(blockData.validator);
    }

    // Extract from extrinsics
    if (blockData.extrinsics) {
      blockData.extrinsics.forEach((extrinsic, index) => {
        // Extract signer account
        if (extrinsic.signer) {
          accounts.add(extrinsic.signer);
        }

        // Extract transfer-related accounts and create transfer IDs
        if (extrinsic.method?.section === 'balances' && extrinsic.method?.method === 'transfer') {
          const transferId = `${blockData.hash}-${index}`;
          transfers.push(transferId);
          
          // Extract transfer destination account from method args
          if (extrinsic.method.args && extrinsic.method.args.dest) {
            const dest = extrinsic.method.args.dest;
            if (typeof dest === 'string') {
              accounts.add(dest);
            } else if (dest && typeof dest === 'object' && 'Id' in dest) {
              accounts.add(dest.Id as string);
            }
          }
        }

        // Extract other account-related operations
        if (extrinsic.method?.section === 'staking') {
          // Add staking-related accounts from method args
          if (extrinsic.method.args && extrinsic.method.args.targets) {
            const targets = extrinsic.method.args.targets;
            if (Array.isArray(targets)) {
              targets.forEach(target => {
                if (typeof target === 'string') {
                  accounts.add(target);
                  validators.add(target); // Staking targets are usually validators
                }
              });
            }
          }
        }
      });
    }

    // Extract from events
    if (blockData.events) {
      blockData.events.forEach(event => {
        if (event.section === 'balances' && event.method === 'Transfer') {
          // Extract accounts from transfer events
          if (event.data && Array.isArray(event.data)) {
            const [from, to] = event.data;
            if (from) {
              accounts.add(from.toString());
            }
            if (to) {
              accounts.add(to.toString());
            }
          }
        }
        
        if (event.section === 'staking') {
          // Extract validator-related accounts from staking events
          if (event.data && Array.isArray(event.data)) {
            event.data.forEach(item => {
              if (typeof item === 'string') {
                validators.add(item);
                accounts.add(item);
              }
            });
          }
        }
      });
    }

    return {
      validators: Array.from(validators),
      accounts: Array.from(accounts),
      transfers,
    };
  }

  /**
   * Detect era transitions from block events and queue appropriate jobs
   */
  private async detectAndQueueEraTransition(blockData: BlockData): Promise<void> {
    if (!this.queueService) {
      return;
    }

    try {
      // Check for era transition events in the block
      const eraTransitionEvents = blockData.events?.filter(event => 
        event.section === 'staking' && (
          event.method === 'NewEra' || 
          event.method === 'EraPaid' ||
          event.method === 'EraEnded'
        )
      ) || [];

      if (eraTransitionEvents.length === 0) {
        return;
      }

      // Extract era information from events
      for (const event of eraTransitionEvents) {
        if (event.method === 'NewEra' && event.data && Array.isArray(event.data)) {
          const newEraNumber = Number(event.data[0]);
          
          if (!isNaN(newEraNumber)) {
            logger.info('Era transition detected in block, queuing era processing', {
              component: 'block-indexer',
              blockNumber: blockData.number,
              newEra: newEraNumber,
              eventMethod: event.method,
            });

            // Queue era indexing job
            await this.queueService.addJob(JobType.INDEX_ERA, {
              eraNumber: newEraNumber,
              blockNumber: blockData.number,
              blockHash: blockData.hash,
            });

            // Queue era transition job (will handle ending previous era and starting new one)
            const currentEraNumber = newEraNumber - 1;
            await this.queueService.addJob(JobType.ERA_TRANSITION, {
              currentEra: currentEraNumber,
              newEra: newEraNumber,
              transitionBlock: blockData.number,
            });
          }
        }
      }

    } catch (error) {
      logError(error as Error, {
        component: 'block-indexer',
        action: 'detectAndQueueEraTransition',
        blockNumber: blockData.number,
      });
      // Don't throw - we don't want era detection failures to break block indexing
    }
  }

  /**
   * Extract timestamp from timestamp.set extrinsic (first extrinsic in every block)
   */
  private extractTimestampFromExtrinsics(blockData: BlockData): number | null {
    try {
      // The first extrinsic in every Substrate block is timestamp.set
      const timestampExtrinsic = blockData.extrinsics?.find(ext => 
        ext.method?.section === 'timestamp' && ext.method?.method === 'set'
      );

      if (timestampExtrinsic && timestampExtrinsic.method?.args?.now) {
        const timestamp = timestampExtrinsic.method.args.now;
        // Convert from Unix timestamp to milliseconds
        return typeof timestamp === 'number' ? timestamp : parseInt(timestamp.toString());
      }
    } catch (error) {
      logger.debug('Failed to extract timestamp from extrinsics', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
    }
    return null;
  }

  /**
   * Calculate transfer count from balance transfer extrinsics
   */
  private calculateTransferCount(blockData: BlockData): number {
    try {
      return blockData.extrinsics?.filter(ext => 
        ext.method?.section === 'balances' && 
        (ext.method?.method === 'transfer' || ext.method?.method === 'transferKeepAlive')
      ).length || 0;
    } catch (error) {
      logger.debug('Failed to calculate transfer count', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Calculate data submissions size from dataAvailability extrinsics
   */
  private calculateDataSubmissionsSize(blockData: BlockData): number {
    try {
      let totalSize = 0;
      
      blockData.extrinsics?.forEach(ext => {
        if (ext.method?.section === 'dataAvailability' && ext.method?.method === 'submitData') {
          // Extract data size from the arguments
          const data = ext.method?.args?.data;
          if (data) {
            // Data can be a hex string, so calculate size in bytes
            if (typeof data === 'string' && data.startsWith('0x')) {
              totalSize += (data.length - 2) / 2; // Remove 0x prefix and divide by 2 for hex
            } else if (data.length) {
              totalSize += data.length;
            }
          }
        }
      });

      return totalSize;
    } catch (error) {
      logger.debug('Failed to calculate data submissions size', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Calculate total fees from balances.Withdraw events
   */
  private calculateTotalFees(blockData: BlockData): string {
    try {
      let totalFees = new Decimal('0');
      
      // Sum all balances.Withdraw events which represent fee payments
      blockData.events?.forEach(event => {
        if (event.section === 'balances' && event.method === 'Withdraw') {
          // Event data: [who, amount]
          if (event.data && Array.isArray(event.data) && event.data.length >= 2) {
            const amount = event.data[1];
            if (amount) {
              try {
                const feeAmount = new Decimal(amount.toString());
                totalFees = totalFees.add(feeAmount);
              } catch (decimalError) {
                logger.debug('Failed to convert fee amount to Decimal', {
                  component: 'block-indexer',
                  blockNumber: blockData.number,
                  amount: amount,
                  error: (decimalError as Error).message,
                });
              }
            }
          }
        }
      });

      return totalFees.toString();
    } catch (error) {
      logger.debug('Failed to calculate total fees', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      return '0';
    }
  }
}

/**
 * Factory function to create BlockIndexer instance
 */
export const createBlockIndexer = (
  blockRepository: BlockRepository,
  blockchain: AvailBlockchainService,
  queueService?: QueueService,
): BlockIndexer => {
  return new BlockIndexer(blockRepository, blockchain, queueService);
}; 