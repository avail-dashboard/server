# Database & System Migrations TODO

This document tracks all pending migrations and improvements needed for an efficient Avail Explorer system.

## 🗄️ Database Schema Migrations

### **Priority 1: Validator System Implementation**
- **Status**: 🔴 Missing - Critical for full analytics
- **Current State**: Validator data derived from `event_data` staking events
- **Target**: Dedicated `validators` table with aggregated metrics
- **Actions Needed**:
  - [ ] Create `validators` table as per `.temp_file_for_ref.sql` schema
  - [ ] Implement data migration script to populate from existing staking events
  - [ ] Create indexes for validator performance queries
  - [ ] Update Prisma schema to include Validator model
  - [ ] Replace event-based queries with direct table access
- **Impact**: Proper validator analytics, faster queries, complete staking metrics
- **Data Available**: 1,415,596 staking reward events ready for aggregation

### **Priority 2: Account Statistics Aggregation**
- **Status**: 🟡 Partially Working - Using fallback values
- **Current State**: `account_profiles` table exists but statistics are all zeros
- **Target**: Populate real transfer/activity statistics
- **Actions Needed**:
  - [ ] Create background job to aggregate transfer statistics from `transfer_events`
  - [ ] Update `total_transfers_sent/received` from actual transfer data  
  - [ ] Update `total_value_sent/received` from transfer amounts
  - [ ] Implement real-time updates on new transfers
  - [ ] Add proper validator/nominator flags from staking events
- **Impact**: Real account activity metrics, proper user profiles
- **Data Available**: 668,318 transfers ready for aggregation

### **Priority 3: Timestamp Consistency**
- **Status**: 🟢 Implemented - Centralized solution working
- **Current State**: Real timestamps from `extrinsic_data.timestamp.set` extrinsics
- **Target**: Add native timestamp columns to core tables
- **Actions Needed**:
  - [ ] Add `timestamp` column to `transfer_events` table
  - [ ] Add `timestamp` column to `data_submissions` table  
  - [ ] Populate timestamps during indexing process
  - [ ] Update mappers to use native timestamps instead of queries
- **Impact**: Better performance, reduced database queries
- **Current Solution**: Centralized timestamp service working correctly

### **Priority 4: Schema Alignment** ✅ COMPLETED  
- **Status**: 🟢 COMPLETED - Prisma schema now matches actual database structure per `.temp_file_for_ref.sql`
- **Current State**: Database structure confirmed and Prisma updated accordingly
- **Completed Actions**:
  - [x] Configured read-only database access for safety
  - [x] Updated Prisma schema to match actual database structure (without non-existent Avail DA columns)
  - [x] Added analytics tables: `network_statistics`, `balances_summary`, `storage_states`
  - [x] Enhanced Kate commitment model with sampling fields (`sample_data_proof`, `sample_row_data`, `kate_available`)
  - [x] Added account profile timestamp fields (`first_seen_timestamp`, `last_activity_timestamp`)
  - [x] Regenerated Prisma client successfully
  - [x] Verified all APIs working correctly with new schema
- **Impact**: Complete database schema alignment, all analytics features available, APIs fully functional

## ⚡ Performance Optimizations

### **Priority 1: Query Optimization**
- **Current Issues**: Some validator queries timeout (>15s)
- **Actions Needed**:
  - [ ] Add composite indexes for common query patterns
  - [ ] Implement query result caching for expensive operations
  - [ ] Create materialized views for analytics data
  - [ ] Optimize JSON field queries in `event_data`
- **Target Performance**: Sub-second response times for all APIs

### **Priority 2: Caching Strategy**
- **Current State**: Basic TTL caching implemented
- **Actions Needed**:
  - [ ] Implement background cache warming
  - [ ] Add cache invalidation on new blocks
  - [ ] Create tiered caching (L1: Redis, L2: Database views)
  - [ ] Implement cache keys based on block ranges

