# Avail DA Explorer - API Endpoints Specification

## Overview

This document outlines all API endpoints that the backend will provide to the frontend for the Avail DA Explorer. The API follows RESTful conventions and provides comprehensive data access for blockchain exploration, analytics, and real-time monitoring.

## Base URL
```
Production: https://api.explorer.avail.so
Development: http://localhost:3000/api
```

## General API Conventions

### Standard Response Format
All API responses follow this structure:
```json
{
  "success": boolean,
  "data": object | array,
  "meta": {
    "source": "rpc" | "database" | "cache",
    "timestamp": "ISO 8601 string",
    "page": number,
    "limit": number,
    "totalCount": number,
    "period": string,
    "granularity": string
  },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

### Common Query Parameters
- `page`: Page number for pagination (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `period`: Time period for analytics (24h, 7d, 30d, 90d, 1y, custom)
- `granularity`: Data granularity (minute, hour, day, week, month)
- `sortBy`: Field to sort by
- `sortOrder`: Sort direction (asc, desc)
- `search`: Search term for filtering
- `from`: Start date for custom periods (ISO 8601)
- `to`: End date for custom periods (ISO 8601)

### Error Codes
- `INVALID_PARAMETERS`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `RATE_LIMITED`: Too many requests
- `INTERNAL_SERVER_ERROR`: Server error
- `SERVICE_UNAVAILABLE`: External service unavailable

---

## 1. Network & Analytics APIs

### 1.1 Network Statistics

#### GET `/api/analytics/network`
Get comprehensive network statistics and trends.

**Query Parameters:**
- `period`: Time period (default: 24h)
- `granularity`: Data granularity (default: hour)

**Response:**
```json
{
  "success": true,
  "data": {
    "generalStats": {
      "totalBlocks": 1234567,
      "totalExtrinsics": 9876543,
      "totalBlobsSize": 1073741824,
      "totalFees": "1500000000000000000",
      "activeValidators": 128,
      "totalStaked": "50000000000000000000000"
    },
    "throughput": {
      "blocksPerHour": 600,
      "extrinsicsPerHour": 1200,
      "dataThroughputMbPerHour": 50.5,
      "averageBlockTime": 6.0
    },
    "trends": {
      "blockProduction": [...], // Time series data
      "dataSubmissions": [...],
      "networkActivity": [...]
    }
  }
}
```

#### GET `/api/analytics/gas`
Get gas price tracking and fee analytics.

**Query Parameters:**
- `period`: Time period (default: 7d)
- `granularity`: Data granularity (default: hour)

**Response:**
```json
{
  "success": true,
  "data": {
    "currentGasPrice": "1000000000",
    "averageGasPrice24h": "1200000000",
    "gasPriceTrend": [...], // Time series
    "gasEfficiency": {
      "averageGasUsed": 150000,
      "averageGasLimit": 200000,
      "efficiencyRatio": 0.75
    },
    "costPerTransaction": {
      "averageCost24h": "50000000000000000",
      "medianCost24h": "30000000000000000",
      "costTrend": [...]
    },
    "costPerBlock": {
      "averageCost24h": "500000000000000000",
      "costTrend": [...]
    }
  }
}
```

### 1.2 DA Contribution Analytics

#### GET `/api/analytics/da-contribution`
Get data availability contribution breakdown by rollups.

**Query Parameters:**
- `period`: Time period (default: 24h)
- `metric`: Metric type (data_size, blob_count, fees_paid)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDataSize": 1073741824,
    "totalBlobCount": 5000,
    "totalFeesPaid": "1000000000000000000",
    "contributionBreakdown": [
      {
        "appId": 1,
        "name": "Rollup A",
        "dataSize": 536870912,
        "blobCount": 2500,
        "feesPaid": "500000000000000000",
        "percentage": 50.0
      }
    ],
    "trends": {
      "daily": [...],
      "weekly": [...],
      "monthly": [...]
    }
  }
}
```

