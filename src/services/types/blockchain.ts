// Blockchain-specific types and interfaces

export interface BlockchainConnection {
  api: any;
  provider: any;
  url: string;
  isConnected: boolean;
  lastActivity: Date;
}

export interface SubscriptionManager {
  subscriptions: Map<string, any>;
  subscribe<T>(key: string, callback: (data: T) => void): Promise<() => void>;
  unsubscribe(key: string): Promise<void>;
  unsubscribeAll(): Promise<void>;
}

export interface BlockData {
  hash: string;
  number: number;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  timestamp: number;
  validator?: string;
  extrinsics: ExtrinsicData[];
  events: EventData[];
}

export interface ExtrinsicData {
  hash: string;
  index: number;
  isSigned: boolean;
  method: {
    section: string;
    method: string;
    args: Record<string, any>;
  };
  signer?: string;
  nonce?: number;
  tip?: string;
  fee?: string;
  success: boolean;
  error?: string;
}

export interface EventData {
  index: number;
  section: string;
  method: string;
  data: any[];
  phase: {
    applyExtrinsic?: number;
    finalization?: boolean;
    initialization?: boolean;
  };
}

export interface ChainInfo {
  chain: string;
  nodeName: string;
  nodeVersion: string;
  specName: string;
  specVersion: number;
  implName: string;
  implVersion: number;
  properties: {
    ss58Format: number;
    tokenDecimals: number[];
    tokenSymbol: string[];
  };
}

export interface ValidatorInfo {
  accountId: string;
  stash: string;
  controller?: string;
  commission: string;
  blocked: boolean;
  identity?: {
    display?: string;
    legal?: string;
    web?: string;
    riot?: string;
    email?: string;
    twitter?: string;
  };
  stake: {
    total: string;
    own: string;
    others: string;
  };
  nominators: string[];
  prefs: {
    commission: number;
    blocked: boolean;
  };
}

export interface DataAvailabilityInfo {
  appId: number;
  dataLength: number;
  dataRoot: string;
  blobRoot: string;
  bridgeRoot: string;
  rows: number;
  cols: number;
  commitment: string;
}

export interface KateCommitment {
  rows: number;
  cols: number;
  commitment: string;
  dataRoot: string;
}

export interface RollupData {
  appId: number;
  name?: string;
  dataSubmissions: number;
  totalSize: number;
  totalFees: string;
  lastActive: Date;
  firstSeen: Date;
}

export interface NetworkStats {
  totalBlocks: number;
  totalExtrinsics: number;
  totalBlobSize: number;
  totalFees: string;
  averageBlockTime: number;
  finalizedBlocks: number;
  bestBlocks: number;
  totalIssuance: string;
}

export interface StakingInfo {
  totalStaked: string;
  totalValidators: number;
  activeValidators: number;
  waitingValidators: number;
  era: number;
  epoch: number;
  eraProgress: number;
  epochProgress: number;
  inflationRate: number;
  minimumStake: string;
}

// Phase 2: Dual-Mode Block Processing Types
export type BlockProcessingMode = 'legacy' | 'queue' | 'dual';

export interface PerformanceMetrics {
  processingTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  serviceBreakdown: {
    [serviceName: string]: {
      extractionTime: number;
      processingTime: number;
      entityCount: number;
      successRate: number;
    };
  };
}

export interface ProcessingResult {
  success: boolean;
  blockNumber: number;
  blockHash: string;
  duration: number;
  stats: {
    blocksProcessed: number;
    totalErrors: number;
    errorRate: number;
    serviceStats: {
      [serviceName: string]: {
        successRate: number;
        total: number;
        success: number;
      };
    };
  };
  metrics: PerformanceMetrics;
  errors?: Error[];
  mode: BlockProcessingMode;
}

export interface ComparisonResult {
  blockNumber: number;
  legacySuccess: boolean;
  queueSuccess: boolean;
  processingTimeDiff: number;
  statisticsDiff: {
    serviceSuccessRatesDiff: {
      [serviceName: string]: number;
    };
    totalErrorsDiff: number;
    blocksProcessedDiff: number;
  };
  errorsDiff: string[];
  significantDifferences: boolean;
  alertTriggered: boolean;
}

export interface BlockProcessingOrchestrationConfig {
  mode: BlockProcessingMode;
  dualModeComparisonEnabled: boolean;
  performanceLoggingEnabled: boolean;
  statisticsValidationEnabled: boolean;
  fallbackToLegacyOnError: boolean;
  primaryResult: 'legacy' | 'queue';
  comparisonThresholds: {
    processingTimeDifferencePercent: number;
    successRateDifferencePercent: number;
    errorCountDifference: number;
    memoryUsageDifferencePercent: number;
  };
  monitoring: {
    enabled: boolean;
    logComparisons: boolean;
    alertOnDifferences: boolean;
    collectMetrics: boolean;
  };
} 