import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { ExtrinsicRepository } from '../../database/repositories/ExtrinsicRepository';
import { TransferRepository } from '../../database/repositories/TransferRepository';
import { ValidatorRepository } from '../../database/repositories/ValidatorRepository';
import { DataSubmissionRepository } from '../../database/repositories/DataSubmissionRepository';
import { BaseService, ServiceHealth } from '../types/service';

// Service interfaces
export interface ChainStats {
  totalBlocks: number;
  totalExtrinsics: number;
  totalTransfers: number;
  totalValidators: number;
  totalDataSubmissions: number;
  averageBlockTime: number;
  currentBlockHeight: number;
  totalStaked: string;
  activeValidators: number;
}

export interface NetworkActivity {
  blocksPerHour: number;
  transactionsPerHour: number;
  transfersPerHour: number;
  dataSubmissionsPerHour: number;
  averageBlockTime: number;
  networkUtilization: number;
}

export interface HistoricalData {
  date: string;
  blocks: number;
  transactions: number;
  transfers: number;
  dataSubmissions: number;
  avgBlockTime: number;
  totalStaked: string;
  activeValidators: number;
}

export interface TopMetrics {
  topValidatorsByStake: Array<{
    address: string;
    name: string | null;
    totalBonded: string;
    commission: number;
  }>;
  topTransfersByAmount: Array<{
    hash: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    timestamp: Date;
  }>;
  topDataSubmissionsBySize: Array<{
    hash: string;
    submitter: string;
    dataSize: number;
    rollupName: string | null;
    timestamp: Date;
  }>;
}

export interface IAnalyticsService {
  getChainStats(): Promise<ChainStats>;
  getNetworkActivity(): Promise<NetworkActivity>;
  getHistoricalData(days: number): Promise<HistoricalData[]>;
  getTopMetrics(): Promise<TopMetrics>;
}

/**
 * AnalyticsService - Provides comprehensive blockchain analytics
 * 
 * Responsibilities:
 * - Calculate chain statistics and metrics
 * - Track network activity and performance
 * - Generate historical data reports
 * - Provide top performers and rankings
 * - Support analytics dashboard endpoints
 */
export class AnalyticsService implements BaseService, IAnalyticsService {
  private blockchain: AvailBlockchainService;
  private blockRepository: BlockRepository;
  private extrinsicRepository: ExtrinsicRepository;
  private transferRepository: TransferRepository;
  private validatorRepository: ValidatorRepository;
  private dataSubmissionRepository: DataSubmissionRepository;
  private isRunning = false;

