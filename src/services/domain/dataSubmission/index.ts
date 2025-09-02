/**
 * DataSubmission Domain Export Module
 * 
 * Provides unified access to all DataSubmission domain services and types
 */

// Core services
export { DataSubmissionApiService, createDataSubmissionApiService } from './DataSubmissionApiService';

// Interfaces and types
export {
  IDataSubmissionService,
  DataSubmissionFilterOptions,
  DataSubmissionWithDetails,
  DataSubmissionList,
  DataSubmissionStats,
  PaginationOptions,
  DataSubmissionInfo,
} from './DataSubmissionInterfaces';

// Re-export for backward compatibility during migration
export { DataSubmissionApiService as DataSubmissionService } from './DataSubmissionApiService';
export { createDataSubmissionApiService as createDataSubmissionService } from './DataSubmissionApiService'; 