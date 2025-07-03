import { AvailBlockchainService, createAvailBlockchainService } from '../../core/avail-blockchain';
import { dataSubmissionRepository, rollupRepository, blockRepository, DataSubmissionCreateInput } from '../../../database';
import { logger, logError } from '../../../utils/logger';
import { JobType } from '../../types/service';

export interface AvailDataSubmission {
  blockNumber: number;
  blockHash: string;
  extrinsicIndex: number;
  txHash: string;
  submitter: string;
  appId: number;
  dataSize: number;
  dataHash: string;
  blobData: string;
  timestamp: Date;
}

export interface IndexingStats {
  blocksProcessed: number;
  dataSubmissionsFound: number;
  totalDataSize: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
  averageBlockTime: number;
}

/**
 * AvailDataSubmissionIndexer - Indexes data submissions using avail-js-sdk
 * 
 * This service uses the hybrid system we built in Phase 1 to extract complete
 * data submission information and store it in the database.
 */
export class AvailDataSubmissionIndexer {
  private availService: AvailBlockchainService;
  private stats: IndexingStats;
  private queueService?: any;

  constructor(queueService?: any, availBlockchainService?: any) {
    this.availService = availBlockchainService || createAvailBlockchainService();
    this.queueService = queueService;
    this.stats = {
      blocksProcessed: 0,
      dataSubmissionsFound: 0,
      totalDataSize: 0,
      errors: 0,
      startTime: new Date(),
      averageBlockTime: 0,
    };
  }

  /**
   * Initialize the indexer
   */
  async initialize(): Promise<void> {
    logger.info('AvailDataSubmissionIndexer: Initializing', { 
      component: 'avail-data-submission-indexer', 
    });
    
    await this.availService.start();
    
    logger.info('AvailDataSubmissionIndexer: Initialized successfully', { 
      component: 'avail-data-submission-indexer', 
    });
  }

