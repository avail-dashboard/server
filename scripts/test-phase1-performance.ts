#!/usr/bin/env ts-node

/**
 * Phase 1 Performance Testing Script
 * 
 * Tests the performance of Phase 1 processors with different configurations
 * and block ranges to validate performance requirements.
 */

import { AvailBlockchainService } from '../src/services/core/avail-blockchain';
import { EnhancedProcessorService } from '../src/services/domain/EnhancedProcessor';
import { ValidatorRepository } from '../src/database/repositories/ValidatorRepository';
import { TransferRepository } from '../src/database/repositories/TransferRepository';
import { EraRepository } from '../src/database/repositories/EraRepository';
import db from '../src/utils/database';
import logger from '../src/utils/logger';

interface PerformanceMetrics {
  totalBlocks: number;
  totalTime: number;
  avgTimePerBlock: number;
  blocksPerSecond: number;
  validatorsProcessed: number;
  transfersProcessed: number;
  erasProcessed: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

class Phase1PerformanceTester {
  private blockchain: AvailBlockchainService;
  private enhancedProcessor: EnhancedProcessorService;
  private validatorRepo: ValidatorRepository;
  private transferRepo: TransferRepository;
  private eraRepo: EraRepository;

  constructor() {
    this.blockchain = new AvailBlockchainService();
    this.validatorRepo = new ValidatorRepository();
    this.transferRepo = new TransferRepository();
    this.eraRepo = new EraRepository();
    
    this.enhancedProcessor = new EnhancedProcessorService(
      db,
      this.blockchain,
      this.validatorRepo,
      this.transferRepo,
      this.eraRepo,
    );
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Phase 1 performance tester...');
    
    await this.blockchain.start();
    await this.enhancedProcessor.start();
    
    logger.info('Phase 1 performance tester initialized');
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up Phase 1 performance tester...');
    
    await this.enhancedProcessor.stop();
    await this.blockchain.stop();
    await db.disconnect();
    
    logger.info('Phase 1 performance tester cleanup completed');
  }

