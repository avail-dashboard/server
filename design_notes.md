# Avail Explorer Backend - Design Notes

## Self-Healing Services Architecture

**Concept**: Independent domain services (Account, Validator, Transfer, DataSubmission) implement `SelfHealingProcessor` interface for parallel blockchain data processing. Services automatically resolve dependencies via `SimpleDependencyResolver` and process blocks independently through `SelfHealingBlockProcessor` orchestrator.

**Key Benefits**: Failure isolation (one service failure doesn't stop others), parallel processing, automatic dependency resolution, and graceful degradation. Replaces complex orchestration with simple, resilient architecture.

