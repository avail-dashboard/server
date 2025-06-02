# Avail DA Explorer - Complete API Documentation

## Executive Summary

### Current Implementation Status
- ✅ **Architecture**: Solid REST + WebSocket hybrid approach
- ✅ **Core Infrastructure**: Express.js, Socket.io, PostgreSQL, Redis caching
- ✅ **API Structure**: Well-organized routes with proper error handling and pagination
- ✅ **Real-time Capabilities**: Comprehensive WebSocket subscription system
- ⚠️ **Data Implementation**: Many endpoints return structured placeholder data with TODOs
- ⚠️ **Database Integration**: Partial implementation, needs completion for full functionality

### Recommendation: No System Design Changes Needed
The current hybrid approach is optimal:
- **REST APIs**: Perfect for data fetching, pagination, search, CRUD operations
- **WebSockets**: Ideal for real-time updates, live data streams, notifications

---

## 1. REST API Documentation

### Base URL
```
Production: https://api.avail-explorer.com
Development: http://localhost:3001/api
```

### Common Response Format
```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    source?: string;
    [key: string]: any;
  };
}
```

### Authentication
Currently no authentication required. All endpoints are public.

---

## 2. Network Statistics & Analytics

### 2.1 Network Overview
```http
GET /api/analytics/network?period=24h
```

**Parameters:**
- `period` (optional): `1h`, `24h`, `7d`, `30d` (default: `24h`)

**Response:**
```json
{
  "success": true,
  "data": {
    "current_stats": {
      "block_height": "1234567",
      "total_extrinsics": 0,
      "total_data_size": 52428800,
      "total_fees": 0,
      "active_validators": 128,
      "total_staked": "1000000000000000000000",
      "inflation_rate": 0.05,
      "network_utilization": 0,
      "average_block_time": 20000
    },
    "historical_data": [],
    "gas_price_trend": [],
    "rollup_distribution": [],
    "data_throughput": {
      "submissions_24h": 450,
      "data_size_24h": 2097152,
      "unique_apps_24h": 12,
      "average_submission_size": 41943
    }
  }
}
```

**Status:** ⚠️ Partial implementation - basic stats available, historical data needs implementation

### 2.2 Gas & Fee Analytics
```http
GET /api/analytics/gas?period=7d&granularity=hour
```

**Parameters:**
- `period` (optional): `1h`, `24h`, `7d`, `30d` (default: `7d`)
- `granularity` (optional): `minute`, `hour`, `day` (default: `hour`)

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
  }
}
```

**Status:** ⚠️ Structure implemented, data collection needs implementation

---

## 3. Blocks API

### 3.1 Latest Blocks
```http
GET /api/blocks?page=1&limit=10
```

**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page, max 100 (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "number": 1234567,
      "hash": "0x...",
      "parent_hash": "0x...",
      "timestamp": 1640995200000,
      "extrinsics": 5,
      "time": "2024-01-01T00:00:00.000Z",
      "state_root": "0x...",
      "extrinsics_root": "0x...",
      "author_id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      "size": 1024,
      "weight": 500000,
      "spec": 1001,
      "finalized": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1234567,
    "source": "rpc"
  }
}
```

**Status:** ✅ Fully implemented

### 3.2 Block Details
```http
GET /api/blocks/{numberOrHash}
```

**Parameters:**
- `numberOrHash`: Block number (integer) or block hash (hex string)

**Response:**
```json
{
  "success": true,
  "data": {
    "number": 1234567,
    "hash": "0x...",
    "parent_hash": "0x...",
    "state_root": "0x...",
    "timestamp": 1640995200000,
    "extrinsics_count": 5,
    "time": "2024-01-01T00:00:00.000Z",
    "extrinsics_root": "0x...",
    "author_id": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    "size": 1024,
    "weight": 500000,
    "spec": 1001,
    "finalized": true,
    "extrinsics": [
      {
        "id": "1234567-0",
        "hash": "0x...",
        "extrinsic_index": 0,
        "module": "dataAvailability",
        "call": "submitData",
        "success": true,
        "timestamp": 1640995200000,
        "signer": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        "fee": 1000000000000000000,
        "tip": 0,
        "signature": "0x...",
        "args": {},
        "events": []
      }
    ]
  }
}
```

