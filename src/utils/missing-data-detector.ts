import { logger } from './logger';
import { PrismaClient } from '@prisma/client';

export interface BlockIssue {
  blockNumber: number;
  issueType: 'missing_extrinsics' | 'missing_events' | 'missing_data_submissions';
  expected: number;
  actual: number;
  details?: string;
}

export interface MissingDataSummary {
  missingBlocks: number[];
  incompleteBlocks: BlockIssue[];
  missingValidators: string[];
  missingAccounts: string[];
  missingDataSubmissions: number[];
}

/**
 * MissingDataDetector - Analyzes database for missing or incomplete data
 * 
 * Uses comprehensive SQL queries to detect:
 * - Missing blocks in sequence
 * - Incomplete entity counts for blocks
 * - Missing referenced entities (validators, accounts)
 * - Missing data submissions for DA extrinsics
 */
export class MissingDataDetector {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Find missing blocks in sequence using recursive CTE
   */
  async findMissingBlocks(startBlock: number, endBlock: number): Promise<number[]> {
    logger.debug('Finding missing blocks in sequence', {
      component: 'missing-data-detector',
      startBlock,
      endBlock,
      range: endBlock - startBlock + 1,
    });

    const result = await this.prisma.$queryRaw<Array<{ missing_block: bigint }>>`
      WITH RECURSIVE block_range AS (
        SELECT ${startBlock} as block_num
        UNION ALL  
        SELECT block_num + 1 FROM block_range WHERE block_num < ${endBlock}
      )
      SELECT br.block_num as missing_block
      FROM block_range br
      LEFT JOIN blocks b ON br.block_num = b.number
      WHERE b.number IS NULL
      ORDER BY br.block_num
    `;

    const missingBlocks = result.map(row => Number(row.missing_block));

    logger.debug('Missing blocks detection complete', {
      component: 'missing-data-detector',
      missingCount: missingBlocks.length,
      totalRange: endBlock - startBlock + 1,
      missingPercentage: (missingBlocks.length / (endBlock - startBlock + 1)) * 100,
    });

    return missingBlocks;
  }

  /**
   * Find blocks with incomplete extrinsics
   */
  async findIncompleteExtrinsics(blockNumbers: number[]): Promise<BlockIssue[]> {
    if (blockNumbers.length === 0) {
      return [];
    }

    logger.debug('Finding blocks with incomplete extrinsics', {
      component: 'missing-data-detector',
      blockCount: blockNumbers.length,
    });

    const result = await this.prisma.$queryRaw<Array<{
      number: number;
      extrinsics_count: number;
      actual_extrinsics: bigint;
    }>>`
      SELECT b.number, b.extrinsics_count, COUNT(e.id) as actual_extrinsics
      FROM blocks b
      LEFT JOIN extrinsics e ON b.number = e.block_number
      WHERE b.number = ANY(${blockNumbers})
      GROUP BY b.number, b.extrinsics_count
      HAVING b.extrinsics_count != COUNT(e.id)
      ORDER BY b.number
    `;

    const issues = result.map(row => ({
      blockNumber: row.number,
      issueType: 'missing_extrinsics' as const,
      expected: row.extrinsics_count,
      actual: Number(row.actual_extrinsics),
      details: `Expected ${row.extrinsics_count} extrinsics, found ${Number(row.actual_extrinsics)}`,
    }));

    logger.debug('Incomplete extrinsics detection complete', {
      component: 'missing-data-detector',
      issueCount: issues.length,
      checkedBlocks: blockNumbers.length,
    });

    return issues;
  }

  /**
   * Find blocks with incomplete events
   */
  async findIncompleteEvents(blockNumbers: number[]): Promise<BlockIssue[]> {
    if (blockNumbers.length === 0) {
      return [];
    }

    logger.debug('Finding blocks with incomplete events', {
      component: 'missing-data-detector',
      blockCount: blockNumbers.length,
    });

    const result = await this.prisma.$queryRaw<Array<{
      number: number;
      events_count: number;
      actual_events: bigint;
    }>>`
      SELECT b.number, b.events_count, COUNT(ev.id) as actual_events
      FROM blocks b
      LEFT JOIN events ev ON b.number = ev.block_number
      WHERE b.number = ANY(${blockNumbers})
      GROUP BY b.number, b.events_count
      HAVING b.events_count != COUNT(ev.id)
      ORDER BY b.number
    `;

    const issues = result.map(row => ({
      blockNumber: row.number,
      issueType: 'missing_events' as const,
      expected: row.events_count,
      actual: Number(row.actual_events),
      details: `Expected ${row.events_count} events, found ${Number(row.actual_events)}`,
    }));

    logger.debug('Incomplete events detection complete', {
      component: 'missing-data-detector',
      issueCount: issues.length,
      checkedBlocks: blockNumbers.length,
    });

    return issues;
  }

  /**
   * Find missing validators referenced in blocks
   */
  async findMissingValidators(blockNumbers: number[]): Promise<string[]> {
    if (blockNumbers.length === 0) {
      return [];
    }

    logger.debug('Finding missing validators', {
      component: 'missing-data-detector',
      blockCount: blockNumbers.length,
    });

    const result = await this.prisma.$queryRaw<Array<{ validator_address: string }>>`
      SELECT DISTINCT b.validator_address
      FROM blocks b
      LEFT JOIN validators v ON b.validator_address = v.stash_address  
      WHERE b.number = ANY(${blockNumbers})
        AND b.validator_address IS NOT NULL 
        AND v.stash_address IS NULL
      ORDER BY b.validator_address
    `;

    const missingValidators = result.map(row => row.validator_address);

    logger.debug('Missing validators detection complete', {
      component: 'missing-data-detector',
      missingCount: missingValidators.length,
      checkedBlocks: blockNumbers.length,
    });

    return missingValidators;
  }

