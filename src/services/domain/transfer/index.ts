/**
 * Transfer Domain Export Module
 * 
 * Provides unified access to all Transfer domain services and types
 */

// Core services
export { TransferApiService, createTransferApiService } from './TransferApiService';

// Interfaces and types
export {
  TransferFilters,
  TransferWithDetails,
  TransferList,
  TransferStats,
  PaginationOptions,
  ITransferService,
} from './TransferInterfaces';

// Re-export for backward compatibility during migration
export { TransferApiService as TransferService } from './TransferApiService';
export { createTransferApiService as createTransferService } from './TransferApiService'; 