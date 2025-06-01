# Avail Explorer Backend - Complete API Documentation

## Base URL
```
http://localhost:3001
```

## API Prefix
All API endpoints are prefixed with `/api`

## Response Format
All API responses follow this standard format:
```json
{
  "success": boolean,
  "data": any,
  "meta": {
    "page"?: number,
    "limit"?: number,
    "total"?: number,
    "source": "rpc" | "database",
    "note"?: string
  },
  "error"?: {
    "code": string,
    "message": string
  }
}
```

---

## External RPC Calls & Data Sources

This section details the external calls to Avail/Polkadot RPC nodes that power each API endpoint.

### Architecture Overview

The backend uses a **Hybrid RPC Architecture** with multiple layers:

1. **API Routes** (`src/routes/`) - Express.js endpoints
2. **Blockchain Service** (`src/services/blockchain.ts`) - High-level blockchain operations
3. **Hybrid RPC Service** (`src/services/hybrid-rpc.ts`) - Polkadot API integration
4. **Avail RPC Service** (`src/services/rpc/`) - Avail-specific RPC calls
5. **External RPC Nodes** - Avail/Polkadot network nodes

### RPC Connection Management

- **Primary**: Polkadot.js API (`@polkadot/api`) for standard Substrate calls
- **Fallback**: Direct Avail RPC for Avail-specific features
- **Load Balancing**: Multiple RPC endpoints with health checking
- **Caching**: Redis-based caching with configurable TTL
- **Error Handling**: Automatic failover and retry logic

---

## API Endpoint RPC Call Mapping

### Health & Monitoring Endpoints

#### 1. Health Check (`GET /health`)
**Call Chain:** Route → Direct health check
**External RPC Calls:**
- None (internal health status only)
**Caching:** None

#### 2. Metrics (`GET /metrics`)
**Call Chain:** Route → Direct metrics collection
**External RPC Calls:**
- None (internal metrics only)
**Caching:** None

#### 3. API Health Check (`GET /api/health`)
**Call Chain:** Route → BlockchainService.getHealth() → HybridRPC.getHealth()
**External RPC Calls:**
```javascript
// Polkadot API health check
api.rpc.system.health()
api.rpc.system.chain()
api.rpc.chain.getHeader()
```
**Caching:** 30 seconds TTL

---

### Block Endpoints

#### 1. Get Latest Blocks (`GET /api/blocks`)
**Call Chain:** Route → BlockchainService.getLatestBlocks() → HybridRPC.getLatestBlocks() → RPCMethodsService.getLatestBlocks()

**External RPC Calls:**
```javascript
// Get latest block header
api.rpc.chain.getHeader()

// For each block in range:
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
api.rpc.chain.getHeader(blockHash)
```

**Specific RPC Methods:**
- `chain.getHeader` - Get latest block header for current height
- `chain.getBlockHash` - Get block hash by number
- `chain.getBlock` - Get full block data by hash
- `chain.getHeader` - Get block header by hash

**Caching:** 5 seconds TTL
**Data Transformation:** SignedBlock → Block interface

#### 2. Get Block by Number/Hash (`GET /api/blocks/{numberOrHash}`)
**Call Chain:** Route → BlockchainService.getBlockByNumber/Hash() → HybridRPC.getBlockByNumber() → RPCMethodsService.getBlockByNumber()

**External RPC Calls:**
```javascript
// For block by number:
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
api.rpc.chain.getHeader(blockHash)

// For block by hash:
api.rpc.chain.getBlock(blockHash)
api.rpc.chain.getHeader(blockHash)
```

**Specific RPC Methods:**
- `chain.getBlockHash` - Convert block number to hash
- `chain.getBlock` - Get full block with extrinsics
- `chain.getHeader` - Get block header metadata

**Caching:** 1 hour TTL (specific blocks)
**Data Transformation:** SignedBlock + Header → Block with extrinsics

---

### Extrinsic Endpoints

#### 1. Get Extrinsics (`GET /api/extrinsics`)
**Call Chain:** Route → BlockchainService.getLatestExtrinsics() → HybridRPC.getLatestExtrinsics() → RPCMethodsService.getLatestExtrinsics()

**External RPC Calls:**
```javascript
// Get recent blocks to extract extrinsics
api.rpc.chain.getHeader()
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
```

**Specific RPC Methods:**
- `chain.getHeader` - Get current block height
- `chain.getBlockHash` - Get hashes for recent blocks
- `chain.getBlock` - Get blocks with extrinsics

**Caching:** 5 seconds TTL
**Data Transformation:** Block.extrinsics → Extrinsic[]

#### 2. Get Extrinsic by Hash (`GET /api/extrinsics/{hash}`)
**Call Chain:** Route → BlockchainService.getExtrinsicByHash() → Search through recent blocks

**External RPC Calls:**
```javascript
// Search through recent blocks
api.rpc.chain.getHeader()
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
```

**Note:** Currently searches through recent blocks as direct extrinsic lookup by hash is not implemented.

---

### Chain Endpoints

#### 1. Get Chain Statistics (`GET /api/chain/stats`)
**Call Chain:** Route → BlockchainService.getChainStats() → HybridRPC.getChainStats() → RPCMethodsService.getChainStats()

