import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { 
  DataSubmissionRepository, 
  RollupRepository,
  DataSubmissionFilters as RepositoryFilters,
  DataSubmissionCreateInput 
} from '../../database/repositories';
import { DataSubmission, Rollup } from '../../database';
import { 
  PaginatedResponse,
  PaginationParams,
  SortParams,
  DataSubmissionFilters,
  DataSubmissionApiResponse,
  RollupApiResponse,
} from '../../types/database';
import { ExtrinsicData, BlockData } from '../types/blockchain';
import { IDataSubmissionMapper, IRollupMapper } from '../../mappers';

export interface IDataAvailabilityService {
  getDataSubmission(extrinsicHash: string): Promise<DataSubmissionApiResponse | null>;
  getDataSubmissionsForBlock(blockNumber: number): Promise<DataSubmissionApiResponse[]>;
  getDataSubmissionsForRollup(appId: number): Promise<DataSubmissionApiResponse[]>;
  getDataSubmissions(
    pagination?: PaginationParams, 
    sort?: SortParams, 
    filters?: DataSubmissionFilters
  ): Promise<PaginatedResponse<DataSubmissionApiResponse>>;
  getDataSubmissionStats(): Promise<{
    totalSubmissions: number;
    totalDataSize: number;
    uniqueApps: number;
    avgDataSize: number;
    submissionsLast24h: number;
  }>;
  processDataSubmissionsFromBlock(blockData: BlockData): Promise<DataSubmission[]>;
  getRollupInfo(appId: number): Promise<RollupApiResponse | null>;
}

export interface DataSubmissionInfo {
  appId: number;
  dataSize: number;
  dataHash: string;
  submitter: string;
  blobData?: Buffer;
  kateCommitment?: string;
}

export class DataAvailabilityService implements IDataAvailabilityService {
  private dataSubmissionRepository: DataSubmissionRepository;
  private rollupRepository: RollupRepository;
  private blockchain: AvailBlockchainService;
  private dataSubmissionMapper: IDataSubmissionMapper;
  private rollupMapper: IRollupMapper;

  constructor(
    dataSubmissionRepository: DataSubmissionRepository,
    rollupRepository: RollupRepository,
    blockchain: AvailBlockchainService,
    dataSubmissionMapper: IDataSubmissionMapper,
    rollupMapper: IRollupMapper,
  ) {
    this.dataSubmissionRepository = dataSubmissionRepository;
    this.rollupRepository = rollupRepository;
    this.blockchain = blockchain;
    this.dataSubmissionMapper = dataSubmissionMapper;
    this.rollupMapper = rollupMapper;
  }

