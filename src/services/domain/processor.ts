import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { 
  BaseService,
  ServiceHealth,
} from '../types/service';
import { 
  BlockData,
  ExtrinsicData,
  EventData,
} from '../types/blockchain';
import { 
  Block,
  Extrinsic,
  Event,
} from '../../types/database';

export interface IDataProcessorService {
  processBlock(blockData: BlockData): Promise<void>;
  processExtrinsics(blockNumber: number, extrinsics: ExtrinsicData[]): Promise<void>;
  processEvents(blockNumber: number, events: EventData[]): Promise<void>;
  updateAccountStates(blockData: BlockData): Promise<void>;
}

/**
 * DataProcessorService - Processes raw blockchain data and stores it in database
 * 
 * Responsibilities:
 * - Transform raw blockchain data into database records
 * - Store blocks, extrinsics, events in normalized format
 * - Update account balances and states
 * - Handle data relationships and constraints
 * - Ensure data integrity and consistency
 * - Batch operations for performance
 */
export class DataProcessorService implements BaseService, IDataProcessorService {
  private db: typeof db;
  private blockchain: AvailBlockchainService;
  private isRunning = false;
  private readonly BATCH_SIZE = 100; // records per batch

  constructor(database: typeof db, blockchain: AvailBlockchainService) {
    this.db = database;
    this.blockchain = blockchain;
  }