**External RPC Calls:**
```javascript
// Chain information
api.rpc.chain.getHeader()
api.rpc.system.chain()

// Token economics
api.query.balances.totalIssuance()
api.query.staking.totalStake()

// Staking information
api.query.staking.validators.entries()
api.query.staking.nominators.entries()
```

**Specific RPC Methods:**
- `chain.getHeader` - Current block height and finalized blocks
- `system.chain` - Chain name and properties
- `balances.totalIssuance` - Total token supply
- `staking.totalStake` - Total staked amount
- `staking.validators` - Active validators count
- `staking.nominators` - Nominators count

**Caching:** 30 seconds TTL
**Data Transformation:** Multiple RPC responses → ChainStats

---

### Search Endpoints

#### 1. Universal Search (`GET /api/search`)
**Call Chain:** Route → Search logic → Multiple blockchain service calls

**External RPC Calls (depending on query type):**
```javascript
// If numeric (block number):
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)

// If hash (block/extrinsic):
api.rpc.chain.getBlock(hash)

// If address:
api.query.system.account(address)
```

**Caching:** 1 minute TTL
**Data Transformation:** Various → SearchResult[]

---

### Account Endpoints

#### 1. Get Account Details (`GET /api/accounts/{address}`)
**Call Chain:** Route → BlockchainService.getAccountDetails() → HybridRPC.getAccountDetails() → RPCMethodsService.getAccountDetails()

**External RPC Calls:**
```javascript
// Account information
api.query.system.account(address)
```

**Specific RPC Methods:**
- `system.account` - Get account balance, nonce, and flags

**Caching:** 30 seconds TTL
**Data Transformation:** AccountInfo → Account interface

---

### Data Submission Endpoints

#### 1. Get Data Submissions (`GET /api/data-submissions`)
**Call Chain:** Route → BlockchainService.getDataSubmissions() → HybridRPC.getDataSubmissions() → RPCMethodsService.getDataSubmissions()

**External RPC Calls:**
```javascript
// Get recent blocks and filter for data submissions
api.rpc.chain.getHeader()
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
```

**Data Filtering:** Filters extrinsics for `dataAvailability.submitData` calls
**Caching:** 5 seconds TTL
**Data Transformation:** Extrinsic → DataSubmission

#### 2. Get Data Submission Statistics (`GET /api/data-submissions/stats`)
**Call Chain:** Route → BlockchainService.getDataSubmissionStats() → Analysis of recent submissions

**External RPC Calls:**
```javascript
// Analyze recent blocks for submission patterns
api.rpc.chain.getHeader()
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
```

**Caching:** 1 minute TTL

---

### Validator Endpoints

#### 1. Get Validators List (`GET /api/validators`)
**Call Chain:** Route → BlockchainService.getValidators() → HybridRPC.getValidators() → RPCMethodsService.getValidators()

**External RPC Calls:**
```javascript
// Validator information
api.query.session.validators()
api.query.staking.validators.entries()
api.query.staking.erasStakers.entries()

// For each validator:
api.query.staking.validators(validatorAddress)
api.query.identity.identityOf(validatorAddress)
```

**Specific RPC Methods:**
- `session.validators` - Current active validators
- `staking.validators` - Validator preferences and commission
- `staking.erasStakers` - Validator stake and nominators
- `identity.identityOf` - Validator identity information

**Caching:** 5 minutes TTL

#### 2. Get Validator Details (`GET /api/validators/{address}`)
**External RPC Calls:**
```javascript
// Detailed validator information
api.query.staking.validators(address)
api.query.staking.erasStakers(currentEra, address)
api.query.identity.identityOf(address)
api.query.staking.nominators.entries()
```

**Caching:** 2 minutes TTL

#### 3. Get Staking Overview (`GET /api/validators/staking/overview`)
**External RPC Calls:**
```javascript
// Staking system overview
api.query.staking.totalStake()
api.query.staking.validators.entries()
api.query.staking.nominators.entries()
api.query.staking.currentEra()
api.query.staking.erasRewardPoints(currentEra)
```

**Caching:** 1 minute TTL

#### 4. Get Nomination Pools (`GET /api/validators/nomination-pools`)
**External RPC Calls:**
```javascript
// Nomination pools (if available)
api.query.nominationPools?.bondedPools?.entries()
api.query.nominationPools?.poolMembers?.entries()
```

**Note:** Nomination pools may not be available on all Avail networks.

---

### Analytics Endpoints

#### 1. Get Network Analytics (`GET /api/analytics/network`)
**Call Chain:** Route → AnalyticsService.getNetworkAnalytics() → Multiple blockchain calls

**External RPC Calls:**
```javascript
// Current network state
api.rpc.chain.getHeader()
api.query.balances.totalIssuance()
api.query.staking.totalStake()
api.query.staking.validators.entries()

// Historical data (recent blocks)
api.rpc.chain.getBlockHash(blockNumber)
api.rpc.chain.getBlock(blockHash)
```

**Caching:** 1 minute TTL

#### 2. Get Gas Analytics (`GET /api/analytics/gas`)
**External RPC Calls:**
```javascript
// Fee analysis from recent blocks
api.rpc.chain.getHeader()
api.rpc.chain.getBlock(blockHash)
// Analyze extrinsic fees and weights
```

**Note:** Gas tracking implementation in progress.

