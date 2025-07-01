import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { BlockData } from '../../types/blockchain';
import { QueueService } from '../../core/queue';
import { JobType } from '../../types/service';

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
      
      // Store block data in database
      const blockEntity = {
        number: blockData.number,
        hash: blockData.hash,
        parentHash: blockData.parentHash || null,
        stateRoot: blockData.stateRoot || null,
        extrinsicsRoot: blockData.extrinsicsRoot || null,
        timestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
        extrinsicsCount: blockData.extrinsics?.length || 0,
        eventsCount: blockData.events?.length || 0,
        validatorAddress: null, // Always null initially - updated when validator is indexed
        validatorName: null, // Will be populated when validator is indexed
        specVersion: null,
        totalFees: null,
        transferCount: null,
        dataSubmissionsSize: null,
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
      // Queue validator jobs with full block context
      for (const validatorAddress of dependentEntities.validators) {
        await this.queueService.addJob(JobType.INDEX_VALIDATOR, { 
          address: validatorAddress,
          blockNumber: blockData.number,
          blockData: blockData, // Pass full blockchain data to avoid re-fetching
        });
      }
      
      // Queue account jobs with full block context
      for (const accountAddress of dependentEntities.accounts) {
        await this.queueService.addJob(JobType.INDEX_ACCOUNT, { 
          accountAddress: accountAddress,
          blockNumber: blockData.number,
          blockData: blockData, // Pass full blockchain data to avoid re-fetching
        });
      }
      
      // Queue transfer jobs with full block context
      for (const transferId of dependentEntities.transfers) {
        await this.queueService.addJob(JobType.INDEX_TRANSFER, { 
          transferId,
          blockNumber: blockData.number,
          blockData: blockData, // Pass full blockchain data to avoid re-fetching
        });
      }
      
      // Queue extrinsic processing job for this block
      if (blockData.extrinsics && blockData.extrinsics.length > 0) {
        await this.queueService.addJob(JobType.EXTRINSIC_PROCESSING, {
          blockNumber: blockData.number,
          blockData: blockData,
        });
      }

      // Queue data submission jobs if block has data availability extrinsics
      const hasDataSubmissions = blockData.extrinsics.some(ext => 
        ext.method.section === 'dataAvailability' && 
        (ext.method.method === 'submitData' || ext.method.method === 'createApplicationKey'),
      );
      
      if (hasDataSubmissions) {
        await this.queueService.addJob(JobType.INDEX_DATA_SUBMISSION, { 
          blockNumber: blockData.number,
          blockData: blockData, // Pass full blockchain data including extrinsics
        });
      }

      logger.debug('Queued processor jobs', {
        component: 'block-indexer',
        blockNumber: blockData.number,
        validatorJobs: dependentEntities.validators.length,
        accountJobs: dependentEntities.accounts.length,
        transferJobs: dependentEntities.transfers.length,
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