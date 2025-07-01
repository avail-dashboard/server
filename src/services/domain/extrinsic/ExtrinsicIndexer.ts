import { logger, logError } from '../../../utils/logger';
import { ExtrinsicRepository } from '../../../database/repositories/ExtrinsicRepository';
import { ExtrinsicService } from './ExtrinsicApiService';

/**
 * ExtrinsicIndexer - Domain-specific extrinsic processing
 * 
 * Responsibilities:
 * - Process extrinsics from block data
 * - Store extrinsic records with proper relationships
 * - Handle extrinsic-specific business logic
 * - Return indexing results with success/error status
 */

export interface IExtrinsicIndexer {
  indexBlockExtrinsics(blockData: any): Promise<ExtrinsicIndexingResult>;
}

export interface ExtrinsicIndexingResult {
  extrinsics: any[];
  success: boolean;
  error?: string;
  processedCount: number;
}

export class ExtrinsicIndexer implements IExtrinsicIndexer {
  private extrinsicRepository: ExtrinsicRepository;
  private extrinsicService: ExtrinsicService;

  constructor(
    extrinsicRepository: ExtrinsicRepository,
    extrinsicService: ExtrinsicService,
  ) {
    this.extrinsicRepository = extrinsicRepository;
    this.extrinsicService = extrinsicService;
  }

  /**
   * Index all extrinsics from a block
   */
  async indexBlockExtrinsics(blockData: any): Promise<ExtrinsicIndexingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing block extrinsics', {
        component: 'extrinsic-indexer',
        action: 'indexBlockExtrinsics',
        blockNumber: blockData.number,
        extrinsicsCount: blockData.extrinsics?.length || 0,
      });

      // Use existing ExtrinsicService domain logic
      const processedExtrinsics = await this.extrinsicService.processBlockExtrinsics(blockData);
      
      const duration = Date.now() - startTime;
      
      logger.info('Block extrinsics indexed successfully', {
        component: 'extrinsic-indexer',
        action: 'indexBlockExtrinsics',
        blockNumber: blockData.number,
        processedCount: processedExtrinsics.length,
        duration,
      });

      return {
        extrinsics: processedExtrinsics,
        success: true,
        processedCount: processedExtrinsics.length,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'extrinsic-indexer',
        action: 'indexBlockExtrinsics',
        blockNumber: blockData.number,
        duration,
      });

      return {
        extrinsics: [],
        success: false,
        error: (error as Error).message,
        processedCount: 0,
      };
    }
  }
}

/**
 * Factory function to create ExtrinsicIndexer instance
 */
export const createExtrinsicIndexer = (
  extrinsicRepository: ExtrinsicRepository,
  extrinsicService: ExtrinsicService,
): ExtrinsicIndexer => {
  return new ExtrinsicIndexer(extrinsicRepository, extrinsicService);
};