  private getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    };
  }

  async testBlockProcessingPerformance(
    startBlock: number,
    endBlock: number,
    phase1Enabled: boolean = true,
  ): Promise<PerformanceMetrics> {
    logger.info(`Testing block processing performance: ${startBlock}-${endBlock}, Phase1: ${phase1Enabled}`);
    
    this.enhancedProcessor.setPhase1Enabled(phase1Enabled);
    
    const initialStats = await this.enhancedProcessor.getProcessingStats();
    const startTime = Date.now();
    
    let processedBlocks = 0;
    
    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      try {
        const blockData = await this.blockchain.getBlock(blockNumber);
        await this.enhancedProcessor.processBlock(blockData);
        processedBlocks++;
        
        if (processedBlocks % 10 === 0) {
          const currentMemory = this.getMemoryUsage();
          logger.info(`Processed ${processedBlocks} blocks, Memory: ${currentMemory.heapUsed}MB`);
        }
      } catch (error) {
        logger.warn(`Failed to process block ${blockNumber}:`, error);
        // Continue with next block
      }
    }
    
    const endTime = Date.now();
    const finalStats = await this.enhancedProcessor.getProcessingStats();
    const finalMemory = this.getMemoryUsage();
    
    const totalTime = endTime - startTime;
    const avgTimePerBlock = totalTime / processedBlocks;
    const blocksPerSecond = (processedBlocks * 1000) / totalTime;
    
    const metrics: PerformanceMetrics = {
      totalBlocks: processedBlocks,
      totalTime,
      avgTimePerBlock,
      blocksPerSecond,
      validatorsProcessed: finalStats.phase1Stats.validatorsTracked - initialStats.phase1Stats.validatorsTracked,
      transfersProcessed: finalStats.phase1Stats.transfersProcessed - initialStats.phase1Stats.transfersProcessed,
      erasProcessed: finalStats.phase1Stats.erasTracked - initialStats.phase1Stats.erasTracked,
      memoryUsage: finalMemory,
    };
    
    logger.info('Performance test completed:', {
      blocks: processedBlocks,
      timeMs: totalTime,
      avgTimePerBlock: avgTimePerBlock.toFixed(2),
      blocksPerSecond: blocksPerSecond.toFixed(2),
      memoryUsageMB: finalMemory.heapUsed,
    });
    
    return metrics;
  }

  async runPerformanceComparison(): Promise<void> {
    logger.info('Running Phase 1 performance comparison...');
    
    const latestBlock = await this.blockchain.getLatestBlock();
    const testEndBlock = latestBlock.number - 10;
    const testStartBlock = testEndBlock - 20; // Test 20 blocks
    
    logger.info(`Testing block range: ${testStartBlock} to ${testEndBlock}`);
    
    // Test without Phase 1
    logger.info('Testing without Phase 1...');
    const withoutPhase1 = await this.testBlockProcessingPerformance(
      testStartBlock,
      testEndBlock,
      false,
    );
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test with Phase 1
    logger.info('Testing with Phase 1...');
    const withPhase1 = await this.testBlockProcessingPerformance(
      testStartBlock,
      testEndBlock,
      true,
    );
    
    // Calculate performance impact
    const performanceImpact = {
      timeIncrease: ((withPhase1.avgTimePerBlock - withoutPhase1.avgTimePerBlock) / withoutPhase1.avgTimePerBlock) * 100,
      throughputDecrease: ((withoutPhase1.blocksPerSecond - withPhase1.blocksPerSecond) / withoutPhase1.blocksPerSecond) * 100,
      memoryIncrease: ((withPhase1.memoryUsage.heapUsed - withoutPhase1.memoryUsage.heapUsed) / withoutPhase1.memoryUsage.heapUsed) * 100,
    };
    
    logger.info('Performance Comparison Results:', {
      withoutPhase1: {
        avgTimePerBlock: withoutPhase1.avgTimePerBlock.toFixed(2) + 'ms',
        blocksPerSecond: withoutPhase1.blocksPerSecond.toFixed(2),
        memoryUsage: withoutPhase1.memoryUsage.heapUsed + 'MB',
      },
      withPhase1: {
        avgTimePerBlock: withPhase1.avgTimePerBlock.toFixed(2) + 'ms',
        blocksPerSecond: withPhase1.blocksPerSecond.toFixed(2),
        memoryUsage: withPhase1.memoryUsage.heapUsed + 'MB',
        validatorsProcessed: withPhase1.validatorsProcessed,
        transfersProcessed: withPhase1.transfersProcessed,
        erasProcessed: withPhase1.erasProcessed,
      },
      impact: {
        timeIncrease: performanceImpact.timeIncrease.toFixed(1) + '%',
        throughputDecrease: performanceImpact.throughputDecrease.toFixed(1) + '%',
        memoryIncrease: performanceImpact.memoryIncrease.toFixed(1) + '%',
      },
    });
    
    // Performance assertions
    if (performanceImpact.timeIncrease > 100) {
      logger.warn('⚠️  Phase 1 processing increases time by more than 100%');
    } else if (performanceImpact.timeIncrease > 50) {
      logger.warn('⚠️  Phase 1 processing increases time by more than 50%');
    } else {
      logger.info('✅ Phase 1 performance impact is acceptable');
    }
    
    if (performanceImpact.memoryIncrease > 50) {
      logger.warn('⚠️  Phase 1 processing increases memory usage by more than 50%');
    } else {
      logger.info('✅ Phase 1 memory usage is acceptable');
    }
  }

  async runStressTest(): Promise<void> {
    logger.info('Running Phase 1 stress test...');
    
    const latestBlock = await this.blockchain.getLatestBlock();
    const testEndBlock = latestBlock.number - 10;
    const testStartBlock = testEndBlock - 100; // Test 100 blocks
    
    logger.info(`Stress testing block range: ${testStartBlock} to ${testEndBlock}`);
    
    const metrics = await this.testBlockProcessingPerformance(
      testStartBlock,
      testEndBlock,
      true,
    );
    
    logger.info('Stress Test Results:', {
      totalBlocks: metrics.totalBlocks,
      totalTimeMinutes: (metrics.totalTime / 1000 / 60).toFixed(2),
      avgTimePerBlock: metrics.avgTimePerBlock.toFixed(2) + 'ms',
      blocksPerSecond: metrics.blocksPerSecond.toFixed(2),
      validatorsProcessed: metrics.validatorsProcessed,
      transfersProcessed: metrics.transfersProcessed,
      peakMemoryUsage: metrics.memoryUsage.heapUsed + 'MB',
    });
    
    // Stress test assertions
    if (metrics.avgTimePerBlock > 10000) {
      logger.warn('⚠️  Average processing time per block exceeds 10 seconds');
    } else {
      logger.info('✅ Stress test performance is acceptable');
    }
    
    if (metrics.memoryUsage.heapUsed > 1000) {
      logger.warn('⚠️  Memory usage exceeds 1GB during stress test');
    } else {
      logger.info('✅ Memory usage during stress test is acceptable');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'comparison';
  
  const tester = new Phase1PerformanceTester();
  
  try {
    await tester.initialize();
    
    switch (testType) {
      case 'comparison':
        await tester.runPerformanceComparison();
        break;
      case 'stress':
        await tester.runStressTest();
        break;
      case 'both':
        await tester.runPerformanceComparison();
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
        await tester.runStressTest();
        break;
      default:
        logger.error('Invalid test type. Use: comparison, stress, or both');
        process.exit(1);
    }
    
    logger.info('Phase 1 performance testing completed successfully');
    
  } catch (error) {
    logger.error('Phase 1 performance testing failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
} 