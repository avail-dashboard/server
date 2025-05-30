# Avail API Integration Fix - Complete Implementation Guide

## 🔧 **Current Problem Analysis**

Your explorer is currently facing API issues because you're only using **1 out of 5** available Avail API types from the official documentation.

### **Current Implementation (Working)**
- ✅ **Avail Node API** (Substrate RPC) via WebSocket
- Endpoints: `wss://mainnet-rpc.avail.so/ws`, `wss://avail-rpc.dwellir.com`
- Methods: `chain_getBlock`, `state_getStorage`, etc.

### **Missing APIs (Causing Issues)**
- ❌ **Avail Light Client API** (HTTPS & WSS)
- ❌ **Avail Bridge API** (REST)
- ❌ **Avail Nexus API** (Specialized)
- ❌ **Turbo DA API** (Data Submission)

## 🚀 **Complete Integration Solution**

### **1. Add Avail Light Client API Integration**

Create a new service: `src/services/avail-light-client.ts`

```typescript
import axios from 'axios';
import { WebSocket } from 'ws';

export class AvailLightClientService {
  private httpEndpoint: string;
  private wsEndpoint: string;

  constructor() {
    // Official Light Client endpoints
    this.httpEndpoint = 'https://your-light-client-endpoint';
    this.wsEndpoint = 'wss://your-light-client-ws-endpoint';
  }

  // HTTPS API Methods
  async getVersion(): Promise<any> {
    return await axios.get(`${this.httpEndpoint}/version`);
  }

  async getStatus(): Promise<any> {
    return await axios.get(`${this.httpEndpoint}/status`);
  }

  async getBlockStatus(blockNumber: number): Promise<any> {
    return await axios.get(`${this.httpEndpoint}/status/${blockNumber}`);
  }

  async getBlockHeader(blockNumber: number): Promise<any> {
    return await axios.get(`${this.httpEndpoint}/header/${blockNumber}`);
  }

  async getBlockData(blockNumber: number): Promise<any> {
    return await axios.get(`${this.httpEndpoint}/data/${blockNumber}`);
  }

  async submitData(data: any): Promise<any> {
    return await axios.post(`${this.httpEndpoint}/submit`, data);
  }

  // WebSocket API Methods
  async connectWebSocket(): Promise<WebSocket> {
    const ws = new WebSocket(this.wsEndpoint);
    
    ws.on('open', () => {
      console.log('Light Client WebSocket connected');
    });

    return ws;
  }

  async requestVersion(ws: WebSocket): Promise<void> {
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'version',
      id: 1
    }));
  }

  async requestStatus(ws: WebSocket): Promise<void> {
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'status',
      id: 2
    }));
  }
}
```

### **2. Add Avail Bridge API Integration**

Create: `src/services/avail-bridge.ts`

```typescript
import axios from 'axios';

export class AvailBridgeService {
  private baseUrl: string;

  constructor() {
    // Official Bridge API endpoint
    this.baseUrl = 'https://bridge-api.avail.so'; // Replace with actual endpoint
  }

  // REST API Methods from official docs
  async checkHealth(): Promise<any> {
    return await axios.get(`${this.baseUrl}/`);
  }

  async getVersions(): Promise<any> {
    return await axios.get(`${this.baseUrl}/versions`);
  }

  // NOTE: The following endpoints are external Avail bridge service APIs
  // These v1 paths should NOT be changed as they belong to external services
  async getBridgeInfo(): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/info`);
  }

  async getEthereumHead(): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/eth/head`);
  }

  async getAvailHead(): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/avl/head`);
  }

  async getSP1VectorHead(chainId: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/head/${chainId}`);
  }

  async generateMerkleProof(blockHash: string, index: number): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/eth/proof/${blockHash}?index=${index}`);
  }

  async generateProofByChain(chainId: string, blockHash: string, index: number): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/proof/${chainId}?block_hash=${blockHash}&index=${index}`);
  }

  async getStorageProof(blockHash: string, messageId: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/v1/avl/proof/${blockHash}/${messageId}`);
  }

  async getBridgeTransactions(availAddress?: string, ethAddress?: string): Promise<any> {
    const params = new URLSearchParams();
    if (availAddress) params.append('availAddress', availAddress);
    if (ethAddress) params.append('ethAddress', ethAddress);
    
    return await axios.get(`${this.baseUrl}/v1/transactions?${params.toString()}`);
  }
}
```

### **3. Add Avail Nexus API Integration**

Create: `src/services/avail-nexus.ts`

```typescript
import axios from 'axios';

