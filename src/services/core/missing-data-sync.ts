import { logger } from '../../utils/logger';
import { MissingDataDetector, MissingDataSummary, BlockIssue } from '../../utils/missing-data-detector';
import { RecoveryJobScheduler, RecoveryJobConfig, RecoveryProgress } from './recovery-job-scheduler';
import { QueueService } from './queue';
import { PrismaClient } from '@prisma/client';

export interface BlockRange {
  startBlock: number;
  endBlock: number;
}

export interface MissingDataReport {
  scanRange: BlockRange;
  summary: {
    totalBlocks: number;
    missingBlocks: number;
    incompleteBlocks: number;
    missingEntities: { [entityType: string]: number };
  };
  details: {
    missingBlockRanges: Array<{ start: number; end: number; count: number }>;
    incompleteBlocks: Array<{
      blockNumber: number;
      issues: string[];
      expectedCounts: { [entity: string]: number };
      actualCounts: { [entity: string]: number };
    }>;
    missingEntities: {
      validators: string[];
      accounts: string[];
      dataSubmissions: number[];
    };
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
}

export interface SyncMissingOptions {
  checkOnly?: boolean;
  dryRun?: boolean;
  from?: number;
  to?: number;
  entities?: string[];
  blockBatchSize?: number;
  entityBatchSize?: number;
  throttleThreshold?: number;
}

export interface RecoveryOptions {
  blockBatchSize: number;
  entityBatchSize: number;
  throttleThreshold: number;
  maxRetries: number;
  delayBetweenBatches: number;
}

/**
 * MissingDataSyncService - Core orchestration service for missing data detection and recovery
 * 
 * Coordinates between MissingDataDetector and RecoveryJobScheduler to:
 * - Detect all types of missing data
 * - Generate comprehensive reports
 * - Execute recovery plans with proper batching
 * - Monitor progress and provide feedback
 */
export class MissingDataSyncService {
  private detector: MissingDataDetector;
  private scheduler: RecoveryJobScheduler;
  private queueService: QueueService;
  private prisma: PrismaClient;

  constructor(
    detector: MissingDataDetector,
    scheduler: RecoveryJobScheduler,
    queueService: QueueService,
    prisma: PrismaClient,
  ) {
    this.detector = detector;
    this.scheduler = scheduler;
    this.queueService = queueService;
    this.prisma = prisma;
  }

  /**
   * Detect all missing data in the specified range
   */
  async detectAllMissingData(range: BlockRange): Promise<MissingDataReport> {
    logger.info('Starting comprehensive missing data detection', {
      component: 'missing-data-sync',
      range,
      totalBlocks: range.endBlock - range.startBlock + 1,
    });

    const startTime = Date.now();

    // Get comprehensive missing data summary
    const missingData = await this.detector.getComprehensiveMissingData(
      range.startBlock,
      range.endBlock,
    );

    // Generate detailed report
    const report = await this.generateDetailedReport(range, missingData);

    const duration = Date.now() - startTime;

    logger.info('Missing data detection completed', {
      component: 'missing-data-sync',
      duration,
      summary: report.summary,
    });

    return report;
  }

  /**
   * Execute recovery plan based on missing data report
   */
  async executeRecovery(report: MissingDataReport, options: RecoveryOptions): Promise<void> {
    logger.info('Starting missing data recovery execution', {
      component: 'missing-data-sync',
      recoveryPlan: report.recoveryPlan,
      options,
    });

    const startTime = Date.now();

    // Create recovery job scheduler with options
    const config: RecoveryJobConfig = {
      blockBatchSize: options.blockBatchSize,
      entityBatchSize: options.entityBatchSize,
      throttleThreshold: options.throttleThreshold,
      maxRetries: options.maxRetries,
      delayBetweenBatches: options.delayBetweenBatches,
    };

    // Update scheduler config
    this.scheduler = new RecoveryJobScheduler(this.queueService, config);

    // Execute recovery in priority order
    await this.executeRecoveryPlan(report);

    const duration = Date.now() - startTime;

    logger.info('Missing data recovery execution completed', {
      component: 'missing-data-sync',
      duration,
      totalJobs: report.recoveryPlan.totalJobs,
    });
  }

