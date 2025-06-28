/**
 * DataSubmission Domain Export Module
 * 
 * Provides unified access to all DataSubmission domain services and types
 */

// Core services
export { DataSubmissionApiService, createDataSubmissionApiService } from './DataSubmissionApiService';
export { DataSubmissionProcessor, createDataSubmissionProcessor } from './DataSubmissionProcessor';
export { AvailDataSubmissionIndexer } from './DataSubmissionIndexer';

// Interfaces and types
export {
  IDataSubmissionService,
  IDataSubmissionProcessor,
  DataSubmissionFilterOptions,
  DataSubmissionWithDetails,
  DataSubmissionList,
  DataSubmissionStats,
  PaginationOptions,
  DataSubmissionInfo,
  DataSubmissionProcessingOptions,
  DataSubmissionProcessingResult,
} from './DataSubmissionInterfaces';

// Re-export for backward compatibility during migration
export { DataSubmissionApiService as DataSubmissionService } from './DataSubmissionApiService';
export { createDataSubmissionApiService as createDataSubmissionService } from './DataSubmissionApiService'; 