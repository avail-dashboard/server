import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { TransferRepository } from '../../database/repositories/TransferRepository';
import { BlockData, ExtrinsicData, EventData } from '../types/blockchain';

export interface TransferInfo {
  id: string;
  extrinsicHash: string;
  blockNumber: number;
  extrinsicIndex: number;
  fromAddress: string;
  toAddress: string;
  amount: bigint;
  tokenType: string;
  fees: bigint;
  status: 'success' | 'failed';
  timestamp: Date;
}

export interface ITransferProcessor {
  processBlockTransfers(blockData: BlockData): Promise<TransferInfo[]>;
  extractTransfersFromExtrinsic(extrinsic: ExtrinsicData, blockData: BlockData): Promise<TransferInfo[]>;
  extractTransfersFromEvents(events: EventData[], blockData: BlockData): Promise<TransferInfo[]>;
  calculateTransferFees(extrinsic: ExtrinsicData, events: EventData[]): Promise<bigint>;
}

/**
 * TransferProcessor - Processes balance transfer data from blocks
 * 
 * Responsibilities:
 * - Extract balance transfers from extrinsics
 * - Parse transfer events for amounts and addresses
 * - Calculate transfer fees from withdraw events
 * - Track transfer success/failure status
 * - Store transfer records in database
 */
export class TransferProcessor implements ITransferProcessor {
  private blockchain: AvailBlockchainService;
  private transferRepository: TransferRepository;

  constructor(
    blockchain: AvailBlockchainService,
    transferRepository: TransferRepository,
  ) {
    this.blockchain = blockchain;
    this.transferRepository = transferRepository;
  }

  /**
   * Process all transfers in a block
   */
  async processBlockTransfers(blockData: BlockData): Promise<TransferInfo[]> {
    try {
      logger.debug('TransferProcessor: Processing block transfers', {
        component: 'transfer-processor',
        blockNumber: blockData.number,
        extrinsicsCount: blockData.extrinsics.length,
        eventsCount: blockData.events.length,
      });

      const allTransfers: TransferInfo[] = [];

      // Process transfers from extrinsics
      for (let i = 0; i < blockData.extrinsics.length; i++) {
        const extrinsic = blockData.extrinsics[i];
        const transfers = await this.extractTransfersFromExtrinsic(extrinsic, blockData);
        allTransfers.push(...transfers);
      }

      // Process transfers from events (for cases where extrinsic parsing misses them)
      const eventTransfers = await this.extractTransfersFromEvents(blockData.events, blockData);
      
      // Merge and deduplicate transfers
      const uniqueTransfers = this.deduplicateTransfers([...allTransfers, ...eventTransfers]);

      // Store transfers in database
      if (uniqueTransfers.length > 0) {
        await this.storeTransfers(uniqueTransfers);
      }

      logger.debug('TransferProcessor: Block transfers processed', {
        component: 'transfer-processor',
        blockNumber: blockData.number,
        transfersFound: uniqueTransfers.length,
      });

      return uniqueTransfers;

    } catch (error) {
      logError(error as Error, {
        component: 'transfer-processor',
        action: 'processBlockTransfers',
        blockNumber: blockData.number,
      });
      return [];
    }
  }

  /**
   * Extract transfers from a single extrinsic
   */
  async extractTransfersFromExtrinsic(extrinsic: ExtrinsicData, blockData: BlockData): Promise<TransferInfo[]> {
    try {
      const transfers: TransferInfo[] = [];

      // Check if this is a balance transfer extrinsic
      if (!this.isTransferExtrinsic(extrinsic)) {
        return transfers;
      }

      logger.debug('TransferProcessor: Processing transfer extrinsic', {
        component: 'transfer-processor',
        blockNumber: blockData.number,
        extrinsicHash: extrinsic.hash,
        method: `${extrinsic.method.section}.${extrinsic.method.method}`,
      });

      // Extract transfer details from extrinsic arguments
      const transferDetails = this.extractTransferDetails(extrinsic);
      if (!transferDetails) {
        return transfers;
      }

      // Calculate fees
      const fees = await this.calculateTransferFees(extrinsic, blockData.events);

      // Create transfer record
      const transfer: TransferInfo = {
        id: `${extrinsic.hash}-${extrinsic.index}`,
        extrinsicHash: extrinsic.hash,
        blockNumber: blockData.number,
        extrinsicIndex: extrinsic.index,
        fromAddress: transferDetails.from,
        toAddress: transferDetails.to,
        amount: transferDetails.amount,
        tokenType: 'AVAIL',
        fees,
        status: extrinsic.success ? 'success' : 'failed',
        timestamp: new Date(blockData.timestamp),
      };

      transfers.push(transfer);

      return transfers;

    } catch (error) {
      logError(error as Error, {
        component: 'transfer-processor',
        action: 'extractTransfersFromExtrinsic',
        blockNumber: blockData.number,
        extrinsicHash: extrinsic.hash,
      });
      return [];
    }
  }

  /**
   * Extract transfers from events
   */
  async extractTransfersFromEvents(events: EventData[], blockData: BlockData): Promise<TransferInfo[]> {
    try {
      const transfers: TransferInfo[] = [];

      for (const event of events) {
        if (this.isTransferEvent(event)) {
          const transfer = this.extractTransferFromEvent(event, blockData);
          if (transfer) {
            transfers.push(transfer);
          }
        }
      }

      return transfers;

    } catch (error) {
      logError(error as Error, {
        component: 'transfer-processor',
        action: 'extractTransfersFromEvents',
        blockNumber: blockData.number,
      });
      return [];
    }
  }

