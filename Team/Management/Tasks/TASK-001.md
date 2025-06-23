# TASK-001: Priority Queue Enhancement

## Assignment Details
- **Assigned to**: Adam
- **Priority**: High
- **Estimated Time**: 2 days
- **Deadline**: 2 days from assignment
- **Type**: Enhancement

## Background
The current QueueService uses Bull/Redis but lacks proper priority handling. Jobs are processed FIFO without considering importance levels. We need to add priority levels to ensure critical jobs (like dependencies and core data) process before less important ones (like analytics).

## Task Description
Enhance the existing QueueService to support priority levels for job processing.

## Requirements

### 1. Add Priority Enum
Create a JobPriority enum in the service types:
```typescript
enum JobPriority {
  CRITICAL = 1,    // Dependencies, core data
  HIGH = 5,        // Block processing
  MEDIUM = 10,     // Standard processing  
  LOW = 15         // Analytics, cleanup
}
```

### 2. Update QueueService
Modify `src/services/core/queue.ts`:
- Update `addJob` method to accept priority parameter
- Add helper methods for different priority levels
- Ensure Bull queue uses priority correctly

### 3. Add Helper Methods
Create convenience methods:
```typescript
async addCriticalJob(type: string, data: any): Promise<QueueJob>
async addHighPriorityJob(type: string, data: any): Promise<QueueJob>
async addMediumPriorityJob(type: string, data: any): Promise<QueueJob>
async addLowPriorityJob(type: string, data: any): Promise<QueueJob>
```

## Files to Modify
- `src/services/core/queue.ts` (lines 117-161 - addJob method)
- `src/services/types/service.ts` (add JobPriority enum)

## Acceptance Criteria
- [ ] JobPriority enum created and exported
- [ ] addJob method accepts priority parameter (optional, defaults to MEDIUM)
- [ ] Helper methods for each priority level implemented
- [ ] Jobs process in priority order (critical first, low last)
- [ ] Existing functionality unchanged
- [ ] All existing tests pass
- [ ] New tests added for priority functionality

## Implementation Steps
1. **Add Priority Types** (30 min)
   - Add JobPriority enum to `src/services/types/service.ts`
   - Export the enum

2. **Modify addJob Method** (1 hour)
   - Add optional priority parameter
   - Pass priority to Bull queue options
   - Update method signature and JSDoc

3. **Add Helper Methods** (1 hour)
   - Implement 4 priority helper methods
   - Add proper typing and documentation

4. **Testing** (2-3 hours)
   - Write unit tests for priority functionality
   - Test that jobs process in correct order
   - Verify existing functionality still works

5. **Documentation** (30 min)
   - Update JSDoc comments
   - Add usage examples

## Example Usage After Implementation
```typescript
// High priority job (processes before others)
await queueService.addHighPriorityJob(JobType.DATA_SYNC, { blockRange });

// Critical job (processes first)
await queueService.addCriticalJob(JobType.DEPENDENCY_RESOLUTION, { accountId });

// Standard priority (default)
await queueService.addJob(JobType.ANALYTICS_CALCULATION, { data });
```

## Success Criteria
- Jobs with CRITICAL priority process before HIGH priority jobs
- HIGH priority jobs process before MEDIUM priority jobs
- MEDIUM priority jobs process before LOW priority jobs
- Existing job scheduling still works without specifying priority
- Clean, readable code following existing patterns
- Comprehensive test coverage

## Notes
- Keep changes minimal - enhance existing code, don't rewrite
- Follow existing code patterns and style
- Use Bull's built-in priority support
- Add comprehensive logging for debugging
- Consider edge cases (what if all jobs have same priority?)

## Resources
- Bull Queue Priority Documentation: https://github.com/OptimalBits/bull#priority
- Existing QueueService: `src/services/core/queue.ts`
- Service Types: `src/services/types/service.ts`

## Questions/Support
If you encounter issues or need clarification:
1. Check existing Bull queue documentation
2. Look at how other queue options are handled in the code
3. Ask for senior review if unsure about design decisions

**Remember**: Keep it simple, enhance existing code, minimal changes for maximum impact!