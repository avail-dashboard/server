/**
 * Validator Domain Export Module
 * 
 * Provides unified access to all Validator domain services and types.
 * Validators are responsible for block production and network security in the Avail blockchain.
 */

// Core services
export { ValidatorApiService, createValidatorApiService } from './ValidatorApiService';
export { ValidatorProcessor, createValidatorProcessor } from './ValidatorProcessor';
export { ValidatorIndexer, createValidatorIndexer } from './ValidatorIndexer';

// Interfaces and types
export {
  ValidatorWithDetails,
  ValidatorList,
  ValidatorStats,
  NominatorList,
  RewardList,
  BlockList,
  ValidatorPerformance,
  StakingOverview,
  PaginationOptions,
  IValidatorService,
} from './ValidatorInterfaces';
export {
  IValidatorIndexer,
  ValidatorIndexingResult,
  ValidatorData,
} from './ValidatorIndexer';

// Re-export for backward compatibility during migration
export { ValidatorApiService as ValidatorService } from './ValidatorApiService';
export { createValidatorApiService as createValidatorService } from './ValidatorApiService';