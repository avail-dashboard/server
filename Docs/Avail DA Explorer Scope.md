# Avail DA Explorer Scope

## 1. Data Scope

### Network Statistics
- **General Statistics**: Total Blocks, Total Extrinsics, Total Blobs Size, Total Fees
- **Data Throughput Tracking**: Real-time monitoring of data flow
- **DA Contribution Graph**: Percentage share of each rollup in total DA submission (calculated daily, weekly, monthly)
- **Cost per MB of Data**: Pricing analytics for data availability

### Gas and Fee Tracking
- **Gas Price Tracker**: Hourly average for the past 7 days
- **Gas Efficiency**: Gas used / Gas Limit ratio
- **Cost per Transaction**: Hourly average for the past 1 day
- **Cost per Block**: Hourly average for the past 1 day

### Rollup/App-Space Tracking
- **Rollup Overview Page**: 
  - Rollup Name
  - Last Active
  - Size
  - Blobs
  - Blob Fees Paid
  - Paid per MB
- **Detailed Rollup View**: 
  - Size
  - Blobs
  - Blob Fees Paid
  - First Seen
  - Last Active
- **List of Blobs for each Rollup**: 
  - Signer
  - Time
  - Share Commitments
  - Size
- **Analytics per Rollup** (24h/Week/Month): 
  - DA Usage
  - Blob Count
  - Fee Paid
  - Blob Size

### Blocks Data
- Timestamp
- Block Time
- Status
- Hash
- Parent Hash
- State Root
- Extrinsics Root
- Validator Information
- Spec Version
- Cost per Block

### Extrinsics
- **List View**: 
  - ID
  - Hash
  - Data Submission Status
  - Time
  - Result
  - Action
- **Detailed View**: 
  - Timestamp
  - Block
  - Lifetime
  - Hash
  - Action
  - Asset Transfers
  - Sender
  - Fees
  - Nonce
  - Result
  - Parameters
  - Signature Information
  - Cost per Tx

### Account Profiles
- **Balances and Role**
- **History of**:
  - Extrinsics
  - Transfers
  - Rewards
  - Balances

### Events
*Shown inside Extrinsics and Blocks*
- ID
- Action
- Type

### Data Submissions
- **List View**:
  - Extrinsic ID
  - Rollup Name
  - Size
  - Submitter
  - Data Hash

### Logs
*Shown inside Extrinsics and Blocks*
- **List View**:
  - LogIndex
  - Block
  - Type
  - Engine

### Transfers
- **AVAIL Transfer Indexing**:
  - From Address
  - To Address
  - Events Emitted
  - Fees
  - Block Number
  - Extrinsic Hash
  - Parameters
  - Signature
  - Assets Flow
  - Status

### Staking and Validation
- **Validator List**: 
  - Active
  - New Entrants
  - Waiting
  - Slashed
- **Detailed Validator Info**: 
  - Stash and Controller Addresses
  - Nominator Count
  - Commission Rate
  - Session Keys
  - Self-Bonded
  - Total Bonded
  - Nominators
  - List of Rewards
  - List of Blocks Proposed
  - Slashing Events
- **Nomination Pools**
- **Nominator Info**: 
  - Bonded Amount
  - Reward Lists
  - Stash, Controller and Reward Addresses
- **Era and Epoch Tracking**

### Validator Statistics
- Total Staking Amount (Validator vs Nominator)
- Inflation Rate
- Minimum Stake Requirement

## 2. Explorer Features

### Core Functionality
- **Search Functionality**: Blocks, extrinsics, addresses, app spaces
- **Easy Navigation**: Between related entities (e.g., from block to extrinsics to events)
- **Detailed Views**: Blocks, extrinsics, addresses, validators and rollups
- **Filtered Extrinsics View**: Only Data Submission transactions
- **Blobs**: Content decoding and downloads
- **Analytics**: Network activity monitoring
- **Gas Tracker**: Cost estimation tooling
- **App Space Views**: Rollup analytics
- **API Services**: Endpoints for all data points and documentation for API usage
- **Avail Light Client Integration**: 
  - Ability to run Light client
  - Check status and sync information

## 3. User Interface

### Main Sections
- **Home Page**: Network overview and recent activity for all entities
- **Dedicated Sections**: 
  - Blocks
  - Extrinsics
  - Rollups
  - Accounts
  - Validators

### Analytics & Visualization
- **Rollup Leaderboard**: Analytics and heatmaps
- **Network and DA Statistics**: Charts and graphs
- **Staking and Validation Graphs**: Visual representation of staking data
- **Data Submission/Blob Analytics**: Comprehensive blob analysis

### User Experience Features
- **Bookmarks**: Track specific transactions
- **cmd + K Functionality**: 
  - Perform explorer navigation
  - Run light clients
  - Transfer Avail to addresses
  - Submit data
  - Estimate fees