  constructor(
    blockchain: AvailBlockchainService,
    blockRepository: BlockRepository,
    extrinsicRepository: ExtrinsicRepository,
    transferRepository: TransferRepository,
    validatorRepository: ValidatorRepository,
    dataSubmissionRepository: DataSubmissionRepository,
  ) {
    this.blockchain = blockchain;
    this.blockRepository = blockRepository;
    this.extrinsicRepository = extrinsicRepository;
    this.transferRepository = transferRepository;
    this.validatorRepository = validatorRepository;
    this.dataSubmissionRepository = dataSubmissionRepository;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    logger.info('AnalyticsService: Starting service', { component: 'analytics-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('AnalyticsService: Stopping service', { component: 'analytics-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'AnalyticsService',
        version: '1.0.0',
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get comprehensive chain statistics
   */
  async getChainStats(): Promise<ChainStats> {
    try {
      logger.debug('AnalyticsService: Getting chain statistics', { component: 'analytics-service' });

      const [
        totalBlocks,
        totalExtrinsics,
        totalTransfers,
        totalValidators,
        totalDataSubmissions,
        latestBlock,
        validatorStats,
        averageBlockTime
      ] = await Promise.all([
        this.blockRepository.count(),
        this.extrinsicRepository.count(),
        this.transferRepository.findMany({ page: 1, limit: 1 }).then(r => r.total),
        this.validatorRepository.findMany({ page: 1, limit: 1 }).then(r => r.total),
        this.dataSubmissionRepository.findMany({}, { limit: 1 }).then(r => r.total),
        this.blockRepository.getLatest(),
        this.validatorRepository.getStats(),
        this.calculateAverageBlockTime(),
      ]);

      const chainStats: ChainStats = {
        totalBlocks,
        totalExtrinsics,
        totalTransfers,
        totalValidators,
        totalDataSubmissions,
        averageBlockTime,
        currentBlockHeight: latestBlock?.number || 0,
        totalStaked: validatorStats.totalStaked.toString(),
        activeValidators: validatorStats.activeValidators,
      };

      logger.debug('AnalyticsService: Chain statistics retrieved', { 
        component: 'analytics-service',
        totalBlocks: chainStats.totalBlocks,
        totalExtrinsics: chainStats.totalExtrinsics,
        currentBlockHeight: chainStats.currentBlockHeight,
      });

      return chainStats;

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getChainStats',
      });
      throw error;
    }
  }

  /**
   * Get current network activity metrics
   */
  async getNetworkActivity(): Promise<NetworkActivity> {
    try {
      logger.debug('AnalyticsService: Getting network activity', { component: 'analytics-service' });

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [
        recentBlocks,
        recentExtrinsics,
        recentTransfers,
        recentDataSubmissions,
        averageBlockTime
      ] = await Promise.all([
        this.blockRepository.findInRange(
          Math.max(0, (await this.blockRepository.getLatest())?.number || 0 - 300), // Last ~1 hour of blocks
          (await this.blockRepository.getLatest())?.number || 0
        ),
        this.extrinsicRepository.findMany({ limit: 1000 }).then(r => 
          r.extrinsics.filter(e => e.timestamp && e.timestamp > oneHourAgo).length
        ),
        this.transferRepository.findMany({ limit: 1000 }).then(r => 
          r.transfers.filter(t => t.timestamp > oneHourAgo).length
        ),
                this.dataSubmissionRepository.findMany({}, { limit: 1000 }).then(r =>
          r.submissions.filter((d: any) => d.timestamp > oneHourAgo).length
        ),
        this.calculateAverageBlockTime(),
      ]);

      const blocksPerHour = recentBlocks.length;
      const expectedBlocksPerHour = 3600 / averageBlockTime; // Expected blocks based on block time
      const networkUtilization = expectedBlocksPerHour > 0 ? (blocksPerHour / expectedBlocksPerHour) * 100 : 0;

      const networkActivity: NetworkActivity = {
        blocksPerHour,
        transactionsPerHour: recentExtrinsics,
        transfersPerHour: recentTransfers,
        dataSubmissionsPerHour: recentDataSubmissions,
        averageBlockTime,
        networkUtilization: Math.min(100, Math.max(0, networkUtilization)),
      };

      logger.debug('AnalyticsService: Network activity retrieved', { 
        component: 'analytics-service',
        blocksPerHour: networkActivity.blocksPerHour,
        transactionsPerHour: networkActivity.transactionsPerHour,
        networkUtilization: networkActivity.networkUtilization,
      });

      return networkActivity;

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getNetworkActivity',
      });
      throw error;
    }
  }

  /**
   * Get historical data for specified number of days
   */
  async getHistoricalData(days: number = 7): Promise<HistoricalData[]> {
    try {
      logger.debug('AnalyticsService: Getting historical data', { 
        component: 'analytics-service',
        days,
      });

      const historicalData: HistoricalData[] = [];
      const endDate = new Date();
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(endDate);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        // Get data for this day (simplified implementation)
        const dayData: HistoricalData = {
          date: date.toISOString().split('T')[0],
          blocks: 0,
          transactions: 0,
          transfers: 0,
          dataSubmissions: 0,
          avgBlockTime: 12, // Default
          totalStaked: '0',
          activeValidators: 0,
        };

        historicalData.push(dayData);
      }

      logger.debug('AnalyticsService: Historical data retrieved', { 
        component: 'analytics-service',
        days,
        dataPoints: historicalData.length,
      });

      return historicalData;

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getHistoricalData',
        days,
      });
      throw error;
    }
  }

  /**
   * Get top metrics and rankings
   */
  async getTopMetrics(): Promise<TopMetrics> {
    try {
      logger.debug('AnalyticsService: Getting top metrics', { component: 'analytics-service' });

      const [
        topValidators,
        topTransfers,
        topDataSubmissions
      ] = await Promise.all([
        this.validatorRepository.getTopValidators(10),
        this.getTopTransfers(10),
        this.getTopDataSubmissions(10),
      ]);

      const topMetrics: TopMetrics = {
        topValidatorsByStake: topValidators.map(v => ({
          address: v.stashAddress,
          name: v.identityName,
          totalBonded: v.totalBonded.toString(),
          commission: v.commission,
        })),
        topTransfersByAmount: topTransfers,
        topDataSubmissionsBySize: topDataSubmissions,
      };

      logger.debug('AnalyticsService: Top metrics retrieved', { 
        component: 'analytics-service',
        topValidators: topMetrics.topValidatorsByStake.length,
        topTransfers: topMetrics.topTransfersByAmount.length,
        topDataSubmissions: topMetrics.topDataSubmissionsBySize.length,
      });

      return topMetrics;

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getTopMetrics',
      });
      throw error;
    }
  }

  // Private helper methods

  private async calculateAverageBlockTime(): Promise<number> {
    try {
      const recentBlocks = await this.blockRepository.findMany({ 
        page: 1, 
        limit: 100, 
        orderBy: 'desc' 
      });

      if (recentBlocks.blocks.length < 2) {
        return 12; // Default 12 seconds
      }

      const blockTimes = recentBlocks.blocks
        .slice(0, -1)
        .map((block, index) => {
          const nextBlock = recentBlocks.blocks[index + 1];
          return (block.timestamp.getTime() - nextBlock.timestamp.getTime()) / 1000;
        })
        .filter(time => time > 0 && time < 60); // Filter out unrealistic times

      if (blockTimes.length === 0) {
        return 12;
      }

      return blockTimes.reduce((sum, time) => sum + time, 0) / blockTimes.length;

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'calculateAverageBlockTime',
      });
      return 12; // Default fallback
    }
  }

  private async getTopTransfers(limit: number): Promise<Array<{
    hash: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    timestamp: Date;
  }>> {
    try {
      const transfers = await this.transferRepository.findMany({ 
        page: 1, 
        limit,
        orderBy: 'amount',
        orderDirection: 'desc',
      });

      return transfers.transfers.map(t => ({
        hash: t.extrinsicHash,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        amount: t.amount.toString(),
        timestamp: t.timestamp,
      }));

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getTopTransfers',
      });
      return [];
    }
  }

  private async getTopDataSubmissions(limit: number): Promise<Array<{
    hash: string;
    submitter: string;
    dataSize: number;
    rollupName: string | null;
    timestamp: Date;
  }>> {
    try {
            const submissions = await this.dataSubmissionRepository.findMany({}, {
        limit,
        orderBy: 'desc',
      });

      return submissions.submissions.map((d: any) => ({
        hash: d.extrinsicHash,
        submitter: d.submitter,
        dataSize: d.dataSize,
        rollupName: d.rollupName,
        timestamp: d.timestamp,
      }));

    } catch (error) {
      logError(error as Error, { 
        component: 'analytics-service', 
        action: 'getTopDataSubmissions',
      });
      return [];
    }
  }
}

// Factory function
export const createAnalyticsService = (
  blockchain: AvailBlockchainService,
  blockRepository: BlockRepository,
  extrinsicRepository: ExtrinsicRepository,
  transferRepository: TransferRepository,
  validatorRepository: ValidatorRepository,
  dataSubmissionRepository: DataSubmissionRepository,
): AnalyticsService => {
  return new AnalyticsService(
    blockchain,
    blockRepository,
    extrinsicRepository,
    transferRepository,
    validatorRepository,
    dataSubmissionRepository,
  );
}; 