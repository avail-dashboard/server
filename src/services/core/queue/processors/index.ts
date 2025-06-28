import { Job } from 'bull';
import { JobType, JobPriority } from '../../../types/service';
import { CoreProcessors } from './core-processors';
import { JobProcessorDependencies } from '../types';
import { logger } from '../../../../utils/logger';
import { createDeadLetterProcessor } from './dead-letter-processor';

/**
 * Job Processor Registry
 * 
 * Centralized registry for all job processors with clean separation of concerns:
 * - Core processors: Essential blockchain operations
 * - Dependency processors: Entity dependency management  
 * - Analytics processors: Statistics and reporting
 */
export class JobProcessorRegistry {
  private coreProcessors: CoreProcessors;
  private deadLetterProcessor: any;
  private processors: Map<string, (job: Job) => Promise<any>> = new Map();

  constructor(
    private dependencies: JobProcessorDependencies,
    private getService: <T>(serviceName: string) => Promise<T>,
    private addJob: <T>(type: string, data: T, options?: any) => Promise<any>,
  ) {
    logger.info('🔧 PROCESSOR_REGISTRY: Initializing job processor registry', {
      component: 'processor-registry',
      operation: 'constructor',
      availableDependencies: Object.keys(dependencies),
    });
    
    this.coreProcessors = new CoreProcessors(dependencies, getService);
    this.deadLetterProcessor = createDeadLetterProcessor(getService);
    this.setupProcessors();
    
    logger.info('✅ PROCESSOR_REGISTRY: Job processor registry initialized', {
      component: 'processor-registry',
      operation: 'constructor',
      totalProcessors: this.processors.size,
      registeredTypes: Array.from(this.processors.keys()),
    });
  }

  private setupProcessors(): void {
    logger.debug('🔧 PROCESSOR_REGISTRY: Setting up processors', {
      component: 'processor-registry',
      operation: 'setupProcessors',
    });

    // ==================== Core Processors ====================
    this.processors.set(JobType.BLOCK_INDEXING, (job: Job) => 
      this.coreProcessors.processBlockIndexing(job),
    );

    this.processors.set(JobType.DATA_SYNC, (job: Job) => 
      this.coreProcessors.processDataSync(job),
    );

    this.processors.set(JobType.HEALTH_CHECK, (job: Job) => 
      this.coreProcessors.processHealthCheck(job),
    );



    // ==================== Phase 2: Domain Indexing Processors ====================
    this.processors.set(JobType.INDEX_VALIDATOR, (job: Job) =>
      this.coreProcessors.processValidatorIndexing(job),
    );

    this.processors.set(JobType.INDEX_ACCOUNT, (job: Job) =>
      this.coreProcessors.processAccountIndexing(job),
    );

    this.processors.set(JobType.INDEX_TRANSFER, (job: Job) =>
      this.coreProcessors.processTransferIndexing(job),
    );

    this.processors.set(JobType.INDEX_DATA_SUBMISSION, (job: Job) =>
      this.coreProcessors.processDataSubmissionIndexing(job),
    );

    // ==================== Phase 3: Enhanced Queue Features ====================
    // Dead Letter Queue processor for failed block processing jobs
    this.processors.set('FAILED_BLOCK_DOMAINS', (job: Job) =>
      this.deadLetterProcessor.processFailedBlockDomains(job),
    );

    // ==================== TODO Processors (Stubs) ====================
    this.processors.set(JobType.EXTRINSIC_PROCESSING, async (_job: Job) => {
      return { success: true, message: 'Extrinsic processing completed' };
    });

    this.processors.set(JobType.ANALYTICS_CALCULATION, async (_job: Job) => {
      return { success: true, message: 'Analytics calculation completed' };
    });

    this.processors.set(JobType.ROLLUP_STATISTICS, async (_job: Job) => {
      return { success: true, message: 'Rollup statistics completed' };
    });

    // ==================== Dependency Processors ====================
    // TODO: Extract these to dependency-processors.ts for better organization
    this.setupDependencyProcessors();
    this.setupEnsureProcessors();
  }