---

## 2. Block & Extrinsic APIs

### 2.1 Blocks

#### GET `/api/blocks`
Get list of blocks with pagination and filtering.

**Query Parameters:**
- Standard pagination parameters
- `validator`: Filter by validator address
- `status`: Filter by block status

**Response:**
```json
{
  "success": true,
  "data": {
    "blocks": [
      {
        "number": 1234567,
        "hash": "0x1234...",
        "parentHash": "0x5678...",
        "stateRoot": "0x9abc...",
        "extrinsicsRoot": "0xdef0...",
        "timestamp": "2024-01-01T12:00:00Z",
        "blockTime": 6.2,
        "validator": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "extrinsicsCount": 15,
        "eventsCount": 45,
        "dataSubmissionsCount": 3,
        "totalFees": "100000000000000000",
        "specVersion": 1001,
        "size": 65536
      }
    ],
    "totalCount": 1234567
  }
}
```

#### GET `/api/blocks/:blockNumber`
Get detailed information for a specific block.

**Response:**
```json
{
  "success": true,
  "data": {
    "number": 1234567,
    "hash": "0x1234...",
    "parentHash": "0x5678...",
    "stateRoot": "0x9abc...",
    "extrinsicsRoot": "0xdef0...",
    "timestamp": "2024-01-01T12:00:00Z",
    "blockTime": 6.2,
    "validator": {
      "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "name": "Validator Name",
      "commission": 5.0
    },
    "extrinsics": [...], // Array of extrinsic summaries
    "events": [...], // Array of events
    "logs": [...], // Array of logs
    "justification": "0x...",
    "size": 65536,
    "weight": {
      "normal": 150000000,
      "operational": 0,
      "mandatory": 5000000
    }
  }
}
```

### 2.2 Extrinsics

#### GET `/api/extrinsics`
Get list of extrinsics with filtering options.

**Query Parameters:**
- Standard pagination parameters
- `block`: Filter by block number
- `signer`: Filter by signer address
- `module`: Filter by pallet/module
- `call`: Filter by call name
- `status`: Filter by success/failure
- `dataSubmissionsOnly`: Boolean to show only data submissions

**Response:**
```json
{
  "success": true,
  "data": {
    "extrinsics": [
      {
        "id": "1234567-2",
        "hash": "0xabcd...",
        "blockNumber": 1234567,
        "index": 2,
        "timestamp": "2024-01-01T12:00:00Z",
        "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "module": "dataAvailability",
        "call": "submitData",
        "success": true,
        "fees": "50000000000000000",
        "tip": "0",
        "nonce": 42,
        "signature": "0x...",
        "lifetime": {
          "isImmortal": false,
          "birth": 1234560,
          "death": 1234580
        },
        "dataSubmission": {
          "appId": 1,
          "dataSize": 1024
        }
      }
    ],
    "totalCount": 9876543
  }
}
```

