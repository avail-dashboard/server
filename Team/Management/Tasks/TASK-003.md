# TASK-003: Job Processor Implementation

## Assignment Details
- **Assigned to**: Adam
- **Priority**: High
- **Estimated Time**: 2-3 days
- **Deadline**: 3 days from assignment
- **Type**: Implementation
- **Prerequisites**: TASK-001 ✅, TASK-002 ✅ (Interface & Dead Letter Queue)

## Background
The QueueService currently has placeholder job processors (mostly TODO stubs). With your excellent queue architecture foundation from TASK-001 and TASK-002, it's time to implement actual job processing logic that connects to our existing services. This will bridge the gap between queue infrastructure and business logic.

## Task Description
Implement actual job processing logic for the main job types, connecting the queue system to existing domain services and establishing patterns for reliable job execution.

## Requirements

### 1. Implement Core Job Processors
Replace TODO stubs with actual implementations for:

#### A. DATA_SYNC Processor (Priority: Critical)
```typescript
// Connect to SyncService and SelfHealingBlockProcessor
this.jobProcessors.set(JobType.DATA_SYNC, async (job: Job) => {
  const { startBlock, endBlock, batchIndex, totalBatches } = job.data;
  
  // Implement actual sync logic:
  // 1. Get SelfHealingBlockProcessor from ServiceFactory
  // 2. Process block range with error handling
  // 3. Return meaningful result with metrics
  // 4. Handle dependencies and missing data gracefully
});
```

#### B. BLOCK_INDEXING Processor (Priority: High)
```typescript
// Connect to BlockService and existing processors
this.jobProcessors.set(JobType.BLOCK_INDEXING, async (job: Job) => {
  const { blockNumber, priority } = job.data;
  
  // Implement block indexing:
  // 1. Fetch block data from blockchain
  // 2. Process block through self-healing processors
  // 3. Handle block dependencies
  // 4. Return processing results
});
```

#### C. ANALYTICS_CALCULATION Processor (Priority: Medium)
```typescript
// Connect to AnalyticsService
this.jobProcessors.set(JobType.ANALYTICS_CALCULATION, async (job: Job) => {
  const { type, timeframe, data } = job.data;
  
  // Implement analytics processing:
  // 1. Get AnalyticsService from ServiceFactory
  // 2. Calculate metrics based on type
  // 3. Store results appropriately
  // 4. Return calculation summary
});
```

### 2. Service Integration Pattern
Create a clean pattern for accessing services from job processors:

```typescript
interface JobProcessorContext {
  syncService: SyncService;
  selfHealingBlockProcessor: SelfHealingBlockProcessor;
  analyticsService: AnalyticsService;
  availBlockchain: AvailBlockchainService;
}

class QueueService {
  private processorContext: JobProcessorContext;
  
  constructor(processorContext: JobProcessorContext) {
    this.processorContext = processorContext;
    this.setupJobProcessors();
  }
}
```

### 3. Enhanced Error Handling & Results
Implement comprehensive job results:

```typescript
interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  metrics?: {
    itemsProcessed: number;
    itemsSkipped: number;
    itemsFailed: number;
  };
  retryable?: boolean; // Hint for retry logic
}
```

### 4. Job Progress Tracking
Add progress reporting for long-running jobs:

```typescript
interface JobProgress {
  jobId: string;
  stage: string;
  progress: number; // 0-100
  message: string;
  startedAt: Date;
  estimatedCompletion?: Date;
}
```

## Files to Modify

### Primary Files
- `src/services/core/queue.ts` (job processors section)
- `src/services/types/service.ts` (add JobResult, JobProgress interfaces)

### Integration Points
- `src/services/index.ts` (ServiceFactory integration)
- `src/services/core/sync.ts` (connect to DATA_SYNC jobs)

## Implementation Steps

### Step 1: Service Integration Setup (1 hour)
```typescript
// Modify QueueService constructor
export class QueueService implements QueueServiceInterface {
  private syncService: SyncService;
  private selfHealingBlockProcessor: SelfHealingBlockProcessor;
  private analyticsService: AnalyticsService;
  private availBlockchain: AvailBlockchainService;

  constructor(dependencies: {
    syncService: SyncService;
    selfHealingBlockProcessor: SelfHealingBlockProcessor;
    analyticsService: AnalyticsService;
    availBlockchain: AvailBlockchainService;
  }) {
    // Store dependencies and setup processors
  }
}
```