#### 3. Get Rollup Analytics (`GET /api/analytics/rollups`)
**External RPC Calls:**
```javascript
// Data submission analysis
api.rpc.chain.getHeader()
api.rpc.chain.getBlock(blockHash)
// Filter and analyze dataAvailability.submitData extrinsics
```

#### 4-6. Other Analytics Endpoints
Similar pattern of analyzing recent blocks and extracting relevant metrics.

---

### Rollup Endpoints

#### 1. Get Rollup Leaderboard (`GET /api/rollups/leaderboard`)
**External RPC Calls:**
```javascript
// Analyze data submissions by app ID
api.rpc.chain.getHeader()
api.rpc.chain.getBlock(blockHash)
// Group and rank by app ID
```

#### 2. Get Rollups List (`GET /api/rollups`)
**External RPC Calls:**
```javascript
// Extract unique app IDs from submissions
api.rpc.chain.getHeader()
api.rpc.chain.getBlock(blockHash)
// Aggregate statistics per app ID
```

#### 3. Get Rollup Details (`GET /api/rollups/{appId}`)
**External RPC Calls:**
```javascript
// Filter submissions by specific app ID
api.rpc.chain.getBlock(blockHash)
// Calculate app-specific metrics
```

#### 4. Get Rollup Submissions (`GET /api/rollups/{appId}/submissions`)
**External RPC Calls:**
```javascript
// Filter data submissions by app ID
api.rpc.chain.getBlock(blockHash)
// Extract submissions for specific app
```

#### 5. Get Rollup Blobs (`GET /api/rollups/{appId}/blobs`)
**External RPC Calls:**
```javascript
// Get blob data for app
api.rpc.chain.getBlock(blockHash)
// Extract blob commitments and data
```

#### 6. Get Rollup Analytics (`GET /api/rollups/{appId}/analytics`)
**External RPC Calls:**
```javascript
// App-specific analytics
api.rpc.chain.getBlock(blockHash)
// Calculate metrics for specific app ID
```

---

## Avail-Specific RPC Methods

### Data Availability Proofs
```javascript
// Kate commitment proofs
api.rpc.kate.queryProof(blockHash, extrinsicIndex)
api.rpc.kate.queryDataProof(blockHash, appId)
api.rpc.kate.blockLength(blockHash)
```

### Application Data
```javascript
// Get data for specific app ID
api.rpc.kate.queryRows(blockHash, rows)
// Extract application-specific data
```

### Block Data Root
```javascript
// Get data root for DA
api.rpc.kate.blockLength(blockHash)
```

---

## RPC Performance & Optimization

### Caching Strategy
- **Blocks**: 5 seconds (latest), 1 hour (specific)
- **Accounts**: 30 seconds
- **Chain Stats**: 30 seconds
- **Validators**: 5 minutes
- **Analytics**: 1 minute

### Connection Management
- **Health Checking**: Every 30 seconds
- **Load Balancing**: Round-robin with health-based routing
- **Retry Logic**: 3 attempts with exponential backoff
- **Timeout**: 30 seconds per RPC call

### Error Handling
- **Fallback**: Avail RPC → Polkadot API → Cached data
- **Circuit Breaker**: Disable unhealthy endpoints
- **Graceful Degradation**: Return partial data when possible

### Monitoring
- **RPC Call Metrics**: Duration, success rate, endpoint health
- **Cache Hit Rates**: Per endpoint caching effectiveness
- **Connection Stats**: Active connections, error rates

---

## Health & Monitoring Endpoints

### 1. Health Check
**GET** `/health`

Check server health status.

```bash
curl -X GET "http://localhost:3001/health"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### 2. Metrics
**GET** `/metrics`

Get Prometheus metrics.

```bash
curl -X GET "http://localhost:3001/metrics"
```

### 3. API Health Check
**GET** `/api/health`

Health check under API versioning.

```bash
curl -X GET "http://localhost:3001/api/health"
```

---

## Block Endpoints

### 1. Get Latest Blocks
**GET** `/api/blocks`

Retrieve the latest blocks with pagination.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of blocks per page (default: 10)

```bash
# Get latest blocks (default pagination)
curl -X GET "http://localhost:3001/api/blocks"

# Get specific page with custom limit
curl -X GET "http://localhost:3001/api/blocks?page=2&limit=20"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "number": 1000000,
      "hash": "0x1234567890abcdef...",
      "parent_hash": "0xabcdef1234567890...",
      "timestamp": 1704067200000,
      "extrinsics": 5,
      "time": "2024-01-01T00:00:00.000Z",
      "state_root": "0x...",
      "extrinsics_root": "0x...",
      "author_id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "size": 1024,
      "weight": 500000,
      "spec": 1000,
      "finalized": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1000000,
    "source": "rpc"
  }
}
```

### 2. Get Block by Number or Hash
**GET** `/api/blocks/{numberOrHash}`

Retrieve a specific block by block number or hash.

**Path Parameters:**
- `numberOrHash`: Block number (integer) or block hash (0x...)

```bash
# Get block by number
curl -X GET "http://localhost:3001/api/blocks/1000000"

