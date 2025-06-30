# Avail Blockchain Entities and Relationships

This document explains the core entities in the Avail blockchain ecosystem and how they relate to each other.

## Overview

Avail is a data availability blockchain that enables modular blockchain architectures. It separates consensus from execution, allowing other blockchains (rollups) to use Avail for secure data availability while handling their own execution.

## Core Entities

### 1. Blocks

**Purpose**: Fundamental unit of the blockchain containing all network activity for a specific time period.

**Key Properties**:
- `blockNumber`: Sequential identifier (height)
- `blockHash`: Unique cryptographic identifier
- `parentHash`: Hash of the previous block (creates the chain)
- `timestamp`: When the block was created
- `author`: Validator who authored/produced the block
- `stateRoot`: Root hash of the blockchain state
- `extrinsicsRoot`: Root hash of all extrinsics in the block

**Block Production**:
- **Fixed 20-second intervals** - Deterministic timing via BABE consensus
- **Produced even when "empty"** - Maintains network liveness and consensus
- Contains system operations (timestamps, validator heartbeats, era transitions)
- Enables predictable data availability windows for rollups

**Contains**:
- Block header with metadata
- List of extrinsics (transactions)
- Data submissions from rollups
- Validator attestations and consensus data

### 2. Validators

**Purpose**: Network participants responsible for block production, consensus, and data availability validation.

**Key Properties**:
- `stashAddress`: Main validator account (holds stake) - cold storage, high security
- `controllerAddress`: Account that controls validation operations - hot wallet, daily operations
- `commission`: Fee percentage taken from staking rewards
- `totalBonded`: Total amount staked (own + nominations)
- `selfBonded`: Validator's own stake
- `nominatorCount`: Number of accounts nominating this validator
- `status`: Active/inactive/blocked status
- `identityInfo`: Display name and contact information

**Account Security Model**:
- **Stash**: Holds funds, stays offline, minimal operations
- **Controller**: Manages validation, can be compromised without losing stake
- Risk separation: Controller compromise doesn't affect staked funds

**Responsibilities**:
- Produce blocks when selected
- Validate data availability
- Participate in consensus (BABE/GRANDPA)
- Attest to data submissions
- Maintain network security through staking

**Selection Process**:
- Selected based on stake weight
- Rotation ensures decentralization
- Higher stake = higher probability of selection

### 3. Data Submissions

**Purpose**: External data (from rollups/applications) submitted to Avail for data availability guarantees.

**Key Properties**:
- `appId`: Application/rollup identifier
- `blockNumber`: Block containing the submission
- `extrinsicIndex`: Position within the block
- `dataSize`: Size of submitted data in bytes
- `dataHash`: Hash of the submitted data
- `submitter`: Account that submitted the data

**Data Flow**:
1. Rollup/application creates transaction data
2. Data is submitted to Avail via `dataAvailability.submitData` extrinsic
3. Validators include submission in block
4. Data is erasure coded and distributed
5. Light clients can verify data availability

**Relationship to Blocks**:
- Multiple data submissions per block
- Each submission is an extrinsic within the block
- Block header commits to all data submissions

### 4. Accounts

**Purpose**: Represent users, validators, and applications interacting with the network.

**Key Properties**:
- `address`: Unique identifier (SS58 format)
- `nonce`: Transaction counter
- `balance`: Available token balance
- `reserved`: Locked/reserved tokens
- `accountType`: User/validator/system account

**Roles**:
- **User Accounts**: Submit transactions, hold tokens
- **Validator Accounts**: Participate in consensus (stash/controller)
- **Application Accounts**: Submit data for rollups
- **System Accounts**: Protocol-level operations

### 5. Extrinsics (Transactions)

**Purpose**: State changes or operations submitted to the blockchain.

**Types**:
- **Data Submissions**: `dataAvailability.submitData`
- **Balance Transfers**: `balances.transfer`
- **Staking Operations**: `staking.bond`, `staking.nominate`
- **Validator Operations**: `session.setKeys`
- **Governance**: Voting and proposals

