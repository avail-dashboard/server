# Avail Explorer Backend - Design Notes

## Service Lifecycle Management

**Issue**: Database pool errors "Cannot use a pool after calling end on the pool" during application shutdown.
**Root Cause**: ServiceFactory.shutdown() only stopped 2 services, leaving SyncService monitor interval running after database disconnect.
**Solution**: Comprehensive shutdown - iterate through ALL registered services and call stop() methods in proper order before database closure.

## Service State Management Pattern

**Issue**: Services using `isStarted` flags for lifecycle tracking create unnecessary state management complexity.
**Root Cause**: Boolean flags require manual synchronization with actual component state, leading to race conditions and maintenance overhead.
**Solution**: Make service operations naturally idempotent - let underlying components (connectionManager, subscriptionManager) handle their own state. Services should derive state from dependencies rather than maintaining separate lifecycle flags.

