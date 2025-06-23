// Phase 2: Dependency Management Types and Interfaces
// John's Implementation - Senior Architecture

export interface ProcessedEntity {
  id: string;
  type: string;
  data: any;
  blockNumber?: number;
  timestamp?: Date;
  dependencies?: string[];
}

export interface MissingDependency {
  entityType: string;
  entityId: string;
  requiredBy: string;
  priority: DependencyPriority;
  blockNumber?: number;
  discoveredAt: Date;
}

export enum DependencyPriority {
  CRITICAL = 1,    // System cannot function without this
  HIGH = 2,        // Significant functionality impacted
  MEDIUM = 3,      // Minor functionality impacted
  LOW = 4,         // Nice to have, minimal impact
}

export interface DependencyReport {
  entityId: string;
  missingDependencies: MissingDependency[];
  totalMissing: number;
  criticalMissing: number;
  resolutionRequired: boolean;
  estimatedResolutionTime: number;
}

export interface DependencyPriorityAnalysis {
  dependency: MissingDependency;
  impactScore: number;
  urgencyScore: number;
  resolutionComplexity: number;
  recommendedAction: 'resolve_immediately' | 'queue_for_resolution' | 'defer' | 'ignore';
}

export interface ResolutionPlan {
  planId: string;
  dependencies: MissingDependency[];
  resolutionOrder: string[];
  estimatedDuration: number;
  batchable: boolean;
  requiresManualIntervention: boolean;
  createdAt: Date;
}

export interface BlockResolution {
  blockNumber: number;
  resolved: boolean;
  blockData?: any;
  dependencies?: string[];
  resolutionTime: number;
  error?: string;
}

export interface AccountResolution {
  address: string;
  resolved: boolean;
  accountData?: any;
  balance?: string;
  nonce?: number;
  resolutionTime: number;
  error?: string;
}

export interface RollupResolution {
  appId: number;
  resolved: boolean;
  rollupData?: any;
  name?: string;
  description?: string;
  resolutionTime: number;
  error?: string;
}

export interface BatchResolution {
  batchId: string;
  totalDependencies: number;
  resolvedCount: number;
  failedCount: number;
  resolutions: (BlockResolution | AccountResolution | RollupResolution)[];
  totalTime: number;
  efficiency: number; // percentage of successful resolutions
}

// Dependency Detection Engine Interface
export interface DependencyDetectionEngine {
  detectMissingDependencies(entity: ProcessedEntity): Promise<DependencyReport>;
  analyzeDependencyImpact(dependencies: MissingDependency[]): Promise<DependencyPriorityAnalysis[]>;
  createResolutionStrategy(dependencies: DependencyPriorityAnalysis[]): Promise<ResolutionPlan>;
  validateDependency(entityType: string, entityId: string): Promise<boolean>;
}

// Missing Data Resolver Interface
export interface MissingDataResolver {
  resolveBlock(blockNumber: number): Promise<BlockResolution>;
  resolveAccount(address: string): Promise<AccountResolution>;
  resolveRollup(appId: number): Promise<RollupResolution>;
  resolveBatch(dependencies: MissingDependency[]): Promise<BatchResolution>;
  canResolve(entityType: string): boolean;
}

// Configuration Types
export interface DependencyConfig {
  detection: {
    enabled: boolean;
    scanDepth: number;
    batchSize: number;
    priority: {
      blocks: number;
      accounts: number;
      rollups: number;
    };
  };
  resolution: {
    maxConcurrentResolutions: number;
    retryAttempts: number;
    backoffStrategy: {
      baseDelay: number;
      maxDelay: number;
      exponentialFactor: number;
      jitterEnabled: boolean;
    };
    batchTimeout: number;
  };
  performance: {
    cacheEnabled: boolean;
    cacheTtl: number;
    maxMemoryUsage: string;
    metricsEnabled: boolean;
  };
}

// Metrics and Monitoring
export interface DependencyMetrics {
  detectionTime: number;
  resolutionTime: number;
  successRate: number;
  failureRate: number;
  batchEfficiency: number;
  cacheHitRate: number;
  totalDependenciesProcessed: number;
  averageResolutionTime: number;
} 