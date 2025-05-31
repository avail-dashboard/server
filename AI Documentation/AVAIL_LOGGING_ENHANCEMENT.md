# Avail Endpoint Logging Enhancement

## Overview

This document outlines the comprehensive logging enhancements implemented to track every request, communication, and call going to Avail endpoints. The logging system provides detailed visibility into all interactions with Avail services including HTTP requests, WebSocket connections, RPC calls, and performance metrics.

## Enhanced Logging Functions

### New Avail-Specific Logging Functions Added to `src/utils/logger.ts`:

#### 1. HTTP Request/Response Logging
```typescript
logAvailHttpRequest(service, method, endpoint, params?, headers?)
logAvailHttpResponse(service, method, endpoint, statusCode, duration, responseSize?, success, error?)
```

#### 2. WebSocket Message Logging
```typescript
logAvailWebSocketSend(service, endpoint, method, messageId, params?, messageSize?)
logAvailWebSocketReceive(service, endpoint, method, messageId, duration, messageSize?, success, error?)
```

#### 3. Connection State Logging
```typescript
logAvailConnectionState(service, endpoint, state, details?)
// States: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting'
```

#### 4. Performance Metrics Logging
```typescript
logAvailPerformanceMetric(service, operation, duration, success, metadata?)
```

#### 5. Service Health Logging
```typescript
logAvailServiceHealth(service, healthy, details)
```

#### 6. Data Submission Logging
```typescript
logAvailDataSubmission(service, appId, dataSize, txHash?, blockHash?, success, error?)
```

#### 7. Fallback and Retry Logging
```typescript
logAvailFallback(operation, failedEndpoint, fallbackEndpoint, reason, attempt)
logAvailRetry(service, operation, endpoint, attempt, maxAttempts, delay, lastError?)
```

## Services Enhanced

### 1. Light Client Service (`src/services/avail-light-client.ts`)

**HTTP Methods Enhanced:**
- `getVersion()` - Version endpoint calls
- `getStatus()` - Status endpoint calls  
- `getBlockStatus(blockNumber)` - Block status calls
- `getBlockHeader(blockNumber)` - Block header calls
- `getBlockData(blockNumber)` - Block data calls
- `submitData(data, appId)` - Data submission calls

**WebSocket Methods Enhanced:**
- `connectWebSocket()` - Connection establishment
- `requestVersion()` - Version requests via WebSocket
- `requestStatus()` - Status requests via WebSocket
- `requestSubmitData()` - Data submission via WebSocket

**Logging Details:**
- Request/response timing
- Data sizes (request and response)
- Connection state changes
- Message IDs for WebSocket correlation
- Performance metrics for each operation
- Data submission tracking with app IDs

### 2. Bridge Service (`src/services/avail-bridge.ts`)

**HTTP Methods Enhanced:**
- `getHealth()` - Bridge health checks
- `getBridgeStats()` - Bridge statistics
- `getTransactions()` - Bridge transaction queries
- `getTransactionById(txId)` - Specific transaction lookups
- `getValidatorSet()` - Validator set queries
- `getProofs()` - Proof generation requests
- `submitBridgeTransaction()` - Bridge transaction submissions

**Logging Details:**
- Bridge-specific metrics (transaction counts, validator counts)
- Transaction status tracking
- Proof generation timing
- Bridge health monitoring

### 3. Nexus Service (`src/services/avail-nexus.ts`)

**HTTP Methods Enhanced:**
- `getHealth()` - Nexus health checks
- `getNetworkStats()` - Network statistics
- `getValidators()` - Validator information
- `getValidatorById(validatorId)` - Specific validator details
- `getBlocks()` - Block queries
- `getBlockById(blockId)` - Specific block lookups
- `getTransactions()` - Transaction queries
- `getAnalytics(timeframe)` - Analytics data

**Logging Details:**
- Network statistics tracking
- Validator performance metrics
- Block and transaction counts
- Analytics timeframe tracking

### 4. TurboDA Service (`src/services/turbo-da.ts`)

**HTTP Methods Enhanced:**
- `submitRawData(data)` - Raw data submissions
- `submitJsonData(data)` - JSON data submissions
- `submitTextData(text)` - Text data submissions
- `getSubmissionStatus(submissionId)` - Status polling
- `getSubmissionData(submissionId)` - Data retrieval
- `getStats()` - TurboDA statistics
- `getSubmissions()` - Submission queries
- `pollSubmissionStatus()` - Status polling with retry logic

