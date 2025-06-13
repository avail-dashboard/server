// Main database exports
export { default as prisma } from './client';
export * from './repositories';

// Prisma types
export type { 
  Block, 
  Extrinsic, 
  DataSubmission, 
  Rollup, 
  Account, 
  Event, 
  Watchlist, 
  SyncState,
  SyncStatus,
  SyncMode 
} from '@prisma/client';