# Get block by hash
curl -X GET "http://localhost:3001/api/blocks/0x1234567890abcdef..."
```

**Response:**
```json
{
  "success": true,
  "data": {
    "number": 1000000,
    "hash": "0x1234567890abcdef...",
    "parent_hash": "0xabcdef1234567890...",
    "state_root": "0x...",
    "timestamp": 1704067200000,
    "extrinsics_count": 5,
    "time": "2024-01-01T00:00:00.000Z",
    "extrinsics_root": "0x...",
    "author_id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "size": 1024,
    "weight": 500000,
    "spec": 1000,
    "finalized": true,
    "extrinsics": [
      {
        "id": "ext_123",
        "hash": "0x...",
        "extrinsic_index": 0,
        "module": "System",
        "call": "set_code",
        "success": true,
        "timestamp": 1704067200000,
        "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "fee": 1000000000000000,
        "tip": 0,
        "signature": "0x...",
        "args": {},
        "events": []
      }
    ]
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Extrinsic Endpoints

### 1. Get Extrinsics
**GET** `/api/extrinsics`

Retrieve extrinsics with optional filtering.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of extrinsics per page (default: 10)
- `block` (optional): Filter by specific block number

```bash
# Get latest extrinsics
curl -X GET "http://localhost:3001/api/extrinsics"

# Get extrinsics for specific block
curl -X GET "http://localhost:3001/api/extrinsics?block=1000000"

# Get with pagination
curl -X GET "http://localhost:3001/api/extrinsics?page=2&limit=20"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "hash": "0x1234567890abcdef...",
      "blockNumber": 1000000,
      "extrinsicIndex": 0,
      "module": "System",
      "call": "set_code",
      "success": true,
      "timestamp": 1704067200000,
      "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "fee": 1000000000000000,
      "tip": 0,
      "signature": "0x...",
      "args": {},
      "events": [],
      "isSigned": true,
      "isUserTransaction": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 500000,
    "source": "rpc"
  }
}
```

### 2. Get Extrinsic by Hash
**GET** `/api/extrinsics/{hash}`

Retrieve a specific extrinsic by its hash.

**Path Parameters:**
- `hash`: Extrinsic hash (0x...)

```bash
curl -X GET "http://localhost:3001/api/extrinsics/0x1234567890abcdef..."
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hash": "0x1234567890abcdef...",
    "blockNumber": 1000000,
    "extrinsicIndex": 0,
    "module": "System",
    "call": "set_code",
    "success": true,
    "timestamp": 1704067200000,
    "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "fee": 1000000000000000,
    "tip": 0,
    "signature": "0x...",
    "args": {},
    "events": [],
    "isSigned": true,
    "isUserTransaction": true
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Chain Endpoints

### 1. Get Chain Statistics
**GET** `/api/chain/stats`

Retrieve comprehensive chain statistics.

```bash
curl -X GET "http://localhost:3001/api/chain/stats"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "finalizedBlocks": 1000000,
    "signedExtrinsics": 70,
    "stakedAmount": "500000000000000000000000",
    "bondedAmount": "500000000000000000000000",
    "holders": 1500,
    "totalAccounts": 1500,
    "transfers": 49,
    "inflationRate": 0.07,
    "tokenPrice": 0,
    "priceChange": 0,
    "totalIssuance": "1000000000000000000000000",
    "circulating": {
      "amount": "450000000000000000000000",
      "percentage": 45
    },
    "staking": {
      "amount": "500000000000000000000000",
      "percentage": 50
    },
    "treasury": {
      "amount": "50000000000000000000000",
      "percentage": 5
    },
    "others": {
      "amount": "0",
      "percentage": 0
    },
    "marketCap": 0,
    "totalSupply": 1000000000000000000000000,
    "circulatingSupply": 450000000000000000000000,
    "stakingRatio": 0.5,
    "inflation": 0.07,
    "activeValidators": 100,
    "blockTime": 20,
    "lastBlockTimestamp": 1704067200000
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Search Endpoints

### 1. Universal Search
**GET** `/api/search`

Search for blocks, extrinsics, or accounts.

**Query Parameters:**
- `q` (required): Search query

```bash
# Search by block number
curl -X GET "http://localhost:3001/api/search?q=1000000"

# Search by hash
curl -X GET "http://localhost:3001/api/search?q=0x1234567890abcdef..."

# Search by account address
curl -X GET "http://localhost:3001/api/search?q=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "block",
      "id": "1000000",
      "title": "Block #1000000",
      "description": "Block number 1000000",
      "url": "/blocks/1000000"
    }
  ],
  "meta": {
    "total": 1,
    "source": "database"
  }
}
```

---

## Account Endpoints

### 1. Get Account Details
**GET** `/api/accounts/{address}`

Retrieve account details by address.

**Path Parameters:**
- `address`: Account address (SS58 format)

```bash
curl -X GET "http://localhost:3001/api/accounts/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "balance": 1000000000000000000,
    "nonce": 5,
    "lastUpdated": "2024-01-01T00:00:00.000Z",
    "accountInfo": {
      "free": 1000000000000000000,
      "reserved": 0,
      "frozen": 0,
      "flags": 0
    }
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Data Submission Endpoints

### 1. Get Data Submissions
**GET** `/api/data-submissions`

Retrieve data submissions with filtering options.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of submissions per page (default: 10)
- `appId` (optional): Filter by application ID
- `submitter` (optional): Filter by submitter address
- `orderBy` (optional): Sort field (timestamp, size, appId) (default: timestamp)
- `order` (optional): Sort order (asc, desc) (default: desc)

```bash
# Get all data submissions
curl -X GET "http://localhost:3001/api/data-submissions"

# Filter by app ID
curl -X GET "http://localhost:3001/api/data-submissions?appId=1"

# Filter by submitter
curl -X GET "http://localhost:3001/api/data-submissions?submitter=5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"

# Sort by size
curl -X GET "http://localhost:3001/api/data-submissions?orderBy=size&order=desc"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "extrinsicId": "ext_123",
      "blockNumber": 1000000,
      "extrinsicIndex": 2,
      "appId": 1,
      "size": 1024,
      "dataHash": "0x1234567890abcdef...",
      "submitter": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "timestamp": 1704067200000,
      "success": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5000,
    "source": "rpc"
  }
}
```

### 2. Get Data Submission Statistics
**GET** `/api/data-submissions/stats`

Get aggregated statistics for data submissions.

```bash
curl -X GET "http://localhost:3001/api/data-submissions/stats"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSubmissions": 5000,
    "totalDataSize": 52428800,
    "submissionsToday": 45,
    "dataSizeToday": 2097152,
    "uniqueApps": 12,
    "uniqueSubmitters": 150,
    "averageSize": 10485
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Validator Endpoints