**Status:** ✅ Fully implemented

---

## 4. Extrinsics API

### 4.1 Latest Extrinsics
```http
GET /api/extrinsics?page=1&limit=10&module=dataAvailability
```

**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page, max 100 (default: 10)
- `module` (optional): Filter by module name
- `call` (optional): Filter by call name
- `success` (optional): Filter by success status (true/false)

**Status:** ✅ Implemented (route exists, needs verification of full functionality)

---

## 5. Rollups & App Spaces API

### 5.1 Rollups List
```http
GET /api/rollups?page=1&limit=50&search=&status=active&sortBy=submissions&sortOrder=desc
```

**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page, max 100 (default: 50)
- `search` (optional): Search by rollup name
- `status` (optional): Filter by status
- `sortBy` (optional): Sort field (default: `submissions`)
- `sortOrder` (optional): `asc` or `desc` (default: `desc`)

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
  }
}
```

**Status:** ⚠️ Mock data implementation, needs database integration

### 5.2 Rollup Details
```http
GET /api/rollups/{appId}
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
  }
}
```

**Status:** ⚠️ Mock data implementation, needs database integration

### 5.3 Rollup Leaderboard
```http
GET /api/rollups/leaderboard?period=24h&metric=data_size
```

**Parameters:**
- `period` (optional): `24h`, `7d`, `30d` (default: `24h`)
- `metric` (optional): `data_size`, `submissions`, `fees` (default: `data_size`)

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
      }
    ],
    "total_rollups": 2,
    "metric": "data_size"
  }
}
```

**Status:** ⚠️ Mock data implementation, needs database integration

### 5.4 Rollup Analytics
```http
GET /api/analytics/rollups?period=24h
```

**Status:** ⚠️ Basic structure implemented, needs data collection

### 5.5 Rollup Blobs
```http
GET /api/rollups/{appId}/blobs?page=1&limit=20
```

**Status:** ❌ Not implemented - needs creation

---

## 6. Data Submissions API

### 6.1 Data Submissions List
```http
GET /api/data-submissions?page=1&limit=20&appId=1
```

**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page, max 100 (default: 20)
- `appId` (optional): Filter by app ID
- `submitter` (optional): Filter by submitter address

**Status:** ✅ Basic implementation exists, needs verification

---

## 7. Accounts API

### 7.1 Account Details
```http
GET /api/accounts/{address}
```

**Status:** ⚠️ Basic route exists, needs full implementation for:
- Balance information
- Transaction history
- Staking information
- Rewards history

---

## 8. Validators & Staking API

### 8.1 Validators List
```http
GET /api/validators?page=1&limit=50&status=active
```

**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `status` (optional): `active`, `waiting`, `slashed` (default: all)

**Status:** ⚠️ Route exists, needs full implementation

### 8.2 Validator Details
```http
GET /api/validators/{address}
```

**Status:** ⚠️ Route exists, needs full implementation for:
- Stash and controller addresses
- Nominator count and list
- Commission rate
- Session keys
- Bonded amounts
- Rewards history
- Proposed blocks
- Slashing events

### 8.3 Staking Overview
```http
GET /api/validators/staking/overview
```

**Status:** ❌ Not implemented - needs creation

---

## 9. Search API

### 9.1 Global Search
```http
GET /api/search?q={query}&type=all&limit=10
```

**Parameters:**
- `q`: Search query (required)
- `type` (optional): `all`, `blocks`, `extrinsics`, `accounts`, `rollups` (default: `all`)
- `limit` (optional): Max results per type (default: 10)

**Status:** ✅ Basic implementation exists

---

## 10. Missing APIs (Need Implementation)

