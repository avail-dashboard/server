# TASK-018: DataSubmission Domain Migration
**Assigned to**: John (Senior Developer)  
**Assigned Date**: 2025-06-25  
**Priority**: High  
**Estimated Time**: 3-4 hours  
**Complexity**: Senior Level (Domain Architecture + Avail SDK Integration)
**Status**: pending
**BlockedBy**: [TASK-017]

## Task Overview
Migrate the DataSubmission domain service following the established Transfer domain pattern. This domain contains Avail-specific logic including data submission extraction and rollup auto-creation.

## Background Context
✅ **Transfer Domain Complete**: Transfer domain successfully migrated to domain-first structure
🔄 **Block Domain In Progress**: TASK-017 should be completed first
🎯 **Current Target**: DataSubmission domain (530 lines - mixed concerns)

**Current State**: `/src/services/domain/dataSubmission.ts` (monolithic file)
**Target State**: `/src/services/domain/dataSubmission/` (domain-first structure)

## Implementation Plan

### Phase 1: DataSubmission Domain Structure Creation (2.5-3 hours)

#### 1.1 Create Target Directory Structure
```
src/services/domain/dataSubmission/
├── DataSubmissionProcessor.ts   # Lines 146-520 (processing logic)
├── DataSubmissionApiService.ts  # Future API endpoints
├── DataSubmissionInterfaces.ts  # Lines 10-84 (interfaces)
└── index.ts                     # Clean exports
```

#### 1.2 Extract DataSubmissionInterfaces.ts (45 minutes)
**File**: `src/services/domain/dataSubmission/DataSubmissionInterfaces.ts`

**Extract from** current `dataSubmission.ts` lines 10-84:
- `DataSubmissionFilters`
- `DataSubmissionWithDetails` 
- `DataSubmissionList`
- `DataSubmissionStats`
- `PaginationOptions`
- `IDataSubmissionService` interface

**Requirements**:
- Add comprehensive JSDoc documentation
- Ensure proper TypeScript exports
- Include all filtering and pagination interfaces
- Document Avail-specific concepts (appId, rollups, etc.)

#### 1.3 Create DataSubmissionProcessor.ts (1.5-2 hours)
**File**: `src/services/domain/dataSubmission/DataSubmissionProcessor.ts`

**Extract from** current `dataSubmission.ts` lines 146-520:
- Core SelfHealingProcessor methods: `extractFromBlock`, `processExtractedEntities`, `ensureDependencies`
- Avail-specific logic: `isDataSubmissionExtrinsic`, `extractDataSubmissionData`, `extractDataSubmissionFromExtrinsic`
- Auto-creation logic: `ensureRollupExists`, `processDataSubmission`
- SDK integration: Enhanced data submission detection with avail-js-sdk

**Critical Requirements**:
- **Avail SDK Integration**: Maintain `blockchain.getBlockWithDataSubmissions()` calls
- **Rollup Auto-Creation**: Preserve automatic rollup creation for new app IDs
- **Dependency Management**: Ensure proper account/rollup dependency resolution
- **Error Isolation**: Continue processing other entities if individual submissions fail
- **Remove ALL API-related logic** (future API endpoints will be in separate service)

**Implementation Notes**:
- Keep dependency on `AvailBlockchainService`, `DataSubmissionRepository`, `RollupRepository`
- Maintain `DependencyResolver` integration
- Preserve self-healing processor statistics and monitoring

#### 1.4 Create DataSubmissionApiService.ts (30 minutes)
**File**: `src/services/domain/dataSubmission/DataSubmissionApiService.ts`

**Purpose**: Placeholder for future API endpoints

**Implementation**:
```typescript
/**
 * DataSubmissionApiService - Handles data submission API endpoints
 * 
 * Future responsibilities:
 * - getDataSubmissions with filtering and pagination
 * - getDataSubmission by hash/id
 * - getDataSubmissionsByBlock, getDataSubmissionsByApp, getDataSubmissionsBySubmitter
 * - getDataSubmissionStatistics
 * - getRollupInfo
 */
export class DataSubmissionApiService {
  // TODO: Implement IDataSubmissionService interface
  // TODO: Add API endpoint methods from interface
  // TODO: Add data enhancement and identity integration
  // TODO: Add statistics and analytics methods
}
```

#### 1.5 Create index.ts (15 minutes)
**File**: `src/services/domain/dataSubmission/index.ts`

**Requirements**:
- Export `DataSubmissionProcessor`
- Export `DataSubmissionApiService` 
- Export all interfaces from `DataSubmissionInterfaces`
- Export factory functions
- Provide clean public API

### Phase 2: Integration Updates (30-45 minutes)