  private setupDependencyProcessors(): void {
    // DEPENDENCY_DETECTION processor - Simplified
    this.processors.set(JobType.DEPENDENCY_DETECTION, async (job: Job) => {
      const { entityType, entityId, priority = 1 } = job.data;
      let dependenciesQueued = 0;
      
      logger.debug('🔧 PROCESSOR: Processing dependency detection', {
        component: 'dependency-detection-processor',
        jobId: job.id,
        entityType,
        entityId,
        priority,
      });
      
      // Simple dependency validation
      if (entityType === 'block' && parseInt(entityId, 10) > 0) {
        const blockService = await this.getService<any>('blockService');
        const parentBlockNumber = parseInt(entityId, 10) - 1;
        const parentBlock = await blockService.getBlockByNumber(parentBlockNumber);
        if (!parentBlock) {
          await this.addJob(JobType.ENSURE_BLOCK, { blockNumber: parentBlockNumber }, { priority: JobPriority.CRITICAL });
          dependenciesQueued++;
          throw new Error(`Parent block ${parentBlockNumber} not found - queued for creation`);
        }
      }
      
      return {
        success: true,
        data: { entityType, entityId, dependenciesQueued },
      };
    });

    // DEPENDENCY_RESOLUTION processor - Simplified
    this.processors.set(JobType.DEPENDENCY_RESOLUTION, async (job: Job) => {
      const { dependencyType, dependencyId } = job.data;
      
      // Route to appropriate ENSURE_* job
      switch (dependencyType) {
      case 'block':
        await this.addJob(JobType.ENSURE_BLOCK, { blockNumber: parseInt(dependencyId, 10) }, { priority: JobPriority.CRITICAL });
        break;
      case 'account':
        await this.addJob(JobType.ENSURE_ACCOUNT, { address: dependencyId }, { priority: JobPriority.HIGH });
        break;
      case 'validator':
        await this.addJob(JobType.ENSURE_VALIDATOR, { address: dependencyId }, { priority: JobPriority.HIGH });
        break;
      case 'rollup':
        await this.addJob(JobType.ENSURE_ROLLUP, { appId: parseInt(dependencyId, 10) }, { priority: JobPriority.MEDIUM });
        break;
      default:
        throw new Error(`Unsupported dependency type: ${dependencyType}`);
      }
      
      return { success: true, data: { dependencyType, dependencyId, status: 'ensure_job_queued' } };
    });

    // DEPENDENCY_BATCH_RESOLUTION processor - Simplified
    this.processors.set(JobType.DEPENDENCY_BATCH_RESOLUTION, async (job: Job) => {
      const { dependencies } = job.data;
      
      // Process batch dependencies
      const missingDataResolver = await this.getService<any>('missingDataResolver');
      const missingDependencies = dependencies.map((dep: any) => ({
        entityType: dep.dependencyType,
        entityId: dep.dependencyId,
        requiredBy: dep.entityId,
        priority: 2,
        discoveredAt: new Date(),
      }));
      
      const batchResolution = await missingDataResolver.resolveBatch(missingDependencies);
      
      return {
        success: batchResolution.resolvedCount > 0,
        data: { batchResolution, processedCount: dependencies.length },
      };
    });
  }

  private setupEnsureProcessors(): void {
    // ENSURE_BLOCK processor
    this.processors.set(JobType.ENSURE_BLOCK, async (job: Job) => {
      const { blockNumber } = job.data;
      const blockService = await this.getService<any>('blockService');
      const blockchain = await this.getService<any>('availBlockchain');
      
      // Check if block already exists
      const existingBlock = await blockService.getBlockByNumber(blockNumber);
      if (existingBlock) {
        return { success: true, created: false, message: 'Block already exists' };
      }
      
      // Fetch and create
      const blockData = await blockchain.getBlockByNumber(blockNumber);
      if (blockData) {
        await blockService.createBlock(blockData);
        return { success: true, created: true, blockData };
      } else {
        throw new Error(`Block ${blockNumber} not found on blockchain`);
      }
    });

    // ENSURE_ACCOUNT processor
    this.processors.set(JobType.ENSURE_ACCOUNT, async (job: Job) => {
      const { address } = job.data;
      const accountService = await this.getService<any>('accountService');
      const blockchain = await this.getService<any>('availBlockchain');
      
      const existingAccount = await accountService.getAccount(address);
      if (existingAccount) {
        return { success: true, created: false, message: 'Account already exists' };
      }
      
      const accountData = await blockchain.getAccount(address).catch(() => null);
      await accountService.createAccount({
        address,
        balance: accountData?.balance || '0',
        nonce: accountData?.nonce || 0,
        createdAt: new Date(),
      });
      
      return { success: true, created: true, accountData };
    });

    // ENSURE_ROLLUP processor  
    this.processors.set(JobType.ENSURE_ROLLUP, async (job: Job) => {
      const { appId } = job.data;
      const dataAvailabilityService = await this.getService<any>('dataAvailabilityService');
      const blockchain = await this.getService<any>('availBlockchain');
      
      const existingRollup = await dataAvailabilityService.getRollupInfo(appId);
      if (existingRollup) {
        return { success: true, created: false, message: 'Rollup already exists' };
      }
      
      const rollupData = await blockchain.getRollupInfo(appId).catch(() => null);
      await dataAvailabilityService.createRollup({
        appId,
        name: rollupData?.name || `Rollup ${appId}`,
        description: rollupData?.description || 'Auto-created rollup',
        createdAt: new Date(),
      });
      
      return { success: true, created: true, rollupData };
    });

    // ENSURE_VALIDATOR processor
    this.processors.set(JobType.ENSURE_VALIDATOR, async (job: Job) => {
      const { address } = job.data;
      const validatorService = await this.getService<any>('validatorService');
      const blockchain = await this.getService<any>('availBlockchain');
      
      const existingValidator = await validatorService.getValidator(address);
      if (existingValidator) {
        return { success: true, created: false, message: 'Validator already exists' };
      }
      
      const validatorData = await blockchain.getValidator(address).catch(() => null);
      if (validatorData) {
        await validatorService.createValidator(validatorData);
      } else {
        await validatorService.createValidator({
          address,
          isActive: false,
          createdAt: new Date(),
        });
      }
      
      return { success: true, created: true, validatorData };
    });
  }

  /**
   * Get processor for job type
   */
  getProcessor(jobType: string): ((job: Job) => Promise<any>) | undefined {
    return this.processors.get(jobType);
  }

  /**
   * Get all registered processor types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Get processor count
   */
  getProcessorCount(): number {
    return this.processors.size;
  }
}