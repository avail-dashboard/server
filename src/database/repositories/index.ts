export { BaseRepository } from './BaseRepository';
export { BlockRepository } from './BlockRepository';
export { DataSubmissionRepository } from './DataSubmissionRepository';
export { RollupRepository } from './RollupRepository';

// Repository instances for dependency injection
import { BlockRepository } from './BlockRepository';
import { DataSubmissionRepository } from './DataSubmissionRepository';
import { RollupRepository } from './RollupRepository';

export const blockRepository = new BlockRepository();
export const dataSubmissionRepository = new DataSubmissionRepository();
export const rollupRepository = new RollupRepository();

// Type exports
export type { BlockWithExtrinsics, BlockCreateInput } from './BlockRepository';
export type { 
  DataSubmissionWithRollup, 
  DataSubmissionCreateInput, 
  DataSubmissionFilters 
} from './DataSubmissionRepository';
export type { RollupCreateInput } from './RollupRepository';