  /**
   * Get current recovery progress
   */
  getRecoveryProgress(): RecoveryProgress {
    return this.scheduler.getProgress();
  }

  /**
   * Generate detailed missing data report
   */
  private async generateDetailedReport(
    range: BlockRange,
    missingData: MissingDataSummary,
  ): Promise<MissingDataReport> {
    const totalBlocks = range.endBlock - range.startBlock + 1;
    const missingBlockRanges = this.generateBlockRanges(missingData.missingBlocks);

    // Group incomplete blocks by block number
    const incompleteBlocksMap = new Map<number, BlockIssue[]>();
    missingData.incompleteBlocks.forEach(issue => {
      if (!incompleteBlocksMap.has(issue.blockNumber)) {
        incompleteBlocksMap.set(issue.blockNumber, []);
      }
      const blockIssues = incompleteBlocksMap.get(issue.blockNumber);
      if (blockIssues) {
        blockIssues.push(issue);
      }
    });

    const incompleteBlocks = Array.from(incompleteBlocksMap.entries()).map(([blockNumber, issues]) => ({
      blockNumber,
      issues: issues.map(issue => issue.issueType),
      expectedCounts: issues.reduce((acc, issue) => {
        acc[issue.issueType] = issue.expected;
        return acc;
      }, {} as { [entity: string]: number }),
      actualCounts: issues.reduce((acc, issue) => {
        acc[issue.issueType] = issue.actual;
        return acc;
      }, {} as { [entity: string]: number }),
    }));

    // Calculate total jobs for recovery plan
    const totalJobs = this.calculateTotalJobs(missingData);

    // Estimate duration (rough calculation)
    const avgJobTime = 5000; // 5 seconds per job
    const estimatedMs = totalJobs * avgJobTime;
    const estimatedDuration = this.formatDuration(estimatedMs);

    return {
      scanRange: range,
      summary: {
        totalBlocks,
        missingBlocks: missingData.missingBlocks.length,
        incompleteBlocks: incompleteBlocks.length,
        missingEntities: {
          validators: missingData.missingValidators.length,
          accounts: missingData.missingAccounts.length,
          dataSubmissions: missingData.missingDataSubmissions.length,
        },
      },
      details: {
        missingBlockRanges,
        incompleteBlocks,
        missingEntities: {
          validators: missingData.missingValidators,
          accounts: missingData.missingAccounts,
          dataSubmissions: missingData.missingDataSubmissions,
        },
      },
      recoveryPlan: {
        totalJobs,
        estimatedDuration,
        batchConfiguration: {
          blockBatchSize: 10, // Default values
          entityBatchSize: 50,
          throttleThreshold: 50,
        },
      },
    };
  }

