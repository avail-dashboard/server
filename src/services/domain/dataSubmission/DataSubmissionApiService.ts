import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { DataSubmissionRepository } from '../../../database/repositories';
import { IDataSubmissionMapper } from '../../../mappers';
import {
  IDataSubmissionService,
  DataSubmissionFilterOptions,
  DataSubmissionWithDetails,
  DataSubmissionList,
  DataSubmissionStats,
  PaginationOptions,
} from './DataSubmissionInterfaces';

/**
 * DataSubmissionApiService - Handles data submission API endpoints
 * 
 * Responsibilities:
 * - getDataSubmissions with filtering and pagination
 * - getDataSubmission by hash/id
 * - getDataSubmissionsByBlock, getDataSubmissionsByApp, getDataSubmissionsBySubmitter
 * - getDataSubmissionStatistics
 * - getRollupInfo
 */
export class DataSubmissionApiService implements IDataSubmissionService {
  private dataSubmissionRepository: DataSubmissionRepository;
  private blockchain: AvailBlockchainService;
  private dataSubmissionMapper: IDataSubmissionMapper;

  constructor(
    dataSubmissionRepository: DataSubmissionRepository,
    blockchain: AvailBlockchainService,
    dataSubmissionMapper: IDataSubmissionMapper,
  ) {
    this.dataSubmissionRepository = dataSubmissionRepository;
    this.blockchain = blockchain;
    this.dataSubmissionMapper = dataSubmissionMapper;
  }