#### GET `/api/extrinsics/:extrinsicId`
Get detailed information for a specific extrinsic.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "1234567-2",
    "hash": "0xabcd...",
    "blockNumber": 1234567,
    "index": 2,
    "timestamp": "2024-01-01T12:00:00Z",
    "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "module": "dataAvailability",
    "call": "submitData",
    "success": true,
    "error": null,
    "fees": "50000000000000000",
    "tip": "0",
    "nonce": 42,
    "signature": "0x...",
    "lifetime": {
      "isImmortal": false,
      "birth": 1234560,
      "death": 1234580
    },
    "parameters": {
      "data": "0x...",
      "appId": 1
    },
    "events": [...], // Related events
    "assetTransfers": [...], // Any asset transfers
    "weight": 150000000,
    "class": "normal"
  }
}
```

---

## 3. Rollup & Data Submission APIs

### 3.1 Rollups

#### GET `/api/rollups`
Get list of rollups/app-spaces.

**Query Parameters:**
- Standard pagination and sorting parameters
- `status`: Filter by active/inactive status
- `search`: Search by rollup name

**Response:**
```json
{
  "success": true,
  "data": {
    "rollups": [
      {
        "appId": 1,
        "name": "Rollup A",
        "description": "A high-performance rollup",
        "website": "https://rollupa.com",
        "logoUrl": "https://rollupa.com/logo.png",
        "lastActive": "2024-01-01T12:00:00Z",
        "firstSeen": "2023-06-01T00:00:00Z",
        "totalSubmissions": 15000,
        "totalDataSize": 1073741824,
        "totalFeesPaid": "500000000000000000",
        "paidPerMb": "476837158203125",
        "uniqueSubmitters": 150,
        "status": "active"
      }
    ],
    "totalCount": 25,
    "activeCount": 20
  }
}
```

#### GET `/api/rollups/leaderboard`
Get rollup leaderboard by various metrics.

**Query Parameters:**
- `period`: Time period (default: 24h)
- `metric`: Ranking metric (data_size, blob_count, fees_paid, submissions)

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "appId": 1,
        "name": "Rollup A",
        "metricValue": 52428800,
        "percentageOfTotal": 45.2,
        "change24h": 12.5,
        "logoUrl": "https://rollupa.com/logo.png"
      }
    ],
    "totalRollups": 25,
    "metric": "data_size"
  }
}
```

#### GET `/api/rollups/:appId`
Get detailed information for a specific rollup.

**Response:**
```json
{
  "success": true,
  "data": {
    "appId": 1,
    "name": "Rollup A",
    "description": "A high-performance rollup",
    "website": "https://rollupa.com",
    "logoUrl": "https://rollupa.com/logo.png",
    "firstSeen": "2023-06-01T00:00:00Z",
    "lastActive": "2024-01-01T12:00:00Z",
    "statistics": {
      "totalSubmissions": 15000,
      "totalDataSize": 1073741824,
      "totalFeesPaid": "500000000000000000",
      "uniqueSubmitters": 150,
      "averageSubmissionSize": 71582,
      "submissions24h": 45,
      "dataSize24h": 3145728,
      "feesPaid24h": "15000000000000000"
    },
    "analytics": {
      "submissionsOverTime": [...],
      "dataSizeOverTime": [...],
      "costPerMbTrend": [...],
      "submitterActivity": [...]
    }
  }
}
```

#### GET `/api/rollups/:appId/analytics`
Get detailed analytics for a specific rollup.

**Query Parameters:**
- `period`: Time period
- `granularity`: Data granularity

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "7d",
    "granularity": "hour",
    "metrics": {
      "submissions": [...], // Time series
      "dataSize": [...],
      "fees": [...],
      "uniqueSubmitters": [...],
      "averageSubmissionSize": [...]
    },
    "summary": {
      "totalSubmissions": 315,
      "totalDataSize": 20971520,
      "totalFees": "100000000000000000",
      "averageSubmissionSize": 66560,
      "peakHour": "2024-01-01T14:00:00Z"
    }
  }
}
```

### 3.2 Data Submissions

#### GET `/api/data-submissions`
Get list of data submissions across all rollups.

**Query Parameters:**
- Standard pagination parameters
- `appId`: Filter by rollup/app ID
- `submitter`: Filter by submitter address
- `minSize`: Minimum data size filter
- `maxSize`: Maximum data size filter

**Response:**
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "extrinsicId": "1234567-2",
        "blockNumber": 1234567,
        "timestamp": "2024-01-01T12:00:00Z",
        "appId": 1,
        "rollupName": "Rollup A",
        "submitter": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "dataSize": 1024,
        "dataHash": "0x...",
        "fees": "50000000000000000",
        "success": true
      }
    ],
    "totalCount": 50000
  }
}
```

#### GET `/api/data-submissions/:extrinsicId`
Get detailed information for a specific data submission.