### Step 2: Implement DATA_SYNC Processor (3-4 hours)
```typescript
async processDataSync(job: Job): Promise<JobResult> {
  const startTime = Date.now();
  const { startBlock, endBlock } = job.data;
  
  try {
    // Use your self-healing block processor
    const result = await this.selfHealingBlockProcessor.processBlockRange(
      startBlock, 
      endBlock
    );
    
    return {
      success: true,
      data: result,
      duration: Date.now() - startTime,
      metrics: {
        itemsProcessed: result.blocksProcessed,
        itemsSkipped: result.blocksSkipped,
        itemsFailed: result.blocksFailed,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
      retryable: this.isRetryableError(error)
    };
  }
}
```

### Step 3: Implement BLOCK_INDEXING Processor (2-3 hours)
Focus on single block processing with dependency handling.

### Step 4: Implement ANALYTICS_CALCULATION Processor (2 hours)
Connect to existing AnalyticsService methods.

### Step 5: Update ServiceFactory Integration (1 hour)
Modify ServiceFactory to properly inject dependencies into QueueService.

### Step 6: Testing & Integration (2-3 hours)
- Unit tests for each processor
- Integration tests with actual services
- Error handling validation

## Service Integration Requirements

### SelfHealingBlockProcessor Integration
```typescript
// Use existing processBlockRange method
await this.selfHealingBlockProcessor.processBlockRange(startBlock, endBlock);

// Handle results appropriately
// Log progress and metrics
// Return meaningful job results
```

### AnalyticsService Integration
```typescript
// Use existing analytics methods
await this.analyticsService.calculateNetworkMetrics(timeframe);
await this.analyticsService.updateChainStats();

// Store results and return summary
```

### Error Classification
Implement smart error classification:
```typescript
private isRetryableError(error: Error): boolean {
  // Network errors - retryable
  if (error.message.includes('ECONNRESET') || error.message.includes('timeout')) {
    return true;
  }
  
  // Data validation errors - not retryable
  if (error.message.includes('Invalid block data')) {
    return false;
  }
  
  // Missing dependencies - retryable (they might become available)
  if (error.message.includes('Missing dependency')) {
    return true;
  }
  
  return false; // Conservative default
}
```

## Acceptance Criteria
- [ ] DATA_SYNC processor connects to SelfHealingBlockProcessor
- [ ] BLOCK_INDEXING processor handles single block processing
- [ ] ANALYTICS_CALCULATION processor connects to AnalyticsService
- [ ] All processors return comprehensive JobResult objects
- [ ] Service dependencies properly injected via constructor
- [ ] Error classification determines retryability
- [ ] Progress tracking for long-running jobs
- [ ] Integration tests pass with actual services
- [ ] Existing priority and dead letter functionality preserved
- [ ] Comprehensive logging for debugging

## Example Usage After Implementation
```typescript
// Queue a data sync job (connects to your self-healing processors)
await queueService.addHighPriorityJob(JobType.DATA_SYNC, {
  startBlock: 1000,
  endBlock: 1050,
  batchIndex: 1,
  totalBatches: 10
});

// Queue block indexing (single block processing)
await queueService.addCriticalJob(JobType.BLOCK_INDEXING, {
  blockNumber: 1001,
  includeExtrinsics: true
});

// Queue analytics calculation
await queueService.addLowPriorityJob(JobType.ANALYTICS_CALCULATION, {
  type: 'network_metrics',
  timeframe: '24h'
});
```

## Success Criteria
- Queue jobs actually process blockchain data through existing services
- Jobs complete with meaningful results and metrics
- Error handling distinguishes between retryable and permanent failures
- Performance is acceptable (jobs don't overwhelm services)
- Integration with existing self-healing architecture works smoothly
- Code follows patterns established in TASK-001 and TASK-002

## Testing Strategy
- **Unit Tests**: Each processor with mocked services
- **Integration Tests**: Actual service integration
- **Error Tests**: Various error conditions and retryability
- **Performance Tests**: Job processing under load
- **End-to-End Tests**: Queue → Job → Service → Result flow

## Notes
- Build on your excellent queue architecture from TASK-001 and TASK-002
- Focus on clean integration patterns that other developers can follow
- Consider job execution time and resource usage
- Think about monitoring and observability for job execution
- Remember: this connects your queue mastery to actual business logic

## Resources
- Your completed TASK-001 (Priority Queues) and TASK-002 (Dead Letter Queue)
- Existing services in `src/services/domain/` and `src/services/core/`
- SelfHealingBlockProcessor implementation
- ServiceFactory pattern in `src/services/index.ts`

## Questions/Support
- Review existing service interfaces before implementing
- Consider how job execution fits into the self-healing architecture
- Think about resource usage and concurrent job processing
- Ask for senior review on service integration patterns

**This task bridges your queue expertise with our business logic - exciting next step in your growth!**