#### 2.1 Update Self-Healing Processor (20 minutes)
**File**: `src/services/domain/selfHealingProcessor.ts`

**Changes Required**:
- Update import: `import { DataSubmissionProcessor } from './dataSubmission'`
- Update constructor parameter type
- Update service registration in constructor
- Maintain existing functionality

#### 2.2 Update ServiceFactory (15 minutes)
**File**: `src/services/index.ts`

**Changes Required**:
- Update import to use new `DataSubmissionProcessor`
- Update service registration for self-healing processor
- Maintain dependency injection patterns

#### 2.3 Future Route Handlers (10 minutes)
**Note**: Currently no data submission API routes exist
- Document future API endpoint implementation plan
- Prepare for future route handler creation

### Phase 3: Validation & Testing (30 minutes)

#### 3.1 Processing Pipeline Testing (20 minutes)
Test data submission processing:
- Verify data submission extraction from blocks works
- Test rollup auto-creation functionality
- Confirm Avail SDK integration remains functional
- Check dependency resolution (accounts, rollups)

**Test Scenarios**:
- Process block with data submissions
- Verify new rollups created automatically
- Check account dependencies resolved correctly
- Confirm error isolation works (failed submission doesn't break batch)

#### 3.2 Integration Testing (10 minutes)
- Run TypeScript compilation
- Verify no import errors
- Check service factory initialization
- Confirm self-healing processor works with new DataSubmissionProcessor

## Success Criteria

### Technical Requirements
- [ ] All data submission processing continues to work
- [ ] TypeScript compilation without errors
- [ ] Rollup auto-creation functionality preserved
- [ ] Avail SDK integration remains functional

### Architecture Requirements
- [ ] Clean domain-first structure following Transfer/Block pattern
- [ ] Proper separation: processing logic vs future API logic
- [ ] Avail-specific logic properly encapsulated
- [ ] Self-healing processor integration maintained

### Quality Requirements
- [ ] Comprehensive inline documentation for Avail concepts
- [ ] Proper TypeScript types throughout
- [ ] Error handling and isolation maintained
- [ ] Logging consistency preserved

## Files to Modify

### New Files to Create
- `src/services/domain/dataSubmission/DataSubmissionProcessor.ts`
- `src/services/domain/dataSubmission/DataSubmissionApiService.ts` 
- `src/services/domain/dataSubmission/DataSubmissionInterfaces.ts`
- `src/services/domain/dataSubmission/index.ts`

### Existing Files to Update
- `src/services/domain/selfHealingProcessor.ts` - Update imports
- `src/services/index.ts` - Update ServiceFactory
- Remove: `src/services/domain/dataSubmission.ts`

## Risk Assessment

**Risk Level**: Medium
- **Reason**: Contains Avail-specific SDK integration and complex processing logic
- **Mitigation**: Carefully preserve SDK calls and rollup auto-creation
- **Testing**: Thorough validation of data submission processing pipeline

## Special Considerations

### Avail-Specific Requirements
- **SDK Integration**: Maintain `blockchain.getBlockWithDataSubmissions()` calls
- **Rollup Management**: Preserve automatic rollup creation for new app IDs  
- **Data Availability**: Keep Avail DA concepts and terminology
- **Performance**: Maintain batch processing efficiency for data submissions

### Error Handling
- **Individual Isolation**: Failed submission processing shouldn't break batch
- **SDK Fallback**: Graceful degradation when SDK enhanced detection fails
- **Dependency Resolution**: Robust account/rollup dependency handling

## Expected Benefits

### Immediate Benefits
- **Architecture Consistency**: DataSubmission domain matches other domains
- **Code Clarity**: Separation of processing vs future API concerns
- **Maintainability**: Focused, single-responsibility classes

### Long-Term Benefits
- **API Extensibility**: Ready for data submission API endpoints
- **Team Productivity**: Clear structure for future development
- **Avail Evolution**: Prepared for Avail SDK enhancements

---

**Task Status**: 📋 **READY FOR ASSIGNMENT** (after TASK-017 completion)  
**Expected Impact**: Complete DataSubmission domain migration with Avail-specific functionality preserved  
**Dependencies**: TASK-017 (Block Domain Migration) completion required  

---

## Implementation Notes

### Follow Established Pattern
- Use Transfer and Block domain structures as templates
- Maintain consistent naming conventions
- Follow same export and factory patterns

### Avail SDK Considerations
- Test SDK integration thoroughly after migration
- Preserve fallback mechanisms for SDK failures
- Document Avail-specific concepts clearly

### Future API Development
- DataSubmissionApiService placeholder ready for API endpoints
- Interface already defined for future implementation
- Clear separation enables independent API development