import { logger, logError } from '../../utils/logger';
import { BlockchainService } from '../core/blockchain';
import { ExtrinsicRepository } from '../../database/repositories/ExtrinsicRepository';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { Extrinsic } from '../../database';
import { BlockData, ExtrinsicData } from '../types/blockchain';
import { 
  PaginatedResponse,
  PaginationParams,
  SortParams,
  ExtrinsicApiResponse,
} from '../../types/database';
import { IExtrinsicMapper } from '../../mappers';

export interface ExtrinsicFeeInfo {
  baseFee: number;
  tip: number;
  totalFee: number;
  feePerByte?: number;
}

export interface ExtrinsicWithFeeInfo extends Extrinsic {
  feeInfo: ExtrinsicFeeInfo;
}

export interface IExtrinsicService {
  processBlockExtrinsics(blockData: BlockData): Promise<Extrinsic[]>;
  getExtrinsic(hash: string): Promise<ExtrinsicApiResponse | null>;
  getExtrinsicsForBlock(blockNumber: number): Promise<ExtrinsicApiResponse[]>;
  getExtrinsics(pagination?: PaginationParams, sort?: SortParams): Promise<PaginatedResponse<ExtrinsicApiResponse>>;
  calculateFeeInfo(extrinsicData: ExtrinsicData): Promise<ExtrinsicFeeInfo>;
}

export class ExtrinsicService implements IExtrinsicService {
  private extrinsicRepository: ExtrinsicRepository;
  private blockRepository: BlockRepository;
  private blockchain: BlockchainService;
  private extrinsicMapper: IExtrinsicMapper;

  constructor(
    extrinsicRepository: ExtrinsicRepository,
    blockRepository: BlockRepository,
    blockchain: BlockchainService,
    extrinsicMapper: IExtrinsicMapper,
  ) {
    this.extrinsicRepository = extrinsicRepository;
    this.blockRepository = blockRepository;
    this.blockchain = blockchain;
    this.extrinsicMapper = extrinsicMapper;
  }

