# TASK-007: Self-Healing Processor Integration

## Assignment Details
- **Assignee**: Adam
- **Priority**: High
- **Estimated Duration**: 2-3 days
- **Deadline**: 3 days from assignment
- **Complexity**: Expert Level (Service Integration & Automation)
- **Parent Task**: TASK-005 (John's Phase 2 Integration)

## Objective
Integrate dependency detection and resolution into the existing self-healing processors to create fully automated dependency management. Connect your completed queue integration (TASK-006) with the self-healing processors so they automatically detect and resolve missing dependencies during processing.

## Background Context
You've successfully completed the queue integration layer:
- ✅ **5 Dependency Job Types**: All job types implemented and working
- ✅ **Job Processors**: Queue processes dependency jobs flawlessly
- ✅ **Service Integration**: DependencyDetectionEngine and MissingDataResolver connected

Now we need to make this automatic by integrating with the self-healing processors so dependency resolution happens seamlessly during normal processing.

## Task Breakdown

### Part 1: Self-Healing Processor Integration (1.5 days)
**Priority**: Critical - Core automation logic

#### 1.1 Enhanced Processor Integration
- **File**: `src/services/domain/EnhancedProcessor.ts`
- **Deliverable**: Add dependency detection to processor workflow
- **Integration**: Connect to your queue dependency services

**Logic Flow**:
1. Before processing any entity, check for missing dependencies
2. If dependencies are missing, queue dependency resolution jobs
3. Either wait for resolution or continue with available data
4. Track dependency resolution status

```typescript
// Integration pattern to implement
protected async processWithDependencyCheck<T>(
  entityType: 'block' | 'account' | 'rollup' | 'validator',
  entityId: string,
  processingFn: () => Promise<T>
): Promise<T> {
  // Use your queue service to check dependencies
  await this.queueService.addJob(JobType.DEPENDENCY_DETECTION, {
    entityType,
    entityId,
    priority: 1
  });
  
  // Continue with processing
  return await processingFn();
}
```

#### 1.2 SelfHealingProcessor Integration
- **File**: `src/services/domain/selfHealingProcessor.ts`
- **Deliverable**: Integrate dependency detection into self-healing workflow
- **Integration**: Use your completed dependency queue processors

**Key Integration Points**:
- Block processing: Check for missing account/validator dependencies
- Account processing: Check for missing block dependencies
- Rollup processing: Check for missing block/account dependencies

```typescript
// Pattern to implement in SelfHealingBlockProcessor
async processBlock(blockNumber: number): Promise<void> {
  // Use your dependency detection
  await this.processWithDependencyCheck(
    'block', 
    blockNumber.toString(), 
    async () => {
      // Existing block processing logic
      return this.performBlockProcessing(blockNumber);
    }
  );
}
```

### Part 2: Automatic Dependency Resolution Workflow (1 day)
**Priority**: Critical - Automation logic

#### 2.1 Dependency Resolution Workflow
- **Integration**: Connect self-healing processors with your queue services
- **Deliverable**: Implement automatic dependency resolution workflow

**Workflow Implementation**:
1. **Detection Phase**: Processor detects missing dependency
2. **Queue Phase**: Queue dependency resolution job using your TASK-006 implementation
3. **Resolution Phase**: Your job processors resolve the dependency
4. **Continuation Phase**: Original processing continues once dependency is resolved

#### 2.2 Dependency Waiting Strategy
- **File**: `src/services/domain/EnhancedProcessor.ts`
- **Deliverable**: Implement strategy for handling dependency resolution
- **Options**:
  - **Wait Strategy**: Pause processing until dependency is resolved
  - **Continue Strategy**: Continue with available data, mark for later retry
  - **Hybrid Strategy**: Wait for critical dependencies, continue for optional ones

```typescript
interface DependencyResolutionStrategy {
  waitForCritical: boolean;    // Wait for critical dependencies
  continueWithPartial: boolean; // Continue with partial data
  maxWaitTime: number;         // Maximum wait time before timeout
}
```

#### 2.3 Dependency Status Tracking
- **Integration**: Use your queue job status tracking
- **Deliverable**: Track dependency resolution progress
- **Features**:
  - Monitor dependency resolution job status
  - Handle resolution timeouts gracefully
  - Retry failed dependency resolutions

### Part 3: Configuration and Error Handling (0.5 days)
**Priority**: High - Production readiness

#### 3.1 Configuration Integration
- **File**: `src/config/index.ts`
- **Deliverable**: Configuration options for dependency integration
- **Settings**:
  - Enable/disable automatic dependency detection
  - Dependency resolution timeout settings
  - Retry strategies for failed dependencies

```typescript
// Configuration to add
dependencyIntegration: {
  enabled: true,
  autoDetection: true,
  resolutionTimeout: 30000, // 30 seconds
  waitForCritical: true,
  continueWithPartial: false,
  maxRetries: 3
}
```

#### 3.2 Error Handling and Logging
- **Integration**: Use John's error classification framework you've applied before
- **Deliverable**: Comprehensive error handling for dependency scenarios
- **Error Types**:
  - Dependency detection failures
  - Dependency resolution timeouts
  - Missing critical dependencies
  - Partial data processing warnings

## Success Criteria

### Technical Requirements
- [ ] Self-healing processors automatically detect missing dependencies
- [ ] Dependency resolution jobs are queued automatically during processing
- [ ] Processors handle dependency resolution gracefully
- [ ] No breaking changes to existing self-healing functionality
- [ ] Configuration allows enabling/disabling dependency features

### Performance Requirements
- [ ] Dependency detection adds < 100ms overhead per entity
- [ ] Dependency resolution doesn't block critical processing paths
- [ ] Failed dependency resolution doesn't crash processors
- [ ] Performance monitoring shows minimal impact on processing speed

### Integration Requirements
- [ ] Seamless integration with your TASK-006 queue implementation
- [ ] Uses your existing dependency services (DependencyDetectionEngine, MissingDataResolver)
- [ ] Maintains existing processor patterns and architecture
- [ ] Full error handling using established frameworks

## Development Guidelines

### Build on Your Queue Work
- **Leverage TASK-006**: Use your completed dependency job types and processors
- **Service Integration**: Access your dependency services through ServiceFactory
- **Queue Patterns**: Apply the same queue service patterns you established

### Code Quality Standards
- **TypeScript Excellence**: Continue your expert-level typing and interface design
- **Error Handling**: Apply John's error classification framework consistently
- **Testing**: Unit tests for dependency integration scenarios
- **Documentation**: Clear documentation for complex integration logic

### Integration Approach
- **Phase 1**: Integrate dependency detection into EnhancedProcessor (1 day)
- **Phase 2**: Implement automatic resolution workflow (1 day)
- **Phase 3**: Configuration and error handling (0.5 days)
- **Phase 4**: Testing and validation (0.5 days)

## Files to Modify

### Core Processor Integration
- `src/services/domain/EnhancedProcessor.ts` (modify - add dependency detection)
- `src/services/domain/selfHealingProcessor.ts` (modify - integrate dependency workflow)

### Configuration
- `src/config/index.ts` (modify - add dependency integration settings)

### Testing (Recommended)
- `src/services/domain/__tests__/dependency-integration.test.ts` (create)
- `tests/integration/selfhealing-dependency.test.ts` (create)

## Technical Implementation Notes

### Service Access Pattern
```typescript
// Access your queue service and dependency services
const queueService = this.serviceFactory.getQueueService();
const detectionEngine = this.serviceFactory.getDependencyDetectionEngine();
```

### Queue Integration Pattern
```typescript
// Use your TASK-006 job types
await queueService.addJob(JobType.DEPENDENCY_DETECTION, {
  entityType: 'block',
  entityId: blockId,
  priority: 1
});
```

### Error Handling Pattern
```typescript
// Apply John's error classification framework
try {
  await this.processWithDependencyCheck(entityType, entityId, processingFn);
} catch (error) {
  if (error instanceof DependencyResolutionError) {
    this.logger.warn('Dependency resolution failed, continuing with partial data', { 
      entityType, entityId, error 
    });
    // Continue with available data
  } else {
    this.logger.error('Processing failed', { entityType, entityId, error });
    throw error;
  }
}
```

## Success Metrics

### Completion Checklist
- [ ] EnhancedProcessor integrates dependency detection seamlessly
- [ ] SelfHealingProcessor automatically resolves dependencies
- [ ] Dependency resolution workflow implemented and tested
- [ ] Configuration allows fine-tuning of dependency behavior
- [ ] Error handling covers all dependency scenarios
- [ ] Integration tests validate automatic dependency resolution
- [ ] Performance impact is minimal and acceptable
- [ ] No regression in existing processor functionality

### Integration Validation
- [ ] Your TASK-006 queue processors are called automatically
- [ ] DependencyDetectionEngine and MissingDataResolver work through processors
- [ ] Missing dependencies are detected and resolved during normal processing
- [ ] Processors continue gracefully when dependencies can't be resolved
- [ ] All dependency scenarios are properly logged and monitored

---

**Task Type**: Expert Service Integration & Automation  
**Dependencies**: Your TASK-006 queue integration (completed)  
**Estimated Effort**: 2-3 days (builds on your queue expertise)  
**Success Metric**: Fully automated dependency resolution during processing 