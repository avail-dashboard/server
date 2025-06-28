import { logger, logError } from '../../../utils/logger';
import { TransferRepository } from '../../../database/repositories/TransferRepository';
import { BlockData } from '../../types/blockchain';

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

  constructor(transferRepository: TransferRepository) {
    this.transferRepository = transferRepository;
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
        extrinsicIndex: transferData.extrinsicIndex,
        fromAddress: transferData.fromAddress,
        toAddress: transferData.toAddress,
        amount: BigInt(transferData.amount),
        tokenType: 'AVAIL',
        fees: BigInt(transferData.fee || '0'),
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
                fee = relatedExtrinsic.fee;
              }
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
}

export const createTransferIndexer = (
  transferRepository: TransferRepository,
): TransferIndexer => {
  return new TransferIndexer(transferRepository);
}; 