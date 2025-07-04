export { BaseRepository } from './BaseRepository';
export { BlockRepository } from './BlockRepository';
export { DataSubmissionRepository } from './DataSubmissionRepository';
export { RollupRepository } from './RollupRepository';
export { ExtrinsicRepository } from './ExtrinsicRepository';
// Phase 1 repositories
export { ValidatorRepository } from './ValidatorRepository';
export { TransferRepository } from './TransferRepository';
export { NominationRepository } from './NominationRepository';
export { EraRepository } from './EraRepository';
export { RewardRepository } from './RewardRepository';
// Phase 3 repositories
export { AccountRepository } from './AccountRepository';
export { EventRepository } from './EventRepository';
// Phase 2 repositories - DependencyRepository removed (replaced by queue job status)

// Repository instances for dependency injection
import { BlockRepository } from './BlockRepository';
import { DataSubmissionRepository } from './DataSubmissionRepository';
import { RollupRepository } from './RollupRepository';
import { ExtrinsicRepository } from './ExtrinsicRepository';
// Phase 1 repository instances
import { ValidatorRepository } from './ValidatorRepository';
import { TransferRepository } from './TransferRepository';
import { NominationRepository } from './NominationRepository';
import { EraRepository } from './EraRepository';
import { RewardRepository } from './RewardRepository';
// Phase 3 repository instances
import { AccountRepository } from './AccountRepository';
import { EventRepository } from './EventRepository';
// Phase 2 repository instances - DependencyRepository removed

export const blockRepository = new BlockRepository();
export const dataSubmissionRepository = new DataSubmissionRepository();
export const rollupRepository = new RollupRepository();
export const extrinsicRepository = new ExtrinsicRepository();
// Phase 1 repository instances
export const validatorRepository = new ValidatorRepository();
export const transferRepository = new TransferRepository();
export const nominationRepository = new NominationRepository();
export const eraRepository = new EraRepository();
export const rewardRepository = new RewardRepository();
// Phase 3 repository instances
export const accountRepository = new AccountRepository();
export const eventRepository = new EventRepository();
// Phase 2 repository instances - dependencyRepository removed

// Type exports
export type { BlockWithExtrinsics, BlockCreateInput } from './BlockRepository';
export type { 
  DataSubmissionWithRollup, 
  DataSubmissionCreateInput, 
  DataSubmissionFilters,
} from './DataSubmissionRepository';
export type { RollupCreateInput } from './RollupRepository';
export type { ExtrinsicCreateInput } from './ExtrinsicRepository';
// Phase 1 type exports
export type { 
  ValidatorWithRelations, 
  ValidatorCreateInput, 
  ValidatorUpdateInput,
  ValidatorFilters,
} from './ValidatorRepository';
export type { 
  TransferWithRelations, 
  TransferCreateInput, 
  TransferFilters,
} from './TransferRepository';
export type { 
  NominationCreateInput, 
  NominationFilters,
} from './NominationRepository';
export type { EraCreateInput } from './EraRepository';
export type { RewardCreateInput } from './RewardRepository';
// Phase 3 type exports
export type { AccountCreateInput, IAccountRepository } from './AccountRepository';
export type { EventCreateInput } from './EventRepository';
// Phase 2 type exports - DependencyRepository types removed