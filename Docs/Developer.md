# Developer Guide

This guide provides essential information for developers working on the Avail Explorer backend. It covers critical warnings, system architecture, best practices, and solutions to common problems.

## 1. Critical Warnings

Urgent issues that will break the application if not followed.

### Block Hash Extraction Critical Issue
NEVER use `block.block.header.hash.toString()` for storing block hashes. This returns an internal header hash, not the canonical block hash.
- ✅ **Correct:** Use the hash parameter from `api.rpc.chain.getBlockHash(number)`
- ❌ **Wrong:** `block.block.header.hash.toString()` - causes parent-child relationship failures

### Blockchain Service Selection Critical
Use `AvailBlockchainService` for proper extrinsics extraction, not `BlockchainService`.
- ✅ **Correct:** `AvailBlockchainService` - extracts extrinsics properly with `avail-sdk`
- ❌ **Wrong:** `BlockchainService` - returns empty extrinsics arrays, causes missing data

### Substrate Extrinsic Hash Unique Constraint Violation
The database schema violates Substrate blockchain architecture by enforcing unique constraint on extrinsic hashes.
- ❌ **Wrong:** `hash String @unique` - Violates Substrate design where hashes can repeat across blocks
- ✅ **Solution:** Remove unique constraint, use `@@unique([blockNumber, extrinsicIndex])` for proper Substrate identification

## 2. System Architecture

High-level design and data flow.

### Smart Routing
The system uses the best API for each operation:
- **blocks** → Light Client first, RPC fallback
- **extrinsics** → RPC first, Nexus fallback
- **accounts** → Nexus first, RPC fallback
- **proofs** → Bridge first, Light Client fallback
- **dataSubmission** → Turbo DA first, Light Client fallback

### Chain Stats Collection
Chain statistics are managed by the `AnalyticsService`:
- `src/services/analytics/analytics.ts` → `getChainStats()`
- `src/routes/analytics.ts` → Exposes `/api/v1/analytics/chain-stats`

### Core Components
- **Singletons:** The application uses singleton instances for the database, blockchain, and queue services.

## 3. Development Best Practices

Key conventions and coding standards to follow.

### Avoid BigInt
Do not use `bigint` for any data models, as this leads to JSON serialization issues in the final API output.

### Task Assignment
To avoid conflicts and unclear task assignments:
- ✅ **Solution:** Create simple task guides with exact file locations and specific code to replace, ensuring clear delegation boundaries.

## 4. Common Issues & Solutions

Fixes for recurring problems.

### Mapper Field Mismatch Runtime Errors
- **Issue:** Prisma returns `camelCase` fields but TypeScript interfaces expect `snake_case`, causing "Cannot read properties of undefined (reading 'toISOString')" errors.
- **Solution:** Update mappers to handle both naming conventions: `field: obj.camelCase || obj.snake_case || defaultValue` with null safety for timestamps.

### Prisma `include` Relation Errors
- **Issue:** Removing `@relation` decorators and foreign key constraints from the Prisma schema breaks `include` statements in repository methods.
- **Solution:** Remove all `include` statements from repository methods. Update TypeScript types to be aliases of base entities for backward compatibility.

### Large Balance Values Integer Overflow
- **Issue:** Blockchain balance values (e.g., 14549686098333938000) exceed PostgreSQL INTEGER limits, causing "Unable to fit value into a 64-bit signed integer" errors.
- **Solution:** Use Prisma `Decimal` type with `@db.Decimal(65,18)` for balance fields. Replace `parseInt()` with `new Decimal(value)` in indexers. Supports unlimited precision and database calculations while avoiding BigInt JSON serialization issues.

### Queue Job Correlation Namespace Failures
- **Issue:** Queue jobs fail with "Correlation namespace not initialized. Call initializeCorrelationId() first." causing all extrinsic processing to fail.
- **Solution:** Ensure correlation namespace is initialized before job processing starts. Call `initializeCorrelationId()` in queue processor setup.

## 5. Performance

Notes on optimization and efficiency.

### Blockchain Function Call Strategy
Repetitive blockchain function calls are acceptable during indexing operations. Performance optimization through caching will be implemented at the blockchain service layer later.
- ✅ **Current approach:** Direct blockchain calls for each entity (validator, account, etc.).
- ✅ **Future optimization:** Add a caching layer to `AvailBlockchainService`.
- ⚠️ **Don't optimize prematurely:** Focus on complete data indexing first, then add caching.

## 6. Server & Script Execution

Instructions for running the application and standalone scripts.

### Initialization
- Use `initializeServices()` and `shutdownServices()` before and after every standalone script.

### Loading Environment Variables
- When running scripts with `npm`, `npx`, `tsx`, `node`, etc., always load the environment variables first.
- **Example:** `ENV_FILE=.env.local dotenv -e .env.local npx tsx scripts/my-script.ts`
- You can read the `.env.local` file using `echo $(cat .env.local)`.

### Server Startup Time
- It can take up to 30 seconds for the server to start, as it waits for all services to initialize. Wait before making requests to the server after a restart.