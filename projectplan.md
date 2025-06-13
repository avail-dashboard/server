# Data-Submission Indexing Implementation Plan

## Overview
Implement data-submission indexing following the same architecture pattern as the existing block indexing system. The current data-submission API exists but lacks the fundamental database schema and indexing infrastructure.

## Current State Analysis

### ✅ What Exists
- **API Routes**: Complete data-submissions endpoints (`/api/data-submissions/*`)
- **Service Layer**: DataAvailabilityService with comprehensive interface
- **Type Definitions**: Complete TypeScript interfaces for DataSubmission and Rollup
- **Tests**: E2E and unit tests for data submission functionality
- **Service Integration**: Properly integrated in service factory

### ❌ Critical Missing Components
- **Database Schema**: data_submissions and rollups tables don't exist in init.sql
- **Indexing Service**: No DataSubmissionIndexerService equivalent to BlockIndexerService
- **Blockchain Integration**: Stub implementations for Avail-specific data extraction
- **Sync Integration**: No data submission sync in SyncService
- **Stats Implementation**: /stats endpoint throws error

## Implementation Plan

### Phase 1: Database Foundation (CRITICAL - Must be first)
**Priority**: High | **Impact**: Critical | **Effort**: Low

#### Todo Items:
- [ ] **Add data_submissions table to init.sql**
  - Mirror the TypeScript interface structure
  - Add proper indexes for performance
  - Include foreign key constraints
- [ ] **Add rollups table to init.sql**
  - Support rollup metadata and statistics
  - Link to data_submissions via app_id
- [ ] **Create database migration script**
  - For existing deployments to add new tables
  - Include data validation and constraint checks
- [ ] **Test database integration**
  - Verify table creation works
  - Test API endpoints with actual database

### Phase 2: Data Submission Indexer Service
**Priority**: High | **Impact**: High | **Effort**: Medium

#### Todo Items:
- [ ] **Create DataSubmissionIndexerService**
  - Mirror BlockIndexerService architecture
  - Implement `indexDataSubmissionsForBlock(blockNumber)`
  - Add batch processing capabilities
  - Include validation and error handling
- [ ] **Extend DataProcessorService**
  - Add `processDataSubmissions(blockData)` method
  - Integrate with existing block processing
  - Use database transactions for atomicity
- [ ] **Add blockchain data extraction**
  - Implement Avail-specific data submission extraction
  - Extract Kate commitments and proofs
  - Map app_id to rollup information

### Phase 3: Sync Integration
**Priority**: Medium | **Impact**: High | **Effort**: Medium

#### Todo Items:
- [ ] **Extend SyncService for data submissions**
  - Add data submission sync tracking
  - Integrate with existing sync orchestration
  - Support incremental data submission sync
- [ ] **Add queue integration**
  - Create data submission job types
  - Add to existing queue processing
  - Implement retry logic for failed extractions
- [ ] **Add sync commands**
  - npm scripts for data submission sync
  - Integration with existing sync:* commands

### Phase 4: Missing Features Implementation
**Priority**: Medium | **Impact**: Medium | **Effort**: Low

#### Todo Items:
- [ ] **Implement stats endpoint**
  - Add DataSubmissionStatsService
  - Return rollup statistics and metrics
  - Cache expensive calculations
- [ ] **Add health monitoring**
  - Data submission indexing health checks
  - Integration with existing health endpoint
  - Sync progress monitoring
- [ ] **Real-time updates (optional)**
  - WebSocket support for new data submissions
  - Integration with existing socket.io setup

## Architecture Principles

### Consistency with Block Indexing
- **Service Layer Pattern**: Indexer → Processor → Database (same as blocks)
- **Sync Orchestration**: Use existing SyncService architecture
- **Queue Processing**: Leverage existing Bull queue system
- **Error Handling**: Mirror block indexing error patterns
- **API Patterns**: Follow existing API response formatting

### Simplicity and Minimal Impact
- **Extend, Don't Replace**: Build on existing infrastructure
- **Reuse Components**: Use existing database connections, queue, sync logic
- **Small Changes**: Each task should impact minimal code
- **Test Incrementally**: Verify each phase independently

## Files to Modify

### New Files:
- `src/services/domain/dataSubmissionIndexer.ts` - New indexer service
- `scripts/migrate-data-submissions.ts` - Database migration script

### Modified Files:
- `init.sql` - Add data_submissions and rollups tables
- `src/services/domain/processor.ts` - Extend for data submissions
- `src/services/core/sync.ts` - Add data submission sync support
- `src/services/domain/dataAvailability.ts` - Implement blockchain extraction stubs
- `package.json` - Add data submission sync scripts

## Success Criteria

### Phase 1 Complete:
- [ ] Database tables created successfully
- [ ] API endpoints return data (not just errors)
- [ ] E2E tests pass

### Phase 2 Complete:
- [ ] Data submissions are extracted from blocks
- [ ] Data is stored in database correctly
- [ ] Manual indexing script works

### Phase 3 Complete:
- [ ] Sync service includes data submissions
- [ ] Incremental sync works for data submissions
- [ ] Queue processing handles data submission jobs

### Phase 4 Complete:
- [ ] Stats endpoint returns meaningful data
- [ ] Health checks include data submission status
- [ ] All tests pass

## Risk Mitigation

### Database Changes
- **Risk**: Breaking existing deployments
- **Mitigation**: Create migration script, test on copy of production data

### Performance Impact
- **Risk**: Adding data submission processing slows block sync
- **Mitigation**: Use same batch processing patterns, queue-based async processing

### Data Consistency
- **Risk**: Data submissions out of sync with blocks
- **Mitigation**: Process data submissions as part of block processing pipeline

## Review Section
*To be completed after implementation*

### Changes Made:
*Summary of actual changes made during implementation*

### Lessons Learned:
*Any deviations from plan or unexpected discoveries*

### Next Steps:
*Recommendations for future improvements*