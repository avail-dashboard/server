# TASK-006: Dependency Queue Integration Implementation

## Assignment Details
- **Assignee**: Adam
- **Priority**: High
- **Estimated Duration**: 2-3 days
- **Deadline**: 3 days from assignment
- **Complexity**: Expert Level (Queue System Integration)
- **Parent Task**: TASK-005 (John's Phase 2 Integration)

## Objective
Implement the queue integration layer for the Phase 2 Missing Data Resolution system. Connect your existing DependencyDetectionEngine and MissingDataResolver services to the Bull queue system with new job types and processors.

## Background Context
You've already built the excellent architectural foundation for dependency management:
- ✅ **DependencyDetectionEngine**: Production-ready service
- ✅ **MissingDataResolver**: Batch processing capabilities  
- ✅ **Type system & configuration**: Complete foundation

Now we need to integrate these services into the queue processing pipeline so they can be triggered automatically and process dependency resolution jobs.

## Task Breakdown

### Part 1: Dependency Job Types (0.5 days)
**Priority**: Critical - Foundation for all queue processing

#### 1.1 Add New Job Types to Queue Service
- **File**: `src/services/core/queue.ts`
- **Deliverable**: Extend JobType enum with dependency-specific jobs

```typescript
export enum JobType {
  // ... existing types (BLOCK_INDEXING, DATA_SYNC, etc.)
  
  // New dependency job types
  DEPENDENCY_DETECTION = 'DEPENDENCY_DETECTION',
  DEPENDENCY_RESOLUTION = 'DEPENDENCY_RESOLUTION', 
  DEPENDENCY_BATCH_RESOLUTION = 'DEPENDENCY_BATCH_RESOLUTION',
  DEPENDENCY_GAP_ANALYSIS = 'DEPENDENCY_GAP_ANALYSIS',
  DEPENDENCY_CONSISTENCY_CHECK = 'DEPENDENCY_CONSISTENCY_CHECK'
}
```

#### 1.2 Job Data Interface Definitions
- **File**: `src/services/core/queue.ts`
- **Deliverable**: TypeScript interfaces for job data

```typescript
interface DependencyDetectionJobData {
  entityType: 'block' | 'account' | 'rollup' | 'validator';
  entityId: string;
  priority?: number;
}

interface DependencyResolutionJobData {
  dependencyType: string;
  dependencyId: string;
  entityType: string;
  entityId: string;
  priority: number;
}

interface DependencyBatchResolutionJobData {
  dependencies: Array<{
    dependencyType: string;
    dependencyId: string;
    entityType: string;
    entityId: string;
  }>;
  batchSize?: number;
}
```

### Part 2: Job Processors Implementation (1.5 days)
**Priority**: Critical - Core processing logic

#### 2.1 Dependency Detection Processor
- **File**: `src/services/core/queue.ts`
- **Integration**: Connect to your DependencyDetectionEngine service
- **Logic**:
  1. Receive entity information (block, account, etc.)
  2. Use DependencyDetectionEngine to find missing dependencies
  3. Queue DEPENDENCY_RESOLUTION jobs for each missing dependency
  4. Update metrics and logging

```typescript
private async processDependencyDetection(job: Job<DependencyDetectionJobData>): Promise<void> {
  const { entityType, entityId, priority = 1 } = job.data;
  
  // Use your DependencyDetectionEngine
  const detectionEngine = this.serviceFactory.getDependencyDetectionEngine();
  const missingDependencies = await detectionEngine.detectMissingDependencies(
    entityType, 
    entityId
  );
  
  // Queue resolution jobs for each missing dependency
  for (const dependency of missingDependencies) {
    await this.addJob(JobType.DEPENDENCY_RESOLUTION, {
      dependencyType: dependency.type,
      dependencyId: dependency.id,
      entityType,
      entityId,
      priority: dependency.priority
    });
  }
}
```

#### 2.2 Dependency Resolution Processor  
- **File**: `src/services/core/queue.ts`
- **Integration**: Connect to your MissingDataResolver service
- **Logic**:
  1. Receive dependency resolution request
  2. Use MissingDataResolver to fetch and store missing data
  3. Update dependency tracking status
  4. Handle errors and retry logic

```typescript
private async processDependencyResolution(job: Job<DependencyResolutionJobData>): Promise<void> {
  const { dependencyType, dependencyId, entityType, entityId } = job.data;
  
  // Use your MissingDataResolver
  const resolver = this.serviceFactory.getMissingDataResolver();
  const result = await resolver.resolveDependency({
    type: dependencyType,
    id: dependencyId,
    entityType,
    entityId
  });
  
  if (!result.success) {
    throw new Error(`Failed to resolve dependency: ${result.error}`);
  }
}
```

#### 2.3 Batch Resolution Processor
- **File**: `src/services/core/queue.ts`  
- **Integration**: Use your MissingDataResolver's batch capabilities
- **Logic**: Process multiple dependencies efficiently in batches

### Part 3: Queue Service Integration (1 day)
**Priority**: Critical - Make processors active

#### 3.1 Register Dependency Processors
- **File**: `src/services/core/queue.ts`
- **Deliverable**: Add processor registration in queue service initialization
- **Integration**: Connect processors to Bull queue processing

```typescript
// In QueueService constructor or init method
this.queue.process(JobType.DEPENDENCY_DETECTION, this.processDependencyDetection.bind(this));
this.queue.process(JobType.DEPENDENCY_RESOLUTION, this.processDependencyResolution.bind(this));
this.queue.process(JobType.DEPENDENCY_BATCH_RESOLUTION, this.processDependencyBatchResolution.bind(this));
```

#### 3.2 Job Priority and Configuration
- **Integration**: Use existing priority queue infrastructure you built
- **Configuration**: Leverage existing retry strategies and error handling
- **Testing**: Ensure dependency jobs are processed with correct priority

#### 3.3 Service Factory Integration
- **File**: `src/services/core/queue.ts`
- **Deliverable**: Ensure queue service can access dependency services
- **Integration**: Use existing ServiceFactory pattern you're familiar with

```typescript
// Access your dependency services through ServiceFactory
const detectionEngine = this.serviceFactory.getDependencyDetectionEngine();
const resolver = this.serviceFactory.getMissingDataResolver();
```

## Success Criteria

### Technical Requirements
- [ ] 5 new dependency job types added to JobType enum
- [ ] Job processors successfully connect to your dependency services
- [ ] Queue service processes dependency jobs without errors
- [ ] Batch processing works efficiently for multiple dependencies
- [ ] Integration follows existing queue patterns you established

### Performance Requirements  
- [ ] Dependency detection jobs complete within 5 seconds
- [ ] Single dependency resolution completes within 10 seconds
- [ ] Batch resolution processes 10+ dependencies concurrently
- [ ] Queue processing maintains existing performance standards

### Integration Requirements
- [ ] Seamless integration with your existing DependencyDetectionEngine
- [ ] Full utilization of your MissingDataResolver capabilities
- [ ] No breaking changes to existing queue functionality
- [ ] Follows your established queue service patterns

## Development Guidelines

### Build on Your Foundation
- **Leverage Your Services**: Use the DependencyDetectionEngine and MissingDataResolver you built
- **Follow Your Patterns**: Use the same queue architecture patterns from your previous work
- **Maintain Quality**: Apply the same high standards you've established (100% test coverage, excellent error handling)

### Code Quality Standards
- **TypeScript Excellence**: Continue your expert-level typing and interface design
- **Error Handling**: Comprehensive error scenarios with proper retry logic
- **Testing**: Unit tests for each processor with edge cases covered
- **Documentation**: Clear JSDoc comments for complex integration logic

### Integration Approach
- **Phase 1**: Add job types and interfaces (0.5 days)
- **Phase 2**: Implement core processors (1.5 days)  
- **Phase 3**: Queue service integration and testing (1 day)

## Files to Modify

### Core Queue System
- `src/services/core/queue.ts` (modify - add job types, processors, registration)

### Testing (Recommended)
- `src/services/core/__tests__/dependency-queue.test.ts` (create - test dependency job processing)

## Technical Notes

### Service Access Pattern
```typescript
// Access your dependency services through ServiceFactory
const detectionEngine = this.serviceFactory.getDependencyDetectionEngine();
const resolver = this.serviceFactory.getMissingDataResolver();
```

### Error Handling Pattern
```typescript
// Use your established error handling patterns
try {
  const result = await resolver.resolveDependency(dependencyInfo);
  if (!result.success) {
    throw new Error(`Resolution failed: ${result.error}`);
  }
} catch (error) {
  this.logger.error('Dependency resolution failed', { error, jobData: job.data });
  throw error; // Let Bull handle retry logic
}
```

### Priority Integration
```typescript
// Use your existing priority queue infrastructure
const jobOptions = {
  priority: job.data.priority || 1,
  attempts: this.config.queue.retryStrategies.default.maxAttempts,
  backoff: 'exponential'
};
```

## Success Metrics

### Completion Checklist
- [ ] All 5 dependency job types added to queue system
- [ ] Dependency detection processor implemented and tested
- [ ] Dependency resolution processor implemented and tested  
- [ ] Batch resolution processor implemented and tested
- [ ] Queue service successfully processes dependency jobs
- [ ] Integration tests pass with your dependency services
- [ ] Performance meets specified requirements
- [ ] Code follows your established quality standards

### Integration Validation
- [ ] DependencyDetectionEngine successfully called from queue processors
- [ ] MissingDataResolver successfully resolves dependencies via queue
- [ ] Batch processing efficiently handles multiple dependencies
- [ ] Error handling and retry logic works correctly
- [ ] No regression in existing queue functionality

---

**Task Type**: Expert Queue Integration  
**Dependencies**: Your Phase 2 dependency services (DependencyDetectionEngine, MissingDataResolver)  
**Estimated Effort**: 2-3 days (matches your queue system expertise)  
**Success Metric**: Dependency resolution fully integrated into queue processing pipeline 