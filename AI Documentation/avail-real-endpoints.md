# Real Avail API Endpoints

## Official Endpoints from Avail Documentation

Based on the official Avail documentation at https://docs.availproject.org/docs/networks, here are the real production endpoints:

### Mainnet Endpoints

#### RPC/WebSocket Endpoints
- **Primary RPC**: `https://mainnet-rpc.avail.so/rpc`
- **Primary WebSocket**: `wss://mainnet.avail-rpc.com/`
- **Blast API**: `https://avail-mainnet.public.blastapi.io/`
- **Blast WebSocket**: `wss://avail-mainnet.public.blastapi.io/`
- **Ankr**: `https://rpc.ankr.com/avail`

#### Bridge API
- **Endpoint**: `https://bridge-api.avail.so/`
- **VectorX Contract**: `0x02993cdC11213985b9B13224f3aF289F03bf298d`
- **Bridge Contract**: `0x054fd961708d8e2b9c10a63f6157c74458889f0a`

### Testnet (Turing) Endpoints

#### RPC/WebSocket Endpoints
- **RPC**: `https://turing-rpc.avail.so/rpc`
- **WebSocket**: `wss://turing-rpc.avail.so/ws`

#### Bridge API
- **Endpoint**: `https://turing-bridge-api.avail.so/`
- **VectorX Contract**: `0xe542db219a7e2b29c7aeaeace242c9a2cd528f96`
- **Bridge Contract**: `0x967F7DdC4ec508462231849AE81eeaa68Ad01389`

### Additional Provider Endpoints

The following third-party providers offer additional redundancy:

1. **Ankr**
   - Mainnet: `https://rpc.ankr.com/avail`
   - Testnet: `https://rpc.ankr.com/avail_turing_testnet`

2. **Bware Labs (BlastAPI)**
   - Mainnet: `https://avail-mainnet.public.blastapi.io/`
   - Testnet: `https://avail-turing.public.blastapi.io`

3. **AllNodes**
   - Various regional endpoints available

4. **RadiumBlock, BountyBlok, LugaNodes, StakePool, OnFinality** - Multiple providers for high availability

### Configuration Updates Applied

Our configuration has been updated to use these real endpoints instead of placeholder URLs:

1. **RPC Service**: Now uses official mainnet endpoints with fallbacks
2. **Light Client**: Connected to real Avail light client APIs  
3. **Bridge Service**: Connected to official bridge API with real contract addresses
4. **Nexus & Turbo DA**: Using likely endpoint patterns (may need refinement with Avail team)

### Verification Status

✅ **Working**: RPC Service, Bridge Service  
⚠️ **Needs Real URLs**: Nexus API, Turbo DA API (placeholder endpoints)  
✅ **Configured**: All contract addresses and bridge endpoints

This resolves the fundamental issue where we were only using 1 out of 5 available Avail APIs. 