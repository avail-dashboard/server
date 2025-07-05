#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../src/utils/logger';
import { MissingDataDetector } from '../src/utils/missing-data-detector';
import { RecoveryJobScheduler } from '../src/services/core/recovery-job-scheduler';
import { MissingDataSyncService, SyncMissingOptions, RecoveryOptions } from '../src/services/core/missing-data-sync';
import { ServiceFactory } from '../src/services';
import { PrismaClient } from '@prisma/client';

const program = new Command();

/**
 * Sync Missing Data Command
 * 
 * Finds all missing data in the database and queues recovery jobs
 */
class SyncMissingCommand {
  private serviceFactory: ServiceFactory;
  private prisma: PrismaClient;
  private syncService: MissingDataSyncService;

  constructor() {
    this.serviceFactory = ServiceFactory.getInstance();
    this.prisma = new PrismaClient();
  }

  async execute(options: SyncMissingOptions): Promise<void> {
    try {
      logger.info('Starting sync:missing command', {
        component: 'sync-missing-command',
        options,
      });

      // Initialize services
      await this.serviceFactory.initializeAllServices();
      
      // Initialize sync service after ServiceFactory is ready
      const detector = new MissingDataDetector(this.prisma);
      const queueService = this.serviceFactory.get('queue');
      const scheduler = new RecoveryJobScheduler(queueService, {
        blockBatchSize: 10,
        entityBatchSize: 50,
        throttleThreshold: 50,
        maxRetries: 3,
        delayBetweenBatches: 1000,
      });
      
      this.syncService = new MissingDataSyncService(detector, scheduler, queueService, this.prisma);

      // Determine scan range
      const range = await this.determineScanRange(options);

      logger.info('Scan range determined', {
        component: 'sync-missing-command',
        range,
        totalBlocks: range.endBlock - range.startBlock + 1,
      });

      // Detect all missing data
      const report = await this.syncService.detectAllMissingData(range);

      // Display report
      this.displayReport(report);

      // Execute recovery if not check-only mode
      if (!options.checkOnly) {
        if (options.dryRun) {
          logger.info('Dry run mode - would queue recovery jobs', {
            component: 'sync-missing-command',
            totalJobs: report.recoveryPlan.totalJobs,
          });
        } else {
          const recoveryOptions = this.createRecoveryOptions(options);
          await this.syncService.executeRecovery(report, recoveryOptions);
          
          // Monitor progress
          await this.monitorProgress();
        }
      }

      logger.info('Sync:missing command completed successfully', {
        component: 'sync-missing-command',
      });

    } catch (error) {
      logger.error('Sync:missing command failed', {
        component: 'sync-missing-command',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async determineScanRange(options: SyncMissingOptions): Promise<{ startBlock: number; endBlock: number }> {
    if (options.from !== undefined && options.to !== undefined) {
      return { startBlock: options.from, endBlock: options.to };
    }

    // Use database range if no range specified
    return await this.syncService.getDatabaseRange();
  }

  private displayReport(report: {
    scanRange: { startBlock: number; endBlock: number };
    summary: {
      totalBlocks: number;
      missingBlocks: number;
      incompleteBlocks: number;
      missingEntities: { validators: number; accounts: number; dataSubmissions: number };
    };
    details: {
      missingBlockRanges: Array<{ start: number; end: number; count: number }>;
      incompleteBlocks: Array<{ blockNumber: number; issues: string[] }>;
    };
    recoveryPlan: {
      totalJobs: number;
      estimatedDuration: string;
      batchConfiguration: {
        blockBatchSize: number;
        entityBatchSize: number;
        throttleThreshold: number;
      };
    };
  }): void {
    logger.info('=== Missing Data Report ===');
    logger.info(`Scan Range: ${report.scanRange.startBlock} - ${report.scanRange.endBlock}`);
    logger.info(`Total Blocks in Range: ${report.summary.totalBlocks}`);
    logger.info(`Missing Blocks: ${report.summary.missingBlocks}`);
    logger.info(`Incomplete Blocks: ${report.summary.incompleteBlocks}`);
    
    logger.info('=== Missing Entities ===');
    logger.info(`Validators: ${report.summary.missingEntities.validators}`);
    logger.info(`Accounts: ${report.summary.missingEntities.accounts}`);
    logger.info(`Data Submissions: ${report.summary.missingEntities.dataSubmissions}`);

    if (report.details.missingBlockRanges.length > 0) {
      logger.info('=== Missing Block Ranges ===');
      report.details.missingBlockRanges.forEach((range) => {
        logger.info(`  ${range.start}-${range.end} (${range.count} blocks)`);
      });
    }

    if (report.details.incompleteBlocks.length > 0) {
      logger.info('=== Incomplete Blocks (first 10) ===');
      
      // Group issues by type for better reporting
      const issueGroups = {
        missing_extrinsics: [] as any[],
        missing_events: [] as any[],
        missing_data_submissions: [] as any[],
      };
      
      report.details.incompleteBlocks.forEach((block) => {
        block.issues.forEach((issue: string) => {
          if (issue.includes('missing_extrinsics')) {
            issueGroups.missing_extrinsics.push(block);
          } else if (issue.includes('missing_events')) {
            issueGroups.missing_events.push(block);
          } else if (issue.includes('missing_data_submissions')) {
            issueGroups.missing_data_submissions.push(block);
          }
        });
      });
      
      // Report incomplete blocks
      report.details.incompleteBlocks.slice(0, 10).forEach((block) => {
        logger.info(`  Block ${block.blockNumber}: ${block.issues.join(', ')}`);
      });
      
      if (report.details.incompleteBlocks.length > 10) {
        logger.info(`  ... and ${report.details.incompleteBlocks.length - 10} more`);
      }
    }

    logger.info('=== Recovery Plan ===');
    logger.info(`Total Jobs: ${report.recoveryPlan.totalJobs}`);
    logger.info(`Estimated Duration: ${report.recoveryPlan.estimatedDuration}`);
    logger.info('Batch Configuration:');
    logger.info(`  Block Batch Size: ${report.recoveryPlan.batchConfiguration.blockBatchSize}`);
    logger.info(`  Entity Batch Size: ${report.recoveryPlan.batchConfiguration.entityBatchSize}`);
    logger.info(`  Throttle Threshold: ${report.recoveryPlan.batchConfiguration.throttleThreshold}`);
  }

  private createRecoveryOptions(options: SyncMissingOptions): RecoveryOptions {
    return {
      blockBatchSize: options.blockBatchSize || 10,
      entityBatchSize: options.entityBatchSize || 50,
      throttleThreshold: options.throttleThreshold || 50,
      maxRetries: 3,
      delayBetweenBatches: 1000,
    };
  }

  private async monitorProgress(): Promise<void> {
    logger.info('=== Recovery Progress ===');
    
    // Monitor for a reasonable amount of time
    const maxMonitoringTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxMonitoringTime) {
      const progress = this.syncService.getRecoveryProgress();
      
      if (progress.totalJobs > 0) {
        const completionRate = (progress.completedJobs / progress.totalJobs) * 100;
        logger.info(`Progress: ${progress.completedJobs}/${progress.totalJobs} (${completionRate.toFixed(1)}%)`);
        logger.info(`Current Batch: ${progress.currentBatchInfo.batchType} (${progress.currentBatchInfo.progress.toFixed(1)}%)`);
        logger.info(`Estimated Time Remaining: ${progress.estimatedDuration}`);
        
        if (progress.failedJobs > 0) {
          logger.info(`Failed Jobs: ${progress.failedJobs}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }
    
    logger.info('Progress monitoring completed. Check queue status for ongoing jobs.');
  }

  private async cleanup(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      await this.serviceFactory.shutdown();
    } catch (error) {
      logger.error('Cleanup failed', { error });
    }
  }
}

// CLI Command Configuration
program
  .name('sync-missing')
  .description('Find and recover missing blockchain data')
  .version('1.0.0');

program
  .command('run')
  .description('Run missing data detection and recovery')
  .option('--check-only', 'Only check for missing data, do not queue recovery jobs')
  .option('--dry-run', 'Show what would be recovered without actually queuing jobs')
  .option('--from <number>', 'Start block number for scan range', parseInt)
  .option('--to <number>', 'End block number for scan range', parseInt)
  .option('--entities <entities>', 'Comma-separated list of entities to recover (blocks,extrinsics,events,validators,accounts,data_submissions)')
  .option('--block-batch-size <size>', 'Batch size for block recovery jobs', parseInt)
  .option('--entity-batch-size <size>', 'Batch size for entity recovery jobs', parseInt)
  .option('--throttle-threshold <threshold>', 'Queue length threshold for throttling', parseInt)
  .action(async (options) => {
    try {
      // Parse entities option
      if (options.entities) {
        options.entities = options.entities.split(',').map((s: string) => s.trim());
      }

      const command = new SyncMissingCommand();
      await command.execute(options);
      
      process.exit(0);
    } catch (error) {
      logger.error('Command execution failed', { error });
      process.exit(1);
    }
  });

// Default action (run with no subcommand)
program.action(async () => {
  try {
    const command = new SyncMissingCommand();
    await command.execute({});
    
    process.exit(0);
  } catch (error) {
    logger.error('Command execution failed', { error });
    process.exit(1);
  }
});

// Parse CLI arguments
if (require.main === module) {
  program.parse(process.argv);
}

export { SyncMissingCommand };