  /**
   * Get data submissions with filtering and pagination
   */
  async getDataSubmissions(
    filters?: DataSubmissionFilterOptions,
    options?: PaginationOptions
  ): Promise<DataSubmissionList> {
    try {
      const { page = 1, limit = 20, sortBy = 'timestamp', sortOrder = 'desc' } = options || {};
      
      logger.debug('DataSubmissionApiService: Getting data submissions', {
        component: 'data-submission-api-service',
        filters,
        page,
        limit,
      });

      // Convert filters to repository format
      const repositoryFilters: any = {};
      if (filters?.appId !== undefined) {
        repositoryFilters.appId = filters.appId;
      }
      if (filters?.submitter) {
        repositoryFilters.submitter = filters.submitter;
      }
      if (filters?.success !== undefined) {
        repositoryFilters.success = filters.success;
      }
      if (filters?.blockNumber !== undefined) {
        repositoryFilters.blockNumber = filters.blockNumber;
      }

      const { submissions, total } = await this.dataSubmissionRepository.findMany(
        repositoryFilters,
        { page, limit, orderBy: sortOrder }
      );

      // Map submissions to response format (no rollup data available)
      const enhancedSubmissions: DataSubmissionWithDetails[] = submissions.map((submission) => ({
        ...submission,
        rollup: undefined, // Rollups table doesn't exist
      }));

      const totalPages = Math.ceil(total / limit);
      const result: DataSubmissionList = {
        data: enhancedSubmissions,
        pagination: {
          page,
          limit,
          total_count: total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };

      logger.debug('DataSubmissionApiService: Data submissions retrieved', {
        component: 'data-submission-api-service',
        count: enhancedSubmissions.length,
        total,
      });

      return result;
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmissions',
        filters,
        options,
      });
      throw error;
    }
  }

  /**
   * Get specific data submission by hash
   */
  async getDataSubmission(extrinsicHash: string): Promise<DataSubmissionWithDetails | null> {
    try {
      logger.debug('DataSubmissionApiService: Getting data submission by hash', {
        component: 'data-submission-api-service',
        extrinsicHash,
      });

      const submission = await this.dataSubmissionRepository.findByExtrinsicHash(extrinsicHash);
      
      if (!submission) {
        logger.debug('DataSubmissionApiService: Data submission not found', {
          component: 'data-submission-api-service',
          extrinsicHash,
        });
        return null;
      }

      const result: DataSubmissionWithDetails = {
        ...submission,
        rollup: undefined, // Rollups table doesn't exist
      };

      logger.debug('DataSubmissionApiService: Data submission retrieved', {
        component: 'data-submission-api-service',
        extrinsicHash,
        appId: submission.appId,
      });

      return result;
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmission',
        extrinsicHash,
      });
      throw error;
    }
  }

  /**
   * Get data submissions for specific block
   */
  async getDataSubmissionsByBlock(
    blockNumber: number,
    options?: PaginationOptions
  ): Promise<DataSubmissionList> {
    try {
      logger.debug('DataSubmissionApiService: Getting data submissions by block', {
        component: 'data-submission-api-service',
        blockNumber,
        options,
      });

      // Use findByBlock method for efficient block-specific query
      const submissions = await this.dataSubmissionRepository.findByBlock(blockNumber);
      
      // Map to response format (no rollup data available)
      const enhancedSubmissions: DataSubmissionWithDetails[] = submissions.map((submission) => ({
        ...submission,
        rollup: undefined, // Rollups table doesn't exist
      }));

      // Apply pagination if specified
      const { page = 1, limit = 20 } = options || {};
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedSubmissions = enhancedSubmissions.slice(startIndex, endIndex);
      
      const total = enhancedSubmissions.length;
      const totalPages = Math.ceil(total / limit);

      const result: DataSubmissionList = {
        data: paginatedSubmissions,
        pagination: {
          page,
          limit,
          total_count: total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };

      logger.debug('DataSubmissionApiService: Block data submissions retrieved', {
        component: 'data-submission-api-service',
        blockNumber,
        count: paginatedSubmissions.length,
        total,
      });

      return result;
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmissionsByBlock',
        blockNumber,
        options,
      });
      throw error;
    }
  }

  /**
   * Get data submissions for specific app
   */
  async getDataSubmissionsByApp(
    appId: number,
    options?: PaginationOptions
  ): Promise<DataSubmissionList> {
    try {
      logger.debug('DataSubmissionApiService: Getting data submissions by app', {
        component: 'data-submission-api-service',
        appId,
        options,
      });

      const { page = 1, limit = 20 } = options || {};

      // Use repository's specialized findByAppId method
      const { submissions, total } = await this.dataSubmissionRepository.findByAppId(
        appId,
        { page, limit }
      );

      // Map submissions to response format (no rollup data available)
      const enhancedSubmissions: DataSubmissionWithDetails[] = submissions.map((submission) => ({
        ...submission,
        rollup: undefined, // Rollups table doesn't exist
      }));

      const totalPages = Math.ceil(total / limit);
      const result: DataSubmissionList = {
        data: enhancedSubmissions,
        pagination: {
          page,
          limit,
          total_count: total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };

      logger.debug('DataSubmissionApiService: App data submissions retrieved', {
        component: 'data-submission-api-service',
        appId,
        count: enhancedSubmissions.length,
        total,
      });

      return result;
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmissionsByApp',
        appId,
        options,
      });
      throw error;
    }
  }

  /**
   * Get data submissions for specific submitter
   */
  async getDataSubmissionsBySubmitter(
    address: string,
    options?: PaginationOptions
  ): Promise<DataSubmissionList> {
    try {
      logger.debug('DataSubmissionApiService: Getting data submissions by submitter', {
        component: 'data-submission-api-service',
        address,
        options,
      });

      // Use the generic getDataSubmissions with submitter filter
      return this.getDataSubmissions({ submitter: address }, options);
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmissionsBySubmitter',
        address,
        options,
      });
      throw error;
    }
  }

  /**
   * Get data submission statistics
   */
  async getDataSubmissionStatistics(period?: string): Promise<DataSubmissionStats> {
    try {
      logger.debug('DataSubmissionApiService: Getting data submission statistics', {
        component: 'data-submission-api-service',
        period,
      });

      // Get basic statistics from repository
      const [totalSubmissions, totalDataSize, uniqueApps] = await Promise.all([
        this.dataSubmissionRepository.getTotalCount(),
        this.dataSubmissionRepository.getTotalDataSize(),
        this.dataSubmissionRepository.getUniqueAppCount(),
      ]);

      // Calculate average data size
      const avgDataSize = totalSubmissions > 0 ? Math.round(totalDataSize / totalSubmissions) : 0;

      // Get submissions in last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const submissionsLast24h = await this.dataSubmissionRepository.getCountSince(yesterday);

      // Get today's submissions and data size
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStats = await this.dataSubmissionRepository.getStats({
        fromTimestamp: today,
      });

      // Get unique submitters count
      const uniqueSubmittersData = await this.dataSubmissionRepository.findMany({}, { page: 1, limit: 10000 });
      const uniqueSubmitters = new Set(uniqueSubmittersData.submissions.map(s => s.submitter)).size;

      // TODO: Implement top apps and most active submitters queries
      const topAppsBySubmissions: any[] = [];
      const mostActiveSubmitters: any[] = [];

      const stats: DataSubmissionStats = {
        totalSubmissions,
        totalDataSize,
        uniqueApps,
        uniqueSubmitters,
        submissionsToday: todayStats.totalSubmissions,
        dataSizeToday: todayStats.totalDataSize,
        avgDataSize,
        submissionsLast24h,
        topAppsBySubmissions,
        mostActiveSubmitters,
      };

      logger.debug('DataSubmissionApiService: Statistics retrieved', {
        component: 'data-submission-api-service',
        totalSubmissions,
        totalDataSize,
        uniqueApps,
        submissionsLast24h,
      });

      return stats;
    } catch (error) {
      logError(error as Error, {
        component: 'data-submission-api-service',
        action: 'getDataSubmissionStatistics',
        period,
      });
      throw error;
    }
  }

  /**
   * Get rollup information by app ID (currently not available)
   */
  async getRollupInfo(appId: number): Promise<null> {
    logger.debug('DataSubmissionApiService: Rollup info not available - rollups table does not exist', {
      component: 'data-submission-api-service',
      appId,
    });
    return null;
  }
}

// Factory function
export const createDataSubmissionApiService = (
  dataSubmissionRepository: DataSubmissionRepository,
  blockchain: AvailBlockchainService,
  dataSubmissionMapper: IDataSubmissionMapper,
): DataSubmissionApiService => {
  return new DataSubmissionApiService(
    dataSubmissionRepository,
    blockchain,
    dataSubmissionMapper,
  );
};