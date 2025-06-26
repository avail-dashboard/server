import { logger, logError } from '../../../utils/logger';
import { AvailBlockchainService } from '../../core/avail-blockchain';
import { DataSubmissionRepository, RollupRepository } from '../../../database/repositories';
import { Rollup } from '@prisma/client';
import { SelfHealingProcessor, ExtractedEntity, DependencyResolver } from '../../types/self-healing';
import { BlockData, ExtrinsicData } from '../../types/blockchain';
import {
  IDataSubmissionProcessor,
  DataSubmissionProcessingOptions,
  DataSubmissionProcessingResult,
  DataSubmissionInfo,
} from './DataSubmissionInterfaces';

/**
 * DataSubmissionProcessor - Self-Healing Processing Logic for DataSubmission Data
 * 
 * Responsibilities:
 * - Extract data submission information from blockchain data
 * - Process data submissions with Avail SDK integration
 * - Auto-create rollups for new app IDs
 * - Ensure submitter accounts exist via dependency resolver
 * - Process data submissions independently with error isolation
 */
export class DataSubmissionProcessor implements SelfHealingProcessor, IDataSubmissionProcessor {
  private blockchain: AvailBlockchainService;
  private dataSubmissionRepository: DataSubmissionRepository;
  private rollupRepository: RollupRepository;
  private dependencyResolver: DependencyResolver;

  constructor(
    blockchain: AvailBlockchainService,
    dataSubmissionRepository: DataSubmissionRepository,
    rollupRepository: RollupRepository,
    dependencyResolver: DependencyResolver,
  ) {
    this.blockchain = blockchain;
    this.dataSubmissionRepository = dataSubmissionRepository;
    this.rollupRepository = rollupRepository;
    this.dependencyResolver = dependencyResolver;
  }