  /**
   * Process all extrinsics for a given block
   */
  async processBlockExtrinsics(blockData: BlockData): Promise<Extrinsic[]> {
    try {
      logger.info('Processing extrinsics for block', {
        component: 'extrinsic-service',
        blockNumber: blockData.number,
        extrinsicsCount: blockData.extrinsics.length,
      });

      const processedExtrinsics: Extrinsic[] = [];

      for (let i = 0; i < blockData.extrinsics.length; i++) {
        const extrinsicData = blockData.extrinsics[i];
        
        try {
          const processedExtrinsic = await this.processExtrinsic(blockData, extrinsicData, i);
          processedExtrinsics.push(processedExtrinsic);
        } catch (error) {
          logError(error as Error, {
            component: 'extrinsic-service',
            action: 'processExtrinsic',
            blockNumber: blockData.number,
            extrinsicIndex: i,
            extrinsicHash: extrinsicData.hash,
          });
          // Continue processing other extrinsics even if one fails
        }
      }

      logger.info('Completed processing extrinsics for block', {
        component: 'extrinsic-service',
        blockNumber: blockData.number,
        processedCount: processedExtrinsics.length,
        totalCount: blockData.extrinsics.length,
      });

      return processedExtrinsics;

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'processBlockExtrinsics',
        blockNumber: blockData.number,
      });
      throw error;
    }
  }

  /**
   * Get extrinsic by hash
   */
  async getExtrinsic(hash: string): Promise<ExtrinsicApiResponse | null> {
    try {
      const extrinsic = await this.extrinsicRepository.findByHash(hash);
      return extrinsic ? this.extrinsicMapper.toApiResponse(extrinsic) : null;
    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsic',
        hash,
      });
      throw error;
    }
  }

  /**
   * Get all extrinsics for a specific block
   */
  async getExtrinsicsForBlock(blockNumber: number): Promise<ExtrinsicApiResponse[]> {
    try {
      const extrinsics = await this.extrinsicRepository.findByBlock(blockNumber);
      return this.extrinsicMapper.toApiResponseArray(extrinsics);
    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'getExtrinsicsForBlock',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Get paginated list of extrinsics
   */
  async getExtrinsics(
    pagination: PaginationParams = { page: 1, limit: 20 },
    sort: SortParams = { sort_by: 'id', sort_order: 'desc' },
  ): Promise<PaginatedResponse<ExtrinsicApiResponse>> {
    try {
      const { page = 1, limit = 20 } = pagination;
      const { sort_order: sortOrder = 'desc' } = sort;

      const { extrinsics, total } = await this.extrinsicRepository.findMany({
        page,
        limit,
        orderBy: sortOrder.toLowerCase() as 'asc' | 'desc',
      });

      return {
        data: this.extrinsicMapper.toApiResponseArray(extrinsics),
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
        component: 'extrinsic-service',
        action: 'getExtrinsics',
      });
      throw error;
    }
  }

  /**
   * Calculate fee information for an extrinsic
   */
  async calculateFeeInfo(extrinsicData: ExtrinsicData): Promise<ExtrinsicFeeInfo> {
    try {
      // Extract fee components from extrinsic data
      const baseFee = extrinsicData.fee ? Number(extrinsicData.fee) : 0;
      const tip = extrinsicData.tip ? Number(extrinsicData.tip) : 0;
      const totalFee = baseFee + tip;

      // Calculate fee per byte if we have the extrinsic size
      let feePerByte: number | undefined;
      if (extrinsicData.method && totalFee > 0) {
        // Estimate extrinsic size (this is a rough approximation)
        const estimatedSize = JSON.stringify(extrinsicData.method).length;
        if (estimatedSize > 0) {
          feePerByte = totalFee / estimatedSize;
        }
      }

      return {
        baseFee,
        tip,
        totalFee,
        feePerByte,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'calculateFeeInfo',
        extrinsicHash: extrinsicData.hash,
      });

      // Return default fee info on error
      return {
        baseFee: 0,
        tip: 0,
        totalFee: 0,
      };
    }
  }

  // Conversion method removed - now handled by ExtrinsicMapper

  /**
   * Private: Process a single extrinsic
   */
  private async processExtrinsic(
    blockData: BlockData,
    extrinsicData: ExtrinsicData,
    index: number,
  ): Promise<Extrinsic> {
    try {
      // Calculate fee information
      const feeInfo = await this.calculateFeeInfo(extrinsicData);

      // Create extrinsic record
      const extrinsicRecord = await this.extrinsicRepository.create({
        hash: extrinsicData.hash,
        blockNumber: blockData.number,
        extrinsicIndex: index,
        module: extrinsicData.method.section,
        call: extrinsicData.method.method,
        success: extrinsicData.success,
        timestamp: new Date(blockData.timestamp),
        signer: extrinsicData.signer,
        fee: feeInfo.totalFee,
      });

      logger.debug('Processed extrinsic', {
        component: 'extrinsic-service',
        blockNumber: blockData.number,
        extrinsicHash: extrinsicData.hash,
        success: extrinsicData.success,
        fee: feeInfo.totalFee,
      });

      return extrinsicRecord;

    } catch (error) {
      logError(error as Error, {
        component: 'extrinsic-service',
        action: 'processExtrinsic',
        blockNumber: blockData.number,
        extrinsicHash: extrinsicData.hash,
      });
      throw error;
    }
  }
}

export const createExtrinsicService = (
  extrinsicRepository: ExtrinsicRepository,
  blockRepository: BlockRepository,
  blockchain: BlockchainService,
  extrinsicMapper: IExtrinsicMapper,
): ExtrinsicService => {
  return new ExtrinsicService(extrinsicRepository, blockRepository, blockchain, extrinsicMapper);
}; 