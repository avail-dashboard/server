# Avail Explorer API Service Logic & Database Plan

## Executive Summary

Based on analysis of the current API endpoints and their implementation status, this document outlines the service logic requirements and database storage needs for the Avail blockchain explorer. The analysis covers 40 API endpoints across 8 categories, identifying which need enhanced service logic beyond simple RPC calls.

## Current Status Overview

- **Working Endpoints**: 30/40 (75%) - Basic RPC functionality
- **Failing Endpoints**: 6/40 (15%) - Implementation issues
- **Not Implemented**: 4/40 (10%) - Missing route handlers

## API Categories & Service Logic Requirements

### 1. Analytics APIs (High Priority)

#### 1.1 Network Analytics (`/api/analytics/network`)
**Current Status**: Partially working, needs historical data
**Service Logic Needed**:
- Time-series data aggregation for trends
- Network utilization calculations
- Historical snapshots collection
- Performance metrics computation

**Database Requirements**:
```sql
-- Already exists in schema
network_stats_snapshots (
  snapshot_time, block_number, total_extrinsics,
  total_data_size, active_validators, total_staked,
  inflation_rate, network_utilization, avg_block_time
)
```

**Implementation Plan**:
1. Create background service to collect hourly/daily snapshots
2. Implement trend calculation algorithms
3. Add network utilization formula: `(actual_throughput / theoretical_max) * 100`
4. Cache computed metrics for performance

#### 1.2 Gas Analytics (`/api/analytics/gas`)
**Current Status**: Placeholder implementation
**Service Logic Needed**:
- Gas price tracking from extrinsics
- Fee calculation and aggregation
- Cost efficiency metrics
- Historical gas price trends

**Database Requirements**:
```sql
-- Already exists in schema
gas_price_history (
  block_number, timestamp, gas_price, gas_used,
  gas_limit, transaction_count, average_fee
)
```

**Implementation Plan**:
1. Extract gas/fee data from extrinsics during block processing
2. Calculate gas efficiency ratios
3. Implement moving averages for price trends
4. Add cost-per-transaction analytics

#### 1.3 Rollup Analytics (`/api/analytics/rollups`)
**Current Status**: Basic stats only
**Service Logic Needed**:
- Per-rollup data usage tracking
- Growth trend analysis
- Cost efficiency per rollup
- Market share calculations

**Database Requirements**:
```sql
-- Already exists in schema
rollup_analytics (
  app_id, period_start, period_end, period_type,
  submission_count, total_data_size, unique_submitters,
  total_fees, avg_submission_size
)
```

**Implementation Plan**:
1. Aggregate data submissions by app_id and time periods
2. Calculate growth rates and trends
3. Implement leaderboard rankings
4. Add cost-per-MB calculations

### 2. Validator & Staking APIs (Medium Priority)

#### 2.1 Validator Details (`/api/validators/:address`)
**Current Status**: Basic info only
**Service Logic Needed**:
- Performance metrics calculation
- Block authoring history
- Uptime tracking
- Slashing history analysis

**Database Requirements**:
```sql
-- New tables needed
validator_performance (
  validator_address, era, blocks_authored, 
  uptime_percentage, avg_block_time, rewards_earned
)

validator_blocks (
  validator_address, block_number, timestamp,
  block_time, extrinsic_count
)
```

**Implementation Plan**:
1. Track block authoring during block processing
2. Calculate uptime based on expected vs actual blocks
3. Implement performance scoring algorithm
4. Add historical performance trends

#### 2.2 Staking Overview (`/api/validators/staking/overview`)
**Current Status**: Basic aggregation
**Service Logic Needed**:
- Era management and tracking
- Reward distribution calculations
- Nomination pool analytics
- Staking efficiency metrics

**Database Requirements**:
```sql
-- Already exists in schema
eras (era_index, start_block, end_block, total_reward, validator_count)
nominations (nominator_address, validator_address, bonded_amount, era)
nomination_pools (id, total_bonded, member_count, commission)
```

**Implementation Plan**:
1. Implement era detection and tracking
2. Calculate staking ratios and efficiency
3. Add nomination pool management
4. Implement reward distribution tracking

### 3. Data Submission APIs (High Priority)

#### 3.1 Data Submission Stats (`/api/data-submissions/stats`)
**Current Status**: Recently fixed, working
**Service Logic Needed**:
- Real-time statistics calculation
- Trend analysis
- App-specific metrics
- Performance benchmarking

**Database Requirements**:
```sql
-- Already exists in schema
data_submissions (
  app_id, data_size, submitter, timestamp,
  rollup_name, success, kate_commitment
)
```

**Implementation Plan**:
1. ✅ Already implemented - calculates from existing data
2. Add caching for expensive calculations
3. Implement trend detection algorithms
4. Add performance benchmarks

### 4. Search & Discovery APIs (Low Priority)

#### 4.1 Enhanced Search (`/api/search`)
**Current Status**: Basic search working
**Service Logic Needed**:
- Full-text search indexing
- Relevance scoring
- Search suggestions
- Advanced filtering

**Database Requirements**:
```sql
-- New search index tables
search_index (
  entity_type, entity_id, searchable_text,
  relevance_score, last_updated
)
```

**Implementation Plan**:
1. Implement PostgreSQL full-text search
2. Add search result ranking
3. Create auto-complete functionality
4. Add search analytics

### 5. Account & Transaction APIs (Medium Priority)

#### 5.1 Account Details (`/api/accounts/:address`)
**Current Status**: Basic RPC data
**Service Logic Needed**:
- Transaction history aggregation
- Balance change tracking
- Activity analysis
- Portfolio metrics