**Properties**:
- `extrinsicIndex`: Position in block
- `blockNumber`: Containing block
- `signer`: Account that signed the transaction
- `method`: The specific operation being performed
- `success`: Whether execution succeeded
- `fee`: Transaction fee paid

### 6. Rollups

**Purpose**: External blockchains or applications using Avail for data availability.

**Key Properties**:
- `appId`: Unique application identifier (primary key)
- `name`: Human-readable rollup name
- `description`: Description of the rollup/application
- `firstSeenBlock`: First block with data submission
- `lastActiveBlock`: Most recent block with activity
- `totalSubmissions`: Number of data submissions made
- `totalDataSize`: Cumulative bytes submitted
- `totalFeesPaid`: Total fees paid for data availability
- `website`: Official website URL
- `logoUrl`: Logo image URL

**Integration Pattern**:
1. Rollup registers with Avail (gets unique `appId`)
2. Submits transaction/state data via `dataAvailability.submitData`
3. Data is included in Avail blocks with DA guarantees
4. Light clients can verify data availability
5. Rollup can focus on execution while using Avail for DA

**Cross-Block Activity**:
- Rollups span multiple blocks due to independent timing
- Rollup batching doesn't align with Avail's 20-second block schedule
- Economic optimization: rollups batch transactions before submission
- Enables cost-efficient DA usage across variable submission patterns

### 7. Transfers

**Purpose**: Balance transfers between accounts on the Avail network.

**Key Properties**:
- `id`: Unique identifier (`{extrinsic_hash}-{index}`)
- `extrinsicHash`: Hash of containing extrinsic
- `fromAddress`: Sender account address
- `toAddress`: Recipient account address
- `amount`: Transfer amount in smallest unit
- `tokenType`: Token type (default: "AVAIL")
- `fees`: Transaction fees paid
- `status`: Success/failed status
- `timestamp`: When transfer occurred

**Types**:
- **Regular transfers**: User-to-user balance transfers
- **Validator rewards**: Staking reward distributions
- **Fee payments**: Transaction fee transfers to validators

### 8. Nominations

**Purpose**: Staking nominations from accounts to validators.

**Key Properties**:
- `id`: Unique identifier (`{nominator}-{validator}`)
- `nominatorAddress`: Account making the nomination
- `validatorAddress`: Validator being nominated
- `amount`: Amount of stake nominated
- `era`: Era when nomination was made
- `active`: Whether nomination is currently active

**Staking Process**:
1. Account chooses validator to nominate
2. Bonds tokens to validator via nomination
3. Receives proportional share of validator rewards
4. Can unbond with unbonding period

### 9. Eras

**Purpose**: Time periods for staking rewards and validator selection.

**Key Properties**:
- `number`: Era identifier (sequential)
- `startBlock`: Block when era began
- `endBlock`: Block when era ended (if completed)
- `totalStaked`: Total amount staked in this era
- `validatorCount`: Number of active validators
- `active`: Whether era is currently active

**Era Lifecycle**:
1. New era starts with validator selection
2. Validators produce blocks during era
3. Rewards calculated at era end
4. New era begins with updated validator set

### 10. Rewards

**Purpose**: Staking rewards distributed to validators and nominators.

**Key Properties**:
- `id`: Unique identifier (`{address}-{era}-{type}`)
- `address`: Account receiving reward
- `validatorAddress`: Validator associated with reward
- `amount`: Reward amount
- `era`: Era when reward was earned
- `rewardType`: validator/nominator/slash
- `blockNumber`: Block containing reward event
- `timestamp`: When reward was distributed

**Reward Types**:
- **Validator rewards**: Block production and validation rewards
- **Nominator rewards**: Share of validator rewards
- **Slash penalties**: Negative rewards for misbehavior

### 11. Events

**Purpose**: Blockchain events emitted during block execution.

**Key Properties**:
- `blockNumber`: Block containing the event
- `extrinsicIndex`: Extrinsic that triggered event (if any)
- `eventIndex`: Position within block events
- `module`: Pallet/module that emitted event
- `eventName`: Specific event name
- `data`: Event parameters and data
- `phase`: Execution phase (ApplyExtrinsic, Finalization, etc.)

