# Avail Explorer Backend - Design Notes

## Service Lifecycle Management

**Issue**: Database pool errors "Cannot use a pool after calling end on the pool" during application shutdown.
**Root Cause**: ServiceFactory.shutdown() only stopped 2 services, leaving SyncService monitor interval running after database disconnect.
**Solution**: Comprehensive shutdown - iterate through ALL registered services and call stop() methods in proper order before database closure.

## Service State Management Pattern

**Issue**: Services using `isStarted` flags for lifecycle tracking create unnecessary state management complexity.
**Root Cause**: Boolean flags require manual synchronization with actual component state, leading to race conditions and maintenance overhead.
**Solution**: Make service operations naturally idempotent - let underlying components (connectionManager, subscriptionManager) handle their own state. Services should derive state from dependencies rather than maintaining separate lifecycle flags.

## Independent Domain Indexer Pattern

**Issue**: Complex orchestration through DomainProcessingOrchestrator creates tight coupling between domain services and makes the system hard to maintain and scale.
**Root Cause**: Centralized coordination requires all domains to be processed together, creating cascading failures and complex dependency management.
**Solution**: Move to independent domain indexers where each domain handles its own blockchain calls and data processing. Use queue-driven architecture for cross-domain dependencies.

### Design Principles
1. **Domain Independence**: Each domain (Block, Account, Validator, Transfer, DataSubmission) has its own indexer service
2. **Self-Sufficient Processing**: Each indexer makes its own blockchain RPC calls rather than depending on shared data
3. **DB-First Dependency Checks**: Before queuing cross-domain jobs, check database existence to prevent unnecessary work
4. **Repository Access Pattern**: Domains can access other domain repositories for data lookups without service coupling
5. **Queue-Driven Dependencies**: Cross-domain needs trigger queue jobs rather than direct service calls
6. **Acceptable API Duplication**: Multiple domains making same RPC calls is preferred over tight service coupling

### Benefits
- **Simplified Architecture**: No complex orchestration layer
- **Independent Scaling**: Each domain can be optimized separately  
- **Fault Isolation**: Domain failures don't cascade to other domains
- **Efficient Resource Usage**: DB checks prevent unnecessary blockchain calls
- **Development Efficiency**: Teams can work on domains independently

