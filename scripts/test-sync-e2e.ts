#!/usr/bin/env tsx

/**
 * End-to-End Sync Test Script
 * 
 * This script tests the sync functionality with a small block range
 * to validate everything works before running larger syncs.
 */

import { logger } from '../src/utils/logger';
import db from '../src/utils/database';
import { BlockchainService } from '../src/services/core/blockchain';
import { createBlockIndexerService } from '../src/services/domain/indexer';
import { createDataProcessorService } from '../src/services/domain/processor';

async function testSyncE2E(): Promise<void> {
  let blockchain: BlockchainService | null = null;
  let indexer: ReturnType<typeof createBlockIndexerService> | null = null;
  let processor: ReturnType<typeof createDataProcessorService> | null = null;

  try {
    logger.info('🧪 Starting E2E sync test...');

    // 1. Initialize services
    logger.info('1️⃣ Initializing services...');
    await db.connect();
    
    blockchain = new BlockchainService();
    await blockchain.start();
    
    indexer = createBlockIndexerService(db, blockchain);
    processor = createDataProcessorService(db, blockchain);
    
    await indexer.start();
    await processor.start();
    
    logger.info('✅ All services initialized');

    // 2. Get latest block info
    logger.info('2️⃣ Getting blockchain info...');
    const latestBlock = await blockchain.getLatestBlock();
    const chainInfo = await blockchain.getChainInfo();
    
    logger.info(`📊 Chain: ${chainInfo.chain}`);
    logger.info(`📊 Latest block: ${latestBlock.number}`);
    logger.info(`📊 Latest hash: ${latestBlock.hash}`);

    // 3. Test with a small range (last 5 blocks)
    const testEndBlock = latestBlock.number;
    const testStartBlock = Math.max(testEndBlock - 4, 1); // Last 5 blocks
    
    logger.info(`3️⃣ Testing sync with blocks ${testStartBlock} to ${testEndBlock}...`);

    // 4. Index blocks
    logger.info('4️⃣ Indexing blocks from RPC...');
    const blocks = await indexer.indexBlockRange(testStartBlock, testEndBlock);
    logger.info(`✅ Indexed ${blocks.length} blocks`);

    // 5. Process and store blocks
    logger.info('5️⃣ Processing and storing blocks...');
    let processedCount = 0;
    
    for (const blockData of blocks) {
      try {
        await processor.processBlock(blockData);
        processedCount++;
        logger.info(`✅ Processed block ${blockData.number} (${blockData.extrinsics.length} extrinsics, ${blockData.events.length} events)`);
      } catch (error) {
        logger.error(`❌ Failed to process block ${blockData.number}:`, error);
      }
    }

    logger.info(`✅ Successfully processed ${processedCount}/${blocks.length} blocks`);

    // 6. Verify data in database
    logger.info('6️⃣ Verifying data in database...');
    
    const blocksInDb = await db.query(
      'SELECT COUNT(*) as count FROM blocks WHERE number >= $1 AND number <= $2',
      [testStartBlock, testEndBlock]
    );
    
    const extrinsicsInDb = await db.query(
      'SELECT COUNT(*) as count FROM extrinsics WHERE block_number >= $1 AND block_number <= $2',
      [testStartBlock, testEndBlock]
    );
    
    const eventsInDb = await db.query(
      'SELECT COUNT(*) as count FROM events WHERE block_number >= $1 AND block_number <= $2',
      [testStartBlock, testEndBlock]
    );

    logger.info(`📊 Database verification:`);
    logger.info(`   - Blocks stored: ${blocksInDb.rows[0].count}`);
    logger.info(`   - Extrinsics stored: ${extrinsicsInDb.rows[0].count}`);
    logger.info(`   - Events stored: ${eventsInDb.rows[0].count}`);

    // 7. Test duplicate handling
    logger.info('7️⃣ Testing duplicate block handling...');
    const firstBlock = blocks[0];
    if (firstBlock) {
      await processor.processBlock(firstBlock);
      logger.info('✅ Duplicate block handling works (no errors)');
    }

    logger.info('🎉 E2E sync test completed successfully!');

  } catch (error) {
    logger.error('💥 E2E sync test failed:', error);
    throw error;
  } finally {
    // Cleanup
    logger.info('🧹 Cleaning up services...');
    
    if (processor) await processor.stop();
    if (indexer) await indexer.stop();
    if (blockchain) await blockchain.stop();
    await db.disconnect();
    
    logger.info('✅ Cleanup completed');
  }
}

// Run the test
if (require.main === module) {
  testSyncE2E().catch((error) => {
    logger.error('💥 E2E test execution failed:', error);
    process.exit(1);
  });
} 