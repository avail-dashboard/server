export interface TableCacheConfig {
  ttl: number;                    // Cache TTL in seconds
  enabled: boolean;               // Enable/disable caching
  invalidateOnWrite: boolean;     // Auto-invalidate on writes
  keyPattern?: string;            // Custom key pattern
}

export interface QueryCacheOptions {
  useCache?: boolean;             // Enable/disable for this query
  ttl?: number;                   // Override default TTL
  cacheKey?: string;              // Custom cache key
  tags?: string[];                // Cache tags for invalidation
}

export interface GlobalCacheConfig {
  defaultTTL: number;             // Default cache TTL
  enabled: boolean;               // Global enable/disable
  keyPrefix: string;              // Cache key prefix
  maxKeyLength: number;           // Maximum key length
}

export const CACHE_CONFIG = {
  // Table-specific cache settings
  tables: {
    Block: { 
      ttl: 3600,                  // 1 hour - blocks are immutable
      enabled: true,
      invalidateOnWrite: true,
    },
    Account: { 
      ttl: 300,                   // 5 minutes - balances change frequently
      enabled: true,
      invalidateOnWrite: true,
    },
    Validator: { 
      ttl: 900,                   // 15 minutes - validator data changes moderately
      enabled: true,
      invalidateOnWrite: true,
    },
    Extrinsic: { 
      ttl: 1800,                  // 30 minutes - extrinsics are immutable
      enabled: true,
      invalidateOnWrite: true,
    },
    Event: { 
      ttl: 1800,                  // 30 minutes - events are append-only
      enabled: true,
      invalidateOnWrite: false,    // Events are never updated
    },
    Transfer: { 
      ttl: 1800,                  // 30 minutes - transfers are immutable
      enabled: true,
      invalidateOnWrite: false,
    },
    Nomination: { 
      ttl: 600,                   // 10 minutes - nominations change occasionally
      enabled: true,
      invalidateOnWrite: true,
    },
    Era: { 
      ttl: 1800,                  // 30 minutes - eras change infrequently
      enabled: true,
      invalidateOnWrite: true,
    },
    Reward: { 
      ttl: 1800,                  // 30 minutes - rewards are immutable once set
      enabled: true,
      invalidateOnWrite: false,
    },
    DataSubmission: { 
      ttl: 1800,                  // 30 minutes - data submissions are immutable
      enabled: true,
      invalidateOnWrite: true,
    },
    Rollup: { 
      ttl: 900,                   // 15 minutes - rollup data changes occasionally
      enabled: true,
      invalidateOnWrite: true,
    },
    Watchlist: { 
      ttl: 300,                   // 5 minutes - user data changes frequently
      enabled: true,
      invalidateOnWrite: true,
    },
    SyncState: { 
      ttl: 60,                    // 1 minute - sync state changes very frequently
      enabled: true,
      invalidateOnWrite: true,
    },
  } as Record<string, TableCacheConfig>,

  // Global cache settings
  global: {
    defaultTTL: 300,              // 5 minutes default
    enabled: true,
    keyPrefix: 'db:',
    maxKeyLength: 250,
  } as GlobalCacheConfig,

  // Cache invalidation patterns
  invalidation: {
    Block: ['blocks:*', 'chain:*', 'latest:*'],
    Account: ['accounts:*', 'balances:*'],
    Validator: ['validators:*', 'staking:*'],
    Extrinsic: ['extrinsics:*', 'blocks:*'],
    Event: ['events:*', 'blocks:*'],
    Transfer: ['transfers:*', 'accounts:*'],
    Nomination: ['nominations:*', 'validators:*', 'staking:*'],
    Era: ['eras:*', 'staking:*'],
    Reward: ['rewards:*', 'validators:*', 'accounts:*'],
    DataSubmission: ['data-submissions:*', 'rollups:*'],
    Rollup: ['rollups:*', 'data-submissions:*'],
    Watchlist: ['watchlists:*'],
    SyncState: ['sync:*'],
  } as Record<string, string[]>,
};

// Helper functions
export function getTableCacheConfig(tableName: string): TableCacheConfig {
  return CACHE_CONFIG.tables[tableName] || {
    ttl: CACHE_CONFIG.global.defaultTTL,
    enabled: true,
    invalidateOnWrite: true,
  };
}

export function isCacheEnabled(tableName: string): boolean {
  return CACHE_CONFIG.global.enabled && getTableCacheConfig(tableName).enabled;
}

export function getCacheTTL(tableName: string, customTTL?: number): number {
  if (customTTL) {return customTTL;}
  return getTableCacheConfig(tableName).ttl;
}

export function getInvalidationPatterns(tableName: string): string[] {
  return CACHE_CONFIG.invalidation[tableName] || [`${tableName.toLowerCase()}:*`];
}