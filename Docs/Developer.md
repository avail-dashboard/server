


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