  /**
   * Calculate transfer fees from events
   */
  async calculateTransferFees(extrinsic: ExtrinsicData, events: EventData[]): Promise<bigint> {
    try {
             // Look for withdraw events that indicate fees
       for (const event of events) {
         if (event.section === 'balances' && 
             event.method === 'Withdraw' && 
             event.phase?.applyExtrinsic === extrinsic.index) {
           // Extract fee amount from event data
           if (event.data && Array.isArray(event.data) && event.data.length >= 2) {
             return BigInt(event.data[1].toString());
           }
         }
       }

      // Fallback to extrinsic fee if available
      if (extrinsic.fee) {
        return BigInt(extrinsic.fee.toString());
      }

      return BigInt(0);

    } catch (error) {
      logError(error as Error, {
        component: 'transfer-processor',
        action: 'calculateTransferFees',
        extrinsicHash: extrinsic.hash,
      });
      return BigInt(0);
    }
  }

  /**
   * Check if extrinsic is a transfer
   */
  private isTransferExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'balances' && 
           (extrinsic.method.method === 'transfer' || 
            extrinsic.method.method === 'transferKeepAlive' ||
            extrinsic.method.method === 'transferAll');
  }

  /**
   * Check if event is a transfer event
   */
  private isTransferEvent(event: EventData): boolean {
    return event.section === 'balances' && event.method === 'Transfer';
  }

  /**
   * Extract transfer details from extrinsic arguments
   */
  private extractTransferDetails(extrinsic: ExtrinsicData): { from: string; to: string; amount: bigint } | null {
    try {
      // The signer is the 'from' address
      const from = extrinsic.signer;
      if (!from) {
        return null;
      }

      // Extract 'to' address and amount from method arguments
      const args = extrinsic.method.args;
      if (!args || !Array.isArray(args) || args.length < 2) {
        return null;
      }

      const to = args[0]?.toString();
      const amount = BigInt(args[1]?.toString() || '0');

      if (!to || amount <= 0) {
        return null;
      }

      return { from, to, amount };

    } catch (error) {
      logger.debug('TransferProcessor: Could not extract transfer details', {
        component: 'transfer-processor',
        extrinsicHash: extrinsic.hash,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Extract transfer from transfer event
   */
  private extractTransferFromEvent(event: EventData, blockData: BlockData): TransferInfo | null {
    try {
      if (!event.data || !Array.isArray(event.data) || event.data.length < 3) {
        return null;
      }

      const from = event.data[0]?.toString();
      const to = event.data[1]?.toString();
      const amount = BigInt(event.data[2]?.toString() || '0');

      if (!from || !to || amount <= 0) {
        return null;
      }

      // Generate ID based on event position
      const id = `${blockData.number}-${event.index}-transfer`;

             return {
         id,
         extrinsicHash: '', // Events don't have direct extrinsic hash
         blockNumber: blockData.number,
         extrinsicIndex: event.phase?.applyExtrinsic || 0,
         fromAddress: from,
         toAddress: to,
         amount,
         tokenType: 'AVAIL',
         fees: BigInt(0), // Events don't contain fee info directly
         status: 'success', // Events only exist for successful transfers
         timestamp: new Date(blockData.timestamp),
       };

    } catch (error) {
      logger.debug('TransferProcessor: Could not extract transfer from event', {
        component: 'transfer-processor',
        blockNumber: blockData.number,
        eventIndex: event.index,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Deduplicate transfers (prefer extrinsic-based over event-based)
   */
  private deduplicateTransfers(transfers: TransferInfo[]): TransferInfo[] {
    const seen = new Set<string>();
    const unique: TransferInfo[] = [];

    // Sort to prioritize extrinsic-based transfers (they have better fee info)
    transfers.sort((a, b) => {
      if (a.extrinsicHash && !b.extrinsicHash) return -1;
      if (!a.extrinsicHash && b.extrinsicHash) return 1;
      return 0;
    });

    for (const transfer of transfers) {
      const key = `${transfer.fromAddress}-${transfer.toAddress}-${transfer.amount}-${transfer.blockNumber}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(transfer);
      }
    }

    return unique;
  }

  /**
   * Store transfers in database
   */
  private async storeTransfers(transfers: TransferInfo[]): Promise<void> {
    try {
      const transfersToCreate = transfers.map(transfer => ({
        id: transfer.id,
        extrinsicHash: transfer.extrinsicHash,
        blockNumber: transfer.blockNumber,
        extrinsicIndex: transfer.extrinsicIndex,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
        tokenType: transfer.tokenType,
        fees: transfer.fees,
        status: transfer.status,
        timestamp: transfer.timestamp,
      }));

      await this.transferRepository.createMany(transfersToCreate);

      logger.debug('TransferProcessor: Transfers stored in database', {
        component: 'transfer-processor',
        count: transfers.length,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'transfer-processor',
        action: 'storeTransfers',
        transferCount: transfers.length,
      });
    }
  }
}

export const createTransferProcessor = (
  blockchain: AvailBlockchainService,
  transferRepository: TransferRepository,
): TransferProcessor => {
  return new TransferProcessor(blockchain, transferRepository);
}; 