**Event Types**:
- **System events**: Block finalization, errors
- **Balance events**: Transfers, deposits, withdrawals
- **Staking events**: Rewards, slashing, nominations
- **Data availability events**: Data submissions, commitments

## Entity Relationships

### Block → Validators
```
Block.validatorAddress → Validator.stashAddress
```
- Each block is authored by exactly one validator
- Validators are selected based on stake and randomness
- Block production rotates among active validator set
- Validators earn rewards for block production

### Block → Data Submissions
```
Block contains multiple DataSubmissions
DataSubmission.blockNumber → Block.blockNumber
```
- Blocks contain zero or more data submissions
- Each data submission is included as an extrinsic
- Block commits to all contained data via Merkle roots

### Block → Extrinsics
```
Block contains multiple Extrinsics
Extrinsic.blockNumber → Block.blockNumber
```
- All blockchain operations are recorded as extrinsics
- Extrinsics are ordered within blocks
- Block header commits to all extrinsics

### Block → Transfers
```
Block contains multiple Transfers
Transfer.blockNumber → Block.blockNumber
```
- Balance transfers are recorded per block
- Transfers are linked to specific extrinsics
- Block tracks total transfer count

### Block → Events
```
Block contains multiple Events
Event.blockNumber → Block.blockNumber
```
- Events are emitted during block execution
- Events can be triggered by extrinsics or system operations
- Events provide detailed operation results

### Block → Rewards
```
Block contains multiple Rewards
Reward.blockNumber → Block.blockNumber
```
- Staking rewards are distributed in specific blocks
- Era rewards are calculated and distributed
- Block tracks reward distribution events

### Data Submissions → Rollups
```
DataSubmission.appId → Rollup.appId
```
- Each data submission belongs to a specific rollup
- Rollups can have multiple data submissions across blocks
- Enables per-rollup data tracking and analytics
- Rollup statistics are aggregated from submissions

### Data Submissions → Accounts
```
DataSubmission.submitter → Account.address
```
- Data submissions are signed by accounts
- Accounts pay fees for data submissions
- Enables attribution and billing

### Validators → Accounts (Multi-Role)
```
Validator.stashAddress → Account.address (ValidatorStash)
Validator.controllerAddress → Account.address (ValidatorController)
Validator.rewardAddress → Account.address (ValidatorReward)
```
- Validators have multiple account roles
- Stash account holds the stake
- Controller account performs validation operations
- Reward account receives staking rewards

### Nominations → Validators → Accounts
```
Nomination.nominatorAddress → Account.address
Nomination.validatorAddress → Validator.stashAddress
```
- Accounts can nominate validators with their stake
- Validators receive additional stake from nominators
- Nominations are tracked per era
- Rewards are shared between validator and nominators

### Transfers → Accounts (Bidirectional)
```
Transfer.fromAddress → Account.address (TransferFrom)
Transfer.toAddress → Account.address (TransferTo)
```
- Transfers connect sender and receiver accounts
- Accounts track sent and received transfers
- Transfer history enables account activity tracking

### Transfers → Extrinsics
```
Transfer.extrinsicHash → Extrinsic.hash
```
- Transfers are executed via extrinsics
- Multiple transfers can occur in single extrinsic
- Extrinsic provides execution context and fees

### Rewards → Accounts
```
Reward.address → Account.address
```
- Rewards are distributed to account addresses
- Accounts accumulate rewards over time
- Reward history enables performance tracking

### Rewards → Validators
```
Reward.validatorAddress → Validator.stashAddress
```
- Rewards are associated with specific validators
- Validators earn block production rewards
- Nominators receive rewards through validator association

### Rewards → Eras
```
Reward.era → Era.number
```
- Rewards are calculated and distributed per era
- Era provides context for reward calculation
- Historical reward tracking per era

### Eras → Validators (Implicit)
```
Era affects Validator selection and rewards
```
- Eras determine active validator sets
- Validator performance is measured per era
- Stake amounts can change between eras

### Events → Extrinsics
```
Event.extrinsicIndex → Extrinsic.extrinsicIndex (within block)
```
- Events can be triggered by extrinsic execution
- System events occur without extrinsic association
- Events provide detailed operation outcomes

