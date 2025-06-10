import { logger, logError } from '../../utils/logger';
import db from '../../utils/database';
import { BlockchainService } from '../core/blockchain';
import { 
  DataSubmission, 
  Rollup,
  PaginatedResponse,
  PaginationParams,
  SortParams,
  DataSubmissionFilters,
} from '../../types/database';
import { ExtrinsicData, BlockData } from '../types/blockchain';

export interface IDataAvailabilityService {
  getDataSubmission(extrinsicHash: string): Promise<DataSubmission | null>;
  getDataSubmissionsForBlock(blockNumber: number): Promise<DataSubmission[]>;
  getDataSubmissionsForRollup(appId: number): Promise<DataSubmission[]>;
  getDataSubmissions(
    pagination?: PaginationParams, 
    sort?: SortParams, 
    filters?: DataSubmissionFilters
  ): Promise<PaginatedResponse<DataSubmission>>;
  processDataSubmissionsFromBlock(blockData: BlockData): Promise<DataSubmission[]>;
  getRollupInfo(appId: number): Promise<Rollup | null>;
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
  private db: typeof db;
  private blockchain: BlockchainService;

  constructor(database: typeof db, blockchain: BlockchainService) {
    this.db = database;
    this.blockchain = blockchain;
  }

  /**
   * Get data submission by extrinsic hash
   * Pattern: Check database first, then fetch from blockchain if needed
   */
  async getDataSubmission(extrinsicHash: string): Promise<DataSubmission | null> {
    try {
      // Step 1: Check database first
      const existingSubmission = await this.getDataSubmissionFromDatabase(extrinsicHash);
      if (existingSubmission) {
        logger.info('Data submission found in database', { 
          component: 'data-availability-service',
          extrinsicHash,
          source: 'database',
        });
        return existingSubmission;
      }

      // Step 2: If not in database, we need to process the block containing this extrinsic
      logger.info('Data submission not found in database', {
        component: 'data-availability-service',
        extrinsicHash,
        source: 'blockchain',
      });

      // For now, return null - in a real implementation, we'd need to find the block
      // and process it to extract the data submission
      return null;

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
   * Get all data submissions for a specific block
   */
  async getDataSubmissionsForBlock(blockNumber: number): Promise<DataSubmission[]> {
    try {
      // Step 1: Check database first
      const existingSubmissions = await this.getDataSubmissionsFromDatabaseByBlock(blockNumber);
      if (existingSubmissions.length > 0) {
        logger.info('Data submissions found in database for block', { 
          component: 'data-availability-service',
          blockNumber,
          count: existingSubmissions.length,
          source: 'database',
        });
        return existingSubmissions;
      }

      // Step 2: Fetch block from blockchain and process data submissions
      logger.info('Data submissions not found in database, fetching block from blockchain', {
        component: 'data-availability-service',
        blockNumber,
        source: 'blockchain',
      });

      const blockData = await this.blockchain.getBlock(blockNumber);
      const processedSubmissions = await this.processDataSubmissionsFromBlock(blockData);
      
      logger.info('Data submissions processed and persisted for block', {
        component: 'data-availability-service',
        blockNumber,
        count: processedSubmissions.length,
      });

      return processedSubmissions;

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
  async getDataSubmissionsForRollup(appId: number): Promise<DataSubmission[]> {
    try {
      const submissions = await this.db.findMany<DataSubmission>(
        'data_submissions',
        { app_id: appId },
        { orderBy: 'timestamp', order: 'DESC' },
      );

      logger.info('Data submissions retrieved for rollup', {
        component: 'data-availability-service',
        appId,
        count: submissions.length,
      });

      return submissions;

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
  ): Promise<PaginatedResponse<DataSubmission>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_by: sortBy = 'timestamp', sort_order: sortOrder = 'desc' } = sort;

      // Build where clause from filters
      const whereClause: Record<string, any> = {};
      if (filters.app_id !== undefined) {
        whereClause.app_id = filters.app_id;
      }
      if (filters.rollup_name) {
        whereClause.rollup_name = filters.rollup_name;
      }
      if (filters.submitter) {
        whereClause.submitter = filters.submitter;
      }
      if (filters.success !== undefined) {
        whereClause.success = filters.success;
      }

      const result = await this.db.paginate<DataSubmission>(
        'data_submissions',
        page,
        limit,
        Object.keys(whereClause).length > 0 ? whereClause : undefined,
        sortBy,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );

      return {
        data: result.data,
        pagination: {
          page: result.meta.page,
          limit: result.meta.limit,
          total_count: result.meta.total,
          total_pages: result.meta.totalPages,
          has_next: result.meta.page < result.meta.totalPages,
          has_prev: result.meta.page > 1,
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
          
          // Create data submission record
          const submissionRecord: Omit<DataSubmission, 'id' | 'created_at'> = {
            extrinsic_hash: extrinsicData.hash,
            block_number: BigInt(blockData.number),
            extrinsic_index: extrinsicData.index,
            app_id: submissionInfo.appId,
            rollup_name: undefined, // TODO: Look up rollup name from app_id
            data_size: BigInt(submissionInfo.dataSize),
            data_hash: submissionInfo.dataHash,
            submitter: submissionInfo.submitter,
            timestamp: BigInt(blockData.timestamp),
            success: extrinsicData.success,
            blob_data: submissionInfo.blobData,
            kate_commitment: submissionInfo.kateCommitment,
            proof: undefined, // TODO: Extract proof data if available
          };

          // Persist to database
          const insertedSubmission = await this.db.insert<DataSubmission>('data_submissions', submissionRecord);
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
   * Get rollup information by app ID
   */
  async getRollupInfo(appId: number): Promise<Rollup | null> {
    try {
      const rollup = await this.db.findOne<Rollup>('rollups', { app_id: appId });
      return rollup;
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
      return await this.db.findOne<DataSubmission>('data_submissions', { extrinsic_hash: extrinsicHash });
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
      return await this.db.findMany<DataSubmission>(
        'data_submissions',
        { block_number: blockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );
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
      // Check if rollup exists
      const rollup = await this.db.findOne<Rollup>('rollups', { app_id: appId });
      
      if (rollup) {
        // Update existing rollup stats
        await this.db.update<Rollup>(
          'rollups',
          {
            total_submissions: rollup.total_submissions + 1,
            total_data_size: rollup.total_data_size + BigInt(dataSize),
            last_active_block: undefined, // TODO: Set current block number
            updated_at: new Date(),
          },
          { app_id: appId },
        );
      } else {
        // Create new rollup entry
        const newRollup: Omit<Rollup, 'created_at' | 'updated_at'> = {
          app_id: appId,
          name: `App ${appId}`, // Default name, can be updated later
          description: undefined,
          first_seen_block: undefined, // TODO: Set current block number
          last_active_block: undefined, // TODO: Set current block number
          total_submissions: 1,
          total_data_size: BigInt(dataSize),
          total_fees_paid: BigInt(0), // TODO: Calculate from extrinsic fees
          website: undefined,
          logo_url: undefined,
        };

        await this.db.insert<Rollup>('rollups', newRollup);
      }
    } catch (error) {
      logError(error as Error, {
        component: 'data-availability-service',
        action: 'updateRollupStats',
        appId,
      });
      // Don't throw error here to avoid failing the main data submission processing
    }
  }
}

// Factory function for dependency injection
export const createDataAvailabilityService = (database: typeof db, blockchain: BlockchainService): DataAvailabilityService => {
  return new DataAvailabilityService(database, blockchain);
}; 