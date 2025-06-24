// Phase 2: Basic Dependency Types (Simplified)
// Complex dependency management services removed - now using queue-based approach

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

// Basic configuration for queue-based dependency handling
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
}

// Basic metrics for monitoring
export interface DependencyMetrics {
  detectionTime: number;
  resolutionTime: number;
  successRate: number;
  failureRate: number;
  totalDependenciesProcessed: number;
  averageResolutionTime: number;
} 