  /**
   * Find missing accounts referenced in extrinsics
   */
  async findMissingAccounts(blockNumbers: number[]): Promise<string[]> {
    if (blockNumbers.length === 0) {
      return [];
    }

    logger.debug('Finding missing accounts', {
      component: 'missing-data-detector',
      blockCount: blockNumbers.length,
    });

    const result = await this.prisma.$queryRaw<Array<{ signer: string }>>`
      SELECT DISTINCT e.signer
      FROM extrinsics e
      LEFT JOIN accounts a ON e.signer = a.address
      WHERE e.block_number = ANY(${blockNumbers})
        AND e.signer IS NOT NULL 
        AND a.address IS NULL
      ORDER BY e.signer
    `;

    const missingAccounts = result.map(row => row.signer);

    logger.debug('Missing accounts detection complete', {
      component: 'missing-data-detector',
      missingCount: missingAccounts.length,
      checkedBlocks: blockNumbers.length,
    });

    return missingAccounts;
  }

  /**
   * Find missing data submissions for blocks with data availability extrinsics
   */
  async findMissingDataSubmissions(blockNumbers: number[]): Promise<number[]> {
    if (blockNumbers.length === 0) {
      return [];
    }

    logger.debug('Finding missing data submissions', {
      component: 'missing-data-detector',
      blockCount: blockNumbers.length,
    });

    const result = await this.prisma.$queryRaw<Array<{ block_number: number }>>`
      SELECT DISTINCT e.block_number
      FROM extrinsics e
      LEFT JOIN data_submissions ds ON e.block_number = ds.block_number
      WHERE e.block_number = ANY(${blockNumbers})
        AND e.module = 'dataAvailability' 
        AND e.call = 'submitData' 
        AND ds.block_number IS NULL
      ORDER BY e.block_number
    `;

    const missingDataSubmissions = result.map(row => row.block_number);

    logger.debug('Missing data submissions detection complete', {
      component: 'missing-data-detector',
      missingCount: missingDataSubmissions.length,
      checkedBlocks: blockNumbers.length,
    });

    return missingDataSubmissions;
  }


  /**
   * Get comprehensive missing data summary for a block range
   */
  async getComprehensiveMissingData(startBlock: number, endBlock: number): Promise<MissingDataSummary> {
    logger.info('Starting comprehensive missing data analysis', {
      component: 'missing-data-detector',
      startBlock,
      endBlock,
      range: endBlock - startBlock + 1,
    });

    const startTime = Date.now();

    // Find missing blocks first
    const missingBlocks = await this.findMissingBlocks(startBlock, endBlock);

    // Get all existing blocks in range for entity analysis
    const existingBlocks = await this.prisma.block.findMany({
      where: {
        number: {
          gte: startBlock,
          lte: endBlock,
        },
      },
      select: { number: true },
      orderBy: { number: 'asc' },
    });

    const existingBlockNumbers = existingBlocks.map(b => b.number);

    // Run parallel analysis on existing blocks
    const [
      incompleteExtrinsics,
      incompleteEvents,
      missingValidators,
      missingAccounts,
      missingDataSubmissions,
    ] = await Promise.all([
      this.findIncompleteExtrinsics(existingBlockNumbers),
      this.findIncompleteEvents(existingBlockNumbers),
      this.findMissingValidators(existingBlockNumbers),
      this.findMissingAccounts(existingBlockNumbers),
      this.findMissingDataSubmissions(existingBlockNumbers),
    ]);

    // Combine all incomplete block issues
    const incompleteBlocks = [...incompleteExtrinsics, ...incompleteEvents];

    const duration = Date.now() - startTime;

    logger.info('Comprehensive missing data analysis complete', {
      component: 'missing-data-detector',
      duration,
      summary: {
        totalRange: endBlock - startBlock + 1,
        existingBlocks: existingBlockNumbers.length,
        missingBlocks: missingBlocks.length,
        incompleteBlocks: incompleteBlocks.length,
        incompleteExtrinsics: incompleteExtrinsics.length,
        incompleteEvents: incompleteEvents.length,
        missingValidators: missingValidators.length,
        missingAccounts: missingAccounts.length,
        missingDataSubmissions: missingDataSubmissions.length,
      },
    });

    return {
      missingBlocks,
      incompleteBlocks,
      missingValidators,
      missingAccounts,
      missingDataSubmissions,
    };
  }

  /**
   * Get database statistics for health monitoring
   */
  async getDatabaseStats(): Promise<{
    totalBlocks: number;
    latestBlock: number | null;
    totalExtrinsics: number;
    totalEvents: number;
    totalValidators: number;
    totalAccounts: number;
    totalDataSubmissions: number;
  }> {
    const [
      totalBlocks,
      latestBlock,
      totalExtrinsics,
      totalEvents,
      totalValidators,
      totalAccounts,
      totalDataSubmissions,
    ] = await Promise.all([
      this.prisma.block.count(),
      this.prisma.block.findFirst({ orderBy: { number: 'desc' }, select: { number: true } }),
      this.prisma.extrinsic.count(),
      this.prisma.event.count(),
      this.prisma.validator.count(),
      this.prisma.account.count(),
      this.prisma.dataSubmission.count(),
    ]);

    return {
      totalBlocks,
      latestBlock: latestBlock?.number || null,
      totalExtrinsics,
      totalEvents,
      totalValidators,
      totalAccounts,
      totalDataSubmissions,
    };
  }
}