**Response:**
```json
{
  "success": true,
  "data": {
    "extrinsicId": "1234567-2",
    "blockNumber": 1234567,
    "timestamp": "2024-01-01T12:00:00Z",
    "appId": 1,
    "rollupName": "Rollup A",
    "submitter": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "dataSize": 1024,
    "dataHash": "0x...",
    "fees": "50000000000000000",
    "success": true,
    "kateCommitment": "0x...",
    "dataProof": "0x...",
    "cellData": [...], // Available cells
    "decodedData": "base64_encoded_data" // If decodable
  }
}
```

#### GET `/api/data-submissions/:extrinsicId/download`
Download the raw data for a specific submission.

**Response:** Binary data with appropriate content-type headers.

---

## 4. Account & Transfer APIs

### 4.1 Accounts

#### GET `/api/accounts/:address`
Get account information and balances.

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "balances": {
      "free": "1000000000000000000000",
      "reserved": "100000000000000000000",
      "frozen": "50000000000000000000",
      "total": "1150000000000000000000"
    },
    "nonce": 42,
    "role": "validator", // validator, nominator, regular
    "identity": {
      "display": "Validator Name",
      "legal": "Legal Name",
      "web": "https://validator.com",
      "email": "contact@validator.com",
      "twitter": "@validator"
    },
    "statistics": {
      "totalExtrinsics": 1500,
      "totalDataSubmissions": 200,
      "totalFeesSpent": "50000000000000000000",
      "firstActivity": "2023-01-01T00:00:00Z",
      "lastActivity": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### GET `/api/accounts/:address/extrinsics`
Get extrinsics history for an account.

**Query Parameters:**
- Standard pagination parameters
- `module`: Filter by pallet/module
- `success`: Filter by success/failure

**Response:**
```json
{
  "success": true,
  "data": {
    "extrinsics": [...], // Array of extrinsic objects
    "totalCount": 1500
  }
}
```

#### GET `/api/accounts/:address/transfers`
Get transfer history for an account.

**Query Parameters:**
- Standard pagination parameters
- `direction`: Filter by in/out/all

**Response:**
```json
{
  "success": true,
  "data": {
    "transfers": [
      {
        "extrinsicId": "1234567-1",
        "blockNumber": 1234567,
        "timestamp": "2024-01-01T12:00:00Z",
        "from": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "to": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        "amount": "1000000000000000000",
        "fees": "10000000000000000",
        "success": true,
        "direction": "out" // in, out
      }
    ],
    "totalCount": 500
  }
}
```

### 4.2 Transfers

#### GET `/api/transfers`
Get list of all transfers with filtering.

**Query Parameters:**
- Standard pagination parameters
- `from`: Filter by sender address
- `to`: Filter by recipient address
- `minAmount`: Minimum transfer amount
- `maxAmount`: Maximum transfer amount

**Response:**
```json
{
  "success": true,
  "data": {
    "transfers": [...], // Array of transfer objects
    "totalCount": 100000
  }
}
```

---

## 5. Staking & Validation APIs

### 5.1 Validators

#### GET `/api/validators`
Get list of validators with their status and statistics.

**Query Parameters:**
- Standard pagination parameters
- `status`: Filter by active/waiting/slashed
- `sortBy`: Sort by commission, stake, blocks, etc.

**Response:**
```json
{
  "success": true,
  "data": {
    "validators": [
      {
        "stashAddress": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "controllerAddress": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        "status": "active", // active, waiting, slashed
        "commission": 5.0,
        "selfBonded": "1000000000000000000000",
        "totalBonded": "10000000000000000000000",
        "nominatorCount": 150,
        "blocksProduced": 1500,
        "lastBlockProduced": "2024-01-01T12:00:00Z",
        "identity": {
          "display": "Validator Name",
          "web": "https://validator.com"
        },
        "sessionKeys": {
          "babe": "0x...",
          "grandpa": "0x...",
          "imOnline": "0x...",
          "authorityDiscovery": "0x..."
        }
      }
    ],
    "totalCount": 200,
    "activeCount": 128,
    "waitingCount": 50,
    "slashedCount": 2
  }
}
```

#### GET `/api/validators/:address`
Get detailed information for a specific validator.

**Response:**
```json
{
  "success": true,
  "data": {
    "stashAddress": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "controllerAddress": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    "rewardAddress": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    "status": "active",
    "commission": 5.0,
    "selfBonded": "1000000000000000000000",
    "totalBonded": "10000000000000000000000",
    "nominatorCount": 150,
    "identity": {
      "display": "Validator Name",
      "legal": "Legal Name",
      "web": "https://validator.com",
      "email": "contact@validator.com"
    },
    "sessionKeys": {...},
    "statistics": {
      "blocksProduced": 1500,
      "lastBlockProduced": "2024-01-01T12:00:00Z",
      "totalRewards": "100000000000000000000",
      "slashingEvents": [],
      "uptimePercentage": 99.8
    },
    "nominators": [...], // Array of nominator objects
    "recentBlocks": [...], // Recent blocks produced
    "rewardHistory": [...] // Historical rewards
  }
}
```

### 5.2 Staking Statistics

#### GET `/api/staking/overview`
Get overall staking statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalStaked": "50000000000000000000000000",
    "totalIssuance": "100000000000000000000000000",
    "stakingRate": 50.0,
    "inflationRate": 8.5,
    "minimumStake": "1000000000000000000000",
    "activeValidators": 128,
    "waitingValidators": 50,
    "totalNominators": 5000,
    "averageCommission": 7.5,
    "currentEra": 1500,
    "eraProgress": 75.0,
    "nextEraIn": "2h 30m"
  }
}
```

### 5.3 Nomination Pools

#### GET `/api/staking/pools`
Get list of nomination pools.

**Response:**
```json
{
  "success": true,
  "data": {
    "pools": [
      {
        "poolId": 1,
        "name": "Pool A",
        "state": "open", // open, blocked, destroying
        "memberCount": 500,
        "totalBonded": "5000000000000000000000",
        "commission": 2.0,
        "roles": {
          "root": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
          "nominator": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
          "bouncer": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
        }
      }
    ],
    "totalCount": 50
  }
}
```

---

## 6. Search & Utility APIs

### 6.1 Search

#### GET `/api/search`
Universal search across all entities.

**Query Parameters:**
- `q`: Search query (required)
- `type`: Filter by entity type (block, extrinsic, account, validator, rollup)
- `limit`: Number of results per type

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "results": {
      "accounts": [...],
      "validators": [...],
      "blocks": [...],
      "extrinsics": [...],
      "rollups": [...]
    },
    "totalResults": 15
  }
}
```