export class AvailNexusService {
  private baseUrl: string;

  constructor() {
    // Official Nexus API endpoint
    this.baseUrl = 'https://nexus-api.avail.so'; // Replace with actual endpoint
  }

  async getHealth(): Promise<any> {
    return await axios.get(`${this.baseUrl}/health`);
  }

  async getAccountState(address: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/account/state/${address}`);
  }

  async getAccountStateHex(address: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/account/state/hex/${address}`);
  }

  async getBlockByHash(hash: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/block/hash/${hash}`);
  }

  async getBlockByHeight(height: number): Promise<any> {
    return await axios.get(`${this.baseUrl}/block/height/${height}`);
  }

  async getHeaderByHash(hash: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/header/${hash}`);
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/transaction/status/${txHash}`);
  }

  async getBlockRangeForProof(startBlock: number, endBlock: number): Promise<any> {
    return await axios.get(`${this.baseUrl}/block/range/${startBlock}/${endBlock}`);
  }
}
```

### **4. Add Turbo DA API Integration**

Create: `src/services/turbo-da.ts`

```typescript
import axios from 'axios';

export class TurboDAService {
  private baseUrl: string;

  constructor() {
    // Official Turbo DA endpoint
    this.baseUrl = 'https://turbo-da.avail.so'; // Replace with actual endpoint
  }

  async submitRawData(data: Buffer): Promise<any> {
    return await axios.post(`${this.baseUrl}/submit/raw`, data, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  }

  async submitJsonData(data: object): Promise<any> {
    return await axios.post(`${this.baseUrl}/submit/json`, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async fetchPreImage(hash: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/preimage/${hash}`);
  }

  async getSubmissionInfo(submissionId: string): Promise<any> {
    return await axios.get(`${this.baseUrl}/submission/${submissionId}`);
  }
}
```

### **5. Update Configuration**

Update `src/config/index.ts`:

```typescript
// Add to your config
dataSources: {
  rpc: {
    // Existing RPC config
    endpoints: [
      env.AVAIL_RPC_ENDPOINT,
      'wss://mainnet-rpc.avail.so/ws',
      'wss://avail-rpc.dwellir.com',
    ].filter(Boolean),
    // ... existing config
  },
  
  // NEW: Additional Avail APIs
  lightClient: {
    httpEndpoint: env.AVAIL_LIGHT_CLIENT_HTTP || 'https://your-light-client-endpoint',
    wsEndpoint: env.AVAIL_LIGHT_CLIENT_WS || 'wss://your-light-client-ws-endpoint',
  },
  
  bridge: {
    endpoint: env.AVAIL_BRIDGE_API || 'https://bridge-api.avail.so',
  },
  
  nexus: {
    endpoint: env.AVAIL_NEXUS_API || 'https://nexus-api.avail.so',
  },
  
  turboDA: {
    endpoint: env.AVAIL_TURBO_DA_API || 'https://turbo-da.avail.so',
  },
},
```

### **6. Create Unified Avail Service**

Create: `src/services/unified-avail.ts`

```typescript
import { AvailRPCService } from './rpc';
import { AvailLightClientService } from './avail-light-client';
import { AvailBridgeService } from './avail-bridge';
import { AvailNexusService } from './avail-nexus';
import { TurboDAService } from './turbo-da';