  /**
   * Start the processor service
   */
  async start(): Promise<void> {
    try {
      logger.info('DataProcessorService: Starting service', { component: 'processor' });
      
      this.isRunning = true;
      logger.info('DataProcessorService: Service started successfully', { component: 'processor' });
      
    } catch (error) {
      logError(error as Error, { component: 'processor', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the processor service
   */
  async stop(): Promise<void> {
    try {
      logger.info('DataProcessorService: Stopping service', { component: 'processor' });
      
      this.isRunning = false;
      logger.info('DataProcessorService: Service stopped', { component: 'processor' });
      
    } catch (error) {
      logError(error as Error, { component: 'processor', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Test database connectivity
      const dbHealthy = await this.db.checkHealth();
      
      return {
        healthy: this.isRunning && dbHealthy,
        lastCheck: now,
        error: !dbHealthy ? 'Database connection failed' : undefined,
        details: {
          isRunning: this.isRunning,
          databaseHealthy: dbHealthy,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          isRunning: this.isRunning,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Process a complete block and all its data
   */
  async processBlock(blockData: BlockData): Promise<void> {
    try {
      logger.debug('DataProcessorService: Processing block', { 
        component: 'processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
        extrinsicsCount: blockData.extrinsics.length,
        eventsCount: blockData.events.length,
      });

      // Use transaction to ensure data consistency
      await this.db.transaction(async (client) => {
        // 1. Store block data
        await this.storeBlock(blockData, client);
        
        // 2. Process and store extrinsics
        if (blockData.extrinsics.length > 0) {
          await this.processExtrinsics(blockData.number, blockData.extrinsics, client);
        }
        
        // 3. Process and store events
        if (blockData.events.length > 0) {
          await this.processEvents(blockData.number, blockData.events, client);
        }
        
        // 4. Update account states based on extrinsics
        await this.updateAccountStates(blockData, client);
        
        // 5. Update sync state
        await this.updateSyncProgress(blockData.number, client);
      });

      logger.debug('DataProcessorService: Block processed successfully', { 
        component: 'processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'processBlock',
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      throw error;
    }
  }

  /**
   * Process extrinsics from a block
   */
  async processExtrinsics(
    blockNumber: number, 
    extrinsics: ExtrinsicData[], 
    client?: any,
  ): Promise<void> {
    try {
      logger.debug('DataProcessorService: Processing extrinsics', { 
        component: 'processor', 
        blockNumber,
        count: extrinsics.length,
      });

      const dbExtrinsics: Partial<Extrinsic>[] = extrinsics.map(ext => {
        // Extract section and method from Avail SDK objects using proper API
        const section = ext.method?.section || 'unknown';
        const method = ext.method?.method || 'unknown';
        
        return {
        hash: ext.hash,
        block_number: blockNumber,
        extrinsic_index: ext.index,
          module: section,
          call: method,
        success: ext.success,
        timestamp: new Date(), // Use current timestamp if not provided
        signer: ext.signer || undefined,
        fee: ext.fee ? Number(ext.fee) : undefined,
        };
      });

      // Batch insert extrinsics
      if (client) {
        await this.batchInsertExtrinsics(dbExtrinsics, client);
      } else {
        await this.db.transaction(async (txClient) => {
          await this.batchInsertExtrinsics(dbExtrinsics, txClient);
        });
      }

      logger.debug('DataProcessorService: Extrinsics processed successfully', { 
        component: 'processor', 
        blockNumber,
        count: extrinsics.length,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'processExtrinsics',
        blockNumber,
        count: extrinsics.length,
      });
      throw error;
    }
  }

  /**
   * Process events from a block
   */
  async processEvents(
    blockNumber: number, 
    events: EventData[], 
    client?: any,
  ): Promise<void> {
    try {
      logger.debug('DataProcessorService: Processing events', { 
        component: 'processor', 
        blockNumber,
        count: events.length,
      });

      const dbEvents: Partial<Event>[] = events.map((event, index) => {
        // PHASE 1 FIX: Enhanced event method extraction
        const section = event.section || event.module || 'unknown';
        const method = event.method || event.event || event.name || 'unknown';
        
        // PHASE 1 FIX: Extract phase information
        let phaseType: string | undefined;
        let phase: any = null;
        
        if (event.phase) {
          phase = event.phase;
          if (event.phase.applyExtrinsic !== undefined) {
            phaseType = 'ApplyExtrinsic';
          } else if (event.phase.finalization !== undefined) {
            phaseType = 'Finalization';
          } else if (event.phase.initialization !== undefined) {
            phaseType = 'Initialization';
          } else {
            phaseType = 'Unknown';
          }
        }
        
        // PHASE 1 FIX: Store method object when available
        const methodObject = event.method && typeof event.method === 'object' 
          ? event.method 
          : null;
        
        return {
        block_number: blockNumber,
          extrinsic_index: event.phase?.applyExtrinsic || undefined,
        event_index: event.index,
          module: section,
          event_name: method,
        data: event.data,
        timestamp: new Date(),
          // Phase 1 enhancements
          phase: phase,
          phase_type: phaseType,
          method_object: methodObject,
          event_order: index, // Store order within block
        };
      });

      // Batch insert events
      if (client) {
        await this.batchInsertEvents(dbEvents, client);
      } else {
        await this.db.transaction(async (txClient) => {
          await this.batchInsertEvents(dbEvents, txClient);
        });
      }

      logger.debug('DataProcessorService: Events processed successfully', { 
        component: 'processor', 
        blockNumber,
        count: events.length,
        phaseTypes: dbEvents.map(e => e.phase_type).filter(Boolean),
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'processEvents',
        blockNumber,
        count: events.length,
      });
      throw error;
    }
  }

  /**
   * Update account states based on block data
   */
  async updateAccountStates(blockData: BlockData, client?: any): Promise<void> {
    try {
      // Extract unique addresses from extrinsics
      const addresses = new Set<string>();
      
      blockData.extrinsics.forEach(ext => {
        if (ext.signer) {
          addresses.add(ext.signer);
        }
        
        // Extract addresses from transfer extrinsics
        if (ext.method.section === 'balances' && ext.method.method === 'transfer') {
          const dest = ext.method.args.dest;
          if (dest && typeof dest === 'string') {
            addresses.add(dest);
          }
        }
      });

      if (addresses.size === 0) {
        return;
      }

      logger.debug('DataProcessorService: Updating account states', { 
        component: 'processor', 
        blockNumber: blockData.number,
        accountCount: addresses.size,
      });

      // Update or insert account records
      const updatePromises = Array.from(addresses).map(address => 
        this.updateAccountRecord(address, client),
      );

      await Promise.all(updatePromises);

      logger.debug('DataProcessorService: Account states updated', { 
        component: 'processor', 
        blockNumber: blockData.number,
        accountCount: addresses.size,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'updateAccountStates',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }

  /**
   * Store block data in database
   */
  private async storeBlock(blockData: BlockData, client: any): Promise<void> {
    try {
      const blockRecord: Partial<Block> = {
        number: blockData.number,
        hash: blockData.hash,
        parent_hash: blockData.parentHash,
        state_root: blockData.stateRoot,
        extrinsics_root: blockData.extrinsicsRoot,
        timestamp: new Date(blockData.timestamp),
        extrinsics_count: blockData.extrinsics.length,
        validator_address: blockData.validator, // Add validator address
      };

      // Check if block already exists
      const existingBlock = await client.query(
        'SELECT number FROM blocks WHERE number = $1',
        [blockRecord.number],
      );

      if (existingBlock.rows.length > 0) {
        logger.debug('DataProcessorService: Block already exists, skipping', { 
          component: 'processor', 
          blockNumber: blockData.number, 
        });
        return;
      }

      // Insert new block
      await client.query(
        `INSERT INTO blocks (number, hash, parent_hash, state_root, extrinsics_root, timestamp, extrinsics_count, validator_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          blockRecord.number,
          blockRecord.hash,
          blockRecord.parent_hash,
          blockRecord.state_root,
          blockRecord.extrinsics_root,
          blockRecord.timestamp,
          blockRecord.extrinsics_count,
          blockRecord.validator_address,
        ],
      );

      logger.debug('DataProcessorService: Block stored successfully', { 
        component: 'processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'storeBlock',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }

  /**
   * Batch insert extrinsics
   */
  private async batchInsertExtrinsics(extrinsics: Partial<Extrinsic>[], client: any): Promise<void> {
    if (extrinsics.length === 0) {return;}

    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      
      extrinsics.forEach((ext, index) => {
        const baseIndex = index * 9; // Changed from 8 to 9 to include fee
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9})`,
        );
        values.push(
          ext.hash,
          ext.block_number,
          ext.extrinsic_index,
          ext.module,
          ext.call,
          ext.success,
          ext.timestamp,
          ext.signer,
          ext.fee, // Added fee field
        );
      });

      const query = `
        INSERT INTO extrinsics (hash, block_number, extrinsic_index, module, call, success, timestamp, signer, fee)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (hash) DO NOTHING
      `;

      await client.query(query, values);
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'batchInsertExtrinsics',
        count: extrinsics.length,
      });
      throw error;
    }
  }

  /**
   * Batch insert events
   */
  private async batchInsertEvents(events: Partial<Event>[], client: any): Promise<void> {
    if (events.length === 0) {return;}

    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      
      events.forEach((event, index) => {
        const baseIndex = index * 7;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7})`,
        );
        values.push(
          event.block_number,
          event.extrinsic_index,
          event.event_index,
          event.module,
          event.event_name,
          JSON.stringify(event.data),
          event.timestamp,
        );
      });

      const query = `
        INSERT INTO events (block_number, extrinsic_index, event_index, module, event_name, data, timestamp)
        VALUES ${placeholders.join(', ')}
      `;

      await client.query(query, values);
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'batchInsertEvents',
        count: events.length,
      });
      throw error;
    }
  }

  /**
   * Update individual account record
   */
  private async updateAccountRecord(address: string, client?: any): Promise<void> {
    try {
      const queryClient = client || this.db;
      
      // For now, just ensure the account exists in the database
      // TODO: Fetch actual balance from blockchain in future iterations
      await queryClient.query(
        `INSERT INTO accounts (address, last_updated)
           VALUES ($1, CURRENT_TIMESTAMP)
           ON CONFLICT (address) 
           DO UPDATE SET last_updated = CURRENT_TIMESTAMP`,
        [address],
      );
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'updateAccountRecord',
        address,
      });
      // Don't throw - account updates shouldn't fail the entire block processing
    }
  }

  /**
   * Update sync progress
   */
  private async updateSyncProgress(blockNumber: number, client: any): Promise<void> {
    try {
      await client.query(
        `UPDATE sync_state 
         SET last_synced_block = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT id FROM sync_state ORDER BY id DESC LIMIT 1)`,
        [blockNumber],
      );
      
    } catch (error) {
      logError(error as Error, { 
        component: 'processor', 
        action: 'updateSyncProgress',
        blockNumber,
      });
      // Don't throw - sync progress update shouldn't fail block processing
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    blocksProcessed: number;
    extrinsicsProcessed: number;
    eventsProcessed: number;
    accountsTracked: number;
    processingRate: number; // blocks per minute
  }> {
    try {
      const [blocksResult, extrinsicsResult, eventsResult, accountsResult, rateResult] = await Promise.all([
        this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM blocks'),
        this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM extrinsics'),
        this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM events'),
        this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM accounts'),
        this.db.query<{ count: number }>(
          `SELECT COUNT(*) as count 
           FROM blocks 
           WHERE created_at >= NOW() - INTERVAL '1 hour'`,
        ),
      ]);

      return {
        blocksProcessed: blocksResult.rows[0]?.count || 0,
        extrinsicsProcessed: extrinsicsResult.rows[0]?.count || 0,
        eventsProcessed: eventsResult.rows[0]?.count || 0,
        accountsTracked: accountsResult.rows[0]?.count || 0,
        processingRate: rateResult.rows[0]?.count || 0,
      };
    } catch (error) {
      logError(error as Error, { component: 'processor', action: 'getProcessingStats' });
      return {
        blocksProcessed: 0,
        extrinsicsProcessed: 0,
        eventsProcessed: 0,
        accountsTracked: 0,
        processingRate: 0,
      };
    }
  }
}

/**
 * Factory function to create a DataProcessorService instance
 */
export const createDataProcessorService = (
  database: typeof db, 
  blockchain: AvailBlockchainService,
): DataProcessorService => {
  return new DataProcessorService(database, blockchain);
};

// Export for service factory registration
export let dataProcessorService: DataProcessorService; 