### 1. Get Validators List
**GET** `/api/validators`

Retrieve list of validators with pagination.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of validators per page (default: 50)

```bash
# Get validators list
curl -X GET "http://localhost:3001/api/validators"

# Get with pagination
curl -X GET "http://localhost:3001/api/validators?page=2&limit=25"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "validators": [
      {
        "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "active": true,
        "commission": "5.0",
        "totalStake": "1000000000000000000000",
        "ownStake": "100000000000000000000",
        "nominators": 50,
        "identity": {
          "display": "Validator 1",
          "web": "https://validator1.com"
        }
      }
    ],
    "total_count": 100,
    "active_count": 95,
    "waiting_count": 5,
    "slashed_count": 0
  },
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "source": "rpc"
  }
}
```

### 2. Get Validator Details
**GET** `/api/validators/{address}`

Get detailed information about a specific validator.

**Path Parameters:**
- `address`: Validator address

```bash
curl -X GET "http://localhost:3001/api/validators/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "active": true,
    "commission": "5.0",
    "totalStake": "1000000000000000000000",
    "ownStake": "100000000000000000000",
    "nominators": 50,
    "identity": {
      "display": "Validator 1",
      "web": "https://validator1.com"
    },
    "nominations": [],
    "recent_blocks": [],
    "slashing_history": [],
    "performance_metrics": {
      "blocks_authored": 0,
      "uptime_percentage": 0,
      "average_block_time": 0
    }
  },
  "meta": {
    "source": "rpc"
  }
}
```

### 3. Get Staking Overview
**GET** `/api/validators/staking/overview`

Get comprehensive staking overview.

```bash
curl -X GET "http://localhost:3001/api/validators/staking/overview"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_staked": "500000000000000000000000",
    "active_validators": 95,
    "total_nominators": 1000,
    "current_era": 0,
    "inflation_rate": 0.07,
    "average_commission": 5.2,
    "nomination_pools": []
  },
  "meta": {
    "source": "rpc"
  }
}
```

### 4. Get Nomination Pools
**GET** `/api/validators/nomination-pools`

Get nomination pools information.

```bash
curl -X GET "http://localhost:3001/api/validators/nomination-pools"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "data": [],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total_count": 0,
      "total_pages": 0,
      "has_next": false,
      "has_prev": false
    }
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Analytics Endpoints

### 1. Get Network Analytics
**GET** `/api/analytics/network`

Get comprehensive network analytics.

**Query Parameters:**
- `period` (optional): Time period (24h, 7d, 30d) (default: 24h)

```bash
# Get network analytics for 24h
curl -X GET "http://localhost:3001/api/analytics/network"

