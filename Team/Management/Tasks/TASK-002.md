# TASK-002: Enhanced Retry Mechanism with Dead Letter Queue

## Assignment Details
- **Assigned to**: Adam
- **Priority**: High
- **Estimated Time**: 1-2 days
- **Deadline**: 2 days from assignment
- **Type**: Enhancement
- **Prerequisite**: TASK-001 (Priority Queue) ✅ Completed

## Background
The current QueueService uses Bull's basic retry mechanism, but we need more sophisticated retry logic with exponential backoff and a dead letter queue for permanently failed jobs. This is crucial for handling temporary failures (network issues, database locks) while preventing infinite retry loops.

## Task Description
Enhance the existing QueueService retry mechanism with configurable retry strategies, exponential backoff, and dead letter queue handling for different job types.

## Requirements

### 1. Enhanced Retry Configuration
Create retry configurations for different job types:
```typescript
interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;      // Initial delay in ms
  maxDelay: number;       // Maximum delay cap
  exponentialFactor: number; // Multiplier for exponential backoff
  jitterEnabled: boolean; // Add randomness to prevent thundering herd
}

const RETRY_STRATEGIES = {
  [JobType.DATA_SYNC]: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    exponentialFactor: 2,
    jitterEnabled: true
  },
  [JobType.BLOCK_INDEXING]: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialFactor: 1.5,
    jitterEnabled: true
  },
  // ... other job types
};
```

### 2. Dead Letter Queue Implementation
- Create a separate Bull queue for permanently failed jobs
- Move jobs to dead letter queue after exhausting all retries
- Add methods to inspect and potentially retry dead letter jobs

### 3. Enhanced Job Options
Update the QueueService to accept retry strategy overrides:
```typescript
interface EnhancedJobOptions extends JobOptions {
  retryStrategy?: Partial<RetryStrategy>;
  skipDeadLetter?: boolean; // For jobs that shouldn't go to dead letter
}
```

### 4. Retry Logic Integration
- Integrate with existing priority system (keep TASK-001 functionality)
- Calculate delays using exponential backoff formula
- Add jitter to prevent thundering herd problems
- Comprehensive logging for retry attempts

## Files to Modify
- `src/services/core/queue.ts` (main retry logic)
- `src/services/types/service.ts` (add retry types)
- `src/config/index.ts` (add retry configuration)

## Implementation Steps

### Step 1: Add Retry Types (30 min)
```typescript
// Add to service.ts
interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialFactor: number;
  jitterEnabled: boolean;
}

interface EnhancedJobOptions extends JobOptions {
  retryStrategy?: Partial<RetryStrategy>;
  skipDeadLetter?: boolean;
}
```

### Step 2: Create Retry Strategies Configuration (45 min)
- Define retry strategies for each job type
- Add to config with sensible defaults
- Consider job criticality (critical jobs = more retries)

### Step 3: Implement Dead Letter Queue (1.5 hours)
```typescript
// In QueueService class
private deadLetterQueue: Queue | null = null;

private async setupDeadLetterQueue(): void {
  this.deadLetterQueue = new Bull('avail-explorer-dead-letter', {
    redis: { /* same redis config */ }
  });
}

async moveToDeadLetter(job: Job, finalError: Error): Promise<void> {
  // Implementation details
}
```

### Step 4: Enhanced Retry Logic (2 hours)
- Modify job options to include retry strategy
- Implement exponential backoff calculation
- Add jitter calculation
- Update job processors to handle retries

### Step 5: Integration & Testing (2-3 hours)
- Write comprehensive tests for retry logic
- Test dead letter queue functionality
- Test exponential backoff calculations
- Integration tests with priority system

## Acceptance Criteria
- [ ] RetryStrategy interface implemented and exported
- [ ] RETRY_STRATEGIES configuration created for all job types
- [ ] Dead letter queue created and functional
- [ ] Jobs retry with exponential backoff (with jitter)
- [ ] Jobs move to dead letter queue after max retries
- [ ] Enhanced addJob method accepts retry strategy overrides
- [ ] Existing priority functionality unchanged (backward compatibility)
- [ ] All existing tests pass
- [ ] New comprehensive tests for retry functionality
- [ ] Dead letter queue inspection methods available

## Technical Specifications

### Exponential Backoff Formula
```typescript
function calculateDelay(attempt: number, strategy: RetryStrategy): number {
  const baseDelay = Math.min(
    strategy.baseDelay * Math.pow(strategy.exponentialFactor, attempt - 1),
    strategy.maxDelay
  );
  
  if (strategy.jitterEnabled) {
    // Add up to 25% jitter
    const jitter = Math.random() * baseDelay * 0.25;
    return baseDelay + jitter;
  }
  
  return baseDelay;
}
```

### Dead Letter Queue Job Data
```typescript
interface DeadLetterJob {
  originalJobId: string;
  jobType: string;
  jobData: any;
  failureReason: string;
  attemptCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  retryStrategy: RetryStrategy;
}
```

## Example Usage After Implementation
```typescript
// Using default retry strategy for job type
await queueService.addJob(JobType.DATA_SYNC, { blockRange });

// Override retry strategy for specific job
await queueService.addJob(JobType.BLOCK_INDEXING, { blockNumber }, {
  priority: JobPriority.HIGH,
  retryStrategy: {
    maxRetries: 10,  // Override default
    baseDelay: 5000  // Override default
  }
});

// Skip dead letter for non-critical jobs
await queueService.addJob(JobType.ANALYTICS_CALCULATION, { data }, {
  skipDeadLetter: true
});

// Inspect dead letter queue
const deadJobs = await queueService.getDeadLetterJobs();
await queueService.retryDeadLetterJob(deadJobId);
```

## Success Criteria
- Jobs retry automatically with exponential backoff
- Failed jobs don't retry infinitely (move to dead letter)
- Different job types have appropriate retry strategies
- System remains responsive during retry storms (jitter works)
- Dead letter queue provides visibility into permanent failures
- Existing priority system continues to work perfectly

## Testing Requirements
- Unit tests for exponential backoff calculation
- Unit tests for jitter implementation
- Integration tests for retry flow
- Dead letter queue functionality tests
- Backward compatibility tests with priority system
- Load tests to ensure retry storms don't overwhelm system

## Resources
- Bull Retry Documentation: https://github.com/OptimalBits/bull#retries
- Your completed TASK-001 (Priority Queue Enhancement)
- Existing retry utilities in `src/utils/retry.ts`

## Notes
- Build on your excellent TASK-001 work - maintain all priority functionality
- Keep the same clean code patterns you established
- Focus on reliability and preventing infinite loops
- Consider job criticality when designing retry strategies
- Add comprehensive logging for debugging retry issues

## Questions/Support
- Review existing `src/utils/retry.ts` for inspiration
- Consider how retry delays interact with job priorities
- Think about monitoring and alerting for dead letter queue growth
- Ask for senior review on retry strategy configurations

**Remember**: Enhance existing functionality, maintain backward compatibility, and keep changes focused and minimal!