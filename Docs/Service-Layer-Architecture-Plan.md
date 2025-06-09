# Avail DA Explorer - Service Layer Architecture Plan

## Overview

This document outlines the complete service layer architecture for the Avail DA Explorer backend, designed to handle blockchain data fetching, real-time streaming, analytics, and data availability operations.

## Architecture Summary

```
Service Layer Architecture:
├── Core Services (Singleton pattern - leverage existing)
│   ├── CacheService (✓ EXISTS - Redis with health checks)
│   ├── DatabaseService (✓ EXISTS - PostgreSQL with transactions)
│   ├── ConfigService (✓ EXISTS - Centralized configuration)
│   └── Logger (✓ EXISTS - Comprehensive logging)
├── Infrastructure Services (Singleton pattern)
│   ├── BlockchainService (RPC client management)
│   ├── QueueService (Background job processing)
│   ├── MetricsService (Performance monitoring)
│   └── HealthService (Service health monitoring)
├── Domain Services (Class-based with simple DI)
│   ├── BlockService
│   ├── ExtrinsicService  
│   ├── ValidatorService
│   ├── AccountService
│   └── DataAvailabilityService
├── Analytics Services (Functional modules)
│   ├── NetworkAnalyticsService
│   ├── RollupAnalyticsService
│   └── StakingAnalyticsService
├── Real-time Services (Event-driven)
│   ├── StreamingService (WebSocket coordination)
│   ├── EventBusService (Internal pub/sub)
│   └── NotificationService
└── Integration Services (Adapter pattern)
    ├── RPCClientService (Polkadot.js wrapper)
    ├── KateRPCService (DA-specific operations)
    └── LightClientService (Future integration)
```

## Design Principles

### 1. **Simple Dependency Injection**
- Factory pattern for service creation
- Constructor injection for dependencies
- No complex DI containers

### 2. **Mixed Lifecycle Management**
- **Always-running**: StreamingService, EventBusService, QueueService
- **On-demand**: Analytics services, domain services
- **Singleton**: Core infrastructure services

### 3. **Retry Mechanisms with Exponential Backoff**
- Built into all RPC operations
- Configurable retry counts and delays
- Circuit breaker pattern for external services

### 4. **Integration Testing Ready**
- Mock-friendly service interfaces
- Test RPC provider support
- Isolated service testing capabilities

## Service Specifications

### Infrastructure Services

#### 1. BlockchainService (Core)
```typescript
class BlockchainService {
  // RPC client management with failover
  // Connection health monitoring
  // Subscription management for real-time data
}
```

**Responsibilities:**
- Manage Polkadot.js API connections
- Handle RPC provider failover
- Maintain WebSocket subscriptions
- Provide retry mechanisms for all blockchain calls

#### 2. QueueService
```typescript
class QueueService {
  // Bull queue integration
  // Job scheduling and processing
  // Background task coordination
}
```

**Responsibilities:**
- Analytics data processing
- Block/extrinsic indexing jobs
- Periodic data synchronization
- Rollup statistics calculation

#### 3. MetricsService
```typescript
class MetricsService {
  // Prometheus metrics collection
  // Performance monitoring
  // Service health tracking
}
```

#### 4. HealthService
```typescript
class HealthService {
  // Aggregate health checks
  // Service dependency monitoring
  // System status reporting
}
```

### Domain Services

#### 1. BlockService
```typescript
class BlockService {
  constructor(
    private blockchain: BlockchainService,
    private cache: CacheService,
    private db: DatabaseService
  ) {}
}
```

**Scope Coverage:**
- Block data retrieval and caching
- Block time calculations
- Validator information extraction
- Cost per block analytics

#### 2. ExtrinsicService
```typescript
class ExtrinsicService {
  // Extrinsic data processing
  // Fee calculation
  // Result parsing and categorization
}
```

**Scope Coverage:**
- Extrinsic list and detail views
- Action classification
- Asset transfer tracking
- Cost per transaction analytics

#### 3. DataAvailabilityService
```typescript
class DataAvailabilityService {
  // Kate commitment operations
  // Data submission handling
  // Blob content processing
}
```

**Scope Coverage:**
- Data submissions tracking
- Rollup data analysis
- Blob size and fee calculations
- Kate proof operations

