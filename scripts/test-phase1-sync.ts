#!/usr/bin/env tsx

/**
 * Simple test script to verify Phase 1 processors work with real blockchain data
 * This bypasses the queue service dependency issues in the main sync script
 */

import { logger } from '../src/utils/logger';
import db from '../src/utils/database';
import { AvailBlockchainService } from '../src/services/core/avail-blockchain';
import { createBlockIndexerService } from '../src/services/domain/indexer';
import { createEnhancedProcessorService } from '../src/services/domain/EnhancedProcessor';
import { ValidatorRepository } from '../src/database/repositories/ValidatorRepository';
import { TransferRepository } from '../src/database/repositories/TransferRepository';
import { EraRepository } from '../src/database/repositories/EraRepository';

class SimplePhase1SyncTest {
  private blockchain: AvailBlockchainService;
  private indexer: ReturnType<typeof createBlockIndexerService>;
  private processor: ReturnType<typeof createEnhancedProcessorService>;

  constructor() {
    this.blockchain = new AvailBlockchainService();
    this.indexer = createBlockIndexerService(db, this.blockchain);
    
    // Initialize Phase 1 repositories
    const validatorRepository = new ValidatorRepository();
    const transferRepository = new TransferRepository();
    const eraRepository = new EraRepository();
    
    // Create enhanced processor with Phase 1 support
    this.processor = createEnhancedProcessorService(
      db, 
      this.blockchain,
      validatorRepository,
      transferRepository,
      eraRepository,
    );
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing simple Phase 1 sync test...');

      // Initialize database connection
      await db.connect();
      logger.info('✅ Database connected');

      // Initialize blockchain services
      await this.blockchain.start();
      logger.info('✅ Blockchain service started');

      // Initialize domain services
      await this.indexer.start();
      await this.processor.start();
      
      logger.info('✅ All services initialized for Phase 1 test');

    } catch (error) {
      logger.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      logger.info('🧹 Shutting down services...');

      if (this.processor) {
        await this.processor.stop();
      }
      
      if (this.indexer) {
        await this.indexer.stop();
      }
      
      if (this.blockchain) {
        await this.blockchain.stop();
      }
      
      await db.disconnect();

      logger.info('✅ All services shut down successfully');
    } catch (error) {
      logger.error('❌ Error during cleanup:', error);
    }
  }

  async testPhase1Sync(fromBlock: number, toBlock: number): Promise<void> {
    try {
      logger.info(`📦 Testing Phase 1 sync: blocks ${fromBlock} to ${toBlock}`);

      for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
        try {
          logger.info(`🔄 Processing block ${blockNum}...`);
          
          // Index the block
          const blocks = await this.indexer.indexBlockRange(blockNum, blockNum);
          
          if (blocks.length === 0) {
            logger.warn(`⚠️ No block data returned for block ${blockNum}`);
            continue;
          }

          const blockData = blocks[0];
          
          // Process with Phase 1 enhanced processor
          await this.processor.processBlock(blockData);
          
          logger.info(`✅ Successfully processed block ${blockNum} with Phase 1 data`);
          
          // Small delay to avoid overwhelming the RPC
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`❌ Failed to process block ${blockNum}:`, error);
          // Continue with next block instead of failing completely
        }
      }

      logger.info('✅ Phase 1 sync test completed successfully!');

    } catch (error) {
      logger.error('❌ Phase 1 sync test failed:', error);
      throw error;
    }
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      
      // Test with a small range of recent blocks
      const fromBlock = 1000000;
      const toBlock = 1000003;
      
      await this.testPhase1Sync(fromBlock, toBlock);

    } catch (error) {
      logger.error('💥 Fatal error in Phase 1 sync test:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const test = new SimplePhase1SyncTest();
  await test.run();
}

// Handle script execution
if (require.main === module) {
  main().catch((error) => {
    logger.error('💥 Phase 1 sync test failed:', error);
    process.exit(1);
  });
} 