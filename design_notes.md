# Avail Explorer Backend - Design Notes

## Self-Healing Services Architecture

**Concept**: Independent domain services (Account, Validator, Transfer, DataSubmission) implement `SelfHealingProcessor` interface for parallel blockchain data processing. Services automatically resolve dependencies via `SimpleDependencyResolver` and process blocks independently through `SelfHealingBlockProcessor` orchestrator.

**Key Benefits**: Failure isolation (one service failure doesn't stop others), parallel processing, automatic dependency resolution, and graceful degradation. Replaces complex orchestration with simple, resilient architecture.

## Service Lifecycle Management

**Issue**: Database pool errors "Cannot use a pool after calling end on the pool" during application shutdown.
**Root Cause**: ServiceFactory.shutdown() only stopped 2 services, leaving SyncService monitor interval running after database disconnect.
**Solution**: Comprehensive shutdown - iterate through ALL registered services and call stop() methods in proper order before database closure.

