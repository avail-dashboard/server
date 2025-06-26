# TASK-017: Block Domain Migration
**Assigned to**: John (Senior Developer)  
**Assigned Date**: 2025-06-25  
**Priority**: High  
**Estimated Time**: 2-3 hours  
**Complexity**: Senior Level (Domain Architecture)
**Status**: pending
**BlockedBy**: []

## Task Overview
Migrate the Block domain service following the successful Transfer domain pattern. This is the second domain migration in the larger domain services architecture transformation.

## Background Context
✅ **Transfer Domain Complete**: Transfer domain successfully migrated to domain-first structure
🎯 **Next Target**: Block domain (171 lines - mostly API only)

**Current State**: `/src/services/domain/block.ts` (single monolithic file)
**Target State**: `/src/services/domain/block/` (domain-first structure)

## Implementation Plan

### Phase 1: Block Domain Structure Creation (1.5-2 hours)

#### 1.1 Create Target Directory Structure
```
src/services/domain/block/
├── BlockProcessor.ts         # Future blockchain data extraction
├── BlockApiService.ts        # Existing API logic (renamed)
├── BlockInterfaces.ts        # Block DTOs and interfaces
└── index.ts                  # Clean exports
```

#### 1.2 Extract BlockInterfaces.ts (30 minutes)
**File**: `src/services/domain/block/BlockInterfaces.ts`

**Extract from** current `block.ts` lines 5-19:
- `BlockWithMetadataApiResponse`
- `BlockApiResponse` 
- `PaginatedResponse<BlockApiResponse>`
- `PaginationParams`
- `SortParams`
- `IBlockService` interface

**Requirements**:
- Add comprehensive JSDoc documentation
- Ensure proper TypeScript exports
- Include all pagination and sorting interfaces

#### 1.3 Create BlockApiService.ts (45 minutes)
**File**: `src/services/domain/block/BlockApiService.ts`

**Extract from** current `block.ts` lines 21-171:
- Move entire `BlockService` class → `BlockApiService`
- Core methods: `getBlock`, `getLatestBlock`, `getBlocks`
- Private method: `getBlockFromDatabase`
- Implement `IBlockService` interface
- Maintain all existing functionality

**Requirements**:
- Rename class from `BlockService` to `BlockApiService`
- Keep all existing method signatures identical
- Maintain error handling patterns
- Preserve logging and monitoring

#### 1.4 Create BlockProcessor.ts (15 minutes)
**File**: `src/services/domain/block/BlockProcessor.ts`

**Purpose**: Placeholder for future block processing logic

**Implementation**:
```typescript
/**
 * BlockProcessor - Handles blockchain data extraction and indexing
 * 
 * Future responsibilities:
 * - Extract block metadata from blockchain
 * - Process block events and logs
 * - Implement SelfHealingProcessor interface
 */
export class BlockProcessor {
  // TODO: Implement SelfHealingProcessor interface
  // TODO: Add extractFromBlock method
  // TODO: Add processExtractedEntities method
  // TODO: Add ensureDependencies method
}
```

#### 1.5 Create index.ts (15 minutes)
**File**: `src/services/domain/block/index.ts`

**Requirements**:
- Export `BlockApiService`
- Export `BlockProcessor` 
- Export all interfaces from `BlockInterfaces`
- Export factory functions
- Provide clean public API

### Phase 2: Integration Updates (30-45 minutes)

#### 2.1 Update Route Handlers (15 minutes)
**File**: `src/routes/blocks.ts`

**Changes Required**:
- Update import: `import { BlockApiService } from '../services/domain/block'`
- Update service instantiation
- Ensure zero API changes

#### 2.2 Update ServiceFactory (15 minutes)
**File**: `src/services/index.ts`

**Changes Required**:
- Update import to use new `BlockApiService`
- Update service registration
- Maintain dependency injection patterns

#### 2.3 Update Self-Healing Processor (15 minutes)
**File**: `src/services/domain/selfHealingProcessor.ts`

**Note**: File appears to already reference TransferProcessor, verify if BlockProcessor updates needed

### Phase 3: Validation & Testing (30 minutes)

#### 3.1 API Endpoint Testing (15 minutes)
Test all block endpoints:
- `GET /blocks` - Block listing with pagination
- `GET /blocks/latest` - Latest block
- `GET /blocks/:hashOrNumber` - Specific block

**Success Criteria**:
- Identical response formats
- Same performance characteristics
- Error handling consistency

#### 3.2 Integration Testing (15 minutes)
- Run TypeScript compilation
- Verify no import errors
- Check service factory initialization
- Confirm no regressions in other services

## Success Criteria

### Technical Requirements
- [ ] Zero breaking changes to existing API endpoints
- [ ] TypeScript compilation without errors
- [ ] All existing tests pass
- [ ] Block service instantiation works correctly

### Architecture Requirements
- [ ] Clean domain-first structure following Transfer pattern
- [ ] Proper separation: API logic vs future processing logic
- [ ] Consistent interfaces and exports
- [ ] Placeholder for future block processing

### Quality Requirements
- [ ] Comprehensive inline documentation
- [ ] Proper TypeScript types throughout
- [ ] Error handling maintained
- [ ] Logging consistency preserved

## Files to Modify

### New Files to Create
- `src/services/domain/block/BlockApiService.ts`
- `src/services/domain/block/BlockProcessor.ts` 
- `src/services/domain/block/BlockInterfaces.ts`
- `src/services/domain/block/index.ts`

### Existing Files to Update
- `src/routes/blocks.ts` - Update imports
- `src/services/index.ts` - Update ServiceFactory
- Remove: `src/services/domain/block.ts`

## Risk Assessment

**Risk Level**: Low
- **Reason**: Block service is simple (171 lines, mostly API)
- **Pattern Proven**: Transfer domain migration was successful
- **Low Complexity**: No complex processing logic to migrate

## Expected Benefits

### Immediate Benefits
- **Consistency**: Block domain matches Transfer domain structure
- **Maintainability**: Separate concerns for future development
- **Developer Experience**: Clear structure for future block processing

### Long-Term Benefits
- **Extensibility**: Ready for block processing features
- **Team Productivity**: Clear separation makes development easier
- **Architecture Consistency**: All domains follow same pattern

---

**Task Status**: 📋 **READY FOR ASSIGNMENT**  
**Expected Impact**: Complete Block domain migration following proven Transfer pattern  
**Dependencies**: Transfer domain migration completed  

---

## Implementation Notes

### Follow Transfer Pattern
- Use Transfer domain structure as template
- Maintain consistent naming conventions
- Follow same export patterns

### Future Considerations
- BlockProcessor placeholder for future blockchain data extraction
- Ready for event processing and metadata extraction
- Prepared for SelfHealingProcessor integration