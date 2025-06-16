


## Smart routing: Uses the best API for each operation:
blocks → Light Client first, RPC fallback
extrinsics → RPC first, Nexus fallback
accounts → Nexus first, RPC fallback
proofs → Bridge first, Light Client fallback
dataSubmission → Turbo DA first, Light Client fallback

## Chain Stats Collection
Multiple services contribute to chain statistics:
src/services/rpc/methods.ts → getChainStats()
src/services/hybrid-rpc.ts → getChainStatsPolkadot()
src/services/direct-websocket.ts → getChainStats()
src/routes/chain.ts → Exposes /api/chain/stats




## initialization
use these before every standalone script: shutdownServices, initializeServices

singleton database, blockchain, queue

don't use bigint for anything, as this leads to JSON serialization issues


Loading env variables:
* ENV_FILE=.env.local dotenv -e .env.local etc whenever using env variables like `npm`, `npx`, `tsx`, `node` etc.

## Avail Data Submission Indexing
Foreign key constraint issue with data_submissions_app_id_fkey → Fixed by ensuring rollup records exist before inserting data submissions. Added ensureRollupsExist() method to AvailDataSubmissionIndexer to auto-create rollup records for new app_ids discovered during indexing.

## Foreign Key Constraint Issues
data_submissions_app_id_fkey violations: Ensure rollup records exist before inserting data submissions. Create rollups first in indexing flow.

## Mapper Field Mismatch Runtime Errors
Prisma returns camelCase fields but TypeScript interfaces expect snake_case, causing "Cannot read properties of undefined (reading 'toISOString')" errors.
Solution: Update mappers to handle both naming conventions: `field: obj.camelCase || obj.snake_case || defaultValue` with null safety for timestamps.

It can take up to 30 seconds for the server to start, as it waits for all the services to start. So wait for making requests to server

## Block Hash Extraction Critical Issue
NEVER use `block.block.header.hash.toString()` for storing block hashes. This returns an internal header hash, not the canonical block hash.
✅ Correct: Use the hash parameter from `api.rpc.chain.getBlockHash(number)` 
❌ Wrong: `block.block.header.hash.toString()` - causes parent-child relationship failures
