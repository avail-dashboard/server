# Avail Blockchain Explorer - Backend API Integration Guide

## 🔧 Architecture Overview

### **CORS-Safe Architecture**
```
Frontend → Backend Server (preferred)
Frontend → Next.js API Routes → External APIs (fallback)
❌ NEVER: Frontend → External APIs (causes CORS errors)
```

### **Response Flow**
1. **Primary**: Frontend calls backend server at `localhost:3001`
2. **Fallback**: Frontend calls Next.js API routes at `/api/*`
3. **Server-side only**: Next.js routes call external APIs (Subscan, CoinGecko)

## 🚀 Quick Start

### 1. **Backend Development Setup**

// ... existing code ...

### 2. **Frontend Environment Configuration**

// ... existing code ...

### 3. **Test the Integration**

```bash
# Terminal 1: Start backend (if available)
cd server && npm run dev

# Terminal 2: Start frontend
cd web && npm run dev

# Visit: http://localhost:3000
```

The frontend will automatically detect if the backend is available:
- ✅ **With backend**: Shows "Backend Connected" + real-time updates
- ⚠️ **Without backend**: Shows "Backend Offline" + uses Next.js API fallback

## 📋 API Implementation Details

### **Frontend API Client (`web/src/lib/api.ts`)**

```typescript
export class AvailAPI {
  // ✅ Calls backend server directly
  private backend: BackendAPIClient
  
  // ✅ Calls Next.js API routes (server-side external API calls)
  private frontend: FrontendAPIClient
  
  // ❌ NO direct external API calls from frontend
}
```

### **Next.js API Routes (Fallback Layer)**

All external API calls happen server-side in Next.js routes:

- **`/api/blocks`** → Subscan API (server-side)
- **`/api/chain`** → Subscan + CoinGecko (server-side)  
- **`/api/extrinsics`** → Subscan API (server-side)
- **`/api/search`** → Subscan API (server-side)

```typescript
// Example: /api/blocks/route.ts
export async function GET() {
  try {
    // ✅ Server-side call to external API
    const response = await axios.post('https://avail.api.subscan.io/api/scan/blocks', ...)
    return NextResponse.json({ success: true, data: response.data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message })
  }
}
```

## 🔄 Fallback Strategy

### **Automatic Backend Detection**
```typescript
// Frontend automatically checks backend health
const isBackendAvailable = await availAPI.refreshBackendStatus()

if (isBackendAvailable) {
  // Use backend server for real-time data + WebSockets
} else {
  // Use Next.js API routes (external APIs called server-side)
}
```

### **Graceful Degradation**
| Feature | With Backend | Without Backend |
|---------|-------------|-----------------|
| **Blocks** | ✅ Real-time | ✅ Via Next.js API |
| **Chain Data** | ✅ Live stats | ✅ Via Next.js API |
| **Search** | ✅ Full search | ✅ Via Next.js API |
| **WebSocket** | ✅ Real-time | ❌ Polling only |
| **Analytics** | ✅ Advanced | ❌ Limited |

## 🛡️ CORS Prevention

### **❌ Wrong (Causes CORS Errors)**
```typescript
// DON'T DO THIS - Direct external API calls from browser
const response = await axios.get('https://avail.api.subscan.io/api/scan/blocks')
const priceData = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=avail')
```

### **✅ Correct (CORS-Safe)**
```typescript
// Frontend calls own Next.js API routes
const response = await fetch('/api/blocks')  // → Next.js API → Subscan (server-side)
const chainData = await fetch('/api/chain')  // → Next.js API → Subscan + CoinGecko (server-side)
```

## 🔌 Real-Time Features

### **WebSocket Connection (Backend Required)**
```typescript
import { availWS } from '@/lib/api'

// Only works when backend is available
availWS.connect(
  (data) => console.log('Real-time update:', data),
  (error) => console.error('WebSocket error:', error)
)

// Subscribe to specific updates
availWS.subscribe('blocks')
availWS.subscribe('extrinsics')
```

### **Polling Fallback (No Backend)**
```typescript
// Automatic polling when WebSocket unavailable
useEffect(() => {
  if (!isBackendAvailable) {
    const interval = setInterval(() => {
      // Fetch updates via Next.js API routes
      refreshData()
    }, 10000) // Poll every 10 seconds
    
    return () => clearInterval(interval)
  }
}, [isBackendAvailable])
```