# Get network analytics for 7 days
curl -X GET "http://localhost:3001/api/analytics/network?period=7d"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_stats": {
      "block_height": "1000000",
      "total_extrinsics": 0,
      "total_data_size": 52428800,
      "total_fees": 0,
      "active_validators": 95,
      "total_staked": "1000000000000000000000000",
      "inflation_rate": 0.07,
      "network_utilization": 0,
      "average_block_time": 20
    },
    "historical_data": [],
    "gas_price_trend": [],
    "rollup_distribution": [],
    "data_throughput": {
      "submissions_24h": 45,
      "data_size_24h": 2097152,
      "unique_apps_24h": 12,
      "average_submission_size": 10485
    }
  },
  "meta": {
    "source": "rpc",
    "period": "24h"
  }
}
```

### 2. Get Gas Analytics
**GET** `/api/analytics/gas`

Get gas price and fee analytics.

**Query Parameters:**
- `period` (optional): Time period (default: 7d)
- `granularity` (optional): Data granularity (hour, day) (default: hour)

```bash
curl -X GET "http://localhost:3001/api/analytics/gas?period=7d&granularity=hour"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_gas_price": "0",
    "average_gas_price_24h": "0",
    "gas_price_trend": [],
    "gas_efficiency": {
      "average_gas_used": 0,
      "average_gas_limit": 0,
      "efficiency_ratio": 0
    },
    "cost_per_transaction": {
      "average_cost_24h": "0",
      "median_cost_24h": "0",
      "cost_trend": []
    },
    "cost_per_block": {
      "average_cost_24h": "0",
      "cost_trend": []
    },
    "fee_distribution": {
      "by_transaction_type": [],
      "by_complexity": []
    }
  },
  "meta": {
    "source": "rpc",
    "period": "7d",
    "granularity": "hour",
    "note": "Gas tracking implementation in progress"
  }
}
```

### 3. Get Rollup Analytics
**GET** `/api/analytics/rollups`

Get rollup/app-space analytics.

**Query Parameters:**
- `period` (optional): Time period (default: 24h)

```bash
curl -X GET "http://localhost:3001/api/analytics/rollups?period=24h"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_rollups": 12,
    "total_submissions": 5000,
    "total_data_size": 52428800,
    "rollup_leaderboard": [],
    "da_contribution_breakdown": [],
    "rollup_growth_trends": [],
    "cost_per_mb_by_rollup": [],
    "active_rollups_24h": 12,
    "new_rollups_24h": 0
  },
  "meta": {
    "source": "rpc",
    "period": "24h",
    "note": "Detailed rollup analytics implementation in progress"
  }
}
```

### 4. Get Specific Rollup Analytics
**GET** `/api/analytics/rollups/{appId}`

Get analytics for a specific rollup.

**Path Parameters:**
- `appId`: Application ID (integer)

**Query Parameters:**
- `period` (optional): Time period (default: 24h)

```bash
curl -X GET "http://localhost:3001/api/analytics/rollups/1?period=24h"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "app_id": 1,
    "name": "App 1",
    "statistics": {
      "total_submissions": 0,
      "total_data_size": 0,
      "total_fees_paid": 0,
      "first_seen": null,
      "last_active": null,
      "unique_submitters": 0
    },
    "analytics": {
      "submissions_over_time": [],
      "data_size_over_time": [],
      "cost_per_mb_trend": [],
      "submitter_activity": []
    },
    "recent_submissions": [],
    "performance_metrics": {
      "average_submission_size": 0,
      "submission_frequency": 0,
      "cost_efficiency": 0
    }
  },
  "meta": {
    "source": "rpc",
    "period": "24h",
    "app_id": "1",
    "note": "Specific rollup analytics implementation in progress"
  }
}
```

### 5. Get Data Throughput Analytics
**GET** `/api/analytics/data-throughput`

Get data throughput analytics.

**Query Parameters:**
- `period` (optional): Time period (default: 24h)
- `granularity` (optional): Data granularity (default: hour)

```bash
curl -X GET "http://localhost:3001/api/analytics/data-throughput?period=24h&granularity=hour"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_metrics": {
      "submissions_per_hour": 0,
      "data_mb_per_hour": 0,
      "unique_submitters_active": 150,
      "average_submission_size": 10485
    },
    "historical_throughput": [],
    "peak_usage": {
      "highest_submissions_hour": { "timestamp": null, "count": 0 },
      "highest_data_hour": { "timestamp": null, "size": 0 },
      "busiest_app": { "app_id": null, "submissions": 0 }
    },
    "predictions": {
      "next_hour_estimate": 0,
      "growth_trend": "stable",
      "capacity_utilization": 0
    }
  },
  "meta": {
    "source": "rpc",
    "period": "24h",
    "granularity": "hour"
  }
}
```

### 6. Get Validator Analytics
**GET** `/api/analytics/validators`

Get validator and staking analytics.

```bash
curl -X GET "http://localhost:3001/api/analytics/validators"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "staking_overview": {
      "total_staked": "500000000000000000000000",
      "staking_ratio": 0.5,
      "inflation_rate": 0.07,
      "minimum_stake": "1000000000000000000000",
      "average_stake": "5263157894736842105263"
    },
    "validator_distribution": {
      "active_validators": 95,
      "waiting_validators": 5,
      "total_nominators": 1000
    },
    "commission_analytics": {
      "average_commission": 0,
      "median_commission": 0,
      "commission_distribution": []
    },
    "performance_metrics": {
      "average_uptime": 0,
      "block_production_distribution": [],
      "slashing_events": []
    }
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Rollup Endpoints

### 1. Get Rollup Leaderboard
**GET** `/api/rollups/leaderboard`

Get rollup leaderboard by various metrics.

**Query Parameters:**
- `period` (optional): Time period (default: 24h)
- `metric` (optional): Metric to rank by (data_size, submissions, fees) (default: data_size)

```bash
# Get leaderboard by data size
curl -X GET "http://localhost:3001/api/rollups/leaderboard"

# Get leaderboard by submissions
curl -X GET "http://localhost:3001/api/rollups/leaderboard?metric=submissions&period=7d"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "app_id": 1,
        "name": "Top Rollup",
        "metric_value": 52428800,
        "percentage_of_total": 45.2,
        "change_24h": 12.5
      },
      {
        "rank": 2,
        "app_id": 2,
        "name": "Second Rollup",
        "metric_value": 31457280,
        "percentage_of_total": 27.1,
        "change_24h": -5.2
      }
    ],
    "total_rollups": 2,
    "metric": "data_size"
  },
  "meta": {
    "source": "rpc",
    "period": "24h"
  }
}
```

### 2. Get Rollups List
**GET** `/api/rollups`

Get list of rollups/app-spaces.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of rollups per page (default: 50, max: 100)
- `search` (optional): Search term
- `status` (optional): Filter by status
- `sortBy` (optional): Sort field (default: submissions)
- `sortOrder` (optional): Sort order (asc, desc) (default: desc)

