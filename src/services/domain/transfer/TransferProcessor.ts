import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { TransferRepository } from '../../../database/repositories/TransferRepository';
import { SelfHealingProcessor, ExtractedEntity, DependencyResolver } from '../../types/self-healing';
import { BlockData, ExtrinsicData } from '../../types/blockchain';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * TransferProcessor - Self-Healing Transfer Data Processor
 * 
 * Responsibilities:
 * - Extract transfer information from blockchain data
 * - Process transfer entities with dependency resolution
 * - Ensure account dependencies exist before creating transfers
 * - Handle balance.transfer, balance.transferKeepAlive, and balance.transferAll extrinsics
 */
export class TransferProcessor implements SelfHealingProcessor {
  private blockchain: AvailBlockchainService;
  private transferRepository: TransferRepository;
  private dependencyResolver: DependencyResolver;

  constructor(
    blockchain: AvailBlockchainService,
    transferRepository: TransferRepository,
    dependencyResolver: DependencyResolver,
  ) {
    this.blockchain = blockchain;
    this.transferRepository = transferRepository;
    this.dependencyResolver = dependencyResolver;
  }

  /**
   * Extract transfer information from block data
   * Identifies balance.transfer, balance.transferKeepAlive, and balance.transferAll extrinsics
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    try {
      logger.debug('TransferProcessor: Extracting transfers from block', { 
        component: 'transfer-processor',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      const transfers: ExtractedEntity[] = [];

      blockData.extrinsics.forEach((extrinsic, index) => {
        if (this.isTransferExtrinsic(extrinsic)) {
          const transferData = this.extractTransferData(extrinsic, blockData, index);
          if (transferData) {
            transfers.push({
              type: 'transfer',
              id: `${blockData.number}-${index}`,
              data: transferData,
              dependencies: [
                {
                  service: 'account',
                  entityType: 'account',
                  entityId: transferData.fromAddress,
                  required: true,
                },
                {
                  service: 'account',
                  entityType: 'account',
                  entityId: transferData.toAddress,
                  required: true,
                },
              ],
            });
          }
        }
      });

      logger.debug('TransferProcessor: Extracted transfers from block', { 
        component: 'transfer-processor',
        blockNumber: blockData.number,
        transferCount: transfers.length,
      });

      return transfers;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'extractFromBlock',
        blockNumber: blockData.number,
      });
      return [];
    }
  }

  /**
   * Process extracted transfer entities
   * Creates transfer records after ensuring dependencies exist
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<any[]> {
    try {
      logger.debug('TransferProcessor: Processing extracted transfer entities', { 
        component: 'transfer-processor',
        entityCount: entities.length,
      });

      const results: any[] = [];

      for (const entity of entities) {
        try {
          // Ensure dependencies exist first
          await this.ensureDependencies(entity);

          // Process the transfer
          const transfer = await this.processTransfer(entity);
          if (transfer) {
            results.push(transfer);
          }

        } catch (error) {
          logError(error as Error, { 
            component: 'transfer-processor', 
            action: 'processExtractedEntity',
            entityId: entity.id,
          });
          // Continue processing other entities
        }
      }

      logger.debug('TransferProcessor: Processed transfer entities', { 
        component: 'transfer-processor',
        processedCount: results.length,
        totalEntities: entities.length,
      });

      return results;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'processExtractedEntities',
      });
      return [];
    }
  }

  /**
   * Ensure transfer dependencies exist (from and to accounts)
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    try {
      // Ensure from account exists
      if (entity.data.fromAddress) {
        await this.dependencyResolver.ensureAccount(entity.data.fromAddress);
      }

      // Ensure to account exists  
      if (entity.data.toAddress) {
        await this.dependencyResolver.ensureAccount(entity.data.toAddress);
      }

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'ensureDependencies',
        entityId: entity.id,
      });
      throw error;
    }
  }

  /**
   * Public method for dependency resolver integration
   */
  async ensureTransferExists(extrinsicHash: string): Promise<any> {
    try {
      const transfer = await this.transferRepository.findByExtrinsicHash(extrinsicHash);
      return transfer;
    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'ensureTransferExists',
        extrinsicHash,
      });
      throw error;
    }
  }

  /**
   * Helper method: Check if extrinsic is a transfer
   */
  private isTransferExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'balances' && 
           ['transfer', 'transferKeepAlive', 'transferAll'].includes(extrinsic.method.method);
  }

  /**
   * Helper method: Extract transfer data from extrinsic
   */
  private extractTransferData(extrinsic: ExtrinsicData, blockData: BlockData, index: number) {
    try {
      if (!extrinsic.signer) {
        return null; // No signer means no valid transfer
      }

      // Extract destination address
      let toAddress: string | null = null;
      if (extrinsic.method.args.dest) {
        // Handle different destination formats
        if (typeof extrinsic.method.args.dest === 'string') {
          toAddress = extrinsic.method.args.dest;
        } else if (extrinsic.method.args.dest.Id) {
          toAddress = extrinsic.method.args.dest.Id;
        } else if (extrinsic.method.args.dest.toString) {
          toAddress = extrinsic.method.args.dest.toString();
        }
      }

      if (!toAddress) {
        logger.warn('TransferProcessor: Could not extract destination address', {
          component: 'transfer-processor',
          extrinsicHash: extrinsic.hash,
          args: extrinsic.method.args,
        });
        return null;
      }

      // Extract amount
      let amount = 0;
      if (extrinsic.method.args.value) {
        try {
          amount = parseInt(extrinsic.method.args.value.toString());
        } catch {
          logger.warn('TransferProcessor: Could not parse transfer amount', {
            component: 'transfer-processor',
            extrinsicHash: extrinsic.hash,
            value: extrinsic.method.args.value,
          });
        }
      }

      return {
        extrinsicHash: extrinsic.hash,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        extrinsicIndex: index,
        fromAddress: extrinsic.signer,
        toAddress,
        amount: amount.toString(),
        fee: extrinsic.fee || '0',
        success: extrinsic.success,
        timestamp: new Date(blockData.timestamp),
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'extractTransferData',
        extrinsicHash: extrinsic.hash,
      });
      return null;
    }
  }

  /**
   * Helper method: Process a single transfer entity
   */
  private async processTransfer(entity: ExtractedEntity): Promise<any> {
    try {
      const transferData = entity.data;

      // Check if transfer already exists
      const existing = await this.transferRepository.findByExtrinsicHash(transferData.extrinsicHash);
      if (existing) {
        logger.debug('TransferProcessor: Transfer already exists, skipping', {
          component: 'transfer-processor',
          extrinsicHash: transferData.extrinsicHash,
        });
        return existing;
      }

      // Create new transfer record
      const transfer = await this.transferRepository.create({
        id: `${transferData.extrinsicHash}-${transferData.extrinsicIndex}`,
        extrinsicHash: transferData.extrinsicHash,
        blockHash: transferData.blockHash || null,
        blockTimestamp: transferData.timestamp,
        fromAddress: transferData.fromAddress,
        toAddress: transferData.toAddress,
        amount: new Decimal(transferData.amount),
        tokenType: 'AVAIL',
        fees: new Decimal(transferData.fee),
        status: transferData.success ? 'success' : 'failed',
        blockNumber: transferData.blockNumber,
        extrinsicIndex: transferData.extrinsicIndex,
        timestamp: transferData.timestamp,
      });

      logger.debug('TransferProcessor: Transfer created', {
        component: 'transfer-processor',
        transferId: transfer.id,
        extrinsicHash: transferData.extrinsicHash,
        amount: transferData.amount,
      });

      return transfer;

    } catch (error) {
      logError(error as Error, { 
        component: 'transfer-processor', 
        action: 'processTransfer',
        entityId: entity.id,
      });
      throw error;
    }
  }
}

// Factory function
export const createTransferProcessor = (
  blockchain: AvailBlockchainService,
  transferRepository: TransferRepository,
  dependencyResolver: DependencyResolver,
): TransferProcessor => {
  return new TransferProcessor(blockchain, transferRepository, dependencyResolver);
}; 