### 10.1 Transfers API
```http
GET /api/transfers?page=1&limit=20&from=&to=&asset=AVAIL
POST /api/transfers/estimate-fee
```

**Status:** ❌ Not implemented

### 10.2 Events API
```http
GET /api/events?page=1&limit=20&block={blockNumber}&extrinsic={extrinsicId}
```

**Status:** ❌ Not implemented

### 10.3 Logs API
```http
GET /api/logs?page=1&limit=20&block={blockNumber}&type=
```

**Status:** ❌ Not implemented

### 10.4 Light Client API
```http
GET /api/light-client/status
POST /api/light-client/start
POST /api/light-client/stop
```

**Status:** ❌ Not implemented

---

## 11. WebSocket Documentation

### Connection
```javascript
import io from 'socket.io-client';
const socket = io('ws://localhost:3001');
```

### 11.1 Basic Subscriptions

#### Blocks
```javascript
// Subscribe to new blocks
socket.emit('subscribe:blocks');

// Listen for new blocks
socket.on('block:new', (block) => {
  console.log('New block:', block);
});
```

#### Extrinsics
```javascript
// Subscribe to new extrinsics
socket.emit('subscribe:extrinsics');

// Listen for new extrinsics
socket.on('extrinsic:new', (extrinsic) => {
  console.log('New extrinsic:', extrinsic);
});
```

#### Chain Stats
```javascript
// Subscribe to chain statistics
socket.emit('subscribe:chain');

// Listen for chain updates
socket.on('chain:stats', (stats) => {
  console.log('Chain stats:', stats);
});
```

### 11.2 Validator Subscriptions

#### All Validators
```javascript
// Subscribe to validator updates
socket.emit('subscribe:validators', {
  // Optional filters
});

// Listen for validator updates
socket.on('validator:update', (validator) => {
  console.log('Validator update:', validator);
});
```

#### Specific Validator
```javascript
// Subscribe to specific validator
socket.emit('subscribe:validator', 'validatorAddress');

// Listen for specific validator updates
socket.on('validator:specific', (data) => {
  console.log('Validator data:', data);
});
```

#### Staking Updates
```javascript
// Subscribe to staking information
socket.emit('subscribe:staking');

// Listen for staking updates
socket.on('staking:update', (stakingData) => {
  console.log('Staking update:', stakingData);
});
```

### 11.3 Rollup Subscriptions

#### All Rollups
```javascript
// Subscribe to rollup updates
socket.emit('subscribe:rollups');

// Listen for rollup updates
socket.on('rollup:update', (rollupData) => {
  console.log('Rollup update:', rollupData);
});
```

#### Specific Rollup
```javascript
// Subscribe to specific rollup
socket.emit('subscribe:rollup', appId);

// Listen for specific rollup updates
socket.on('rollup:specific', (data) => {
  console.log('Rollup data:', data);
});
```

#### Rollup Leaderboard
```javascript
// Subscribe to leaderboard updates
socket.emit('subscribe:rollup-leaderboard');

// Listen for leaderboard updates
socket.on('leaderboard:update', (leaderboard) => {
  console.log('Leaderboard update:', leaderboard);
});
```

### 11.4 Analytics Subscriptions

#### Network Analytics
```javascript
// Subscribe to network analytics
socket.emit('subscribe:network-analytics', '1h'); // timeframe

// Listen for analytics updates
socket.on('analytics:network', (analytics) => {
  console.log('Network analytics:', analytics);
});
```

#### Gas Tracker
```javascript
// Subscribe to gas price updates
socket.emit('subscribe:gas-tracker');

// Listen for gas updates
socket.on('gas:update', (gasData) => {
  console.log('Gas update:', gasData);
});
```

#### Data Throughput
```javascript
// Subscribe to data throughput metrics
socket.emit('subscribe:data-throughput');

// Listen for throughput updates
socket.on('throughput:update', (throughputData) => {
  console.log('Throughput update:', throughputData);
});
```

