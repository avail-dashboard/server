import { logger, logError } from '../../../utils/logger';
import { TransferRepository } from '../../../database/repositories/TransferRepository';
import { BlockData } from '../../types/blockchain';
import { JobType } from '../../types/service';
import { Decimal } from '@prisma/client/runtime/library';

export interface ITransferIndexer {
  indexTransfersForBlock(blockData: BlockData): Promise<TransferIndexingResult>;
  indexTransfer(transferData: TransferData): Promise<TransferIndexingResult>;
}

export interface TransferIndexingResult {
  transfersProcessed: number;
  transfers: TransferData[];
  success: boolean;
  error?: string;
}

export interface TransferData {
  id: string;
  blockNumber: number;
  blockHash: string;
  extrinsicIndex: number;
  eventIndex?: number;
  fromAddress: string;
  toAddress: string;
  amount: string;
  fee?: string;
  success: boolean;
  timestamp: Date;
  txHash?: string;
}

export class TransferIndexer implements ITransferIndexer {
  private transferRepository: TransferRepository;
  private queueService?: any;

  constructor(transferRepository: TransferRepository, queueService?: any) {
    this.transferRepository = transferRepository;
    this.queueService = queueService;
  }

  async indexTransfersForBlock(blockData: BlockData): Promise<TransferIndexingResult> {
    try {
      const transfers = this.extractTransfersFromBlock(blockData);
      const storedTransfers: TransferData[] = [];
      
      for (const transfer of transfers) {
        const result = await this.indexTransfer(transfer);
        if (result.success) {
          storedTransfers.push(...result.transfers);
        }
      }

      // Queue cross-domain account indexing jobs for all transfer participants
      await this.queueAccountDependencies(storedTransfers);

      return {
        transfersProcessed: storedTransfers.length,
        transfers: storedTransfers,
        success: true,
      };
    } catch (error) {
      return {
        transfersProcessed: 0,
        transfers: [],
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async indexTransfer(transferData: TransferData): Promise<TransferIndexingResult> {
    try {
      const transferEntity = {
        id: transferData.id,
        extrinsicHash: transferData.txHash || `block-${transferData.blockHash}`,
        blockNumber: transferData.blockNumber,
        blockHash: transferData.blockHash || null,
        blockTimestamp: transferData.timestamp,
        extrinsicIndex: transferData.extrinsicIndex,
        fromAddress: transferData.fromAddress,
        toAddress: transferData.toAddress,
        amount: new Decimal(transferData.amount),
        tokenType: 'AVAIL',
        fees: new Decimal(transferData.fee || '0'),
        status: transferData.success ? 'success' as const : 'failed' as const,
        timestamp: transferData.timestamp,
      };

      const existingTransfer = await this.transferRepository.findById(transferData.id);
      if (existingTransfer) {
        logger.debug('Transfer already exists, skipping update', {
          component: 'transfer-indexer',
          transferId: transferData.id,
        });
      } else {
        await this.transferRepository.create(transferEntity);
      }

      return {
        transfersProcessed: 1,
        transfers: [transferData],
        success: true,
      };
    } catch (error) {
      logError(error as Error, {
        component: 'transfer-indexer',
        action: 'indexTransfer',
        transferId: transferData.id,
      });

      return {
        transfersProcessed: 0,
        transfers: [],
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private extractTransfersFromBlock(blockData: BlockData): TransferData[] {
    const transfers: TransferData[] = [];
    const timestamp = blockData.timestamp ? new Date(blockData.timestamp) : new Date();

    if (blockData.events) {
      blockData.events.forEach((event, eventIndex) => {
        if (event.section === 'balances' && event.method === 'Transfer') {
          if (event.data && Array.isArray(event.data) && event.data.length >= 3) {
            const [from, to, amount] = event.data;
            const transferId = `${blockData.hash}-event-${eventIndex}`;
            
            let extrinsicIndex = 0;
            let txHash = undefined;
            let fee = undefined;
            
            if (event.phase?.applyExtrinsic !== undefined) {
              extrinsicIndex = event.phase.applyExtrinsic;
              const relatedExtrinsic = blockData.extrinsics?.[extrinsicIndex];
              if (relatedExtrinsic) {
                txHash = relatedExtrinsic.hash;
              }
              
              // Extract fee from corresponding balances.Withdraw event
              fee = this.extractFeeFromWithdrawEvent(blockData.events, extrinsicIndex, from.toString());
            }
            
            transfers.push({
              id: transferId,
              blockNumber: blockData.number,
              blockHash: blockData.hash,
              extrinsicIndex,
              eventIndex,
              fromAddress: from.toString(),
              toAddress: to.toString(),
              amount: amount.toString(),
              fee,
              success: true,
              timestamp,
              txHash,
            });
          }
        }
      });
    }

    return transfers;
  }

  /**
   * Extract transaction fee from balances.Withdraw event that corresponds to the same extrinsic
   * In Substrate/Avail, transaction fees are withdrawn from the signer's account and recorded as Withdraw events
   */
  private extractFeeFromWithdrawEvent(events: any[], extrinsicIndex: number, signerAddress: string): string | undefined {
    try {
      // Find the balances.Withdraw event for this extrinsic from the signer's account
      const withdrawEvent = events.find(event => 
        event.section === 'balances' &&
        event.method === 'Withdraw' &&
        event.phase?.applyExtrinsic === extrinsicIndex &&
        event.data &&
        Array.isArray(event.data) &&
        event.data.length >= 2 &&
        event.data[0]?.toString() === signerAddress,
      );

      if (withdrawEvent && withdrawEvent.data[1]) {
        const feeAmount = withdrawEvent.data[1].toString();
        logger.debug('Fee extracted from Withdraw event', {
          component: 'transfer-indexer',
          extrinsicIndex,
          signerAddress,
          feeAmount,
        });
        return feeAmount;
      }

      logger.debug('No fee Withdraw event found for transfer', {
        component: 'transfer-indexer',
        extrinsicIndex,
        signerAddress,
      });
      return undefined;

    } catch (error) {
      logger.warn('Failed to extract fee from Withdraw event', {
        component: 'transfer-indexer',
        extrinsicIndex,
        signerAddress,
        error: (error as Error).message,
      });
      return undefined;
    }
  }

  /**
   * Queue account indexing jobs for transfer participants
   */
  private async queueAccountDependencies(transfers: TransferData[]): Promise<void> {
    if (!this.queueService) {
      logger.debug('Queue service not available, skipping cross-domain job queuing', {
        component: 'transfer-indexer',
        transferCount: transfers.length,
      });
      return;
    }

    try {
      const accountsToQueue = new Set<string>();

      // Extract all unique account addresses from transfers
      transfers.forEach(transfer => {
        accountsToQueue.add(transfer.fromAddress);
        accountsToQueue.add(transfer.toAddress);
      });

      // Queue account indexing jobs
      let queuedCount = 0;
      for (const accountAddress of accountsToQueue) {
        try {
          await this.queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress });
          queuedCount++;
          logger.debug('Queued account indexing job from transfer', {
            component: 'transfer-indexer',
            accountAddress,
          });
        } catch (error) {
          logger.warn('Failed to queue account indexing job', {
            component: 'transfer-indexer',
            accountAddress,
            error: (error as Error).message,
          });
        }
      }

      logger.info('Cross-domain account jobs queued from transfer indexing', {
        component: 'transfer-indexer',
        transfersProcessed: transfers.length,
        uniqueAccounts: accountsToQueue.size,
        queuedJobs: queuedCount,
      });

    } catch (error) {
      logger.error('Failed to queue cross-domain account dependencies', {
        component: 'transfer-indexer',
        transferCount: transfers.length,
        error: (error as Error).message,
      });
    }
  }
}

export const createTransferIndexer = (
  transferRepository: TransferRepository,
  queueService?: any,
): TransferIndexer => {
  return new TransferIndexer(transferRepository, queueService);
}; 