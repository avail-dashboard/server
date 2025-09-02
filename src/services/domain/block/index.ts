/**
 * Block Domain Export Module
 * 
 * Provides unified access to all Block domain services and types
 */

// Core services
export { BlockApiService, createBlockApiService } from './BlockApiService';

// Interfaces and types
export {
  IBlockService,
  BlockValidationResult,
} from './BlockInterfaces';

// Re-export for backward compatibility during migration
export { BlockApiService as BlockService } from './BlockApiService';
export { createBlockApiService as createBlockService } from './BlockApiService'; 