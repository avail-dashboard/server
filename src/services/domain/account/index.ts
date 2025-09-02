/**
 * Account Domain Export Module
 * 
 * Provides unified access to all Account domain services and types.
 * Accounts are the base entity in the Avail blockchain explorer system.
 */

// Core services
export { AccountApiService, createAccountApiService } from './AccountApiService';

// Interfaces and types
export {
  AccountBalance,
  AccountWithDetails,
  AccountActivity,
  AccountStats,
  PaginationOptions,
  HistoryOptions,
  IAccountService,
} from './AccountInterfaces';

// Re-export for backward compatibility during migration
export { AccountApiService as AccountService } from './AccountApiService';
export { createAccountApiService as createAccountService } from './AccountApiService'; 