### 11.5 Data Submission Subscriptions

#### Data Submissions
```javascript
// Subscribe to data submissions
socket.emit('subscribe:data-submissions', {
  appId: 1, // Optional filter
});

// Listen for new data submissions
socket.on('submission:new', (submission) => {
  console.log('New submission:', submission);
});
```

#### Blob Activity
```javascript
// Subscribe to blob activity
socket.emit('subscribe:blob-activity');

// Listen for blob updates
socket.on('blob:activity', (blobData) => {
  console.log('Blob activity:', blobData);
});
```

### 11.6 Unsubscription

```javascript
// Unsubscribe from specific room
socket.emit('unsubscribe', 'blocks');

// Unsubscribe from all
socket.emit('unsubscribe:all');
```

### 11.7 Connection Events

```javascript
// Connection established
socket.on('connected', (data) => {
  console.log('Connected:', data);
  // data.availableSubscriptions contains list of available subscriptions
});

// Connection error
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

// Disconnection
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

---

## 12. Implementation Roadmap

### Phase 1: Complete Core APIs (High Priority)
1. **Complete Analytics Implementation**
   - Historical data collection for network stats
   - Gas price tracking and trends
   - Fee calculation and distribution analysis

2. **Complete Rollup Database Integration**
   - Implement rollup registry and tracking
   - Real leaderboard calculations
   - Per-rollup analytics and metrics

3. **Complete Validator/Staking APIs**
   - Full validator information endpoints
   - Staking overview and statistics
   - Nomination pools and nominator information

### Phase 2: Missing Core Features (Medium Priority)
1. **Implement Missing APIs**
   - Transfers API with fee estimation
   - Events API for block and extrinsic events
   - Logs API for system logs

2. **Account Profile Enhancement**
   - Complete balance and history tracking
   - Reward calculations and history
   - Asset transfer tracking

### Phase 3: Advanced Features (Lower Priority)
1. **Light Client Integration**
   - Light client management APIs
   - Status monitoring and control

2. **Advanced Analytics**
   - Predictive analytics
   - Performance metrics
   - Cost optimization insights

---

## 13. Architecture Recommendations

### Current Architecture: ✅ KEEP AS-IS
The current hybrid REST + WebSocket approach is optimal and should be maintained:

**REST APIs for:**
- Data fetching with pagination
- Search operations
- Historical data queries
- CRUD operations

**WebSockets for:**
- Real-time block updates
- Live validator status
- Rollup activity streams
- Analytics dashboards
- Gas price monitoring

### Performance Optimizations
1. **Caching Strategy**: Already implemented with Redis
2. **Database Indexing**: Ensure proper indexes for query performance
3. **Rate Limiting**: Already implemented
4. **Compression**: Already implemented

### Security Considerations
1. **Input Validation**: Already implemented with express-validator
2. **CORS Configuration**: Already implemented
3. **Rate Limiting**: Already implemented
4. **Helmet Security**: Already implemented

---

## 14. Error Handling

### Standard Error Codes
- `INVALID_PARAMETERS`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `INTERNAL_SERVER_ERROR`: Server error
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INVALID_APP_ID`: Invalid rollup/app ID format

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Block not found"
  }
}
```

---

## 15. Development Notes

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/avail_explorer
REDIS_URL=redis://localhost:6379

# API Configuration
PORT=3001
NODE_ENV=development

# Blockchain RPC
AVAIL_RPC_URL=wss://mainnet.avail.tools/ws
```

### Testing
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

### Development Commands
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## Conclusion

The current API architecture is well-designed and production-ready. The main development effort should focus on:

1. **Completing TODO implementations** in existing routes
2. **Database integration** for rollup and analytics data
3. **Implementing missing APIs** for transfers, events, and logs
4. **Enhancing real-time capabilities** with more granular WebSocket subscriptions

No major architectural changes are needed. The hybrid REST + WebSocket approach provides the optimal balance of functionality, performance, and developer experience. 