  /**
   * Get data submission by extrinsic hash (database-only)
   */
  async getDataSubmission(extrinsicHash: string): Promise<DataSubmissionApiResponse | null> {
    try {
      // Database-only approach - no blockchain fallback
      const existingSubmission = await this.getDataSubmissionFromDatabase(extrinsicHash);
      
      if (existingSubmission) {
        logger.info('Data submission found in database', { 
          component: 'data-availability-service',
          extrinsicHash,
          source: 'database',
        });
        return this.dataSubmissionMapper.toApiResponse(existingSubmission);
      } else {
        logger.info('Data submission not found in database', {
          component: 'data-availability-service',
          extrinsicHash,
          source: 'database',
        });
        return null;
      }

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmission',
        extrinsicHash,
      });
      throw error;
    }
  }

  /**
   * Get all data submissions for a specific block (database-only)
   */
  async getDataSubmissionsForBlock(blockNumber: number): Promise<DataSubmissionApiResponse[]> {
    try {
      // Database-only approach - no blockchain fallback
      const existingSubmissions = await this.getDataSubmissionsFromDatabaseByBlock(blockNumber);
      
      logger.info('Data submissions retrieved from database for block', { 
        component: 'data-availability-service',
        blockNumber,
        count: existingSubmissions.length,
        source: 'database',
      });
      
      return this.dataSubmissionMapper.toApiResponseArray(existingSubmissions);

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissionsForBlock',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Get all data submissions for a specific rollup/app
   */
  async getDataSubmissionsForRollup(appId: number): Promise<DataSubmissionApiResponse[]> {
    try {
      const { submissions } = await this.dataSubmissionRepository.findByAppId(
        appId,
        { page: 1, limit: 1000 }
      );

      logger.info('Data submissions retrieved for rollup', {
        component: 'data-availability-service',
        appId,
        count: submissions.length,
      });

      return this.dataSubmissionMapper.toApiResponseArray(submissions);

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissionsForRollup',
        appId,
      });
      throw error;
    }
  }

  /**
   * Get paginated list of data submissions with optional filters
   */
  async getDataSubmissions(
    pagination: PaginationParams = { page: 1, limit: 20 },
    sort: SortParams = { sort_by: 'timestamp', sort_order: 'desc' },
    filters: DataSubmissionFilters = {},
  ): Promise<PaginatedResponse<DataSubmissionApiResponse>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_order: sortOrder = 'desc' } = sort;

      // Convert filters to repository format
      const repositoryFilters: RepositoryFilters = {};
      if (filters.app_id !== undefined) {
        repositoryFilters.appId = filters.app_id;
      }
      // Note: rollup_name filtering would need to be handled differently with joins
      if (filters.submitter) {
        repositoryFilters.submitter = filters.submitter;
      }
      if (filters.success !== undefined) {
        repositoryFilters.success = filters.success;
      }

      const { submissions, total } = await this.dataSubmissionRepository.findMany(
        repositoryFilters,
        { page, limit }
      );

      return {
        data: this.dataSubmissionMapper.toApiResponseArray(submissions),
        pagination: {
          page,
          limit,
          total_count: total,
          total_pages: Math.ceil(total / limit),
          has_next: page < Math.ceil(total / limit),
          has_prev: page > 1,
        },
      };

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissions',
      });
      throw error;
    }
  }

  /**
   * Process data submissions from a block and persist to database
   */
  async processDataSubmissionsFromBlock(blockData: BlockData): Promise<DataSubmission[]> {
    try {
      const processedSubmissions: DataSubmission[] = [];

      for (let i = 0; i < blockData.extrinsics.length; i++) {
        const extrinsicData = blockData.extrinsics[i];
        
        // Check if this extrinsic is a data submission
        if (this.isDataSubmissionExtrinsic(extrinsicData)) {
          const submissionInfo = this.extractDataSubmissionInfo(extrinsicData);
          
          // Create data submission with repository
          const submissionCreateData: DataSubmissionCreateInput = {
            extrinsicHash: extrinsicData.hash,
            blockNumber: blockData.number,
            extrinsicIndex: extrinsicData.index,
            appId: submissionInfo.appId,
            rollupName: null, // TODO: Look up rollup name from app_id
            dataSize: submissionInfo.dataSize,
            dataHash: submissionInfo.dataHash,
            submitter: submissionInfo.submitter,
            timestamp: new Date(blockData.timestamp),
            success: extrinsicData.success,
            blobData: submissionInfo.blobData || null,
            kateCommitment: submissionInfo.kateCommitment || null,
            proof: null, // TODO: Extract proof data if available
          };

          // Persist to database
          const insertedSubmission = await this.dataSubmissionRepository.create(submissionCreateData);
          processedSubmissions.push(insertedSubmission);

          // Update rollup statistics if needed
          await this.updateRollupStats(submissionInfo.appId, submissionInfo.dataSize);
        }
      }

      return processedSubmissions;

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'processDataSubmissionsFromBlock',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }

  /**
   * Get data submission statistics
   */
  async getDataSubmissionStats(): Promise<{
    totalSubmissions: number;
    totalDataSize: number;
    uniqueApps: number;
    avgDataSize: number;
    submissionsLast24h: number;
  }> {
    try {
      // Get overall stats from repository
      const totalSubmissions = await this.dataSubmissionRepository.getTotalCount();
      const totalDataSize = await this.dataSubmissionRepository.getTotalDataSize();
      const uniqueApps = await this.dataSubmissionRepository.getUniqueAppCount();
      
      // Calculate average data size
      const avgDataSize = totalSubmissions > 0 ? totalDataSize / totalSubmissions : 0;
      
      // Get submissions in last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const submissionsLast24h = await this.dataSubmissionRepository.getCountSince(yesterday);
      
      return {
        totalSubmissions,
        totalDataSize,
        uniqueApps,
        avgDataSize: Math.round(avgDataSize),
        submissionsLast24h,
      };
    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissionStats',
      });
      throw error;
    }
  }

  /**
   * Get rollup information by app ID
   */
  async getRollupInfo(appId: number): Promise<RollupApiResponse | null> {
    try {
      const rollup = await this.rollupRepository.findByAppId(appId);
      return rollup ? this.rollupMapper.toApiResponse(rollup) : null;
    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getRollupInfo',
        appId,
      });
      throw error;
    }
  }

  /**
   * Private: Check if an extrinsic is a data submission
   */
  private isDataSubmissionExtrinsic(extrinsicData: ExtrinsicData): boolean {
    // Check for common data submission methods in Avail
    const dataSubmissionMethods = [
      'dataAvailability.submitData',
      'dataAvailability.submit_data',
      'dactr.submitData',
      'dactr.submit_data',
    ];

    const methodName = `${extrinsicData.method.section}.${extrinsicData.method.method}`;
    return dataSubmissionMethods.includes(methodName);
  }

  /**
   * Private: Extract data submission information from extrinsic
   */
  private extractDataSubmissionInfo(extrinsicData: ExtrinsicData): DataSubmissionInfo {
    try {
      const args = extrinsicData.method.args;
      
      // Extract common fields from extrinsic arguments
      // Note: Field names may vary depending on the exact Avail implementation
      const appId = args.app_id || args.appId || args.application_id || 0;
      const data = args.data || args.blob || args.payload || '';
      
      // Calculate data size and hash
      const dataBuffer = Buffer.from(data, 'hex');
      const dataSize = dataBuffer.length;
      const dataHash = this.calculateDataHash(dataBuffer);

      return {
        appId: Number(appId),
        dataSize,
        dataHash,
        submitter: extrinsicData.signer || 'unknown',
        blobData: dataBuffer,
        kateCommitment: args.commitment || undefined,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'extractDataSubmissionInfo',
        extrinsicHash: extrinsicData.hash,
      });
      
      // Return default values if extraction fails
      return {
        appId: 0,
        dataSize: 0,
        dataHash: '0x',
        submitter: extrinsicData.signer || 'unknown',
      };
    }
  }

  // Conversion methods removed - now handled by dedicated mapper classes

  /**
   * Private: Calculate hash of data
   */
  private calculateDataHash(data: Buffer): string {
    import('crypto').then(crypto => {
      return '0x' + crypto.createHash('sha256').update(data).digest('hex');
    });
    // For now, return a simple hash - TODO: implement proper async crypto
    return '0x' + data.toString('hex').slice(0, 64);
  }

  /**
   * Private: Get data submission from database by extrinsic hash
   */
  private async getDataSubmissionFromDatabase(extrinsicHash: string): Promise<DataSubmission | null> {
    try {
      return await this.dataSubmissionRepository.findByExtrinsicHash(extrinsicHash);
    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissionFromDatabase',
        extrinsicHash,
      });
      throw error;
    }
  }

  /**
   * Private: Get data submissions from database by block number
   */
  private async getDataSubmissionsFromDatabaseByBlock(blockNumber: number): Promise<DataSubmission[]> {
    try {
      const { submissions } = await this.dataSubmissionRepository.findMany(
        { blockNumber }, // Filter by block number
        { page: 1, limit: 1000 }
      );
      return submissions;
    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'getDataSubmissionsFromDatabaseByBlock',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Private: Update rollup statistics
   */
  private async updateRollupStats(appId: number, dataSize: number): Promise<void> {
    try {
      // Try to increment existing rollup stats
      await this.rollupRepository.incrementStats(appId, {
        submissionsIncrement: 1,
        dataSizeIncrement: dataSize,
      });
    } catch (error) {
      // If rollup doesn't exist, create it
      await this.rollupRepository.create({
        appId,
        name: `Rollup ${appId}`, // Default name
        totalSubmissions: 1,
        totalDataSize: dataSize,
        totalFeesPaid: 0, // TODO: Calculate from extrinsic fees
      });
    }
  }
}

// Factory function for dependency injection with repositories
export const createDataAvailabilityService = (
  dataSubmissionRepository: DataSubmissionRepository,
  rollupRepository: RollupRepository,
  blockchain: AvailBlockchainService,
  dataSubmissionMapper: IDataSubmissionMapper,
  rollupMapper: IRollupMapper,
): DataAvailabilityService => {
  return new DataAvailabilityService(
    dataSubmissionRepository,
    rollupRepository,
    blockchain,
    dataSubmissionMapper,
    rollupMapper,
  );
}; 