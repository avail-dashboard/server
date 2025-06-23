import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { DataProcessorService, createDataProcessorService } from './processor';
import { ValidatorProcessor, createValidatorProcessor } from './ValidatorProcessor';
import { TransferProcessor, createTransferProcessor } from './TransferProcessor';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { TransferRepository } from '../../database/repositories/TransferRepository';
import { EraRepository } from '../../database/repositories/EraRepository';
import { 
  BaseService,
  ServiceHealth,
} from '../types/service';
import { 
  BlockData,
} from '../types/blockchain';

export interface IEnhancedProcessorService extends BaseService {
  processBlock(blockData: BlockData): Promise<void>;
  processPhase1Data(blockData: BlockData): Promise<void>;
}

/**
 * EnhancedProcessorService - Extends DataProcessorService with Phase 1.2 processors
 * 
 * Responsibilities:
 * - All existing DataProcessorService functionality
 * - Process validator and staking data
 * - Process transfer data with enhanced details
 * - Track era changes and validator statistics
 * - Maintain backward compatibility
 */
export class EnhancedProcessorService implements IEnhancedProcessorService {
  private dataProcessor: DataProcessorService;
  private validatorProcessor: ValidatorProcessor;
  private transferProcessor: TransferProcessor;
  private isRunning = false;
  private phase1Enabled = true; // Feature flag for Phase 1 processing

  constructor(
    database: typeof db,
    blockchain: AvailBlockchainService,
    validatorRepository: ValidatorRepository,
    transferRepository: TransferRepository,
    eraRepository: EraRepository,
  ) {
    // Initialize base data processor
    this.dataProcessor = createDataProcessorService(database, blockchain);
    
    // Initialize Phase 1 processors
    this.validatorProcessor = createValidatorProcessor(blockchain, validatorRepository, eraRepository);
    this.transferProcessor = createTransferProcessor(blockchain, transferRepository);
  }

  /**
   * Start the enhanced processor service
   */
  async start(): Promise<void> {
    try {
      logger.info('EnhancedProcessorService: Starting service', { component: 'enhanced-processor' });
      
      // Start base data processor
      await this.dataProcessor.start();
      
      this.isRunning = true;
      logger.info('EnhancedProcessorService: Service started successfully', { 
        component: 'enhanced-processor',
        phase1Enabled: this.phase1Enabled,
      });
      
    } catch (error) {
      logError(error as Error, { component: 'enhanced-processor', action: 'start' });
      throw error;
    }
  }

  /**
   * Stop the enhanced processor service
   */
  async stop(): Promise<void> {
    try {
      logger.info('EnhancedProcessorService: Stopping service', { component: 'enhanced-processor' });
      
      // Stop base data processor
      await this.dataProcessor.stop();
      
      this.isRunning = false;
      logger.info('EnhancedProcessorService: Service stopped', { component: 'enhanced-processor' });
      
    } catch (error) {
      logError(error as Error, { component: 'enhanced-processor', action: 'stop' });
      throw error;
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<ServiceHealth> {
    const now = new Date();
    
    try {
      // Get base processor health
      const baseHealth = await this.dataProcessor.getHealth();
      
      return {
        healthy: this.isRunning && baseHealth.healthy,
        lastCheck: now,
        error: baseHealth.error,
        details: {
          isRunning: this.isRunning,
          baseProcessorHealthy: baseHealth.healthy,
          phase1Enabled: this.phase1Enabled,
          ...baseHealth.details,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        lastCheck: now,
        error: (error as Error).message,
        details: {
          isRunning: this.isRunning,
          phase1Enabled: this.phase1Enabled,
        },
      };
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isRunning && this.dataProcessor.isHealthy();
  }

  /**
   * Process a complete block with Phase 1 enhancements
   */
  async processBlock(blockData: BlockData): Promise<void> {
    try {
      logger.debug('EnhancedProcessorService: Processing block', { 
        component: 'enhanced-processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
        phase1Enabled: this.phase1Enabled,
      });

      // 1. Process Phase 1 data FIRST if enabled (to satisfy foreign key constraints)
      if (this.phase1Enabled) {
        await this.processPhase1Data(blockData);
      }

      // 2. Process with base data processor (existing functionality)
      await this.dataProcessor.processBlock(blockData);

      logger.debug('EnhancedProcessorService: Block processed successfully', { 
        component: 'enhanced-processor', 
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      
    } catch (error) {
      logError(error as Error, { 
        component: 'enhanced-processor', 
        action: 'processBlock',
        blockNumber: blockData.number,
        hash: blockData.hash,
      });
      throw error;
    }
  }

  /**
   * Process Phase 1 specific data (validators, transfers, etc.)
   */
  async processPhase1Data(blockData: BlockData): Promise<void> {
    try {
      logger.debug('EnhancedProcessorService: Processing Phase 1 data', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
      });

      // Process in parallel for better performance
      const phase1Tasks = [
        // Process validator data
        this.validatorProcessor.processBlockValidator(blockData),
        this.validatorProcessor.processEraChange(blockData),
        
        // Process transfer data
        this.transferProcessor.processBlockTransfers(blockData),
      ];

      await Promise.all(phase1Tasks);

      logger.debug('EnhancedProcessorService: Phase 1 data processed', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
      });

    } catch (error) {
      logError(error as Error, {
        component: 'enhanced-processor',
        action: 'processPhase1Data',
        blockNumber: blockData.number,
      });
      // Don't throw - Phase 1 processing failures shouldn't break base processing
      logger.warn('EnhancedProcessorService: Phase 1 processing failed, continuing with base processing', {
        component: 'enhanced-processor',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Enable or disable Phase 1 processing
   */
  setPhase1Enabled(enabled: boolean): void {
    this.phase1Enabled = enabled;
    logger.info('EnhancedProcessorService: Phase 1 processing toggled', {
      component: 'enhanced-processor',
      phase1Enabled: this.phase1Enabled,
    });
  }

  /**
   * Get processing statistics including Phase 1 metrics
   */
  async getProcessingStats(): Promise<{
    blocksProcessed: number;
    extrinsicsProcessed: number;
    eventsProcessed: number;
    accountsTracked: number;
    processingRate: number;
    phase1Stats: {
      validatorsTracked: number;
      transfersProcessed: number;
      erasTracked: number;
    };
  }> {
    try {
      // Get base stats
      const baseStats = await this.dataProcessor.getProcessingStats();

      // Get Phase 1 stats (simplified for now)
      const phase1Stats = {
        validatorsTracked: 0, // TODO: Implement actual counting
        transfersProcessed: 0, // TODO: Implement actual counting
        erasTracked: 0, // TODO: Implement actual counting
      };

      return {
        ...baseStats,
        phase1Stats,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'enhanced-processor',
        action: 'getProcessingStats',
      });
      throw error;
    }
  }
}

export const createEnhancedProcessorService = (
  database: typeof db,
  blockchain: AvailBlockchainService,
  validatorRepository: ValidatorRepository,
  transferRepository: TransferRepository,
  eraRepository: EraRepository,
): EnhancedProcessorService => {
  return new EnhancedProcessorService(
    database,
    blockchain,
    validatorRepository,
    transferRepository,
    eraRepository,
  );
}; 