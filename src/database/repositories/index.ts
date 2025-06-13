export { BaseRepository } from './BaseRepository';
export { BlockRepository } from './BlockRepository';
export { DataSubmissionRepository } from './DataSubmissionRepository';
export { RollupRepository } from './RollupRepository';
export { ExtrinsicRepository } from './ExtrinsicRepository';

// Repository instances for dependency injection
import { BlockRepository } from './BlockRepository';
import { DataSubmissionRepository } from './DataSubmissionRepository';
import { RollupRepository } from './RollupRepository';
import { ExtrinsicRepository } from './ExtrinsicRepository';

export const blockRepository = new BlockRepository();
export const dataSubmissionRepository = new DataSubmissionRepository();
export const rollupRepository = new RollupRepository();
export const extrinsicRepository = new ExtrinsicRepository();

// Type exports
export type { BlockWithExtrinsics, BlockCreateInput } from './BlockRepository';
export type { 
  DataSubmissionWithRollup, 
  DataSubmissionCreateInput, 
  DataSubmissionFilters 
} from './DataSubmissionRepository';
export type { RollupCreateInput } from './RollupRepository';
export type { ExtrinsicCreateInput } from './ExtrinsicRepository';