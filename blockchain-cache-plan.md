# Blockchain API Caching Implementation Plan

## Problem Statement

Currently, the `api.query.staking.validators(validatorId)` call and other blockchain API calls in ValidatorIndexer are **completely uncached**, causing:
- 500-2000ms delays per validator indexing
- High RPC load and potential rate limiting  
- Poor scalability for batch validator processing
- 5-10 blockchain calls per validator without caching

## Current State Analysis

### ✅ What's Already Cached
- **Database queries**: Prisma middleware with 15-minute TTL
- **Chain metadata**: `getChainInfo()` cached for 30 minutes  
- **Old blocks**: Blocks >100 age cached for 24 hours
- **Redis infrastructure**: Fully operational with health monitoring

### ❌ What's Missing
- **Validator preferences**: `api.query.staking.validators(validatorId)` uncached
- **Identity queries**: `api.query.identity.identityOf()` uncached
- **Staking ledger**: `api.query.staking.ledger()` uncached
- **Era stakers**: `api.query.staking.erasStakers()` uncached
- **Bonded controllers**: `api.query.staking.bonded()` uncached

## Implementation Strategy

### Phase 1: Core Cached Methods (Priority: HIGH)

Add these cached methods to `AvailBlockchainService`:

```typescript
// 1. Validator Preferences (5-minute TTL)
async getValidatorPrefs(validatorId: string): Promise<any> {
  const cacheKey = CacheKeys.validatorDetails(validatorId);
  return cacheWrapper(cacheKey, async () => {
    const api = await this.getApi();
    return await api.query.staking.validators(validatorId);
  }, CACHE_TTL.validators);
}

// 2. Identity Information (5-minute TTL)
async getIdentity(address: string): Promise<any> {
  const cacheKey = CacheKeys.validatorIdentity(address);
  return cacheWrapper(cacheKey, async () => {
    const api = await this.getApi();
    return await api.query.identity.identityOf(address);
  }, CACHE_TTL.validatorIdentity);
}

// 3. Staking Ledger (5-minute TTL)
async getStakingLedger(controllerAddress: string): Promise<any> {
  const cacheKey = `staking:ledger:${controllerAddress}`;
  return cacheWrapper(cacheKey, async () => {
    const api = await this.getApi();
    return await api.query.staking.ledger(controllerAddress);
  }, CACHE_TTL.validators);
}

// 4. Era Stakers (30-minute TTL - more stable)
async getEraStakers(era: number, validatorId: string): Promise<any> {
  const cacheKey = `staking:era:${era}:${validatorId}`;
  return cacheWrapper(cacheKey, async () => {
    const api = await this.getApi();
    return await api.query.staking.erasStakers(era, validatorId);
  }, CACHE_TTL.eraData);
}

// 5. Bonded Controller (15-minute TTL)
async getBondedController(stashAddress: string): Promise<any> {
  const cacheKey = `staking:bonded:${stashAddress}`;
  return cacheWrapper(cacheKey, async () => {
    const api = await this.getApi();
    return await api.query.staking.bonded(stashAddress);
  }, CACHE_TTL.sessionData);
}
```

### Phase 2: Update ValidatorIndexer (Priority: HIGH)

Replace direct API calls in `fetchValidatorFromBlockchain()`:

```typescript
// Before (uncached):
const [validatorPrefs, stakingLedger, stashIdentity, controllerIdentity, exposure] = await Promise.all([
  api.query.staking.validators(validatorId),
  controllerAddress ? api.query.staking.ledger(controllerAddress) : Promise.resolve(api.createType('Option<StakingLedger>')),
  api.query.identity.identityOf(validatorId),
  controllerAddress ? api.query.identity.identityOf(controllerAddress) : Promise.resolve(api.createType('Option<Registration>')),
  activeEra ? api.query.staking.erasStakers(activeEra, validatorId) : Promise.resolve(api.createType('Option<Exposure>')),
]);

// After (cached):
const [validatorPrefs, stakingLedger, stashIdentity, controllerIdentity, exposure] = await Promise.all([
  this.blockchain.getValidatorPrefs(validatorId),
  controllerAddress ? this.blockchain.getStakingLedger(controllerAddress) : Promise.resolve(api.createType('Option<StakingLedger>')),
  this.blockchain.getIdentity(validatorId),
  controllerAddress ? this.blockchain.getIdentity(controllerAddress) : Promise.resolve(api.createType('Option<Registration>')),
  activeEra ? this.blockchain.getEraStakers(activeEra, validatorId) : Promise.resolve(api.createType('Option<Exposure>')),
]);
```

### Phase 3: Cache Key Additions (Priority: MEDIUM)

Add missing cache keys to `utils/cache.ts`:

