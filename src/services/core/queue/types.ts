// Queue Job Data Types and Interfaces

export interface JobProcessorDependencies {
  selfHealingBlockProcessor?: any;
  analyticsService?: any;
  blockService?: any;
  serviceFactory?: any;
  // Phase 2: Dependency Management Services - Removed (using queue-based approach)
}

export interface ErrorClassification {
  isRetryable: boolean;
  retryDelay?: number;
  category: 'network' | 'service' | 'data' | 'system';
  alertLevel: 'low' | 'medium' | 'high' | 'critical';
}



// Phase 2: Dependency Job Data Interfaces - Adam's Implementation
export interface DependencyDetectionJobData {
  entityType: 'block' | 'account' | 'rollup' | 'validator';
  entityId: string;
  priority?: number;
}

export interface DependencyResolutionJobData {
  dependencyType: string;
  dependencyId: string;
  entityType: string;
  entityId: string;
  priority: number;
}

export interface DependencyBatchResolutionJobData {
  dependencies: Array<{
    dependencyType: string;
    dependencyId: string;
    entityType: string;
    entityId: string;
  }>;
  batchSize?: number;
}

// Core Job Data Interfaces
export interface BlockRangeIndexingJobData {
  startBlock: number;
  endBlock: number;
  batchIndex: number;
  totalBatches: number;
}

export interface BlockIndexingJobData {
  blockNumber: number;
}

// Base job data interface - all jobs inherit from this
export interface BaseJobData {
  blockNumber?: number;
  blockHash?: string;
  _correlationId?: string;
}

// Specific entity job data interfaces
export interface ValidatorIndexingJobData extends BaseJobData {
  validatorAddress: string; // Consistent naming: {entity}Address
}

export interface AccountIndexingJobData extends BaseJobData {
  accountAddress: string;
}

export interface TransferIndexingJobData extends BaseJobData {
  transferId?: string; // For specific transfer processing
  blockNumber: number; // Always required for transfers
}

export interface DataSubmissionIndexingJobData extends BaseJobData {
  blockNumber: number; // Process single block at a time for consistency
}

export interface ExtrinsicIndexingJobData extends BaseJobData {
  blockNumber: number; // Process single block's extrinsics
}

// Block range processing should be separate job type
export interface BlockRangeProcessingJobData {
  startBlock: number;
  endBlock: number;
  batchSize?: number;
  _correlationId?: string;
}

export interface EnsureBlockJobData {
  blockNumber: number;
}

export interface EnsureAccountJobData {
  address: string;
}

export interface EnsureRollupJobData {
  appId: number;
}

export interface EnsureValidatorJobData {
  address: string;
}

export interface EventIndexingJobData {
  blockNumber: number;
  eventIds: string[];
  _correlationId?: string;
}

export interface EraIndexingJobData {
  eraIndex: number;
  _correlationId?: string;
}