### 6.2 Chain Information

#### GET `/api/chain/info`
Get basic chain information.

**Response:**
```json
{
  "success": true,
  "data": {
    "chainName": "Avail",
    "chainType": "Live",
    "genesisHash": "0x...",
    "specVersion": 1001,
    "implVersion": 1,
    "authoringVersion": 1,
    "transactionVersion": 1,
    "properties": {
      "ss58Format": 42,
      "tokenDecimals": 18,
      "tokenSymbol": "AVAIL"
    },
    "currentBlock": {
      "number": 1234567,
      "hash": "0x...",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 6.3 Fee Estimation

#### POST `/api/utils/estimate-fee`
Estimate fees for various operations.

**Request Body:**
```json
{
  "operation": "data_submission", // data_submission, transfer, staking
  "parameters": {
    "dataSize": 1024, // For data submission
    "amount": "1000000000000000000", // For transfer
    "to": "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "estimatedFee": "50000000000000000",
    "breakdown": {
      "baseFee": "30000000000000000",
      "lengthFee": "15000000000000000",
      "weightFee": "5000000000000000"
    },
    "costPerMb": "48828125000000000" // For data submissions
  }
}
```

---

## 7. Real-time & Light Client APIs

### 7.1 WebSocket Endpoints

#### WS `/ws/blocks`
Real-time block updates.

**Message Format:**
```json
{
  "type": "new_block",
  "data": {
    "number": 1234568,
    "hash": "0x...",
    "timestamp": "2024-01-01T12:00:06Z",
    "validator": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "extrinsicsCount": 12,
    "dataSubmissionsCount": 2
  }
}
```

#### WS `/ws/extrinsics`
Real-time extrinsic updates.

#### WS `/ws/data-submissions`
Real-time data submission updates.

### 7.2 Light Client Integration

#### GET `/api/light-client/status`
Get light client status and sync information.

**Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "syncStatus": "synced", // syncing, synced, error
    "currentBlock": 1234567,
    "targetBlock": 1234567,
    "syncProgress": 100.0,
    "peers": 15,
    "confidence": 99.9,
    "lastUpdate": "2024-01-01T12:00:00Z"
  }
}
```