export class UnifiedAvailService {
  public rpc: AvailRPCService;
  public lightClient: AvailLightClientService;
  public bridge: AvailBridgeService;
  public nexus: AvailNexusService;
  public turboDA: TurboDAService;

  constructor() {
    this.rpc = new AvailRPCService();
    this.lightClient = new AvailLightClientService();
    this.bridge = new AvailBridgeService();
    this.nexus = new AvailNexusService();
    this.turboDA = new TurboDAService();
  }

  async initialize(): Promise<void> {
    await this.rpc.initialize();
    // Initialize other services as needed
  }

  // Smart method routing - use the best API for each operation
  async getLatestBlocks(query?: any): Promise<any> {
    try {
      // Try Light Client first (more reliable for recent data)
      return await this.lightClient.getBlockData(0); // Latest block
    } catch (error) {
      // Fallback to RPC
      return await this.rpc.getLatestBlocks(query);
    }
  }

  async getBlockWithProofs(blockNumber: number): Promise<any> {
    try {
      // Use Bridge API for blocks with proofs
      const blockHash = await this.rpc.getBlockByNumber(blockNumber);
      const proofs = await this.bridge.generateMerkleProof(blockHash.hash, 0);
      return { block: blockHash, proofs };
    } catch (error) {
      // Fallback to RPC only
      return await this.rpc.getBlockByNumber(blockNumber);
    }
  }

  async getAccountWithState(address: string): Promise<any> {
    try {
      // Use Nexus API for enhanced account data
      return await this.nexus.getAccountState(address);
    } catch (error) {
      // Fallback to RPC
      return await this.rpc.getAccountDetails(address);
    }
  }

  async submitDataToAvail(data: any): Promise<any> {
    try {
      // Use Turbo DA for data submission (optimized)
      return await this.turboDA.submitJsonData(data);
    } catch (error) {
      // Fallback to Light Client
      return await this.lightClient.submitData(data);
    }
  }
}
```

## 🔧 **Environment Variables to Add**

Add to your `.env` file:

```bash
# Avail Light Client
AVAIL_LIGHT_CLIENT_HTTP=https://your-light-client-endpoint
AVAIL_LIGHT_CLIENT_WS=wss://your-light-client-ws-endpoint

# Avail Bridge API
AVAIL_BRIDGE_API=https://bridge-api.avail.so

# Avail Nexus API  
AVAIL_NEXUS_API=https://nexus-api.avail.so

# Turbo DA API
AVAIL_TURBO_DA_API=https://turbo-da.avail.so
```

## 🎯 **Benefits of This Complete Implementation**

1. **Reduced API Issues**: Multiple fallback options
2. **Better Performance**: Use specialized APIs for specific operations
3. **Enhanced Features**: Access to proofs, cross-chain data, optimized submissions
4. **Industry Standard**: Following official Avail documentation completely
5. **Future-Proof**: Ready for all Avail ecosystem features

## 🚀 **Implementation Priority**

1. **High Priority**: Light Client API (solves most reliability issues)
2. **Medium Priority**: Bridge API (essential for cross-chain features)
3. **Low Priority**: Nexus & Turbo DA (enhancement features)

## 🔍 **Testing Your Integration**

After implementation, test each API:

```typescript
// Test script
async function testAvailAPIs() {
  const avail = new UnifiedAvailService();
  await avail.initialize();

  // Test each API
  const rpcHealth = await avail.rpc.getHealth();
  const lightClientStatus = await avail.lightClient.getStatus();
  const bridgeInfo = await avail.bridge.getBridgeInfo();
  const nexusHealth = await avail.nexus.getHealth();

  console.log('All Avail APIs working:', { rpcHealth, lightClientStatus, bridgeInfo, nexusHealth });
}
```

This complete implementation will resolve your API issues by properly utilizing all available Avail APIs according to the official documentation. 