```typescript
export const CacheKeys = {
  // ... existing keys ...
  
  // Staking-specific cache keys
  validatorPrefs: (validatorId: string) => `staking:validators:${validatorId}`,
  stakingLedger: (controllerAddress: string) => `staking:ledger:${controllerAddress}`,
  bondedController: (stashAddress: string) => `staking:bonded:${stashAddress}`,
  eraStakers: (era: number, validatorId: string) => `staking:era:${era}:${validatorId}`,
  activeEra: () => `staking:active-era`,
};

export const CACHE_TTL = {
  // ... existing TTLs ...
  
  // Staking-specific TTLs
  validatorPrefs: 300,       // 5 minutes
  stakingLedger: 300,        // 5 minutes  
  bondedController: 900,     // 15 minutes
  eraStakers: 1800,          // 30 minutes (more stable)
  activeEra: 300,            // 5 minutes
};
```

## Prevention Mechanisms for Direct API Calls

### 1. Code Review Guidelines
- **Rule**: Never use `api.query.*` directly in domain services
- **Enforcement**: All blockchain queries must go through `AvailBlockchainService` cached methods
- **Documentation**: Update developer docs with caching patterns

### 2. TypeScript Interface Restriction
Create a restricted API interface:

```typescript
// src/services/types/blockchain-api.ts
export interface RestrictedBlockchainApi {
  // Only expose cached methods
  getValidatorPrefs(validatorId: string): Promise<any>;
  getIdentity(address: string): Promise<any>;
  getStakingLedger(controllerAddress: string): Promise<any>;
  // ... other cached methods
}

// Modify AvailBlockchainService to implement this interface
export class AvailBlockchainService implements BaseService, RestrictedBlockchainApi {
  // ... existing implementation
  
  // Hide raw API access - make it private
  private async getApi(): Promise<any> {
    const connection = await this.connectionManager.getHealthyConnection();
    return connection.api;
  }
}
```

### 3. ESLint Rule (Future Enhancement)
Create custom ESLint rule to detect direct API usage:

```typescript
// .eslintrc.js
rules: {
  'no-direct-blockchain-api': 'error', // Custom rule to detect api.query.* usage
  'prefer-cached-blockchain-methods': 'warn'
}
```

### 4. Wrapper Service Pattern
Create a `CachedBlockchainService` that only exposes cached methods:

```typescript
// src/services/core/cached-blockchain.ts
export class CachedBlockchainService {
  constructor(private blockchain: AvailBlockchainService) {}
  
  // Only expose cached methods - no raw API access
  async getValidatorPrefs(validatorId: string) {
    return this.blockchain.getValidatorPrefs(validatorId);
  }
  
  // ... other cached methods only
}
```

### 5. Documentation & Training
- Update `CLAUDE.md` with caching requirements
- Add to `docs/Developer.md`: "Always use cached blockchain methods"
- Create architecture decision record (ADR) for caching strategy

## Expected Performance Impact

### Before Implementation
- **Validator indexing**: 500-2000ms per validator
- **Batch processing**: 5 validators × 5 API calls = 25 uncached calls
- **RPC load**: High, potential rate limiting
- **Scalability**: Poor for large validator sets

### After Implementation
- **Validator indexing**: 50-200ms per validator (10x improvement)
- **Batch processing**: Most calls served from cache
- **RPC load**: Significantly reduced
- **Scalability**: Excellent for large validator sets

## Validation Steps

### 1. Performance Testing
- Benchmark validator indexing before/after implementation
- Test batch processing performance
- Monitor cache hit rates

### 2. Cache Verification
- Verify cache keys are being created
- Check TTL values are appropriate
- Monitor cache invalidation patterns

### 3. Integration Testing
- Test ValidatorIndexer with cached methods
- Verify data consistency between cached and fresh data
- Test edge cases (cache misses, errors)

## Risk Mitigation

### 1. Cache Invalidation
- Use appropriate TTL values for data freshness
- Implement cache warming for critical paths
- Monitor cache hit rates

### 2. Fallback Strategy
- Graceful degradation if cache is unavailable
- Retry logic for cache failures
- Logging for cache-related issues

### 3. Data Consistency
- Verify cached data matches fresh blockchain data
- Implement cache invalidation on critical events
- Monitor data staleness

## Implementation Timeline

**Week 1: Core Implementation**
- [ ] Add cached methods to AvailBlockchainService
- [ ] Update cache keys and TTL values
- [ ] Implement cacheWrapper pattern

**Week 2: Integration**
- [ ] Update ValidatorIndexer to use cached methods
- [ ] Test validator indexing performance
- [ ] Verify cache hit rates

**Week 3: Prevention & Documentation**
- [ ] Implement TypeScript interface restrictions
- [ ] Update developer documentation
- [ ] Create code review guidelines

**Week 4: Validation & Monitoring**
- [ ] Performance benchmarking
- [ ] Cache monitoring setup
- [ ] Integration testing

## Success Metrics

- **Performance**: 5-10x improvement in validator indexing time
- **Cache Hit Rate**: >80% for validator-related queries
- **RPC Load**: 50-70% reduction in blockchain API calls
- **Code Quality**: Zero direct API calls in domain services
- **Developer Experience**: Clear caching patterns and documentation

## Review & Approval

This plan should be reviewed by:
- [ ] Senior Developer (Architecture approval)
- [ ] DevOps Team (Cache infrastructure)
- [ ] Performance Team (Benchmarking strategy)
- [ ] Security Team (Cache security review)