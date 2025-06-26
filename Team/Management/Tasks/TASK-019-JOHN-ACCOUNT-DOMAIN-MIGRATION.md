# TASK-019: Account Domain Migration (Most Complex)
**Assigned to**: John (Senior Developer)  
**Assigned Date**: 2025-06-25  
**Priority**: High  
**Estimated Time**: 4-5 hours  
**Complexity**: Senior Level (Complex Domain Architecture + Blockchain Integration)
**Status**: pending
**BlockedBy**: [TASK-018]

## Task Overview
Migrate the Account domain service - the most complex domain with 956 lines containing both sophisticated API methods and self-healing logic. Accounts are the base entity for other domains, making this migration critical.

## Background Context
✅ **Transfer Domain Complete**: Transfer domain successfully migrated
🔄 **Previous Domains**: TASK-017 (Block), TASK-018 (DataSubmission) should be completed first
🎯 **Current Target**: Account domain (956 lines - highest complexity)

**Current State**: `/src/services/domain/account.ts` (largest monolithic file)
**Target State**: `/src/services/domain/account/` (domain-first structure)

**Critical Importance**: Accounts are base entities - other domains depend on account creation and validation.

## Implementation Plan

### Phase 1: Account Domain Structure Creation (3-4 hours)

#### 1.1 Create Target Directory Structure
```
src/services/domain/account/
├── AccountProcessor.ts      # Lines 672-956 (self-healing logic)
├── AccountApiService.ts     # Lines 135-671 (API methods)
├── AccountInterfaces.ts     # Lines 14-69 (interfaces)
└── index.ts                 # Clean exports
```

#### 1.2 Extract AccountInterfaces.ts (45 minutes)
**File**: `src/services/domain/account/AccountInterfaces.ts`

**Extract from** current `account.ts` lines 14-69:
- `AccountBalance`
- `AccountWithDetails` 
- `AccountActivity`
- `AccountStats`
- `PaginationOptions`
- `HistoryOptions`
- `IAccountService` interface

**Requirements**:
- Add comprehensive JSDoc documentation
- Ensure proper TypeScript exports
- Document complex interfaces (AccountWithDetails includes validator relations)
- Include all pagination and filtering options

#### 1.3 Create AccountApiService.ts (2-2.5 hours)
**File**: `src/services/domain/account/AccountApiService.ts`

**Extract from** current `account.ts` lines 135-671:
- Core API methods: `getAccount`, `getAccountBalance`, `getAccountExtrinsics`, `getAccountTransfers`, `getAccountHistory`, `updateAccountIdentity`, `getAccountStatistics`, `discoverSampleAddresses`
- Helper methods: `getFallbackBalance`, `getTransferStatistics`, `getActivityDates`
- Blockchain integration: Balance fetching, identity updates
- Complex business logic: Account enhancement, statistics calculation

**Critical Requirements**:
- **Blockchain Integration**: Preserve RPC calls for balance fetching (`api.query.system.account`)
- **Identity Management**: Keep identity update logic (`api.query.identity.identityOf`)  
- **Complex Queries**: Maintain sophisticated database queries for statistics
- **Error Handling**: Preserve graceful degradation (fallback balances, RPC failures)
- **Performance**: Keep optimization patterns (Promise.all, pagination)
- **Remove ALL self-healing/processing logic** (moves to AccountProcessor)

**Method-by-Method Migration**:
- `getAccount()`: Keep account creation, statistics gathering, validator relations
- `getAccountBalance()`: Preserve RPC integration, fallback logic, balance updates
- `getAccountExtrinsics()`: Keep pagination and repository calls
- `getAccountTransfers()`: Maintain transfer retrieval and enhancement
- `getAccountHistory()`: Complex activity aggregation across transfers/extrinsics/rewards
- `updateAccountIdentity()`: Blockchain identity fetching and database updates
- `getAccountStatistics()`: Sophisticated analytics and date calculations
- `discoverSampleAddresses()`: Sample data discovery for testing

#### 1.4 Create AccountProcessor.ts (1-1.5 hours)
**File**: `src/services/domain/account/AccountProcessor.ts`

**Extract from** current `account.ts` lines 672-956:
- SelfHealingProcessor methods: `extractFromBlock`, `processExtractedEntities`, `ensureDependencies`
- Address validation: `isValidAvailAddress`, `extractAddressesFromArgs`
- Transfer analysis: `isTransferExtrinsic`, `extractTransferDestination`
- Entity creation: `getOrCreateAccount`, `ensureAccountExists`

**Critical Requirements**:
- **Base Entity Role**: Accounts have no dependencies - they're the foundation
- **Address Validation**: Maintain Avail SS58 format validation
- **Transfer Detection**: Keep transfer analysis for address extraction
- **Self-Healing Foundation**: Core entity creation for dependency resolver
- **Remove ALL API-related logic** (no balance fetching, no statistics)

**Implementation Notes**:
- `extractFromBlock()`: Extract addresses from block validator, extrinsic signers, transfer destinations
- `processExtractedEntities()`: Create account records for discovered addresses
- `ensureDependencies()`: No-op (accounts are base entities)
- `ensureAccountExists()`: Public method for other services to ensure accounts exist

#### 1.5 Create index.ts (15 minutes)
**File**: `src/services/domain/account/index.ts`

**Requirements**:
- Export `AccountApiService`
- Export `AccountProcessor` 
- Export all interfaces from `AccountInterfaces`
- Export factory functions
- Provide clean public API

### Phase 2: Integration Updates (45 minutes - 1 hour)

#### 2.1 Update Route Handlers (20 minutes)
**File**: `src/routes/accounts.ts`

**Changes Required**:
- Update import: `import { AccountApiService } from '../services/domain/account'`
- Update service instantiation
- Ensure zero API changes (accounts API is heavily used)