  /**
   * Extract data submission information from block data
   * Uses avail-sdk for enhanced data submission detection
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    try {
      logger.debug('DataSubmissionProcessor: Extracting data submissions from block', { 
        component: 'data-submission-processor',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      const submissions: ExtractedEntity[] = [];

      try {
        // Use avail-sdk for enhanced data submission detection
        const blockWithSubmissions = await this.blockchain.getBlockWithDataSubmissions(blockData.number);
        
        if (blockWithSubmissions?.dataSubmissions) {
          blockWithSubmissions.dataSubmissions.forEach((submission, index) => {
            const submissionData = this.extractDataSubmissionData(submission, blockData, index);
            if (submissionData) {
              submissions.push({
                type: 'data_submission',
                id: `${blockData.number}-${submissionData.extrinsicIndex || index}`,
                data: submissionData,
                dependencies: [
                  {
                    service: 'account',
                    entityType: 'account',
                    entityId: submissionData.submitter,
                    required: true,
                  },
                  {
                    service: 'rollup',
                    entityType: 'rollup',
                    entityId: submissionData.appId.toString(),
                    required: true,
                  },
                ],
              });
            }
          });
        }
      } catch (sdkError) {
        logger.warn('DataSubmissionProcessor: SDK enhanced detection failed, falling back to extrinsic parsing', {
          component: 'data-submission-processor',
          blockNumber: blockData.number,
          error: (sdkError as Error).message,
        });

        // Fallback: Parse extrinsics directly for data submissions
        blockData.extrinsics.forEach((extrinsic, index) => {
          if (this.isDataSubmissionExtrinsic(extrinsic)) {
            const submissionData = this.extractDataSubmissionFromExtrinsic(extrinsic, blockData, index);
            if (submissionData) {
              submissions.push({
                type: 'data_submission',
                id: `${blockData.number}-${index}`,
                data: submissionData,
                dependencies: [
                  {
                    service: 'account',
                    entityType: 'account',
                    entityId: submissionData.submitter,
                    required: true,
                  },
                  {
                    service: 'rollup',
                    entityType: 'rollup',
                    entityId: submissionData.appId.toString(),
                    required: true,
                  },
                ],
              });
            }
          }
        });
      }

      logger.debug('DataSubmissionProcessor: Extracted data submissions from block', { 
        component: 'data-submission-processor',
        blockNumber: blockData.number,
        submissionCount: submissions.length,
      });

      return submissions;

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'extractFromBlock',
        blockNumber: blockData.number,
      });
      return [];
    }
  }

  /**
   * Process extracted data submission entities
   * Creates data submission records after ensuring dependencies exist
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<any[]> {
    try {
      logger.debug('DataSubmissionProcessor: Processing extracted data submission entities', { 
        component: 'data-submission-processor',
        entityCount: entities.length,
      });

      const results: any[] = [];

      for (const entity of entities) {
        try {
          // Ensure dependencies exist first
          await this.ensureDependencies(entity);

          // Process the data submission
          const submission = await this.processDataSubmission(entity);
          if (submission) {
            results.push(submission);
          }

        } catch (error) {
          logError(error as Error, { 
            component: 'data-submission-processor', 
            action: 'processExtractedEntity',
            entityId: entity.id,
          });
          // Continue processing other entities
        }
      }

      logger.debug('DataSubmissionProcessor: Processed data submission entities', { 
        component: 'data-submission-processor',
        processedCount: results.length,
        totalEntities: entities.length,
      });

      return results;

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'processExtractedEntities',
      });
      return [];
    }
  }

  /**
   * Ensure data submission dependencies exist (block, submitter account and rollup)
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    try {
      // Ensure block exists first (required foreign key)
      if (entity.data.blockNumber !== undefined) {
        await this.dependencyResolver.ensureBlock(entity.data.blockNumber);
      }

      // Ensure submitter account exists
      if (entity.data.submitter) {
        await this.dependencyResolver.ensureAccount(entity.data.submitter);
      }

      // Ensure rollup exists (auto-create if needed)
      if (entity.data.appId !== undefined) {
        await this.ensureRollupExists(entity.data.appId, entity.data.blockNumber);
      }

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'ensureDependencies',
        entityId: entity.id,
      });
      throw error;
    }
  }

  /**
   * Public method for dependency resolver integration
   */
  async ensureDataSubmissionExists(extrinsicHash: string): Promise<any> {
    try {
      const submission = await this.dataSubmissionRepository.findByExtrinsicHash(extrinsicHash);
      return submission;
    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'ensureDataSubmissionExists',
        extrinsicHash,
      });
      throw error;
    }
  }

  /**
   * Process multiple data submissions with batch optimization
   */
  async processDataSubmissions(
    entities: ExtractedEntity[], 
    options: DataSubmissionProcessingOptions = {}
  ): Promise<DataSubmissionProcessingResult[]> {
    const results: DataSubmissionProcessingResult[] = [];
    
    logger.info('DataSubmissionProcessor: Processing multiple data submissions', {
      component: 'data-submission-processor',
      submissionCount: entities.length,
      skipValidation: options.skipValidation,
      ensureDependencies: options.ensureDependencies,
    });

    for (const entity of entities) {
      const startTime = Date.now();
      
      try {
        if (options.ensureDependencies !== false) {
          await this.ensureDependencies(entity);
        }
        
        const submission = await this.processDataSubmission(entity);
        
        const result: DataSubmissionProcessingResult = {
          success: true,
          extrinsicHash: entity.data.extrinsicHash,
          appId: entity.data.appId,
          dataSize: entity.data.dataSize,
          created: !!submission,
          updated: false,
          duration: Date.now() - startTime,
        };
        
        results.push(result);
        
      } catch (error) {
        const result: DataSubmissionProcessingResult = {
          success: false,
          extrinsicHash: entity.data.extrinsicHash || 'unknown',
          appId: entity.data.appId || 0,
          dataSize: entity.data.dataSize || 0,
          created: false,
          updated: false,
          duration: Date.now() - startTime,
          errors: [(error as Error).message],
        };
        
        results.push(result);
        
        logError(error as Error, {
          component: 'data-submission-processor',
          action: 'processDataSubmissions',
          entityId: entity.id,
        });
        
        // Continue processing other submissions
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    logger.info('DataSubmissionProcessor: Batch processing completed', {
      component: 'data-submission-processor',
      totalSubmissions: entities.length,
      successCount,
      failureCount,
      successRate: (successCount / entities.length) * 100,
    });

    return results;
  }

  /**
   * Helper method: Check if extrinsic is a data submission
   */
  private isDataSubmissionExtrinsic(extrinsic: ExtrinsicData): boolean {
    // Data submissions are typically dataAvailability.submitData calls
    return extrinsic.method.section === 'dataAvailability' && 
           ['submitData', 'createApplicationKey'].includes(extrinsic.method.method);
  }

  /**
   * Helper method: Extract data submission data from SDK response
   */
  private extractDataSubmissionData(submission: any, blockData: BlockData, index: number) {
    try {
      return {
        extrinsicHash: submission.txHash || submission.extrinsicHash,
        blockNumber: blockData.number,
        extrinsicIndex: submission.extrinsicIndex || index,
        appId: submission.appId || 0,
        submitter: submission.submitter || submission.signer,
        dataSize: submission.dataSize || 0,
        dataHash: submission.dataHash || '',
        success: submission.success !== false,
        timestamp: new Date(blockData.timestamp),
        blobData: submission.blobData || null,
        kateCommitment: submission.kateCommitment || null,
      };
    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'extractDataSubmissionData',
        submissionIndex: index,
      });
      return null;
    }
  }

  /**
   * Helper method: Extract data submission from extrinsic (fallback)
   */
  private extractDataSubmissionFromExtrinsic(extrinsic: ExtrinsicData, blockData: BlockData, index: number) {
    try {
      if (!extrinsic.signer) {
        return null; // No signer means invalid submission
      }

      // Extract app ID from extrinsic arguments
      let appId = 0;
      if (extrinsic.method.args.appId) {
        appId = parseInt(extrinsic.method.args.appId.toString(), 10) || 0;
      }

      // Extract data size
      let dataSize = 0;
      if (extrinsic.method.args.data) {
        const data = extrinsic.method.args.data;
        if (typeof data === 'string') {
          dataSize = Buffer.from(data, 'hex').length;
        } else if (data.length) {
          dataSize = data.length;
        }
      }

      return {
        extrinsicHash: extrinsic.hash,
        blockNumber: blockData.number,
        extrinsicIndex: index,
        appId,
        submitter: extrinsic.signer,
        dataSize,
        dataHash: '', // Would need to calculate from data
        success: extrinsic.success,
        timestamp: new Date(blockData.timestamp),
        blobData: null,
        kateCommitment: null,
      };

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'extractDataSubmissionFromExtrinsic',
        extrinsicHash: extrinsic.hash,
      });
      return null;
    }
  }

  /**
   * Helper method: Process a single data submission entity
   */
  private async processDataSubmission(entity: ExtractedEntity): Promise<any> {
    try {
      const submissionData = entity.data;

      // Check if data submission already exists
      const existing = await this.dataSubmissionRepository.findByExtrinsicHash(submissionData.extrinsicHash);
      if (existing) {
        logger.debug('DataSubmissionProcessor: Data submission already exists, skipping', {
          component: 'data-submission-processor',
          extrinsicHash: submissionData.extrinsicHash,
        });
        return existing;
      }

      // Create new data submission record
      const submission = await this.dataSubmissionRepository.create({
        extrinsicHash: submissionData.extrinsicHash,
        blockNumber: submissionData.blockNumber,
        extrinsicIndex: submissionData.extrinsicIndex,
        appId: submissionData.appId,
        submitter: submissionData.submitter,
        dataSize: submissionData.dataSize,
        dataHash: submissionData.dataHash,
        success: submissionData.success,
        timestamp: submissionData.timestamp,
        blobData: submissionData.blobData,
        kateCommitment: submissionData.kateCommitment,
      });

      logger.debug('DataSubmissionProcessor: Data submission created', {
        component: 'data-submission-processor',
        extrinsicHash: submissionData.extrinsicHash,
        appId: submissionData.appId,
        dataSize: submissionData.dataSize,
        submitter: submissionData.submitter.substring(0, 20) + '...',
      });

      return submission;

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'processDataSubmission',
        entityId: entity.id,
      });
      throw error;
    }
  }

  /**
   * Helper method: Ensure rollup exists (auto-create if needed)
   */
  private async ensureRollupExists(appId: number, blockNumber: number = 0): Promise<Rollup> {
    try {
      let rollup = await this.rollupRepository.findByAppId(appId);
      
      if (!rollup) {
        rollup = await this.rollupRepository.create({
          appId,
          name: `App ${appId}`,
          description: `Auto-created rollup for app_id ${appId}`,
          firstSeenBlock: blockNumber,
          lastActiveBlock: blockNumber,
          totalSubmissions: 0,
          totalDataSize: 0,
          totalFeesPaid: 0,
        });
        
        logger.debug('DataSubmissionProcessor: Rollup auto-created', {
          component: 'data-submission-processor',
          appId,
          blockNumber,
        });
      }

      return rollup;

    } catch (error) {
      logError(error as Error, { 
        component: 'data-submission-processor', 
        action: 'ensureRollupExists',
        appId,
      });
      throw error;
    }
  }
}

export const createDataSubmissionProcessor = (
  blockchain: AvailBlockchainService,
  dataSubmissionRepository: DataSubmissionRepository,
  rollupRepository: RollupRepository,
  dependencyResolver: DependencyResolver,
): DataSubmissionProcessor => {
  return new DataSubmissionProcessor(blockchain, dataSubmissionRepository, rollupRepository, dependencyResolver);
}; 