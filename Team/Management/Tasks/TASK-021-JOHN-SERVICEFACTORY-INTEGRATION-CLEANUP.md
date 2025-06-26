# TASK-021: ServiceFactory Integration & Final Cleanup
**Assigned to**: John (Senior Developer)  
**Assigned Date**: 2025-06-25  
**Priority**: High  
**Estimated Time**: 1-2 hours  
**Complexity**: Senior Level (Service Integration & Architecture Finalization)
**Status**: pending
**BlockedBy**: [TASK-020]

## Task Overview
Complete the domain services architecture migration by overhauling the ServiceFactory to support the new domain-first structure, creating proper separation between API services and processors, and performing final cleanup.

## Background Context
✅ **All Domain Migrations**: Tasks 017-020 complete domain-specific migrations
🎯 **Final Integration**: ServiceFactory overhaul and architecture finalization
📋 **Cleanup Required**: Remove old monolithic service files and finalize new structure

**Current State**: ServiceFactory configured for monolithic domain services
**Target State**: ServiceFactory supporting separate API services and processors with clean architecture

## Implementation Plan

### Phase 1: ServiceFactory Overhaul (1 hour)

#### 1.1 Update Service Registration (30 minutes)
**File**: `src/services/index.ts`

**Current Issues**:
- ServiceFactory registers monolithic domain services
- No separation between API services and processors
- Self-healing processor gets monolithic services

**Required Changes**:

**1. Separate API Service Registration**:
```typescript
// API Services (for route handlers)
this.register('blockApiService', () => 
  createBlockApiService(blockRepository, blockchain, blockMapper)
);
this.register('accountApiService', () => 
  createAccountApiService(blockchain, transferRepository, extrinsicRepository, validatorRepository, rewardRepository)
);
this.register('validatorApiService', () => 
  createValidatorApiService(blockchain, validatorRepository, nominationRepository, rewardRepository, blockRepository, eraRepository, dependencyResolver)
);
```

**2. Separate Processor Registration**:
```typescript
// Processors (for self-healing pipeline)
this.register('accountProcessor', () => 
  createAccountProcessor(blockchain, transferRepository, extrinsicRepository, validatorRepository, rewardRepository)
);
this.register('validatorProcessor', () => 
  createValidatorProcessor(blockchain, validatorRepository, nominationRepository, rewardRepository, blockRepository, eraRepository, dependencyResolver)
);
this.register('transferProcessor', () => 
  createTransferProcessor(blockchain, transferRepository, blockRepository, dependencyResolver)
);
this.register('dataSubmissionProcessor', () => 
  createDataSubmissionProcessor(blockchain, dataSubmissionRepository, rollupRepository, dependencyResolver)
);
```

**3. Update Self-Healing Processor**:
```typescript
this.register('selfHealingBlockProcessor', () => 
  createSelfHealingBlockProcessor(
    this.get<AccountProcessor>('accountProcessor'),
    this.get<ValidatorProcessor>('validatorProcessor'),
    this.get<TransferProcessor>('transferProcessor'),
    this.get<DataSubmissionProcessor>('dataSubmissionProcessor'),
    this.get<QueueService>('queue')
  )
);
```

#### 1.2 Update Import Statements (15 minutes)
**File**: `src/services/index.ts`

**Required Changes**:
- Update all domain service imports to use new domain folders
- Import both API services and processors
- Update factory function imports

**Example**:
```typescript
// Old
import { AccountService, createAccountService } from './domain/account';

// New
import { 
  AccountApiService, 
  AccountProcessor,
  createAccountApiService,
  createAccountProcessor 
} from './domain/account';
```

#### 1.3 Update Service Health Checks (15 minutes)
**File**: `src/services/index.ts`

**Required Changes**:
- Health checks should include both API services and processors
- Maintain backward compatibility for monitoring
- Ensure proper service startup/shutdown order

### Phase 2: Route Handler Updates (30 minutes)

#### 2.1 Update All Route Files (20 minutes)
**Files**: `src/routes/*.ts`

**Required Updates**:
- `src/routes/accounts.ts` → Use `AccountApiService`
- `src/routes/validators.ts` → Use `ValidatorApiService`  
- `src/routes/blocks.ts` → Use `BlockApiService`
- `src/routes/transfers.ts` → Already updated for Transfer domain
- Future: Data submission routes will use `DataSubmissionApiService`

**Pattern**:
```typescript
// Old
const accountService = serviceFactory.get<AccountService>('account');

// New
const accountApiService = serviceFactory.get<AccountApiService>('accountApiService');
```

#### 2.2 Verify Route Functionality (10 minutes)
- Ensure all route handlers instantiate correctly
- Verify no breaking changes in API responses
- Check error handling consistency