### **Priority 3: Database Connection Optimization**
- **Actions Needed**:
  - [ ] Implement connection pooling optimization
  - [ ] Add read replicas for analytics queries
  - [ ] Separate write/read operations
  - [ ] Implement query monitoring and slow query alerts

## 🔧 Code Improvements

### **Priority 1: Repository Pattern Enhancement**
- **Status**: 🟡 Working but needs optimization
- **Actions Needed**:
  - [ ] Add batch operations for bulk inserts/updates
  - [ ] Implement proper error handling and retries
  - [ ] Add query result validation
  - [ ] Create specialized repository methods for analytics

### **Priority 2: Analytics Service Refactoring**
- **Status**: 🟢 Fixed - Now working with event-based data
- **Actions Needed**:
  - [ ] Replace temporary event-based queries with table queries (after validator migration)
  - [ ] Add comprehensive metrics calculation
  - [ ] Implement historical data aggregation
  - [ ] Add real-time metrics updates

### **Priority 3: API Response Standardization**
- **Actions Needed**:
  - [ ] Ensure all timestamp fields use centralized timestamp service
  - [ ] Standardize BigInt serialization across all endpoints
  - [ ] Add proper error handling for missing data
  - [ ] Implement consistent pagination patterns

## 🗂️ Data Migration Scripts

### **Validator Data Migration**
```sql
-- Migration script to populate validators table from events
-- Location: sql/migrate_validators_from_events.sql
INSERT INTO validators (stash_address, total_bonded, blocks_produced, status)
SELECT 
    ed.raw_data->'event'->'data'->>0 as stash_address,
    0 as total_bonded, -- Will be calculated from bonding events  
    COUNT(*) as blocks_produced,
    'active' as status
FROM event_data ed
WHERE ed.pallet = 'staking' AND ed.event_name = 'Rewarded'
GROUP BY ed.raw_data->'event'->'data'->>0;
```

### **Account Statistics Migration**
```sql
-- Migration script to populate account statistics
-- Location: sql/migrate_account_stats.sql
UPDATE account_profiles SET
    total_transfers_sent = COALESCE(sent_stats.count, 0),
    total_value_sent = COALESCE(sent_stats.amount, 0),
    total_transfers_received = COALESCE(received_stats.count, 0),  
    total_value_received = COALESCE(received_stats.amount, 0)
FROM (/* transfer aggregation queries */) sent_stats
FULL OUTER JOIN (/* transfer aggregation queries */) received_stats
WHERE account_profiles.account_id = COALESCE(sent_stats.account_id, received_stats.account_id);
```

## 📊 Monitoring & Metrics

### **Implementation Needed**:
- [ ] Query performance monitoring
- [ ] Cache hit/miss ratio tracking  
- [ ] API response time monitoring
- [ ] Database connection pool monitoring
- [ ] Background job success/failure tracking

## 🚀 Deployment Considerations

### **Migration Strategy**:
1. **Phase 1**: Implement validator table and populate from events (low risk)
2. **Phase 2**: Add timestamp columns and populate (medium risk)
3. **Phase 3**: Implement account statistics aggregation (low risk)
4. **Phase 4**: Add comprehensive schema improvements (high impact)

### **Rollback Plans**:
- [ ] Database backup before each migration
- [ ] Feature flags for new functionality
- [ ] Gradual rollout with monitoring
- [ ] Fallback to event-based queries if needed

## 📝 Notes

### **Current Working Solutions** (Don't break these):
- ✅ Centralized timestamp service working correctly
- ✅ Analytics API now functional with event-based data
- ✅ All main APIs returning accurate timestamps
- ✅ Prisma schema properly mapped to database tables

### **Quick Wins** (Easy implementations):
1. Create validator table and populate from existing events
2. Add timestamp columns to transfer_events and data_submissions
3. Implement account statistics background job
4. Add performance indexes for common queries

---
*Last Updated: 2025-08-30*
*Next Review: After validator table implementation*