# Indexer Architecture Refactoring Project Plan

## Overview
Architectural refactoring of the Avail Explorer indexer system to move domain-specific indexers into their respective service folders, creating independent, queue-driven indexing with no cross-domain dependencies.

## Current Architecture Analysis

### Current Complex Flow
```
Queue Jobs → CoreProcessors → DomainOrchestrator → Individual Domain Processors
```

### Problems with Current Architecture
1. **Complex Orchestration**: DomainProcessingOrchestrator coordinates multiple services
2. **Cross-Service Dependencies**: Domain processors depend on shared data flow
3. **Tight Coupling**: Services are coupled through orchestrator coordination
4. **Duplicate Indexers**: Both `indexer.ts` and `availDataSubmissionIndexer.ts` exist
5. **Mixed Responsibilities**: Core processors handle both indexing and domain coordination

## Proposed New Architecture

### New Simple Flow
```
Queue Jobs → CoreProcessors → Direct Domain Indexer Calls
```

### Key Principles
1. **Independent Domain Indexers**: Each domain handles its own blockchain calls
2. **DB-First Dependency Check**: Check database existence before queuing jobs
3. **Queue-Driven Dependencies**: Cross-domain needs trigger new queue jobs only if missing
4. **Repository Access**: Each domain can access other domain repositories for lookups
5. **No Service Dependencies**: Each domain is self-sufficient for processing
6. **Acceptable Duplication**: Multiple API calls preferred over tight coupling

### Example Flow
```
Block Indexing → Discovers missing validator → Check DB if validator exists
If missing → Queue validator indexing job
Validator Indexer → Makes own blockchain calls → Stores validator data
```

## Domain Entities & Their Indexers

### Indexer vs Processor Clarification
- **Indexers**: Fetch data from blockchain and store in database
- **Processors**: Process existing data from database (may be removed or simplified)
- **Goal**: Replace complex orchestrated processing with simple independent indexing

### 1. Block Domain (`src/services/domain/block/`)
- **Current**: BlockProcessor.ts (processes existing block data)
- **New**: Add `BlockIndexer.ts` (fetches block data from blockchain)
- **Responsibility**: Fetch and store block data, trigger dependent entity jobs

### 2. Account Domain (`src/services/domain/account/`)
- **Current**: AccountProcessor.ts
- **New**: Add `AccountIndexer.ts`
- **Responsibility**: Fetch account data, balances, nonce information

### 3. Validator Domain (`src/services/domain/validator/`)
- **Current**: ValidatorProcessor.ts
- **New**: Add `ValidatorIndexer.ts`
- **Responsibility**: Fetch validator info, staking details, commission rates

### 4. Transfer Domain (`src/services/domain/transfer/`)
- **Current**: TransferProcessor.ts
- **New**: Add `TransferIndexer.ts`
- **Responsibility**: Extract and index transfer events from blocks

### 5. Data Submission Domain (`src/services/domain/dataSubmission/`)
- **Current**: DataSubmissionProcessor.ts, availDataSubmissionIndexer.ts
- **New**: Move `availDataSubmissionIndexer.ts` to `DataSubmissionIndexer.ts` in domain folder
- **Responsibility**: Index Avail data submissions and blob data

## Implementation Plan

### Phase 1: Create Domain Indexers
- [ ] Create `BlockIndexer.ts` in `src/services/domain/block/`
- [ ] Create `AccountIndexer.ts` in `src/services/domain/account/`
- [ ] Create `ValidatorIndexer.ts` in `src/services/domain/validator/`
- [ ] Create `TransferIndexer.ts` in `src/services/domain/transfer/`
- [ ] Move `availDataSubmissionIndexer.ts` to `src/services/domain/dataSubmission/DataSubmissionIndexer.ts`

### Phase 2: Update Queue Processors
- [ ] Modify `core-processors.ts` to call domain indexers directly
- [ ] Remove orchestrator dependency from PROCESS_BLOCK_DOMAINS
- [ ] Add new job types for individual domain indexing
- [ ] Implement cross-domain job queuing

### Phase 3: Remove Dependencies
- [ ] Remove `DomainProcessingOrchestrator`
- [ ] Remove complex coordination logic
- [ ] Update service factory to register new indexers
- [ ] Remove redundant indexer services

### Phase 4: Testing & Validation
- [ ] Test independent domain indexing
- [ ] Verify queue-based dependency handling
- [ ] Validate blockchain call efficiency
- [ ] Performance testing of new architecture

## New Job Types

### Current Job Types
- `BLOCK_INDEXING` - Index individual blocks
- `DATA_SYNC` - Batch index blocks + schedule domains
- `PROCESS_BLOCK_DOMAINS` - Process all domains for a block