### Phase 3: Final Cleanup (30 minutes)

#### 3.1 Remove Old Monolithic Files (15 minutes)
**Files to Remove**:
- `src/services/domain/account.ts` (migrated to account/)
- `src/services/domain/validator.ts` (migrated to validator/)
- `src/services/domain/block.ts` (migrated to block/)
- `src/services/domain/dataSubmission.ts` (migrated to dataSubmission/)
- Keep: `src/services/domain/transfer.ts` only if not yet migrated

**Verification**:
- Ensure no imports reference old files
- Run TypeScript compilation to check for broken references
- Verify git status shows files as deleted

#### 3.2 Update Documentation (15 minutes)
**Files to Update**:
- Update any service documentation
- Add architecture notes about domain-first structure
- Document new service registration patterns

**Documentation Updates**:
- README.md: Update architecture section if exists
- Add comments in ServiceFactory explaining new structure
- Document factory method patterns for future domains

## Success Criteria

### Technical Requirements
- [ ] All route handlers work with new API services
- [ ] Self-healing processor works with new processors
- [ ] ServiceFactory instantiates all services correctly
- [ ] TypeScript compilation without errors
- [ ] No broken imports or references

### Architecture Requirements
- [ ] Clean separation between API services and processors
- [ ] Consistent factory method patterns
- [ ] Proper dependency injection maintained
- [ ] Service health checks working for all services

### Quality Requirements
- [ ] No monolithic domain service files remain
- [ ] Clean import statements throughout codebase
- [ ] Documentation reflects new architecture
- [ ] Service startup/shutdown works correctly

## Files to Modify

### Primary Files
- `src/services/index.ts` - ServiceFactory overhaul
- `src/routes/accounts.ts` - Update to use AccountApiService
- `src/routes/validators.ts` - Update to use ValidatorApiService
- `src/routes/blocks.ts` - Update to use BlockApiService

### Files to Remove
- `src/services/domain/account.ts`
- `src/services/domain/validator.ts`
- `src/services/domain/block.ts`
- `src/services/domain/dataSubmission.ts`

### Documentation Updates
- README.md (if architecture section exists)
- Inline code comments in ServiceFactory

## Risk Assessment

**Risk Level**: Medium
- **Reason**: Final integration step affecting all services
- **Critical Point**: ServiceFactory is central to entire application
- **Mitigation**: Careful testing of service instantiation and route functionality

## Expected Benefits

### Immediate Benefits
- **Architecture Completion**: Domain-first structure fully implemented
- **Clean Codebase**: No monolithic domain service files
- **Service Clarity**: Clear separation between API and processing concerns

### Long-Term Benefits
- **Maintainability**: Each domain is self-contained and focused
- **Scalability**: API services and processors can be scaled independently
- **Team Productivity**: Clear boundaries enable parallel development
- **Future Development**: Pattern established for new domains

## Testing Strategy

### Service Instantiation Testing
```typescript
// Test all services can be instantiated
const services = [
  'accountApiService', 'accountProcessor',
  'validatorApiService', 'validatorProcessor', 
  'blockApiService',
  'transferProcessor',
  'dataSubmissionProcessor',
  'selfHealingBlockProcessor'
];

services.forEach(serviceName => {
  const service = serviceFactory.get(serviceName);
  console.log(`✅ ${serviceName} instantiated successfully`);
});
```

### Route Handler Testing
- Test each route handler can access its API service
- Verify response formats unchanged
- Check error handling still works

### Processing Pipeline Testing  
- Verify self-healing processor works with new processors
- Test that domain processors can be instantiated
- Confirm dependency resolution still works

---

**Task Status**: 📋 **READY FOR ASSIGNMENT** (after TASK-020 completion)  
**Expected Impact**: Complete domain services architecture migration  
**Dependencies**: TASK-020 (Validator Domain Migration) completion required  

---

## Implementation Notes

### Service Registration Pattern
- **API Services**: For route handlers and external API access
- **Processors**: For self-healing pipeline and data processing
- **Clear Naming**: Suffix distinguishes service types

### Migration Completion
- This task completes the entire domain services architecture migration
- After completion, all domains follow consistent domain-first structure
- Future domains can follow established pattern

### Architecture Achievement
After this task, the architecture will be:
```
src/services/domain/
├── account/           # Complete domain with API + processor + interfaces
├── validator/         # Complete domain with API + processor + interfaces  
├── transfer/          # Complete domain with API + processor + interfaces
├── dataSubmission/    # Complete domain with API + processor + interfaces
└── block/             # Complete domain with API + processor + interfaces
```

Each domain is self-contained with clear separation of concerns and consistent patterns.