```bash
# Get all rollups
curl -X GET "http://localhost:3001/api/rollups"

# Get with pagination and search
curl -X GET "http://localhost:3001/api/rollups?page=1&limit=25&search=example"

# Sort by data size
curl -X GET "http://localhost:3001/api/rollups?sortBy=data_size&sortOrder=desc"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rollups": [
      {
        "app_id": 1,
        "name": "Example Rollup 1",
        "description": "A sample rollup for demonstration",
        "last_active": "2024-01-01T00:00:00.000Z",
        "total_submissions": 1250,
        "total_data_size": 52428800,
        "total_fees_paid": "1500000000000000000",
        "paid_per_mb": "30000000000000000",
        "website": "https://example-rollup.com",
        "logo_url": "https://example-rollup.com/logo.png"
      }
    ],
    "total_count": 2,
    "active_count": 2,
    "page": 1,
    "limit": 50
  },
  "meta": {
    "source": "rpc",
    "note": "Mock data - database integration pending"
  }
}
```

### 3. Get Rollup Details
**GET** `/api/rollups/{appId}`

Get detailed information about a specific rollup.

**Path Parameters:**
- `appId`: Application ID (integer)

```bash
curl -X GET "http://localhost:3001/api/rollups/1"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "app_id": 1,
    "name": "Rollup 1",
    "description": "Detailed information for rollup 1",
    "first_seen": "2024-01-01T00:00:00Z",
    "last_active": "2024-01-01T00:00:00.000Z",
    "total_submissions": 1250,
    "total_data_size": 52428800,
    "total_fees_paid": "1500000000000000000",
    "website": "https://rollup1.com",
    "logo_url": null,
    "statistics": {
      "submissions_24h": 45,
      "data_size_24h": 2097152,
      "fees_paid_24h": "50000000000000000",
      "unique_submitters": 12,
      "average_submission_size": 41943
    },
    "recent_submissions": []
  },
  "meta": {
    "source": "rpc"
  }
}
```

### 4. Get Rollup Submissions
**GET** `/api/rollups/{appId}/submissions`

Get submissions for a specific rollup.

**Path Parameters:**
- `appId`: Application ID (integer)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of submissions per page (default: 50)

```bash
curl -X GET "http://localhost:3001/api/rollups/1/submissions?page=1&limit=20"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "extrinsic_id": "hash123",
        "block_number": 1000000,
        "extrinsic_index": 2,
        "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "data_size": 1024,
        "data_hash": "0x1234567890abcdef",
        "kate_commitment": "0xabcdef1234567890",
        "success": true
      }
    ],
    "total_count": 1
  },
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "source": "rpc"
  }
}
```

### 5. Get Rollup Blobs
**GET** `/api/rollups/{appId}/blobs`

Get blobs for a specific rollup.

**Path Parameters:**
- `appId`: Application ID (integer)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of blobs per page (default: 20)

```bash
curl -X GET "http://localhost:3001/api/rollups/1/blobs?page=1&limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "blobs": [
      {
        "blob_id": "blob_123",
        "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "share_commitments": ["0xcommit1", "0xcommit2"],
        "size": 2048,
        "data_hash": "0x1234567890abcdef",
        "kate_commitment": "0xabcdef1234567890",
        "downloadable": true
      }
    ],
    "total_count": 1
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "source": "rpc"
  }
}
```

### 6. Get Rollup Analytics
**GET** `/api/rollups/{appId}/analytics`

Get analytics for a specific rollup.

**Path Parameters:**
- `appId`: Application ID (integer)

**Query Parameters:**
- `period` (optional): Time period (default: 24h)

```bash
curl -X GET "http://localhost:3001/api/rollups/1/analytics?period=7d"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "da_usage": {
      "total_submissions": 1250,
      "total_data_size": 52428800,
      "average_submission_size": 41943
    },
    "blob_count": {
      "total_blobs": 1250,
      "blobs_24h": 45,
      "average_blob_size": 41943
    },
    "fees_paid": {
      "total_fees": "1500000000000000000",
      "fees_24h": "50000000000000000",
      "cost_per_mb": "30000000000000000"
    },
    "blob_size_distribution": [],
    "submission_frequency": [],
    "cost_efficiency_trend": []
  },
  "meta": {
    "source": "rpc"
  }
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An internal server error occurred"
  }
}
```

---

## Rate Limiting

The API implements rate limiting on certain endpoints:
- Search endpoints: Limited to prevent abuse
- General API endpoints: 100 requests per minute (configurable)

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640995200
```

---

## Caching

Many endpoints implement caching with the following TTL values:
- Blocks: 5 seconds (latest blocks), 1 hour (specific blocks)
- Chain stats: 30 seconds
- Account balance: 30 seconds
- Validators: 5 minutes
- Token price: 1 minute

Cache headers are included in responses:
```
Cache-Control: public, max-age=30
ETag: "abc123"
```

---

## WebSocket Support

The server supports WebSocket connections for real-time updates:

```javascript
const socket = io('http://localhost:3001');

// Subscribe to block updates
socket.emit('subscribe:blocks');

// Subscribe to extrinsic updates
socket.emit('subscribe:extrinsics');

// Subscribe to chain stats updates
socket.emit('subscribe:chain');