#### 4. ValidatorService
```typescript
class ValidatorService {
  // Validator information management
  // Staking data processing
  // Era and epoch tracking
}
```

**Scope Coverage:**
- Validator lists (active, waiting, slashed)
- Staking statistics
- Commission and bonding data
- Nomination pools

#### 5. AccountService
```typescript
class AccountService {
  // Account balance management
  // Transaction history
  // Role identification
}
```

**Scope Coverage:**
- Account profiles and balances
- Transaction history
- Transfer tracking
- Role-based data (validator, nominator, etc.)

### Analytics Services

#### 1. NetworkAnalyticsService
```typescript
export const NetworkAnalyticsService = {
  // Functional service for network-wide analytics
  calculateThroughput: async () => {},
  getGasPriceMetrics: async () => {},
  getCostAnalytics: async () => {}
}
```

**Scope Coverage:**
- Network statistics (blocks, extrinsics, blob size, fees)
- Gas price tracking
- Data throughput monitoring
- Cost per MB analytics

#### 2. RollupAnalyticsService
```typescript
export const RollupAnalyticsService = {
  // Rollup-specific analytics
  calculateDAContribution: async () => {},
  getRollupLeaderboard: async () => {},
  getBlobAnalytics: async () => {}
}
```

**Scope Coverage:**
- DA contribution graphs
- Rollup leaderboard
- Per-rollup analytics (24h/week/month)
- Blob size and fee analysis

#### 3. StakingAnalyticsService
```typescript
export const StakingAnalyticsService = {
  // Staking and validation analytics
  getStakingOverview: async () => {},
  getInflationMetrics: async () => {},
  getValidatorStats: async () => {}
}
```

**Scope Coverage:**
- Total staking amounts
- Inflation rate calculations
- Validator performance metrics
- Era and epoch analytics

### Real-time Services

#### 1. StreamingService
```typescript
class StreamingService {
  // WebSocket event coordination
  // Real-time data distribution
  // Client subscription management
}
```

**Responsibilities:**
- Coordinate real-time block updates
- Stream extrinsic confirmations
- Push rollup analytics updates
- Manage client subscriptions

#### 2. EventBusService
```typescript
class EventBusService {
  // Internal pub/sub for service communication
  // Event routing and transformation
}
```

#### 3. NotificationService
```typescript
class NotificationService {
  // Push notifications for critical events
  // Alert management
}
```

### Integration Services

#### 1. RPCClientService
```typescript
class RPCClientService {
  // Polkadot.js API wrapper
  // Connection pooling
  // Error handling and retries
}
```

#### 2. KateRPCService
```typescript
class KateRPCService {
  // Kate commitment specific operations
  // Data availability proofs
  // Cell queries and block dimensions
}
```

#### 3. LightClientService
```typescript
class LightClientService {
  // Future: Light client integration
  // Status monitoring
  // Sync information
}
```

## Implementation Plan

### Phase 1: Infrastructure Foundation (Week 1)
**Goal**: Create core infrastructure services

#### 1.1 Create services directory structure
```
src/services/
├── core/
│   ├── blockchain.ts
│   ├── queue.ts
│   ├── metrics.ts
│   └── health.ts
├── domain/
├── analytics/
├── realtime/
└── integration/
```

#### 1.2 BlockchainService (Priority 1)
- Basic RPC client setup
- Connection management
- Health monitoring
- **Test**: Connect to test RPC endpoint

#### 1.3 QueueService (Priority 2)
- Bull queue integration
- Basic job processing
- **Test**: Schedule and process simple job

#### 1.4 Service Factory Pattern (Priority 3)
- Simple dependency injection
- Service lifecycle management
- **Test**: Create and inject dependencies

### Phase 2: Domain Services (Week 2)
**Goal**: Implement core domain logic

#### 2.1 BlockService (Priority 1)
- Block data fetching
- Cache integration
- Database persistence
- **Test**: Fetch and cache block data

#### 2.2 ExtrinsicService (Priority 2)
- Extrinsic processing
- Fee calculation
- **Test**: Process extrinsics from test blocks

#### 2.3 DataAvailabilityService (Priority 3)
- Basic data submission tracking
- **Test**: Process data availability extrinsics

