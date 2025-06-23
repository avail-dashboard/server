# Service Integration Architecture - John's Implementation

## Overview

This document describes the service integration architecture implemented by John as part of TASK-003. This architecture provides production-ready patterns for job processor implementation, dependency injection, error handling, and performance monitoring.

## Architecture Components

### 1. Dependency Injection Framework

#### Interface Definition
```typescript
interface JobProcessorDependencies {
  selfHealingBlockProcessor?: any;
  analyticsService?: any;
  blockService?: any;
  serviceFactory?: any;
}
```

#### Initialization Pattern
```typescript
// Called by ServiceFactory after all services are ready
queueService.initializeDependencies({
  selfHealingBlockProcessor,
  analyticsService,
  blockService,
  serviceFactory: this,
});
```

#### Service Access Pattern (For Adam to Follow)
```typescript
// In processor implementations:
const serviceInstance = await this.getService<any>('serviceName');
```

### 2. Error Classification Framework

#### Interface Definition
```typescript
interface ErrorClassification {
  isRetryable: boolean;
  retryDelay?: number;
  category: 'network' | 'service' | 'data' | 'system';
  alertLevel: 'low' | 'medium' | 'high' | 'critical';
}
```

#### Usage Pattern (For Adam to Follow)
```typescript
try {
  // Processor logic
} catch (error) {
  const classification = this.classifyError(error as Error, JobType.YOUR_JOB_TYPE);
  
  if (!classification.isRetryable) {
    this.logger.error('Permanent failure', { 
      error: error.message,
      alertLevel: classification.alertLevel,
    });
  }
  
  throw error;
}
```

#### Error Categories

| Category | Description | Retryable | Examples |
|----------|-------------|-----------|-----------|
| `network` | Connection issues, timeouts | ✅ Yes | `Connection timeout`, `ECONNRESET` |
| `service` | Service unavailable, rate limits | ✅ Yes | `Service unavailable`, `Rate limit exceeded` |
| `data` | Invalid data, validation errors | ❌ No | `Invalid data format`, `Validation failed` |
| `system` | System resource issues | ❌ No | `Out of memory`, `Disk full` |

### 3. Performance Monitoring Framework

#### Metrics Collection
The architecture automatically collects:
- Total jobs processed/failed
- Processing times per job type
- Success/failure rates
- Average processing times

#### Accessing Metrics
```typescript
const metrics = queueService.getPerformanceMetrics();
```

#### Metrics Structure
```typescript
{
  overview: {
    totalJobsProcessed: number;
    totalJobsFailed: number;
    overallSuccessRate: string;
    averageProcessingTime: number;
  },
  jobTypes: {
    [jobType]: {
      processed: number;
      failed: number;
      successRate: string;
      averageProcessingTime: number;
      failureRate: string;
    }
  },
  timestamp: string;
}
```

## Implementation Patterns

### 1. BLOCK_INDEXING Processor (John's Reference Implementation)

```typescript
this.jobProcessors.set(JobType.BLOCK_INDEXING, async (job: Job) => {
  const { blockNumber } = job.data;
  const startTime = Date.now();
  
  this.logger.debug('Processing block indexing job', { 
    component: 'queue-service',
    jobId: job.id, 
    blockNumber,
  });
  
  try {
    // Step 1: Get required services using dependency injection
    const selfHealingBlockProcessor = await this.getService<any>('selfHealingBlockProcessor');
    const blockService = await this.getService<any>('blockService');
    const availBlockchain = await this.getService<any>('availBlockchain');
    
    // Step 2: Fetch block data from blockchain
    const blockData = await availBlockchain.getBlockByNumber(blockNumber);
    if (!blockData) {
      throw new Error(`Block ${blockNumber} not found on blockchain`);
    }
    
    // Step 3: Process block through self-healing architecture
    await selfHealingBlockProcessor.processBlock(blockData);
    
    // Step 4: Ensure block is properly indexed
    const indexedBlock = await blockService.indexBlock(blockData);
    
    const duration = Date.now() - startTime;
    
    // Step 5: Log success and return structured result
    this.logger.info('Block indexing completed successfully', {
      component: 'queue-service',
      jobId: job.id,
      blockNumber,
      duration,
      entitiesProcessed: indexedBlock?.extrinsics?.length || 0,
    });
    
    return {
      success: true,
      data: {
        blockNumber,
        blockHash: blockData.hash,
        extrinsicsCount: blockData.extrinsics.length,
        timestamp: blockData.timestamp,
      },
      metrics: {
        duration,
        entitiesProcessed: blockData.extrinsics.length,
        processingRate: blockData.extrinsics.length / (duration / 1000),
      },
    };
    
  } catch (error) {
    // Step 6: Apply error classification framework
    const classification = this.classifyError(error as Error, JobType.BLOCK_INDEXING);
    const duration = Date.now() - startTime;
    
    this.logger.error('Block indexing failed', {
      component: 'queue-service',
      jobId: job.id,
      blockNumber,
      error: (error as Error).message,
      classification,
      duration,
    });
    
    // Step 7: Log non-retryable errors for immediate attention
    if (!classification.isRetryable) {
      this.logger.error('BLOCK_INDEXING permanent failure', { 
        blockNumber, 
        error: (error as Error).message,
        alertLevel: classification.alertLevel,
      });
    }
    
    throw error;
  }
});
```