### Additional Job Types (New)
- `INDEX_ACCOUNT` - Account domain indexer
- `INDEX_VALIDATOR` - Validator domain indexer  
- `INDEX_TRANSFER` - Transfer domain indexer
- `INDEX_DATA_SUBMISSION` - Data submission domain indexer

Note: `BLOCK_INDEXING` remains but will call new BlockIndexer directly

## Service Architecture Changes

### Before (Complex)
```typescript
// CoreProcessors
async processBlockDomains(job) {
  const orchestrator = await this.getService('domainProcessingOrchestrator');
  return orchestrator.processAllDomainsForBlock(blockData);
}

// DomainProcessingOrchestrator
async processAllDomainsForBlock(blockData) {
  await this.accountProcessor.process(blockData);
  await this.validatorProcessor.process(blockData);
  await this.transferProcessor.process(blockData);
  // ... complex coordination
}
```

### After (Simple with DB Lookup)
```typescript
// CoreProcessors
async processBlockIndexing(job) {
  const blockIndexer = await this.getService('blockIndexer');
  const result = await blockIndexer.indexBlock(blockNumber);
  
  // Check DB first before queuing dependent entity jobs
  if (result.needsValidatorIndexing) {
    const validatorRepo = await this.getService('validatorRepository');
    const existsInDB = await validatorRepo.exists(result.validatorId);
    
    if (!existsInDB) {
      await this.queueService.add('INDEX_VALIDATOR', { validatorId: result.validatorId });
    }
  }
}

async processValidatorIndexing(job) {
  const validatorIndexer = await this.getService('validatorIndexer');
  await validatorIndexer.indexValidator(validatorId);
}
```

## Benefits of New Architecture

### 1. Simplified Maintenance
- Each domain is independent and self-contained
- No complex orchestration logic to maintain
- Clear separation of concerns

### 2. Better Scalability
- Individual domains can be optimized independently
- Queue naturally handles load balancing
- Easier to scale specific domain processing

### 3. Improved Reliability
- Failure in one domain doesn't affect others
- Retry logic is simpler and domain-specific
- No cascading failures through orchestrator

### 4. Development Efficiency
- Teams can work on domains independently
- Easier to test individual domain logic
- Clearer debugging and error tracking

### 5. Efficient Resource Usage
- DB lookup prevents unnecessary blockchain calls
- Repository access allows cross-domain data checks
- Queue jobs only created when truly needed

## Migration Strategy

### Step 1: Create New Indexers (Non-Breaking)
- Create domain indexers alongside existing processors
- Test new indexers independently
- Validate blockchain call patterns

### Step 2: Update Queue Processing (Breaking Change)
- Modify core processors to use new indexers
- Add new job types for domain indexing
- Implement queue-based dependency triggering

### Step 3: Remove Old Architecture (Cleanup)
- Remove domain processing orchestrator
- Clean up unused coordination logic
- Update service registrations

### Step 4: Performance Optimization
- Optimize blockchain call patterns
- Fine-tune queue job scheduling
- Monitor system performance

## Success Metrics

### Technical Metrics
- [ ] Reduced service coupling (no orchestrator dependencies)
- [ ] Simplified code complexity (fewer coordination layers)
- [ ] Independent domain processing (no shared state)
- [ ] Queue-driven dependencies (cross-domain jobs working)

### Performance Metrics
- [ ] Maintained or improved indexing throughput
- [ ] Reduced memory usage (less coordination overhead)
- [ ] Faster error recovery (isolated failures)
- [ ] Better resource utilization (independent scaling)

## Risk Mitigation

### Potential Risks
1. **Increased Blockchain Calls**: Multiple domains calling same RPC endpoints (acceptable trade-off)
2. **Queue Congestion**: More individual domain jobs in queue system
3. **Data Consistency**: Timing issues between domain updates
4. **Migration Complexity**: Breaking changes to existing queue processing

### Mitigation Strategies
1. **RPC Call Optimization**: Monitor call patterns; add caching only if needed
2. **Queue Management**: Monitor queue performance; adjust concurrency settings
3. **Consistency Checks**: Add validation for cross-domain data integrity
4. **Staged Migration**: Implement alongside existing system before switching over

## Timeline

### Week 1: Foundation
- Create domain indexer interfaces
- Implement BlockIndexer and one other domain
- Test basic functionality

### Week 2: Implementation
- Complete all domain indexers
- Update queue processors
- Basic integration testing

### Week 3: Integration
- Remove orchestrator dependencies
- Update service factory
- End-to-end testing

### Week 4: Optimization & Cleanup
- Performance tuning
- Remove redundant code
- Documentation updates

## Review & Feedback

This plan transforms the complex orchestrated architecture into a simple, queue-driven system where each domain is independent and self-sufficient. The trade-off of duplicate blockchain calls is acceptable for the significant reduction in system complexity and improved maintainability.