#### POST `/api/light-client/start`
Start the light client.

#### POST `/api/light-client/stop`
Stop the light client.

#### POST `/api/light-client/verify-data`
Verify data availability for specific blocks.

**Request Body:**
```json
{
  "blockNumbers": [1234567, 1234568],
  "appId": 1 // Optional: verify specific app data
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verificationResults": [
      {
        "blockNumber": 1234567,
        "available": true,
        "confidence": 99.9,
        "sampledCells": 50
      }
    ]
  }
}
```

---

## 8. User Features APIs

### 8.1 Bookmarks

#### GET `/api/user/bookmarks`
Get user bookmarks (requires authentication).

#### POST `/api/user/bookmarks`
Add a bookmark.

**Request Body:**
```json
{
  "type": "extrinsic", // block, extrinsic, account, validator, rollup
  "id": "1234567-2",
  "name": "Important Transaction",
  "notes": "User notes about this bookmark"
}
```

#### DELETE `/api/user/bookmarks/:bookmarkId`
Remove a bookmark.

### 8.2 Command Palette Actions

#### POST `/api/actions/transfer`
Execute AVAIL transfer (requires authentication).

#### POST `/api/actions/submit-data`
Submit data to the blockchain (requires authentication).

#### GET `/api/actions/navigation-suggestions`
Get navigation suggestions for command palette.

---

## 9. File Downloads

### 9.1 Blob Downloads

#### GET `/api/blobs/:extrinsicId/download`
Download decoded blob data.

**Query Parameters:**
- `format`: Download format (raw, json, base64)

**Response:** File download with appropriate headers.

### 9.2 Export Data

#### GET `/api/export/rollup-analytics/:appId`
Export rollup analytics data.

**Query Parameters:**
- `period`: Time period
- `format`: Export format (csv, json, xlsx)

#### GET `/api/export/validator-performance/:address`
Export validator performance data.

---

## Rate Limiting

- **General endpoints**: 100 requests per minute per IP
- **Search endpoints**: 30 requests per minute per IP
- **Real-time WebSocket**: 1000 messages per minute per connection
- **Export endpoints**: 10 requests per hour per IP

## Caching

- **Chain statistics**: 30 seconds
- **Block data**: 5 minutes (1 minute for latest blocks)
- **Analytics data**: 5 minutes
- **Validator data**: 2 minutes
- **Search results**: 1 minute

## Authentication

Some endpoints require authentication:
- User bookmarks
- Blockchain actions (transfers, data submission)
- Light client control
- Export functionality

Authentication is handled via JWT tokens or API keys.

---

This specification covers all the major functionality outlined in the Avail DA Explorer scope. The frontend team can use this as a reference for implementing the explorer interface, with each endpoint providing the necessary data for the corresponding UI components.