### 2. Processor Implementation Template (For Adam)

```typescript
this.jobProcessors.set(JobType.YOUR_JOB_TYPE, async (job: Job) => {
  const { /* extract job data */ } = job.data;
  const startTime = Date.now();
  
  this.logger.debug('Processing YOUR_JOB_TYPE job', { 
    component: 'queue-service',
    jobId: job.id, 
    // ... relevant data
  });
  
  try {
    // Step 1: Get required services using John's dependency pattern
    const requiredService = await this.getService<any>('serviceName');
    
    // Step 2: Execute your business logic
    const result = await requiredService.yourMethod(/* parameters */);
    
    const duration = Date.now() - startTime;
    
    // Step 3: Log success and return structured result
    this.logger.info('YOUR_JOB_TYPE completed successfully', {
      component: 'queue-service',
      jobId: job.id,
      duration,
      // ... relevant metrics
    });
    
    return {
      success: true,
      data: {
        // Your result data
      },
      metrics: {
        duration,
        // Your specific metrics
      },
    };
    
  } catch (error) {
    // Step 4: Apply John's error classification framework
    const classification = this.classifyError(error as Error, JobType.YOUR_JOB_TYPE);
    const duration = Date.now() - startTime;
    
    this.logger.error('YOUR_JOB_TYPE failed', {
      component: 'queue-service',
      jobId: job.id,
      error: (error as Error).message,
      classification,
      duration,
    });
    
    // Step 5: Log non-retryable errors for immediate attention
    if (!classification.isRetryable) {
      this.logger.error('YOUR_JOB_TYPE permanent failure', { 
        error: (error as Error).message,
        alertLevel: classification.alertLevel,
      });
    }
    
    throw error;
  }
});
```

## Best Practices

### 1. Service Access
- Always use `await this.getService<any>('serviceName')` to get dependencies
- Handle service not found errors gracefully
- Use specific service types when possible (instead of `any`)

### 2. Error Handling
- Always wrap processor logic in try-catch
- Use `this.classifyError()` for consistent error handling
- Log permanent failures with appropriate alert levels
- Include correlation IDs and job context in error logs

### 3. Logging
- Use structured logging with consistent component names
- Include job ID, duration, and relevant metrics
- Log at appropriate levels (debug for start, info for success, error for failures)

### 4. Result Structure
- Always return `{ success: boolean, data?: any, metrics?: any }`
- Include processing duration in metrics
- Provide meaningful data for downstream consumers

### 5. Performance
- Track start time and calculate duration
- Include relevant performance metrics in results
- Log processing rates and throughput when applicable

## Integration with Existing Architecture

### ServiceFactory Integration
The QueueService dependencies are initialized in `src/services/index.ts`:

```typescript
// Initialize queue service dependencies (John's Service Integration Architecture)
const queueServiceInstance = this.get<QueueService>('queue');
queueServiceInstance.initializeDependencies({
  selfHealingBlockProcessor,
  analyticsService,
  blockService,
  serviceFactory: this,
});
```

### Exponential Backoff Integration
The architecture integrates with Adam's TASK-002 retry mechanism:

```typescript
// Get job-specific retry strategy
const retryStrategy = config.queue.retryStrategies[type as keyof typeof config.queue.retryStrategies];

// Apply exponential backoff configuration
const backoffConfig = retryStrategy ? {
  type: 'exponential',
  delay: retryStrategy.baseDelay,
} : config.queue.defaultJobOptions.backoff;
```

### Performance Monitoring
Metrics are automatically collected for all job executions:

```typescript
// Automatically called after job completion
this.updateMetrics(job.name, duration, result.success);
```

## Testing

### Unit Testing Pattern
```typescript
describe('Your Processor Implementation', () => {
  test('should process successfully', async () => {
    // Mock dependencies
    const mockService = { method: jest.fn().mockResolvedValue(expectedResult) };
    
    // Initialize QueueService with mocks
    queueService.initializeDependencies({
      serviceName: mockService,
      serviceFactory: mockServiceFactory,
    });
    
    // Test processor
    const result = await processor(mockJob);
    
    // Verify calls and results
    expect(mockService.method).toHaveBeenCalledWith(expectedParams);
    expect(result.success).toBe(true);
  });
});
```

## Production Deployment

### Health Monitoring
```typescript
// Check queue health
const health = await queueService.getHealth();

// Get performance metrics
const metrics = queueService.getPerformanceMetrics();
```

### Metrics Collection
The architecture provides comprehensive metrics for production monitoring:
- Job success/failure rates
- Processing times and throughput
- Error classifications and alerting levels

### Observability
All processors include:
- Structured logging with correlation IDs
- Performance metrics collection
- Error classification and alerting
- Health status monitoring

This architecture provides a robust foundation for implementing production-ready job processors with consistent patterns, comprehensive error handling, and detailed observability. 