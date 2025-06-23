import { BlockData } from './blockchain';

/**
 * Self-Healing Processor Interface
 * 
 * Services implementing this interface can:
 * 1. Extract their entities from blockchain block data
 * 2. Process extracted entities with dependency resolution
 * 3. Ensure their dependencies exist (auto-create missing accounts, rollups, etc.)
 */
export interface SelfHealingProcessor {
  /**
   * Extract entities from block data that this service is responsible for
   * @param blockData - The blockchain block data to process
   * @returns Array of extracted entities with their metadata
   */
  extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]>;

  /**
   * Process the extracted entities and store them in the database
   * This method should call ensureDependencies() for each entity before processing
   * @param entities - The entities extracted from block data
   * @returns Array of processed/stored entities
   */
  processExtractedEntities(entities: ExtractedEntity[]): Promise<any[]>;

  /**
   * Ensure all dependencies for an entity exist
   * Auto-create missing accounts, rollups, or other required entities
   * @param entity - The entity to check dependencies for
   */
  ensureDependencies(entity: ExtractedEntity): Promise<void>;
}

/**
 * Extracted Entity
 * 
 * Represents an entity extracted from blockchain data with its dependencies
 */
export interface ExtractedEntity {
  /** Type of entity (e.g., 'account', 'validator', 'transfer', 'data_submission') */
  type: string;
  
  /** Unique identifier for this entity within its type */
  id: string;
  
  /** Entity-specific data to be processed */
  data: any;
  
  /** List of dependencies that must exist before this entity can be processed */
  dependencies: DependencyInfo[];
}

/**
 * Dependency Information
 * 
 * Describes a dependency that must be resolved before processing an entity
 */
export interface DependencyInfo {
  /** Service responsible for ensuring this dependency exists */
  service: string;
  
  /** Type of entity this dependency represents */
  entityType: string;
  
  /** Unique identifier of the dependency entity */
  entityId: string;
  
  /** Whether this dependency is required (processing fails if not resolvable) */
  required: boolean;
}

/**
 * Dependency Resolution Registry
 * 
 * Provides a way for services to resolve dependencies without tight coupling
 * This avoids circular dependency issues between services
 */
export interface DependencyResolver {
  /**
   * Ensure an account exists, creating it if necessary
   * @param address - The account address
   * @returns The account entity
   */
  ensureAccount(address: string): Promise<any>;

  /**
   * Ensure a block exists, creating it if necessary
   * @param blockNumber - The block number
   * @returns The block entity
   */
  ensureBlock(blockNumber: number): Promise<any>;

  /**
   * Ensure a rollup exists, creating it if necessary  
   * @param appId - The application ID
   * @returns The rollup entity
   */
  ensureRollup(appId: number): Promise<any>;

  /**
   * Register a dependency resolution function for a specific entity type
   * @param entityType - The type of entity (e.g., 'account', 'rollup')
   * @param resolver - Function to resolve/create the entity
   */
  registerResolver(entityType: string, resolver: (entityId: string) => Promise<any>): void;

  /**
   * Resolve a dependency by entity type and ID
   * @param entityType - Type of entity to resolve
   * @param entityId - ID of the entity to resolve
   * @returns The resolved entity
   */
  resolve(entityType: string, entityId: string): Promise<any>;
}

/**
 * Self-Healing Block Processor Interface
 * 
 * Orchestrates multiple self-healing services to process a complete block
 */
export interface SelfHealingBlockProcessor {
  /**
   * Process a complete block using all registered self-healing services
   * @param blockData - The blockchain block to process
   */
  processBlock(blockData: BlockData): Promise<void>;

  /**
   * Register a self-healing service for block processing
   * @param name - Service name for logging and identification
   * @param service - The self-healing service instance
   */
  registerService(name: string, service: SelfHealingProcessor): void;
}

/**
 * Entity Type Constants
 * 
 * Standard entity types used across self-healing services
 */
export const ENTITY_TYPES = {
  ACCOUNT: 'account',
  VALIDATOR: 'validator', 
  TRANSFER: 'transfer',
  DATA_SUBMISSION: 'data_submission',
  ROLLUP: 'rollup',
  EXTRINSIC: 'extrinsic',
  BLOCK: 'block',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

/**
 * Service Names Constants
 * 
 * Standard service names for dependency resolution
 */
export const SERVICE_NAMES = {
  ACCOUNT: 'account',
  VALIDATOR: 'validator',
  TRANSFER: 'transfer', 
  DATA_SUBMISSION: 'dataSubmission',
  ROLLUP: 'rollup',
} as const;

export type ServiceName = typeof SERVICE_NAMES[keyof typeof SERVICE_NAMES]; 