**Database Requirements**:
```sql
-- New tables needed
account_balances_history (
  address, block_number, timestamp,
  free_balance, reserved_balance, total_balance
)

account_activity_summary (
  address, period_start, period_end,
  transaction_count, total_sent, total_received,
  data_submissions_count, staking_activity
)
```

**Implementation Plan**:
1. Track balance changes during block processing
2. Aggregate transaction history
3. Calculate activity metrics
4. Implement portfolio tracking

### 6. Block & Extrinsic APIs (Low Priority)

#### 6.1 Enhanced Block Details
**Current Status**: Working well
**Service Logic Needed**:
- Block analysis and metrics
- Extrinsic categorization
- Performance indicators
- Data availability metrics

**Implementation Plan**:
1. Add block analysis during processing
2. Categorize extrinsics by type
3. Calculate DA efficiency metrics
4. Add block performance scoring

## Database Storage Strategy

### Core Principles
1. **Incremental Processing**: Process blocks sequentially to build historical data
2. **Efficient Indexing**: Strategic indexes for query performance
3. **Data Retention**: Configurable retention policies for large datasets
4. **Caching Strategy**: Redis for frequently accessed computed data

### Storage Requirements by Priority

#### High Priority Tables (Immediate Implementation)
```sql
-- Analytics snapshots
network_stats_snapshots
gas_price_history
rollup_analytics

-- Enhanced data submissions
data_submissions (enhanced with rollup_name, kate_commitment)
rollups (app registry)
```

#### Medium Priority Tables (Phase 2)
```sql
-- Validator performance
validator_performance
validator_blocks
eras
nominations (enhanced)

-- Account tracking
account_balances_history
account_activity_summary
```

#### Low Priority Tables (Phase 3)
```sql
-- Search and discovery
search_index
user_bookmarks
user_preferences

-- Advanced analytics
events (detailed event tracking)
logs (system logs)
```

## Service Logic Implementation Plan

### Phase 1: Analytics Foundation (Weeks 1-2)
1. **Background Data Collector Service**
   - Processes blocks sequentially
   - Extracts analytics data
   - Populates snapshot tables
   - Handles RPC failures gracefully

2. **Analytics Computation Service**
   - Calculates trends and metrics
   - Updates rollup analytics
   - Manages data aggregation
   - Implements caching strategy

### Phase 2: Validator & Staking (Weeks 3-4)
1. **Validator Performance Tracker**
   - Monitors block authoring
   - Calculates uptime metrics
   - Tracks performance scores
   - Manages era transitions

2. **Staking Analytics Service**
   - Processes nomination changes
   - Calculates staking metrics
   - Manages pool analytics
   - Tracks reward distributions

### Phase 3: Enhanced Features (Weeks 5-6)
1. **Search Indexing Service**
   - Builds search indexes
   - Updates relevance scores
   - Manages auto-complete data
   - Handles search analytics

2. **Account Analytics Service**
   - Tracks balance changes
   - Aggregates transaction history
   - Calculates activity metrics
   - Manages portfolio data

## Technical Implementation Details

### Background Processing Architecture
```typescript
class BlockProcessor {
  async processBlock(blockNumber: bigint) {
    const block = await this.rpc.getBlockByNumber(blockNumber);
    
    // Extract analytics data
    await this.extractNetworkMetrics(block);
    await this.extractGasMetrics(block);
    await this.extractDataSubmissions(block);
    await this.extractValidatorActivity(block);
    
    // Update aggregated data
    await this.updateRollupAnalytics(block);
    await this.updateValidatorPerformance(block);
    
    // Cache frequently accessed data
    await this.updateCache(block);
  }
}
```

### Caching Strategy
```typescript
// Redis cache keys
const CACHE_KEYS = {
  NETWORK_STATS: 'network:stats:latest',
  VALIDATOR_LIST: 'validators:active',
  ROLLUP_LEADERBOARD: 'rollups:leaderboard:24h',
  GAS_PRICE_TREND: 'gas:price:trend:7d',
};

// Cache TTL values
const CACHE_TTL = {
  NETWORK_STATS: 300, // 5 minutes
  VALIDATOR_LIST: 600, // 10 minutes
  ANALYTICS: 1800, // 30 minutes
};
```

### Error Handling & Resilience
1. **RPC Failure Handling**: Graceful degradation with cached data
2. **Data Consistency**: Transaction-based updates for critical data
3. **Monitoring**: Comprehensive logging and metrics
4. **Recovery**: Ability to reprocess blocks if needed

## Performance Considerations

### Query Optimization
1. **Strategic Indexing**: Indexes on frequently queried columns
2. **Materialized Views**: For complex aggregations
3. **Partitioning**: Time-based partitioning for large tables
4. **Connection Pooling**: Efficient database connection management

### Scalability Planning
1. **Horizontal Scaling**: Read replicas for analytics queries
2. **Data Archival**: Move old data to cheaper storage
3. **Microservices**: Split services by domain for better scaling
4. **Load Balancing**: Distribute API load across instances

## Success Metrics

### Performance Targets
- API response time: < 500ms for 95% of requests
- Database query time: < 100ms for simple queries
- Background processing: Keep up with block production
- Cache hit ratio: > 80% for frequently accessed data

### Data Quality Metrics
- Data completeness: > 99% of blocks processed
- Analytics accuracy: Validated against RPC data
- Real-time lag: < 30 seconds behind chain head
- Error rate: < 1% for all operations

## Conclusion

This plan provides a comprehensive roadmap for implementing robust service logic and database storage for the Avail Explorer API. The phased approach ensures critical analytics functionality is delivered first, while building a foundation for advanced features. The emphasis on performance, reliability, and scalability ensures the system can handle production workloads effectively. 