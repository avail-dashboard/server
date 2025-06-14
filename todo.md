# TODO - Missing Implementation Items from Avail DA Explorer Scope

## =4 **High Priority Missing - Analytics & Rollup Endpoints**

### Analytics Endpoints (Phase 2)
- [ ] **Network Analytics** (`/api/analytics/network`)
  - General stats (total blocks, extrinsics, blob size, fees)
  - Throughput tracking (blocks/hour, extrinsics/hour, data throughput)
  - Network activity trends

- [ ] **Gas Analytics** (`/api/analytics/gas`)
  - Gas price tracker (hourly average for past 7 days)
  - Gas efficiency (gas used/limit ratio)
  - Cost per transaction & block analytics

- [ ] **DA Contribution Analytics** (`/api/analytics/da-contribution`)
  - Rollup percentage share in total DA submissions
  - Daily/weekly/monthly contribution breakdown
  - Cost per MB analytics by rollup

### Rollup Endpoints (Phase 3)
- [ ] **Rollup List** (`/api/rollups`)
  - Replace mock data with real database queries
  - Rollup overview with stats (size, blobs, fees paid, paid per MB)

- [ ] **Rollup Leaderboard** (`/api/rollups/leaderboard`)
  - Ranking by data size, blob count, fees paid, submissions
  - Percentage of total metrics

- [ ] **Individual Rollup Details** (`/api/rollups/:appId`)
  - Detailed rollup view with statistics
  - First seen, last active, unique submitters

- [ ] **Rollup Analytics** (`/api/rollups/:appId/analytics`)
  - 24h/week/month analytics per rollup
  - DA usage, blob count, fee trends, submission history

## =á **Medium Priority Missing - Account & Validation Features**

### Account System
- [ ] **Account Profiles** (`/api/accounts/:address`)
  - Balances and role information
  - Account statistics and identity data

- [ ] **Account History** (`/api/accounts/:address/extrinsics`, `/api/accounts/:address/transfers`)
  - Extrinsics history with filtering
  - Transfer history (in/out)
  - Rewards and balance history

### Transfer Indexing
- [ ] **AVAIL Transfer System** (`/api/transfers`)
  - From/To address tracking
  - Events emitted, fees, parameters
  - Asset flow and transfer status
  - Transfer list with filtering

### Staking & Validation System
- [ ] **Validator List** (`/api/validators`)
  - Active, waiting, slashed validators
  - Commission rates, bonded amounts
  - Session keys and identity data

- [ ] **Detailed Validator Info** (`/api/validators/:address`)
  - Stash/controller addresses
  - Nominator count, self-bonded amounts
  - Rewards list, blocks proposed, slashing events

- [ ] **Nomination Pools** (`/api/staking/pools`)
  - Pool management and member tracking
  - Pool states and commission rates

- [ ] **Staking Statistics** (`/api/staking/overview`)
  - Total staking amount breakdown
  - Inflation rate, minimum stake requirements
  - Era and epoch tracking

## =â **Lower Priority Missing - Advanced Features**

### Search & Navigation
- [ ] **Universal Search** (`/api/search`)
  - Cross-entity search (blocks, extrinsics, addresses, rollups)
  - Search suggestions and filtering

### Chain Information
- [ ] **Chain Metadata** (`/api/chain/info`)
  - Chain properties, spec version
  - Token decimals, symbols, genesis hash

### Advanced Block/Extrinsic Features
- [ ] **Enhanced Block Data**
  - Validator information integration
  - Block time calculations
  - Cost per block analytics

- [ ] **Enhanced Extrinsic Data**
  - Asset transfers within extrinsics
  - Lifetime/mortality information
  - Weight and class information

### Events & Logs
- [ ] **Events System**
  - Event indexing and display
  - Event filtering by type and action

- [ ] **Logs System**
  - Log indexing with engine and type
  - Log display within blocks and extrinsics

## =5 **Future Features - Real-time & Advanced**

### Real-time Features
- [ ] **WebSocket Endpoints**
  - Real-time block updates (`/ws/blocks`)
  - Real-time extrinsic updates (`/ws/extrinsics`) 
  - Real-time data submission updates (`/ws/data-submissions`)

### Light Client Integration
- [ ] **Light Client Control** (`/api/light-client/*`)
  - Start/stop light client functionality
  - Sync status and progress monitoring
  - Data availability verification

### Fee Estimation
- [ ] **Fee Estimation System** (`/api/utils/estimate-fee`)
  - Data submission fee estimation
  - Transfer fee estimation
  - Cost per MB calculations

### User Features
- [ ] **Bookmark System** (`/api/user/bookmarks`)
  - User bookmark management
  - Transaction tracking

- [ ] **Command Palette Actions** (`/api/actions/*`)
  - Transfer functionality
  - Data submission actions
  - Navigation suggestions

### Export & Downloads
- [ ] **Blob Downloads** (`/api/blobs/:extrinsicId/download`)
  - Raw data downloads
  - Content decoding and format conversion

- [ ] **Data Export** (`/api/export/*`)
  - Rollup analytics export (CSV, JSON, XLSX)
  - Validator performance export

## =à **Infrastructure Missing**

### Database Schema Extensions
- [ ] **Transfers Table** - For AVAIL transfer indexing
- [ ] **Validators Table** - For validator information
- [ ] **Staking Table** - For staking and nomination data
- [ ] **Events Table** - For event indexing
- [ ] **Logs Table** - For log storage
- [ ] **User Tables** - For bookmarks and user features

### Services Extensions
- [ ] **Transfer Service** - For transfer processing
- [ ] **Validator Service** - For validator data
- [ ] **Staking Service** - For staking information
- [ ] **Events Service** - For event processing
- [ ] **Search Service** - For universal search
- [ ] **Light Client Service** - For light client integration

### Authentication System
- [ ] **JWT Authentication** - For user features
- [ ] **API Key System** - For advanced access
- [ ] **Rate Limiting** - Per endpoint rate limits
- [ ] **Caching Strategy** - Advanced caching for performance

---

## =Ê **Current Implementation Status**
-  **Phase 1 Complete**: Core database endpoints (11/11 working)
- = **Phase 2 Ready**: Analytics endpoints (0/3 implemented)  
- ó **Phase 3 Pending**: Rollup endpoints (0/4 implemented)
- ó **Advanced Features**: 0% implemented

**Total Scope Coverage**: ~15% of full Avail DA Explorer specification completed.