  /**
   * Execute the recovery plan in priority order
   */
  private async executeRecoveryPlan(report: MissingDataReport): Promise<void> {
    const { details } = report;

    // Step 1: Recover missing blocks (highest priority)
    if (details.missingBlockRanges.length > 0) {
      logger.info('Recovering missing blocks', {
        component: 'missing-data-sync',
        missingBlocks: report.summary.missingBlocks,
      });

      const allMissingBlocks = details.missingBlockRanges.reduce((acc, range) => {
        for (let i = range.start; i <= range.end; i++) {
          acc.push(i);
        }
        return acc;
      }, [] as number[]);

      await this.scheduler.queueMissingBlocks(allMissingBlocks);
    }

    // Step 2: Recover incomplete blocks (high priority)
    if (details.incompleteBlocks.length > 0) {
      logger.info('Recovering incomplete blocks', {
        component: 'missing-data-sync',
        incompleteBlocks: report.summary.incompleteBlocks,
      });

      // Group by issue type
      const extrinsicsIssues = details.incompleteBlocks
        .filter(block => block.issues.includes('missing_extrinsics'))
        .map(block => block.blockNumber);

      const eventsIssues = details.incompleteBlocks
        .filter(block => block.issues.includes('missing_events'))
        .map(block => block.blockNumber);

      const dataSubmissionIssues = details.incompleteBlocks
        .filter(block => block.issues.includes('missing_data_submissions'))
        .map(block => block.blockNumber);

      if (extrinsicsIssues.length > 0) {
        await this.scheduler.queueIncompleteBlocks(extrinsicsIssues, 'extrinsics');
      }

      if (eventsIssues.length > 0) {
        await this.scheduler.queueIncompleteBlocks(eventsIssues, 'events');
      }

      if (dataSubmissionIssues.length > 0) {
        await this.scheduler.queueIncompleteBlocks(dataSubmissionIssues, 'data_submissions');
      }
    }

    // Step 3: Recover missing entities (medium priority)
    if (details.missingEntities.validators.length > 0) {
      logger.info('Recovering missing validators', {
        component: 'missing-data-sync',
        missingValidators: details.missingEntities.validators.length,
      });

      await this.scheduler.queueMissingEntities('validators', details.missingEntities.validators);
    }

    if (details.missingEntities.accounts.length > 0) {
      logger.info('Recovering missing accounts', {
        component: 'missing-data-sync',
        missingAccounts: details.missingEntities.accounts.length,
      });

      await this.scheduler.queueMissingEntities('accounts', details.missingEntities.accounts);
    }

    if (details.missingEntities.dataSubmissions.length > 0) {
      logger.info('Recovering missing data submissions', {
        component: 'missing-data-sync',
        missingDataSubmissions: details.missingEntities.dataSubmissions.length,
      });

      await this.scheduler.queueMissingEntities(
        'data_submissions',
        details.missingEntities.dataSubmissions.map(String)
      );
    }

    logger.info('Recovery plan execution completed', {
      component: 'missing-data-sync',
      totalJobs: report.recoveryPlan.totalJobs,
    });
  }

  /**
   * Generate block ranges from array of missing block numbers
   */
  private generateBlockRanges(missingBlocks: number[]): Array<{ start: number; end: number; count: number }> {
    if (missingBlocks.length === 0) {
      return [];
    }

    const sortedBlocks = [...missingBlocks].sort((a, b) => a - b);
    const ranges: Array<{ start: number; end: number; count: number }> = [];

    let start = sortedBlocks[0];
    let end = start;

    for (let i = 1; i < sortedBlocks.length; i++) {
      if (sortedBlocks[i] === end + 1) {
        // Consecutive block
        end = sortedBlocks[i];
      } else {
        // Gap found, close current range
        ranges.push({ start, end, count: end - start + 1 });
        start = sortedBlocks[i];
        end = start;
      }
    }

    // Add the last range
    ranges.push({ start, end, count: end - start + 1 });

    return ranges;
  }

  /**
   * Calculate total jobs needed for recovery
   */
  private calculateTotalJobs(missingData: MissingDataSummary): number {
    // Block jobs (each missing block = 1 job)
    const blockJobs = missingData.missingBlocks.length;

    // Incomplete block jobs (each incomplete block = 1 job per issue type)
    const incompleteJobs = missingData.incompleteBlocks.length;

    // Entity jobs (batched, so divide by typical batch size)
    const entityBatchSize = 50;
    const validatorJobs = Math.ceil(missingData.missingValidators.length / entityBatchSize);
    const accountJobs = Math.ceil(missingData.missingAccounts.length / entityBatchSize);
    const dataSubmissionJobs = Math.ceil(missingData.missingDataSubmissions.length / entityBatchSize);

    return blockJobs + incompleteJobs + validatorJobs + accountJobs + dataSubmissionJobs;
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get database range for analysis
   */
  async getDatabaseRange(): Promise<BlockRange> {
    const stats = await this.detector.getDatabaseStats();
    const startBlock = 1;
    const endBlock = stats.latestBlock || 1;

    return { startBlock, endBlock };
  }
}