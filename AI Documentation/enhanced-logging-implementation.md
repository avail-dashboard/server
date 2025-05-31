# Enhanced Logging Implementation

## Overview
Enhanced the logging system to provide detailed visibility into WebSocket connections and RPC method calls across all Avail services.

## New Logging Functions Added

### 1. Enhanced RPC Method Logging
```typescript
logDetailedRpcCall(
  method: string,
  endpoint: string,
  params: any[],
  duration: number,
  success: boolean,
  responseSize?: number,
  cached?: boolean,
  service?: string
)
```

### 2. WebSocket Connection Logging
```typescript
logWebSocketConnection(
  endpoint: string,
  event: string,
  service: string,
  details?: Record<string, any>
)
```

### 3. WebSocket Message Logging
```typescript
logWebSocketMessage(
  endpoint: string,
  method: string,
  service: string,
  messageId?: string,
  responseTime?: number,
  messageSize?: number
)
```

### 4. Service Operation Logging
```typescript
logServiceOperation(
  service: string,
  operation: string,
  duration: number,
  success: boolean,
  details?: Record<string, any>
)
```

### 5. Service Fallback Logging
```typescript
logServiceFallback(
  operation: string,
  failedService: string,
  fallbackService: string,
  reason?: string
)
```

## Example Log Outputs

### RPC Method Call Logs
```json
{
  "timestamp": "2024-01-15 12:19:23",
  "level": "info",
  "message": "RPC Method Call",
  "component": "rpc",
  "service": "rpc",
  "method": "chain.getBlock",
  "endpoint": "wss://avail-turing.avail.tools/ws",
  "params": ["0x1234..."],
  "duration": "245ms",
  "success": true,
  "responseSize": "15432 bytes",
  "cached": false
}
```

### WebSocket Connection Logs
```json
{
  "timestamp": "2024-01-15 12:19:20",
  "level": "info",
  "message": "WebSocket Connection",
  "component": "websocket",
  "service": "lightClient",
  "endpoint": "ws://127.0.0.1:7007/ws",
  "event": "connected",
  "readyState": 1
}
```

### WebSocket Message Logs
```json
{
  "timestamp": "2024-01-15 12:19:21",
  "level": "info",
  "message": "WebSocket Message",
  "component": "websocket",
  "service": "lightClient",
  "endpoint": "ws://127.0.0.1:7007/ws",
  "method": "status",
  "messageId": "1705320361234",
  "responseTime": "12ms",
  "messageSize": "256 bytes"
}
```

### Service Operation Logs
```json
{
  "timestamp": "2024-01-15 12:19:23",
  "level": "info",
  "message": "Service Operation",
  "component": "rpc",
  "service": "lightClient",
  "operation": "getLatestBlocks",
  "duration": "156ms",
  "success": true,
  "blocksReturned": 5,
  "totalBlocks": 1000000
}
```

### Service Fallback Logs
```json
{
  "timestamp": "2024-01-15 12:19:25",
  "level": "warn",
  "message": "Service Fallback",
  "component": "rpc",
  "operation": "getLatestBlocks",
  "failedService": "lightClient",
  "fallbackService": "rpc",
  "reason": "WebSocket connection timeout"
}
```

### Light Client HTTP Request Logs
```json
{
  "timestamp": "2024-01-15 12:19:22",
  "level": "info",
  "message": "Light Client HTTP request",
  "component": "rpc",
  "service": "lightClient",
  "method": "getStatus",
  "endpoint": "http://127.0.0.1:7007/status"
}
```

### Light Client HTTP Response Logs
```json
{
  "timestamp": "2024-01-15 12:19:22",
  "level": "info",
  "message": "Light Client HTTP response",
  "component": "rpc",
  "service": "lightClient",
  "method": "getStatus",
  "endpoint": "http://127.0.0.1:7007/status",
  "duration": "89ms",
  "success": true,
  "responseSize": "342 bytes"
}
```

## Services Enhanced

### 1. Unified Avail Service
- Logs which service is selected for each operation
- Tracks service fallback attempts
- Provides operation timing and success metrics

### 2. RPC Methods Service
- Detailed logging of all RPC method calls
- Endpoint information for each call
- Parameter and response size tracking
- Cache hit/miss logging

### 3. Light Client Service
- WebSocket connection state changes
- WebSocket message details
- HTTP request/response logging
- Endpoint and timing information

### 4. Other Services (Bridge, Nexus, TurboDA)
- Similar HTTP request/response logging patterns
- Service-specific operation tracking

## Benefits

1. **Complete Visibility**: See exactly which WebSocket endpoint and RPC method was used for each data fetch
2. **Performance Monitoring**: Track response times and data sizes across all services
3. **Debugging**: Easily identify which service failed and why fallbacks occurred
4. **Service Health**: Monitor the health and performance of each individual service
5. **Troubleshooting**: Detailed error information with context about which endpoint and method failed

## Usage

The enhanced logging is automatically enabled and will appear in your application logs. You can filter logs by:
- Component: `rpc`, `websocket`
- Service: `rpc`, `lightClient`, `bridge`, `nexus`, `turboDA`
- Log Level: `info`, `warn`, `error`, `debug`

Example log filtering:
```bash
# View all RPC method calls
grep "RPC Method Call" logs/application-*.log

# View WebSocket connections
grep "WebSocket Connection" logs/application-*.log

# View service fallbacks
grep "Service Fallback" logs/application-*.log
``` 