#!/usr/bin/env tsx

import { AvailDataSubmissionIndexer } from '../src/services/domain/availDataSubmissionIndexer';
import { logger } from '../src/utils/logger';

interface IndexingOptions {
  startBlock?: number;
  endBlock?: number;
  batchSize?: number;
  recent?: number;
  mode: 'range' | 'recent' | 'test';
}

async function parseArgs(): Promise<IndexingOptions> {
  const args = process.argv.slice(2);
  const options: IndexingOptions = {
    mode: 'test',
    batchSize: 10,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
    case '--mode':
      options.mode = args[++i] as 'range' | 'recent' | 'test';
      break;
    case '--start-block':
      options.startBlock = parseInt(args[++i]);
      break;
    case '--end-block':
      options.endBlock = parseInt(args[++i]);
      break;
    case '--batch-size':
      options.batchSize = parseInt(args[++i]);
      break;
    case '--recent':
      options.recent = parseInt(args[++i]);
      break;
    case '--help':
      printHelp();
      process.exit(0);
    default:
      console.error(`Unknown option: ${args[i]}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Avail Data Submission Indexer CLI

Usage: tsx scripts/index-data-submissions.ts [options]

Options:
  --mode <mode>           Indexing mode: range, recent, or test (default: test)
  --start-block <number>  Start block number (required for range mode)
  --end-block <number>    End block number (required for range mode)
  --batch-size <number>   Batch size for processing (default: 10)
  --recent <number>       Number of recent blocks to index (default: 100)
  --help                  Show this help message

Examples:
  # Test mode with known blocks
  tsx scripts/index-data-submissions.ts --mode test
  
  # Index a specific range
  tsx scripts/index-data-submissions.ts --mode range --start-block 1478090 --end-block 1478110
  
  # Index recent blocks
  tsx scripts/index-data-submissions.ts --mode recent --recent 50
  
  # Index with custom batch size
  tsx scripts/index-data-submissions.ts --mode range --start-block 1478090 --end-block 1478200 --batch-size 20
`);
}

async function runIndexing(options: IndexingOptions) {
  const indexer = new AvailDataSubmissionIndexer();
  
  try {
    logger.info('Starting data submission indexing', { 
      component: 'indexing-cli',
      options, 
    });
    
    console.log('🚀 Initializing Avail Data Submission Indexer...');
    await indexer.initialize();
    console.log('✅ Indexer initialized successfully');
    
    let stats;
    
    switch (options.mode) {
    case 'test':
      console.log('🧪 Running test mode with recent blocks...');
      stats = await indexer.indexRecentBlocks(10);
      break;
        
    case 'range':
      if (!options.startBlock || !options.endBlock) {
        throw new Error('Start block and end block are required for range mode');
      }
        
      console.log(`📊 Indexing block range ${options.startBlock} to ${options.endBlock}...`);
      stats = await indexer.indexBlockRange(
        options.startBlock,
        options.endBlock,
        options.batchSize,
      );
      break;
        
    case 'recent':
      const recentBlocks = options.recent || 100;
      console.log(`📡 Indexing ${recentBlocks} recent blocks...`);
      stats = await indexer.indexRecentBlocks(recentBlocks);
      break;
        
    default:
      throw new Error(`Unknown mode: ${options.mode}`);
    }
    
    // Display results
    console.log('\n📈 Indexing Results:');
    console.log(`Blocks Processed: ${stats.blocksProcessed}`);
    console.log(`Data Submissions Found: ${stats.dataSubmissionsFound}`);
    console.log(`Total Data Size: ${(stats.totalDataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Average Block Time: ${stats.averageBlockTime}ms`);
    
    if (stats.endTime) {
      const duration = stats.endTime.getTime() - stats.startTime.getTime();
      const blocksPerSecond = (stats.blocksProcessed / (duration / 1000)).toFixed(2);
      console.log(`Total Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`Processing Rate: ${blocksPerSecond} blocks/second`);
    }
    
    logger.info('Data submission indexing completed successfully', {
      component: 'indexing-cli',
      stats,
    });
    
  } catch (error) {
    logger.error('Data submission indexing failed', {
      component: 'indexing-cli',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    console.error('❌ Indexing failed:', (error as Error).message);
    process.exit(1);
    
  } finally {
    await indexer.disconnect();
    console.log('🔌 Disconnected from indexer');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Main execution
if (require.main === module) {
  parseArgs()
    .then(runIndexing)
    .catch(error => {
      console.error('❌ CLI failed:', error.message);
      process.exit(1);
    });
}

export { runIndexing, parseArgs };