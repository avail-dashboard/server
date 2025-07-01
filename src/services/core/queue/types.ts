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

// Phase 2: Domain indexing job data interfaces
export interface ValidatorIndexingJobData {
  validatorId: string;
  _correlationId?: string;
}

export interface AccountIndexingJobData {
  accountAddress: string;
  _correlationId?: string;
}

export interface TransferIndexingJobData {
  blockNumber: number;
  transferIds: string[];
  _correlationId?: string;
}

export interface DataSubmissionIndexingJobData {
  startBlock: number;
  endBlock: number;
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