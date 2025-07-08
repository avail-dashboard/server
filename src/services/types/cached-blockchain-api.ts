/**
 * Cached Blockchain API Interface
 * 
 * This interface defines the public API for blockchain operations with caching.
 * All domain services should use these cached methods instead of direct API calls.
 * 
 * Purpose: Prevent direct api.query.* usage and ensure all blockchain calls are cached.
 */

export interface CachedBlockchainApi {
  // Chain information
  getChainInfo(): Promise<any>;
  getLatestBlock(): Promise<any>;
  getBlock(hashOrNumber: string | number): Promise<any>;
  
  // Validator and staking queries (cached)
  getValidatorPrefs(validatorId: string): Promise<any>;
  getIdentity(address: string): Promise<any>;
  getStakingLedger(controllerAddress: string): Promise<any>;
  getBondedController(stashAddress: string): Promise<any>;
  getEraStakers(era: number, validatorId: string): Promise<any>;
  getActiveEra(): Promise<any>;
  
  // Account queries (cached)
  getAccountData(address: string): Promise<any>;
  getValidatorEntries(): Promise<any>;
  
  // Chain metadata queries (cached)
  getChainConstants(): Promise<any>;
  getSystemRpc(): Promise<{ chain: any; version: any; properties: any }>;
  getRawBlock(blockNumber: number): Promise<any>;
  
  // Era queries (cached)
  getEraTotalStake(era: number): Promise<any>;
  getEraValidatorReward(era: number): Promise<any>;
  
  // Service management
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): Promise<any>;
  isHealthy(): boolean;
}

/**
 * Guidelines for using CachedBlockchainApi:
 * 
 * 1. ALWAYS use cached methods instead of direct API calls
 * 2. NEVER call getApi() directly - it's now private
 * 3. Add new cached methods to this interface when needed
 * 4. All domain services should depend on this interface
 * 5. Update this interface when adding new blockchain operations
 */