// Unsubscribe from all
socket.emit('unsubscribe:all');
```

---

## Notes

1. **Data Sources**: Most endpoints fetch data from Avail RPC nodes in real-time
2. **Pagination**: Default page size is 20, maximum is 100
3. **Timestamps**: All timestamps are in milliseconds (Unix timestamp)
4. **Amounts**: All token amounts are in the smallest unit (planck/wei equivalent)
5. **Development Status**: Some analytics features are marked as "implementation in progress"
6. **Mock Data**: Some endpoints return placeholder data while database integration is being completed

---

## Configuration

The server can be configured via environment variables:
- `PORT`: Server port (default: 3001)
- `AVAIL_RPC_ENDPOINT`: Avail RPC endpoint
- `ENABLE_CACHING`: Enable/disable caching
- `ENABLE_RATE_LIMITING`: Enable/disable rate limiting
- `API_RATE_LIMIT`: Rate limit per minute (default: 100)

For a complete list of configuration options, see the `env.example` file.

---

## Root Cause Analysis: Empty Data Issue Resolution

### Problem Summary
The `/api/extrinsics` endpoint was returning empty data despite showing `total: 8` in the metadata, indicating a pagination issue where users were requesting page 2 but only 8 total items existed.

### Root Cause Analysis

#### Initial Diagnosis
The API response showed:
```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 8,
    "source": "rpc"
  }
}
```

This appeared to be correct pagination behavior (page 2 with limit 20 would be empty if only 8 total items exist).

#### Deeper Investigation
However, investigation revealed the **real issue**: **Avail Runtime Upgrade Incompatibility**

**Error Logs Revealed:**
```
Unable to find Call with index [76, 29]/[76,29]
Unable to find Call with index [68, 29]/[68,29]  
Unable to find Call with index [128, 29]/[128,29]
Unable to find Call with index [104, 29]/[104,29]
Unable to find Call with index [100, 29]/[100,29]
```

**Root Cause:** Avail blockchain underwent runtime upgrades that introduced new call indices that the Polkadot.js API client couldn't decode, causing extrinsic processing to fail completely.

### Solution Implemented

#### 1. Updated Polkadot.js Dependencies
Updated to latest versions for better runtime compatibility:
```json
{
  "@polkadot/api": "^16.1.1",
  "@polkadot/api-augment": "^16.1.1", 
  "@polkadot/types": "^16.1.1",
  "@polkadot/util": "^13.5.1"
}
```

#### 2. Created Avail-Specific Type Definitions
**File:** `src/config/avail-types.ts`

Added comprehensive Avail-specific types including:
- Kate commitment types for data availability
- Avail header extensions
- Data lookup structures
- RPC method definitions for Avail-specific calls

#### 3. Updated API Configuration
**File:** `src/services/rpc/connection.ts`

Modified API creation to include Avail types and graceful error handling:
```typescript
connection.api = await ApiPromise.create({
  provider: connection.provider,
  types: availTypes.types,
  rpc: availTypes.rpc,
  throwOnConnect: true,
  throwOnUnknown: false, // Don't throw on unknown types/calls
});
```

#### 4. Enhanced Error Handling
**File:** `src/services/rpc/methods.ts`

Updated `transformExtrinsic` method to:
- Gracefully handle unknown call indices
- Skip problematic extrinsics instead of failing completely
- Log warnings for debugging while continuing processing
- Return `null` for failed transformations and filter them out

### Results

#### ✅ **Fixed Issues:**
- `/api/extrinsics` now returns data successfully
- `/api/blocks` working correctly
- Basic extrinsic processing functional
- Graceful handling of unknown call indices

#### ⚠️ **Partial Issues:**
- Some blocks still contain unknown call indices ([104, 29], [100, 29])
- Chain stats endpoint still failing due to dependency on problematic blocks
- Some advanced Avail-specific features may need additional type definitions

#### 📊 **Current Status:**
```bash
# Working endpoints:
curl "http://localhost:3001/api/extrinsics?page=1&limit=5"  # ✅ Returns data
curl "http://localhost:3001/api/blocks?page=1&limit=3"      # ✅ Returns data

# Partially working:
curl "http://localhost:3001/api/chain/stats"                # ❌ Still failing
```

### Recommendations

#### Immediate Actions:
1. **Use page 1** for extrinsics API to get data
2. **Monitor logs** for new unknown call indices
3. **Update type definitions** as Avail releases new runtime versions

#### Long-term Solutions:
1. **Implement dynamic type loading** from Avail metadata
2. **Add circuit breaker** for problematic blocks
3. **Create fallback mechanisms** for chain stats
4. **Set up monitoring** for runtime upgrade notifications

### Technical Details

#### Error Handling Strategy:
```typescript
// Skip unknown extrinsics instead of failing
try {
  return transformExtrinsic(ext, blockNumber, index, timestamp);
} catch (error) {
  logger.warn('Failed to transform extrinsic, skipping', { error });
  return null; // Filtered out later
}
```

#### Type Safety:
```typescript
// Filter out null values to maintain type safety
return signedBlock.data.block.extrinsics
  .map((ext, index) => this.transformExtrinsic(ext, blockNumber, index, block.timestamp))
  .filter((ext): ext is Extrinsic => ext !== null);
```

This solution provides **robust error handling** while maintaining **data availability** for successfully decodable extrinsics. 