### Accounts → Multiple Entities
```
Account.address → Validator.stashAddress (if validator)
Account.address → Nomination.nominatorAddress (if nominator)
Account.address → Transfer.fromAddress/toAddress (if transacting)
Account.address → Reward.address (if earning rewards)
```
- Accounts can have multiple roles simultaneously
- Account type enum indicates primary role
- Activity tracking across all entity interactions

## Data Flow Example

### Rollup Data Submission Process:

1. **Rollup creates batch**: Application processes transactions and creates data batch
2. **Data submission**: Rollup calls `dataAvailability.submitData(appId, data)`
3. **Mempool**: Extrinsic enters transaction pool
4. **Block production**: Selected validator includes extrinsic in new block
5. **Consensus**: Validators agree on block validity
6. **Finalization**: Block becomes part of canonical chain
7. **Data availability**: Data is erasure coded and distributed
8. **Light client verification**: Clients can verify data availability without downloading full data

### Block Production Cycle:

1. **Validator selection**: Algorithm selects next block author based on stake
2. **Transaction collection**: Validator gathers extrinsics from mempool
3. **Block construction**: Creates block with header and extrinsics
4. **Block proposal**: Broadcasts block to network
5. **Validation**: Other validators verify block validity
6. **Consensus**: Network agrees on block via GRANDPA finality
7. **Chain extension**: Block becomes part of canonical chain

## Key Insights

### Data Availability Focus
- Avail's primary purpose is ensuring data availability, not execution
- Rollups use Avail for data storage while handling their own computation
- This enables scalable, modular blockchain architectures

### Validator Economics
- Validators earn rewards for block production and data availability validation
- Higher stake increases selection probability and rewards
- Commission structure incentivizes validator performance

### Application Isolation
- Each application gets a unique `appId` for data segregation
- Applications can track their own usage and costs
- Enables multi-tenant data availability service

### Light Client Friendly
- Block structure optimized for light client data availability proofs
- Erasure coding enables efficient data recovery
- Light clients can verify data availability without full node resources

This architecture enables Avail to serve as a foundational data availability layer for the modular blockchain ecosystem.

## Entity Relationship Diagrams

### Core Block Structure
```
┌─────────────────────────────────────────────────────────────┐
│                          BLOCK                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Header: number, hash, parentHash, timestamp, author    ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   EXTRINSICS                           ││
│  │  ├─ Transfer (balances.transfer)                       ││
│  │  ├─ Data Submission (dataAvailability.submitData)     ││
│  │  ├─ Staking Operation (staking.nominate)              ││
│  │  └─ Validator Operation (session.setKeys)             ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                     EVENTS                             ││
│  │  ├─ Transfer events                                    ││
│  │  ├─ Staking reward events                             ││
│  │  ├─ Data availability events                          ││
│  │  └─ System events                                     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       VALIDATOR                             │
│  stashAddress ──────────────────────────── ACCOUNT         │
│  controllerAddress ─────────────────────── ACCOUNT         │
│  rewardAddress ────────────────────────────── ACCOUNT      │
└─────────────────────────────────────────────────────────────┘
```

### Staking Relationship Network
```
┌─────────────┐    nominates    ┌─────────────┐    produces    ┌─────────────┐
│   ACCOUNT   │ ──────────────► │  VALIDATOR  │ ──────────────► │    BLOCK    │
│             │                │             │                │             │
│ (Nominator) │                │ totalBonded │                │   rewards   │
└─────────────┘                │ commission  │                └─────────────┘
       │                       └─────────────┘                       │
       │                              │                              │
       │                              │                              │
       ▼                              ▼                              ▼
┌─────────────┐                ┌─────────────┐                ┌─────────────┐
│ NOMINATION  │                │     ERA     │                │   REWARD    │
│             │                │             │                │             │
│ amount      │                │ totalStaked │                │ validator   │
│ active      │                │ startBlock  │                │ nominator   │
└─────────────┘                └─────────────┘                └─────────────┘
```