#### 2.2 Update Self-Healing Processor (15 minutes)
**File**: `src/services/domain/selfHealingProcessor.ts`

**Changes Required**:
- Update import: `import { AccountProcessor } from './account'`
- Update constructor parameter type
- Update service registration
- Ensure base entity processing works correctly

#### 2.3 Update ServiceFactory (10 minutes)
**File**: `src/services/index.ts`

**Changes Required**:
- Update imports for both `AccountApiService` and `AccountProcessor`
- Separate service registration (API service for routes, processor for self-healing)
- Maintain dependency injection patterns

### Phase 3: Validation & Testing (1 hour)

#### 3.1 API Endpoint Testing (30 minutes)
Test all account endpoints (most critical API):
- `GET /accounts/:address` - Account details with balance
- `GET /accounts/:address/balance` - Real-time balance from blockchain
- `GET /accounts/:address/transfers` - Transfer history with pagination
- `GET /accounts/:address/extrinsics` - Extrinsic history
- `GET /accounts/:address/history` - Combined activity history
- `GET /accounts/:address/statistics` - Complex analytics
- `GET /accounts/discover` - Sample address discovery

**Success Criteria**:
- Identical response formats (especially AccountWithDetails)
- Blockchain integration works (balance fetching, identity)
- Complex statistics calculations preserved
- Performance characteristics maintained

#### 3.2 Processing Pipeline Testing (30 minutes)
Test account processing:
- Verify address extraction from blocks works
- Test account creation for new addresses
- Confirm dependency base functionality (other domains can create accounts)
- Check validation logic (SS58 format, address patterns)

**Critical Tests**:
- Process block with new addresses
- Verify accounts created for signers, transfer destinations
- Test ensureAccountExists() method for other services
- Confirm base entity role (no dependencies)

## Success Criteria

### Technical Requirements
- [ ] Zero breaking changes to account API endpoints
- [ ] All blockchain integration continues to work (RPC calls)
- [ ] Account processing pipeline remains functional
- [ ] TypeScript compilation without errors

### Architecture Requirements
- [ ] Clean domain-first structure following established pattern
- [ ] Proper separation: API logic vs processing logic
- [ ] Base entity role preserved (other domains can depend on accounts)
- [ ] Complex business logic maintained in API service

### Quality Requirements
- [ ] Complex statistics calculations preserved
- [ ] Blockchain integration error handling maintained
- [ ] Performance optimizations preserved (Promise.all patterns)
- [ ] Logging and monitoring consistency maintained

## Files to Modify

### New Files to Create
- `src/services/domain/account/AccountApiService.ts`
- `src/services/domain/account/AccountProcessor.ts` 
- `src/services/domain/account/AccountInterfaces.ts`
- `src/services/domain/account/index.ts`

### Existing Files to Update
- `src/routes/accounts.ts` - Update imports (critical - accounts API heavily used)
- `src/services/domain/selfHealingProcessor.ts` - Update imports
- `src/services/index.ts` - Update ServiceFactory (both API and processor)
- Remove: `src/services/domain/account.ts`

## Risk Assessment

**Risk Level**: High
- **Reason**: Most complex domain (956 lines), base entity for other domains, blockchain integration
- **Critical Dependencies**: Other domains create accounts via ensureAccountExists()
- **API Impact**: Account endpoints are heavily used by frontend
- **Mitigation**: Thorough testing, careful preservation of all functionality

## Special Considerations

### Base Entity Responsibilities
- **Dependency Foundation**: Other domains depend on accounts existing
- **Address Validation**: Central validation logic for Avail addresses
- **Account Creation**: Reliable account creation for discovered addresses
- **No Dependencies**: Accounts don't depend on other entities

### Blockchain Integration Complexity
- **RPC Balance Fetching**: Real-time balance from `api.query.system.account`
- **Identity Management**: Blockchain identity integration
- **Error Handling**: Graceful degradation when blockchain unavailable
- **Performance**: Efficient caching and fallback strategies

### API Complexity
- **Statistics**: Complex analytics across multiple tables
- **History Aggregation**: Combined activity from transfers/extrinsics/rewards
- **Enhancement Logic**: Account data enrichment with validator relations
- **Pagination**: Sophisticated pagination across multiple data types

## Expected Benefits

### Immediate Benefits
- **Architecture Consistency**: Account domain matches other migrated domains
- **Code Maintainability**: Separation of complex API logic from processing logic
- **Testing**: Easier to test API endpoints vs processing pipeline separately

### Long-Term Benefits
- **Development Velocity**: Clear separation enables parallel development
- **Reliability**: Isolated concerns reduce risk of changes affecting multiple areas
- **Scalability**: API and processing can be scaled independently

---

**Task Status**: 📋 **READY FOR ASSIGNMENT** (after TASK-018 completion)  
**Expected Impact**: Complete Account domain migration with all functionality preserved  
**Dependencies**: TASK-018 (DataSubmission Domain Migration) completion required  

---

## Implementation Notes

### Migration Strategy
- **API Service First**: Migrate complex API methods first, ensuring all functionality works
- **Processor Second**: Extract processing logic while preserving base entity role
- **Test Thoroughly**: Account functionality is critical for entire application

### Blockchain Integration
- **Preserve All RPC Calls**: Balance fetching, identity updates must work identically
- **Error Handling**: Maintain graceful degradation and fallback mechanisms
- **Performance**: Keep optimization patterns for blockchain interactions

### Critical Success Factors
- **Zero API Breaking Changes**: Frontend depends heavily on account endpoints
- **Base Entity Role**: Other domain processors must be able to create accounts
- **Complex Logic Preservation**: Statistics and analytics must work identically