## 🎛️ Environment Configuration

### **Development (.env.local)**
```bash
# Backend server (optional)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# External API keys (for Next.js API routes)
SUBSCAN_API_KEY=your_subscan_api_key_here
COINGECKO_API_KEY=your_coingecko_api_key_here

# Environment
NEXT_PUBLIC_NODE_ENV=development
```

### **Production (.env.production)**
```bash
# Backend server (production)
NEXT_PUBLIC_API_BASE_URL=https://api.avail-explorer.com/api/v1
NEXT_PUBLIC_WS_URL=wss://api.avail-explorer.com

# External API keys (server-side only)
SUBSCAN_API_KEY=your_production_subscan_key
COINGECKO_API_KEY=your_production_coingecko_key

# Environment
NEXT_PUBLIC_NODE_ENV=production
```

## 🧪 Testing Different Scenarios

### **1. Test With Backend**
```bash
# Start backend server
cd server && npm run dev

# Start frontend  
cd web && npm run dev

# Expected: "Backend Connected" status, real-time updates
```

### **2. Test Without Backend**
```bash
# Only start frontend (no backend)
cd web && npm run dev

# Expected: "Backend Offline" status, Next.js API fallback
```

### **3. Test Backend Failure Recovery**
```bash
# Start both, then stop backend while frontend is running
# Expected: Automatic fallback to Next.js API routes
```

## 📊 Status Monitoring

### **Backend Status Component**
```typescript
import { BackendStatus } from '@/components/BackendStatus'

// Shows detailed system status
<BackendStatus />

// Shows quick status badge  
<BackendStatusBadge />
```

### **Programmatic Status Check**
```typescript
import { availAPI } from '@/lib/api'

// Check current status
const isOnline = availAPI.isBackendAvailable()

// Force refresh status
const newStatus = await availAPI.refreshBackendStatus()
```

## 🚨 Error Handling

### **Network Errors**
```typescript
try {
  const blocks = await availAPI.getLatestBlocks()
} catch (error) {
  // Automatic fallback to Next.js API routes
  console.error('API error, trying fallback:', error)
}
```

### **Rate Limiting**
```typescript
// Implement exponential backoff for external APIs
const retryDelay = Math.min(1000 * Math.pow(2, attempt), 30000)
setTimeout(() => retry(), retryDelay)
```

## 🔍 Debugging

### **API Request Logging**
```typescript
// Development mode automatically logs all API requests
// Look for these in browser console:
🚀 API Request: GET /api/v1/blocks
✅ API Response: 200 /api/v1/blocks
⚠️ Fallback API used for: /api/blocks
```

### **WebSocket Connection**
```typescript
// WebSocket connection logs
🔌 WebSocket connected
🔄 Attempting to reconnect WebSocket (1/5)
❌ Max WebSocket reconnection attempts reached
```

### **Backend Health Check**
```bash
# Manual health check
curl http://localhost:3001/api/v1/health

# Expected response
{"success": true, "data": {"status": "online", "timestamp": "..."}}
```

## 🎯 Best Practices

### **1. CORS Safety**
- ✅ All external API calls must be server-side
- ✅ Use Next.js API routes for fallback
- ❌ Never call external APIs directly from frontend

### **2. Error Boundaries**
```typescript
// Wrap API calls in error boundaries
<ErrorBoundary fallback={<ErrorComponent />}>
  <DataComponent />
</ErrorBoundary>
```

### **3. Loading States**
```typescript
// Always show loading states
const { data, loading, error } = useAPIRequest(availAPI.getBlocks)

if (loading) return <Spinner />
if (error) return <ErrorMessage error={error} />
return <BlocksList blocks={data} />
```

### **4. Caching Strategy**
```typescript
// Cache API responses appropriately
const { data } = useSWR('/api/blocks', fetcher, {
  refreshInterval: 10000, // 10 seconds
  revalidateOnFocus: false
})
```

This architecture ensures zero CORS issues while providing robust fallback capabilities and optimal user experience! 🚀 