### Data Availability Flow
```
┌─────────────┐    submits data    ┌─────────────┐    includes    ┌─────────────┐
│   ROLLUP    │ ─────────────────► │DATA SUBMISSION│ ─────────────► │    BLOCK    │
│             │                    │             │                │             │
│ appId: 1001 │                    │ dataSize    │                │ validator   │
│ name: "L2"  │                    │ dataHash    │                │ timestamp   │
└─────────────┘                    │ appId: 1001 │                └─────────────┘
       │                           └─────────────┘                       │
       │                                  │                              │
       │                                  │                              │
       ▼                                  ▼                              ▼
┌─────────────┐                    ┌─────────────┐                ┌─────────────┐
│ Statistics  │                    │  EXTRINSIC  │                │ DA Guarantee│
│             │                    │             │                │             │
│totalSubmiss │                    │ method      │                │ Erasure     │
│totalDataSize│                    │ signer      │                │ Coding      │
└─────────────┘                    └─────────────┘                └─────────────┘
```

### Account Activity Network
```
                    ┌─────────────┐
                    │   ACCOUNT   │
                    │   (Central) │
                    └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  TRANSFER   │    │ NOMINATION  │    │   REWARD    │
│             │    │             │    │             │
│ from/to     │    │ validator   │    │ amount      │
│ amount      │    │ amount      │    │ era/type    │
└─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  EXTRINSIC  │    │  VALIDATOR  │    │    ERA      │
│             │    │             │    │             │
│ fee/success │    │ commission  │    │ totalStaked │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Multi-Entity Block Processing
```
Block N arrives
       │
       ▼
┌─────────────────────────────────────┐
│         INDEXING PIPELINE           │
├─────────────────────────────────────┤
│ 1. Block Data ──────────────────────┤──► Block table
│ 2. Validator Info ──────────────────┤──► Validator table  
│ 3. Extrinsics ──────────────────────┤──► Extrinsic table
│ 4. Events ──────────────────────────┤──► Event table
│ 5. Transfers ───────────────────────┤──► Transfer table
│ 6. Data Submissions ────────────────┤──► DataSubmission table
│ 7. Staking Rewards ─────────────────┤──► Reward table
│ 8. Account Updates ─────────────────┤──► Account table
└─────────────────────────────────────┘
              │
              ▼
      ┌─────────────────┐
      │   ANALYTICS     │
      │                 │
      │ • Rollup stats  │
      │ • Validator perf│
      │ • Era progress  │
      │ • Network health│
      └─────────────────┘
```

### Era Lifecycle Chart
```
Era N-1          Era N              Era N+1
   │              │                   │
   ▼              ▼                   ▼
┌─────────┐    ┌─────────┐         ┌─────────┐
│ ACTIVE  │───►│ ACTIVE  │────────►│ ACTIVE  │
│         │    │         │         │         │
│ Rewards │    │ Rewards │         │ Rewards │
│ Calc    │    │ Accrue  │         │ Calc    │
└─────────┘    └─────────┘         └─────────┘
     │              │                   │
     ▼              ▼                   ▼
┌─────────┐    ┌─────────┐         ┌─────────┐
│VALIDATOR│    │VALIDATOR│         │VALIDATOR│
│SET      │    │SELECTION│         │SET      │
│ROTATION │    │& STAKES │         │ROTATION │
└─────────┘    └─────────┘         └─────────┘
     │              │                   │
     ▼              ▼                   ▼
Block 1000     Block 1440          Block 1880
(Era Start)   (Era Progress)      (Era Start)
```

### Rollup Integration Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    ROLLUP ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Rollup A  │  │   Rollup B  │  │   Rollup C  │         │
│  │   appId: 1  │  │   appId: 2  │  │   appId: 3  │         │
│  │   DeFi      │  │   Gaming    │  │   Social    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │            DATA AVAILABILITY LAYER                      ││
│  │                                                         ││
│  │  dataAvailability.submitData(appId, data)              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AVAIL BLOCKCHAIN                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Block    │  │    Block    │  │    Block    │         │
│  │      N      │  │    N+1      │  │    N+2      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Data Submissions from all rollups stored & validated  ││
│  │  • Erasure coding for redundancy                       ││
│  │  • Validator attestations                              ││
│  │  • Light client friendly proofs                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```