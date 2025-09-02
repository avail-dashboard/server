# Backend API Requirements - Phase 1 Completion

## Overview
The Avail DA Explorer frontend (Phase 1) is complete but requires backend API support to display real data instead of placeholders. Currently showing mock data for key metrics.

## Critical API Requirements

### 1. Chain Statistics API - `/api/chain/stats`
**Status: 404 Error**
**Priority: HIGH - Dashboard completely broken without this**

```json
// Expected Response Format:
{
  "success": true,
  "data": {
    "latestBlock": {
      "number": 1234567,
      "hash": "0x...",
      "timestamp": "2024-08-29T02:30:00.000Z"
    },
    "finalizedBlocks": 1234560,
    "totalBlocks": 1234567,
    "tokenPrice": 0.12345678, // AVAIL price in USD
    "priceChange": 2.4, // 24h percentage change
    "staking": {
      "totalBonded": "150000000000000000000", // in AVAIL wei
      "activeValidators": 167,
      "stakingRatio": 0.73
    },
    "network": {
      "blockTime": 12, // average block time in seconds
      "tps": 25.5, // transactions per second
      "uptime": 99.8 // network uptime percentage
    }
  }
}
```

**Frontend Usage:**
- Live Network Banner metrics
- Network Status cards
- Real-time block number display

### 2. Data Submissions API Fixes
**Status: Working but data format issues**
**Priority: MEDIUM - Functional but showing "Invalid date"**

**Current Endpoint:** `/api/data-submissions?limit=8&sort_by=block_number&sort_order=desc`

**Issues to Fix:**
```json
// Current problematic response:
{
  "data": [
    {
      "id": 12345, // ✅ Working
      "blockNumber": 1234567, // ✅ Working  
      "timestamp": "invalid_format", // ❌ BROKEN - shows "Invalid date"
      "dataSize": null, // ❌ Missing - shows as 0 bytes
      "appId": 1, // ✅ Working
      "submitter": "0x...", // ✅ Working
      "transactionHash": "0x..." // ✅ Working
    }
  ]
}
```

**Required Fixes:**
- **Timestamps**: Use ISO 8601 format: `"2024-08-29T02:30:45.000Z"`
- **Data Size**: Provide actual blob size in bytes (not null)
- **Optional**: Add cost estimation per submission

### 3. Real Rollup Data API
**Status: Using mock data**  
**Priority: MEDIUM - Hero content currently fake**

**New Endpoint Needed:** `/api/rollups/active`

```json
// Expected Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Arbitrum One", // or "App ID 1" if name unknown
      "appId": 1,
      "status": "active", // "active" | "inactive"
      "totalSize": 15600000000, // bytes
      "submissions": 2847,
      "lastActive": "2024-08-29T02:25:00.000Z",
      "submitters": 12, // unique submitter addresses
      "avgCostPerMB": 0.032, // USD per MB
      "marketShare": 23.4 // percentage of total DA usage
    }
  ]
}
```

**Rollup Detection Logic:**
- Group data submissions by `appId`
- Calculate aggregated metrics per app
- Determine "active" status (submissions within last 24h)
- If rollup names unknown, use "App ID X" format

### 4. Latest Blocks API (Enhancement)
**Status: Working but could be enhanced**
**Priority: LOW - Currently functional**

**Current:** `/api/blocks?limit=5&sort_by=number&sort_order=desc`

**Enhancement Request:** Add block time calculation
```json
{
  "data": [
    {
      "number": 1234567,
      "hash": "0x...",
      "timestamp": "2024-08-29T02:30:45.000Z",
      "validator": "0x...",
      "blockTime": 12.5, // seconds since previous block
      "dataSize": 2048576, // bytes of DA data in block
      "extrinsicsCount": 15
    }
  ]
}
```

## Optional Enhancements (Future)

### Real-time Data Feed
**WebSocket endpoint for live updates:**
- New blocks as they're produced
- New data submissions
- Price changes
- Validator set changes

### Network Analytics
**Additional metrics for dashboard:**
- Gas price trends
- Network utilization
- DA bandwidth usage
- Cost per block averages

## Implementation Priority

1. **CRITICAL**: Fix `/api/chain/stats` (404 error)
2. **HIGH**: Fix data submission timestamps 
3. **MEDIUM**: Add real rollup aggregation data
4. **LOW**: Enhanced block data

## Testing Endpoints

Once implemented, frontend will automatically consume:
- `GET /api/chain/stats` - Every 10 seconds
- `GET /api/data-submissions?limit=8&sort_by=block_number&sort_order=desc` - Every 15 seconds  
- `GET /api/blocks?limit=5&sort_by=number&sort_order=desc` - Every 15 seconds
- `GET /api/rollups/active` - Every 60 seconds

## Success Criteria

Phase 1 will be considered complete when:
- [ ] Live Network Banner shows real AVAIL price, block numbers, TVL
- [ ] Network Status cards display actual network metrics  
- [ ] Data submissions show proper timestamps and sizes
- [ ] Active Rollups table shows real rollup analytics (not mock data)
- [ ] All dashboard numbers update in real-time

## Notes

- Frontend error handling already implemented for API failures
- All API calls include 10-second timeouts
- Responsive design works with any data volumes
- No breaking changes to existing working endpoints needed

## Contact

Frontend implementation ready - just needs backend data to bring dashboard to life!