**Logging Details:**
- Data submission tracking with sizes
- Submission ID correlation
- Polling attempt tracking
- Status change monitoring

### 5. RPC Service (`src/services/rpc/methods.ts`)

**RPC Methods Enhanced:**
- `getLatestBlock()` - Latest block queries
- `getBlockByNumber(blockNumber)` - Block by number queries
- `getBlockByHash(blockHash)` - Block by hash queries
- `getChainStats()` - Chain statistics
- `getValidators()` - Validator queries

**Logging Details:**
- RPC call timing and parameters
- Response sizes and block information
- Chain statistics tracking
- Validator count monitoring

## Log Output Examples

### HTTP Request Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO",
  "message": "Avail HTTP Request",
  "service": "lightClient",
  "method": "GET",
  "endpoint": "https://mainnet-rpc.avail.so/status",
  "params": undefined,
  "headers": ["Content-Type", "User-Agent"]
}
```

### HTTP Response Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO", 
  "message": "Avail HTTP Response",
  "service": "lightClient",
  "method": "GET",
  "endpoint": "https://mainnet-rpc.avail.so/status",
  "statusCode": 200,
  "duration": "245ms",
  "responseSize": "1024 bytes",
  "success": true
}
```

### WebSocket Send Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO",
  "message": "Avail WebSocket Send",
  "service": "lightClient",
  "endpoint": "wss://mainnet.avail-rpc.com/ws",
  "method": "version",
  "messageId": 1705312245123,
  "messageSize": "45 bytes",
  "direction": "outgoing"
}
```

### Performance Metric Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO",
  "message": "Avail Performance Metric",
  "service": "lightClient",
  "operation": "getBlockData",
  "duration": "156ms",
  "success": true,
  "blockNumber": 12345,
  "responseSize": 2048,
  "extrinsicsCount": 15
}
```

### Data Submission Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO",
  "message": "Avail Data Submission",
  "service": "lightClient",
  "appId": 1,
  "dataSize": "512 bytes",
  "txHash": "0x1234...abcd",
  "blockHash": "0x5678...efgh",
  "success": true
}
```

### Connection State Log
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "INFO",
  "message": "Avail Connection State",
  "service": "lightClient",
  "endpoint": "wss://mainnet.avail-rpc.com/ws",
  "state": "connected",
  "readyState": 1
}
```

## Benefits

### 1. Complete Visibility
- Every HTTP request and response is logged with timing
- All WebSocket messages (send/receive) are tracked
- Connection state changes are monitored
- Performance metrics for all operations

### 2. Debugging and Troubleshooting
- Detailed error logging with context
- Request/response correlation via timestamps
- Connection retry and fallback tracking
- Performance bottleneck identification

### 3. Monitoring and Analytics
- Service health tracking
- Performance trend analysis
- Data submission monitoring
- Connection reliability metrics

### 4. Operational Insights
- Endpoint usage patterns
- Response time analysis
- Error rate monitoring
- Data throughput tracking

## Configuration

The logging system uses the existing Winston configuration in `src/config/index.ts`:

```typescript
logging: {
  level: env.LOG_LEVEL, // Controls log verbosity
  maxFiles: env.LOG_MAX_FILES, // Log rotation
  maxSize: env.LOG_MAX_SIZE, // File size limits
}
```

## Log Levels

- **INFO**: Normal operations, successful requests/responses
- **WARN**: Connection issues, retries, fallbacks
- **ERROR**: Failed requests, connection errors, exceptions
- **DEBUG**: Detailed message content, internal state changes

## Usage

All logging is automatic once the services are initialized. No additional configuration is required. The logs will appear in:

1. **Console** (development/test environments)
2. **Log files** (production):
   - `logs/application-YYYY-MM-DD.log` - All logs
   - `logs/error-YYYY-MM-DD.log` - Error logs only

## Future Enhancements

1. **Metrics Dashboard**: Integration with monitoring tools
2. **Alert System**: Automated alerts for connection failures
3. **Performance Baselines**: Establish performance thresholds
4. **Log Aggregation**: Centralized logging for distributed deployments 