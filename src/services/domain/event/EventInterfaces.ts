import { 
  PaginatedResponse,
  PaginationParams,
  SortParams 
} from '../../../types/database';

// ==========================================
// EVENT CORE INTERFACES
// ==========================================

export interface EventFilters {
  blockNumber?: number;
  extrinsicIndex?: number;
  module?: string;
  eventName?: string;
  phaseType?: 'ApplyExtrinsic' | 'Finalization' | 'Initialization';
  fromDate?: Date;
  toDate?: Date;
}

export interface EventData {
  id?: number;
  blockNumber: number;
  extrinsicIndex?: number;
  eventIndex: number;
  module: string;
  eventName: string;
  data: any[];
  phase: EventPhase;
  phaseType?: string;
  methodObject?: any;
  eventOrder?: number;
  timestamp?: Date;
}

export interface EventPhase {
  applyExtrinsic?: number;
  finalization?: boolean;
  initialization?: boolean;
}

export interface EventApiResponse {
  id: number;
  blockNumber: number;
  extrinsicIndex?: number;
  eventIndex: number;
  module: string;
  eventName: string;
  data: any[];
  phase: EventPhase;
  phaseType: string;
  timestamp: string;
  createdAt: string;
}

// ==========================================
// EVENT PROCESSING INTERFACES
// ==========================================

export interface ProcessedEventData {
  transfers: TransferEventData[];
  stakingRewards: StakingRewardEventData[];
  dataSubmissions: DataSubmissionEventData[];
  systemEvents: SystemEventData[];
  other: EventData[];
}

export interface TransferEventData extends EventData {
  fromAddress: string;
  toAddress: string;
  amount: string;
}

export interface StakingRewardEventData extends EventData {
  validatorAddress: string;
  nominatorAddress?: string;
  amount: string;
  era?: number;
  rewardType: 'validator' | 'nominator' | 'slash';
}

export interface DataSubmissionEventData extends EventData {
  submitter: string;
  appId: number;
  dataHash?: string;
  size?: number;
}

export interface SystemEventData extends EventData {
  severity: 'info' | 'warning' | 'error';
  description: string;
}

// ==========================================
// EVENT INDEXING INTERFACES
// ==========================================

export interface EventIndexingResult {
  success: boolean;
  processedCount: number;
  transferEvents: number;
  stakingEvents: number;
  dataSubmissionEvents: number;
  systemEvents: number;
  otherEvents: number;
  error?: string;
}

export interface IEventIndexer {
  indexBlockEvents(blockData: any): Promise<EventIndexingResult>;
  indexEventRange(fromBlock: number, toBlock: number): Promise<EventIndexingResult>;
}

// ==========================================
// EVENT API SERVICE INTERFACES
// ==========================================

export interface IEventApiService {
  getEvent(id: number): Promise<EventApiResponse | null>;
  getEventsForBlock(blockNumber: number): Promise<EventApiResponse[]>;
  getEventsForExtrinsic(blockNumber: number, extrinsicIndex: number): Promise<EventApiResponse[]>;
  getEvents(
    pagination?: PaginationParams,
    sort?: SortParams,
    filters?: EventFilters
  ): Promise<PaginatedResponse<EventApiResponse>>;
  getEventsByModule(module: string, pagination?: PaginationParams): Promise<PaginatedResponse<EventApiResponse>>;
  getTransferEvents(pagination?: PaginationParams): Promise<PaginatedResponse<EventApiResponse>>;
  getStakingEvents(pagination?: PaginationParams): Promise<PaginatedResponse<EventApiResponse>>;
  getEventStatistics(): Promise<EventStatistics>;
}

export interface EventStatistics {
  totalEvents: number;
  totalTransferEvents: number;
  totalStakingEvents: number;
  totalDataSubmissionEvents: number;
  totalSystemEvents: number;
  eventsByModule: Record<string, number>;
  eventsLast24h: number;
  averageEventsPerBlock: number;
}

// ==========================================
// EVENT PROCESSOR INTERFACES
// ==========================================

export interface IEventProcessor {
  processBlockEvents(blockData: any): Promise<ProcessedEventData>;
  categorizeEvent(event: EventData): 'transfer' | 'staking' | 'dataSubmission' | 'system' | 'other';
  extractTransferData(event: EventData): TransferEventData | null;
  extractStakingRewardData(event: EventData): StakingRewardEventData | null;
  extractDataSubmissionData(event: EventData): DataSubmissionEventData | null;
}

// ==========================================
// EVENT ANALYTICS INTERFACES
// ==========================================

export interface EventAnalytics {
  blockNumber: number;
  timestamp: Date;
  totalEvents: number;
  transferEvents: number;
  stakingEvents: number;
  dataSubmissionEvents: number;
  systemEvents: number;
  otherEvents: number;
}

export interface EventTrends {
  period: '1h' | '1d' | '7d' | '30d';
  eventCounts: EventAnalytics[];
  growthRate: number;
  mostActiveModules: Array<{
    module: string;
    eventCount: number;
    percentage: number;
  }>;
}

// Event domain interfaces placeholder