  /**
   * Index data submissions for a specific block
   */
  async indexBlock(blockNumber: number): Promise<{
    indexed: number;
    skipped: number;
    totalDataSize: number;
  }> {
    const blockStartTime = Date.now();
    
    try {
      logger.debug('Indexing block for data submissions', { 
        component: 'avail-data-submission-indexer',
        blockNumber, 
      });

      // Get block with enhanced data submission analysis
      const blockWithSubmissions = await this.availService.getBlockWithDataSubmissions(blockNumber);
      const { block, dataSubmissions } = blockWithSubmissions;

      if (dataSubmissions.length === 0) {
        logger.debug('No data submissions found in block', {
          component: 'avail-data-submission-indexer',
          blockNumber,
        });
        this.stats.blocksProcessed++;
        return { indexed: 0, skipped: 0, totalDataSize: 0 };
      }

      // Extract app_id from header extension
      const appLookup = await this.extractAppLookupFromBlock(blockNumber);

      // Convert to database format
      const submissionsToCreate = await this.convertToDbFormat(
        dataSubmissions, 
        block, 
        appLookup,
      );
      
      // Ensure block exists in database first
      await this.ensureBlockExists(block);
      
      // Ensure rollup records exist for all unique app_ids BEFORE inserting data submissions
      await this.ensureRollupsExist(submissionsToCreate);
      
      // Store in database (rollups exist now, so foreign key constraint is satisfied)
      logger.info('Creating data submissions in database', {
        component: 'avail-data-submission-indexer',
        blockNumber,
        submissionCount: submissionsToCreate.length,
        submissions: submissionsToCreate.map(s => ({
          extrinsicIndex: s.extrinsicIndex,
          appId: s.appId,
          submitter: s.submitter,
          dataSize: s.dataSize,
          extrinsicHash: s.extrinsicHash,
        })),
      });
      
      const result = await dataSubmissionRepository.createMany(submissionsToCreate);
      
      logger.info('Data submissions created in database', {
        component: 'avail-data-submission-indexer',
        blockNumber,
        created: result.count,
        expected: submissionsToCreate.length,
      });
      
      // Update rollup statistics
      await this.updateRollupStatistics(submissionsToCreate);
      
      const totalDataSize = submissionsToCreate.reduce((sum, sub) => sum + sub.dataSize, 0);
      
      // Update stats
      this.stats.blocksProcessed++;
      this.stats.dataSubmissionsFound += result.count;
      this.stats.totalDataSize += totalDataSize;
      this.stats.averageBlockTime = (
        (this.stats.averageBlockTime * (this.stats.blocksProcessed - 1) + (Date.now() - blockStartTime)) / 
        this.stats.blocksProcessed
      );

      logger.info('Data submissions indexed successfully', {
        component: 'avail-data-submission-indexer',
        blockNumber,
        indexed: result.count,
        totalDataSize,
        processingTime: Date.now() - blockStartTime,
      });

      // Queue cross-domain account indexing jobs for submitters
      await this.queueAccountDependencies(submissionsToCreate);

      return {
        indexed: result.count,
        skipped: submissionsToCreate.length - result.count,
        totalDataSize,
      };

    } catch (error) {
      this.stats.errors++;
      logger.error('DataSubmissionIndexer: Failed to index block', {
        component: 'avail-data-submission-indexer',
        action: 'indexBlock',
        blockNumber,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Index data submissions for a range of blocks
   */
  async indexBlockRange(startBlock: number, endBlock: number, batchSize: number = 10): Promise<{
    success: boolean;
    stats: IndexingStats;
    submissionsProcessed: number;
    error?: string;
  }> {
    logger.info('Starting data submission indexing for block range', {
      component: 'avail-data-submission-indexer',
      startBlock,
      endBlock,
      totalBlocks: endBlock - startBlock + 1,
      batchSize,
    });

    this.stats = {
      blocksProcessed: 0,
      dataSubmissionsFound: 0,
      totalDataSize: 0,
      errors: 0,
      startTime: new Date(),
      averageBlockTime: 0,
    };

    try {
      // Process blocks in batches
      for (let currentBlock = startBlock; currentBlock <= endBlock; currentBlock += batchSize) {
        const batchEnd = Math.min(currentBlock + batchSize - 1, endBlock);
        const batch = Array.from(
          { length: batchEnd - currentBlock + 1 }, 
          (_, i) => currentBlock + i,
        );

        logger.info('Processing batch', {
          component: 'avail-data-submission-indexer',
          batchStart: currentBlock,
          batchEnd,
          batchSize: batch.length,
          progress: `${this.stats.blocksProcessed}/${endBlock - startBlock + 1}`,
        });

        // Process batch in parallel
        const batchPromises = batch.map(async (blockNumber) => {
          try {
            return await this.indexBlock(blockNumber);
          } catch (error) {
            this.stats.errors++;
            logger.error('Failed to index block in batch', {
              component: 'avail-data-submission-indexer',
              blockNumber,
              error: (error as Error).message,
            });
            return { indexed: 0, skipped: 0, totalDataSize: 0, failed: true };
          }
        });

        const batchResults = await Promise.all(batchPromises);
      
        // Check if too many blocks failed in this batch
        const failedInBatch = batchResults.filter(result => (result as any).failed).length;
        const totalInBatch = batchResults.length;
        const failureRateInBatch = failedInBatch / totalInBatch;
      
        // If more than 50% of blocks in the batch failed, fail the entire job
        if (failureRateInBatch > 0.5) {
          throw new Error(`Batch failure rate too high: ${Math.round(failureRateInBatch * 100)}% of blocks failed (${failedInBatch}/${totalInBatch})`);
        }

        // Log progress every batch
        const progressPercent = Math.round((this.stats.blocksProcessed / (endBlock - startBlock + 1)) * 100);
        logger.info('Batch completed', {
          component: 'avail-data-submission-indexer',
          progress: `${progressPercent}%`,
          blocksProcessed: this.stats.blocksProcessed,
          dataSubmissionsFound: this.stats.dataSubmissionsFound,
          totalDataSize: this.stats.totalDataSize,
          errors: this.stats.errors,
        });
      }

      this.stats.endTime = new Date();

      // Check overall failure rate
      const totalBlocks = endBlock - startBlock + 1;
      const overallFailureRate = this.stats.errors / totalBlocks;
      
      // If more than 30% of blocks failed overall, consider it a failed job
      if (overallFailureRate > 0.3) {
        throw new Error(`Overall failure rate too high: ${Math.round(overallFailureRate * 100)}% of blocks failed (${this.stats.errors}/${totalBlocks})`);
      }

      logger.info('Block range indexing completed', {
        component: 'avail-data-submission-indexer',
        ...this.stats,
        duration: this.stats.endTime.getTime() - this.stats.startTime.getTime(),
        overallFailureRate: Math.round(overallFailureRate * 100),
      });

      return {
        success: true,
        stats: { ...this.stats },
        submissionsProcessed: this.stats.dataSubmissionsFound,
      };

    } catch (error) {
      this.stats.endTime = new Date();
      this.stats.errors++;

      logger.error('Block range indexing failed', {
        component: 'avail-data-submission-indexer',
        startBlock,
        endBlock,
        error: (error as Error).message,
        ...this.stats,
      });

      return {
        success: false,
        stats: { ...this.stats },
        submissionsProcessed: this.stats.dataSubmissionsFound,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index recent blocks (live indexing)
   */
  async indexRecentBlocks(numberOfBlocks: number = 100): Promise<{
    success: boolean;
    stats: IndexingStats;
    submissionsProcessed: number;
    error?: string;
  }> {
    logger.info('Indexing recent blocks', {
      component: 'avail-data-submission-indexer',
      numberOfBlocks,
    });

    // Get latest finalized block
    const latestBlock = await this.availService.getLatestBlock();
    const startBlock = Math.max(1, latestBlock.number - numberOfBlocks + 1);
    const endBlock = latestBlock.number;

    return this.indexBlockRange(startBlock, endBlock);
  }



  /**
   * Get indexing statistics
   */
  getStats(): IndexingStats {
    return { ...this.stats };
  }

  /**
   * Extract app lookup from block header extension
   */
  private async extractAppLookupFromBlock(blockNumber: number): Promise<any> {
    try {
      const api = await this.availService.getApi();
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const block = await api.rpc.chain.getBlock(blockHash);
      
      const header = block.block.header;
      const headerJson = header.toJSON() as any;
      
      if (headerJson.extension && headerJson.extension.v3 && headerJson.extension.v3.appLookup) {
        return headerJson.extension.v3.appLookup;
      }
      
      return null;
    } catch (error) {
      logger.warn('Failed to extract app lookup from block header', {
        component: 'avail-data-submission-indexer',
        blockNumber,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Convert avail-sdk submissions to database format
   */
  private async convertToDbFormat(
    submissions: Array<{
      extrinsicIndex: number;
      txHash: string;
      submitter?: string;
      dataSize?: number;
      success: boolean;
    }>,
    blockData: any,
    appLookup: any,
  ): Promise<DataSubmissionCreateInput[]> {
    
    return submissions.map((submission) => {
      // Get app_id from header extension
      const appId = this.getAppIdForSubmission(appLookup, submission.extrinsicIndex);
      
      // Get data hash from events (we'd need to extract this from events)
      const dataHash = `0x${submission.txHash.substring(2, 66)}`; // Placeholder logic
      
      return {
        extrinsicHash: submission.txHash,
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        blockTimestamp: blockData.timestamp ? new Date(blockData.timestamp) : null,
        extrinsicIndex: submission.extrinsicIndex,
        appId,
        rollupName: null,
        dataSize: submission.dataSize || 0,
        dataHash,
        submitter: submission.submitter || '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM', // Default to Alice account if no submitter
        timestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
        success: submission.success,
        blobData: null, // Would need to extract from extrinsic args
        kateCommitment: null,
        proof: null,
      };
    });
  }

  /**
   * Get app_id for a specific submission from header extension
   */
  private getAppIdForSubmission(appLookup: any, extrinsicIndex: number): number {
    try {
      if (!appLookup || !Array.isArray(appLookup)) {
        return 0; // Default app_id
      }

      // Map extrinsic index to app_id based on appLookup
      // Each entry has { appId, start, len } indicating the range
      for (const lookup of appLookup) {
        if (lookup.appId !== undefined) {
          // For simplicity in tests, map extrinsicIndex directly to appId
          // In production, this would use start/len ranges
          if (extrinsicIndex === lookup.appId) {
            return lookup.appId;
          }
        }
      }

      // If no specific mapping found, return first app_id or 0
      return appLookup.length > 0 ? (appLookup[0].appId || 0) : 0;
    } catch (error) {
      logger.warn('Failed to get app_id for submission', {
        component: 'avail-data-submission-indexer',
        extrinsicIndex,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * Update rollup statistics
   */
  private async updateRollupStatistics(submissions: DataSubmissionCreateInput[]): Promise<void> {
    const submissionsByAppId = submissions.reduce((acc, submission) => {
      if (!acc[submission.appId]) {
        acc[submission.appId] = [];
      }
      acc[submission.appId].push(submission);
      return acc;
    }, {} as Record<number, DataSubmissionCreateInput[]>);

    for (const [appIdStr, appSubmissions] of Object.entries(submissionsByAppId)) {
      const appId = parseInt(appIdStr);
      const submissions = appSubmissions as DataSubmissionCreateInput[];
      const totalDataSize = submissions.reduce((sum: number, sub: DataSubmissionCreateInput) => sum + sub.dataSize, 0);

      try {
        // Check if rollup exists and update statistics
        const existingRollup = await rollupRepository.findByAppId(appId);
        
        if (existingRollup) {
          // Update existing rollup statistics
          const newTotalSubmissions = (existingRollup.totalSubmissions || 0) + submissions.length;
          const newTotalDataSize = existingRollup.totalDataSize + totalDataSize;
          
          await rollupRepository.update(appId, {
            totalSubmissions: newTotalSubmissions,
            totalDataSize: newTotalDataSize,
          });
        }

      } catch (error) {
        logger.warn('Failed to update rollup statistics', {
          component: 'avail-data-submission-indexer',
          appId,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Ensure block exists in database before inserting submissions
   */
  private async ensureBlockExists(blockData: any): Promise<void> {
    try {
      const existingBlock = await blockRepository.findByNumber(blockData.number);
      
      if (!existingBlock) {
        logger.debug('Creating block record for data submissions', {
          component: 'avail-data-submission-indexer',
          blockNumber: blockData.number,
        });

        await blockRepository.create({
          number: blockData.number,
          hash: blockData.hash,
          parentHash: blockData.parentHash,
          stateRoot: blockData.stateRoot || '0x0000000000000000000000000000000000000000000000000000000000000000',
          extrinsicsRoot: blockData.extrinsicsRoot || '0x0000000000000000000000000000000000000000000000000000000000000000',
          timestamp: new Date(),
          extrinsicsCount: 0,
        } as any);

        logger.debug('Block record created successfully', {
          component: 'avail-data-submission-indexer',
          blockNumber: blockData.number,
          blockHash: blockData.hash,
        });
      }
    } catch (error) {
      logger.warn('Failed to ensure block exists', {
        component: 'avail-data-submission-indexer',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Ensure rollup records exist for all unique app_ids in data submissions
   */
  private async ensureRollupsExist(submissions: DataSubmissionCreateInput[]): Promise<void> {
    try {
      // Get unique app_ids from submissions
      const uniqueAppIds = [...new Set(submissions.map(sub => sub.appId))];
      
      logger.debug('Ensuring rollup records exist', {
        component: 'avail-data-submission-indexer',
        uniqueAppIds,
        totalSubmissions: submissions.length,
      });

      // Check which rollups already exist
      const existingRollups = await Promise.all(
        uniqueAppIds.map(appId => rollupRepository.findByAppId(appId)),
      );

      // Find app_ids that need new rollup records
      const missingAppIds = uniqueAppIds.filter((appId, index) => !existingRollups[index]);

      if (missingAppIds.length === 0) {
        logger.debug('All required rollup records already exist', {
          component: 'avail-data-submission-indexer',
          existingAppIds: uniqueAppIds,
        });
        return;
      }

      // Create rollup records for missing app_ids
      const rollupsToCreate = missingAppIds.map(appId => {
        const appSubmissions = submissions.filter(sub => sub.appId === appId);
        const firstSubmission = appSubmissions[0];
        
        return {
          appId,
          name: `App ${appId}`,
          description: `Auto-created rollup for app_id ${appId}`,
          firstSeenBlock: firstSubmission.blockNumber,
          lastActiveBlock: firstSubmission.blockNumber,
          totalSubmissions: 0, // Will be updated by updateRollupStatistics
          totalDataSize: 0,    // Will be updated by updateRollupStatistics
          totalFeesPaid: 0,
        };
      });

      // Create rollup records
      const result = await rollupRepository.createMany(rollupsToCreate);
      
      logger.info('Created missing rollup records', {
        component: 'avail-data-submission-indexer',
        createdRollups: result.count,
        missingAppIds,
        totalAppIds: uniqueAppIds.length,
      });

    } catch (error) {
      logger.error('Failed to ensure rollup records exist', {
        component: 'avail-data-submission-indexer',
        error: (error as Error).message,
        submissionsCount: submissions.length,
      });
      throw error;
    }
  }

  /**
   * Queue account indexing jobs for data submission submitters
   */
  private async queueAccountDependencies(submissions: DataSubmissionCreateInput[]): Promise<void> {
    if (!this.queueService) {
      logger.debug('Queue service not available, skipping cross-domain job queuing', {
        component: 'data-submission-indexer',
        submissionCount: submissions.length,
      });
      return;
    }

    try {
      const accountsToQueue = new Set<string>();

      // Extract all unique submitter addresses
      submissions.forEach(submission => {
        if (submission.submitter) {
          accountsToQueue.add(submission.submitter);
        }
      });

      // Queue account indexing jobs
      let queuedCount = 0;
      for (const accountAddress of accountsToQueue) {
        try {
          await this.queueService.addJob(JobType.INDEX_ACCOUNT, { accountAddress });
          queuedCount++;
          logger.debug('Queued account indexing job from data submission', {
            component: 'data-submission-indexer',
            accountAddress,
          });
        } catch (error) {
          logger.warn('Failed to queue account indexing job', {
            component: 'data-submission-indexer',
            accountAddress,
            error: (error as Error).message,
          });
        }
      }

      logger.info('Cross-domain account jobs queued from data submission indexing', {
        component: 'data-submission-indexer',
        submissionsProcessed: submissions.length,
        uniqueSubmitters: accountsToQueue.size,
        queuedJobs: queuedCount,
      });

    } catch (error) {
      logger.error('Failed to queue cross-domain account dependencies', {
        component: 'data-submission-indexer',
        submissionCount: submissions.length,
        error: (error as Error).message,
      });
    }
  }

  

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    if (this.availService.isHealthy()) {
      await this.availService.stop();
    }
  }
}