### Phase 3: Analytics Foundation (Week 3)
**Goal**: Basic analytics capabilities

#### 3.1 NetworkAnalyticsService
- Network statistics calculation
- **Test**: Generate network metrics

#### 3.2 RollupAnalyticsService
- Basic rollup tracking
- **Test**: Calculate rollup statistics

### Phase 4: Real-time Services (Week 4)
**Goal**: WebSocket and streaming capabilities

#### 4.1 StreamingService
- WebSocket coordination
- **Test**: Stream real-time block updates

#### 4.2 EventBusService
- Internal event routing
- **Test**: Pub/sub between services

### Phase 5: Integration & Optimization (Week 5)
**Goal**: Advanced features and performance

#### 5.1 KateRPCService
- Data availability proofs
- **Test**: Retrieve Kate commitments

#### 5.2 Advanced Analytics
- Complex rollup analytics
- Performance optimization
- **Test**: Full analytics pipeline

## Error Handling Strategy

### Retry Configuration
```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  exponentialFactor: 2,
  jitterEnabled: true
}
```

### Circuit Breaker Pattern
- Open circuit after 5 consecutive failures
- Half-open state after 30 seconds
- Reset after 3 successful calls

### Graceful Degradation
- Cache fallback for analytics
- Mock data for non-critical features
- Service isolation to prevent cascade failures

## Testing Strategy

### Unit Testing
- Mock all external dependencies
- Test individual service methods
- Validate error handling paths

### Integration Testing
- Test with mock RPC providers
- Validate service interactions
- Database integration tests

### E2E Testing
- Full service pipeline tests
- Real-time streaming validation
- Performance benchmarking

## File Structure

```
src/services/
├── index.ts                 # Service factory and exports
├── core/
│   ├── blockchain.ts        # RPC client management
│   ├── queue.ts            # Background job processing
│   ├── metrics.ts          # Performance monitoring
│   └── health.ts           # Health check aggregation
├── domain/
│   ├── block.ts            # Block data operations
│   ├── extrinsic.ts        # Extrinsic processing
│   ├── validator.ts        # Validator management
│   ├── account.ts          # Account operations
│   └── data-availability.ts # DA operations
├── analytics/
│   ├── network.ts          # Network analytics
│   ├── rollup.ts           # Rollup analytics
│   └── staking.ts          # Staking analytics
├── realtime/
│   ├── streaming.ts        # WebSocket coordination
│   ├── event-bus.ts        # Internal pub/sub
│   └── notification.ts     # Push notifications
├── integration/
│   ├── rpc-client.ts       # Polkadot.js wrapper
│   ├── kate-rpc.ts         # Kate commitment operations
│   └── light-client.ts     # Light client integration
└── types/
    ├── service.ts          # Common service interfaces
    ├── blockchain.ts       # Blockchain data types
    └── analytics.ts        # Analytics data types
```

## Configuration Extensions

### New Config Sections Needed
```typescript
// Add to config/index.ts
export default {
  // ... existing config
  services: {
    blockchain: {
      rpcEndpoints: string[],
      retryConfig: RetryConfig,
      healthCheckInterval: number
    },
    queue: {
      concurrency: number,
      jobTimeout: number,
      retentionDays: number
    },
    analytics: {
      batchSize: number,
      calculationInterval: number,
      retentionDays: number
    }
  }
}
```

## Success Metrics

### Phase Completion Criteria
1. **Phase 1**: Services can connect and handle basic operations
2. **Phase 2**: Core data operations work with caching
3. **Phase 3**: Basic analytics generate accurate metrics
4. **Phase 4**: Real-time updates function correctly
5. **Phase 5**: Full feature set with performance optimization

### Performance Targets
- API response time < 200ms (cached)
- API response time < 2s (uncached)
- WebSocket message delivery < 100ms
- 99.9% service uptime
- Memory usage < 512MB per service

## Next Steps

1. **Immediate**: Create the services directory structure
2. **Week 1**: Start with BlockchainService implementation
3. **Ongoing**: Implement one service at a time with full testing
4. **Review**: Weekly architecture review and adjustments

This plan provides a clear roadmap for implementing the service layer while leveraging existing infrastructure and meeting all requirements from the Avail DA Explorer scope. 