# Avail Explorer Indexer Architecture - Software Engineering Charts

## Table of Contents
1. [System Architecture Diagram](#system-architecture-diagram)
2. [UML Class Diagram](#uml-class-diagram)
3. [Data Flow Diagram](#data-flow-diagram)
4. [Sequence Diagram](#sequence-diagram)
5. [Component Diagram](#component-diagram)
6. [Deployment Diagram](#deployment-diagram)
7. [State Diagram](#state-diagram)
8. [Entity Relationship Diagram](#entity-relationship-diagram)
9. [Queue Processing Flow](#queue-processing-flow)
10. [Domain Interaction Diagram](#domain-interaction-diagram)

---

## System Architecture Diagram

```mermaid
graph TB
    subgraph "External Systems"
        BC[Avail Blockchain Network]
        DB[(PostgreSQL Database)]
        REDIS[(Redis Queue/Cache)]
    end
    
    subgraph "Avail Explorer Indexer System"
        subgraph "API Layer"
            REST[REST APIs]
            WS[WebSocket APIs]
        end
        
        subgraph "Queue System"
            QS[Queue Service]
            CP[Core Processors]
            QM[Queue Monitor]
        end
        
        subgraph "Domain Indexers"
            BI[Block Indexer]
            VI[Validator Indexer]
            AI[Account Indexer]
            TI[Transfer Indexer]
            DSI[Data Submission Indexer]
        end
        
        subgraph "Service Layer"
            SF[Service Factory]
            BS[Blockchain Service]
            CS[Cache Service]
        end
        
        subgraph "Data Layer"
            REPO[Repositories]
            MODELS[Data Models]
        end
    end
    
    BC --> BS
    BS --> BI
    BS --> VI
    BS --> AI
    BS --> TI
    BS --> DSI
    
    QS --> CP
    CP --> BI
    CP --> VI
    CP --> AI
    CP --> TI
    CP --> DSI
    
    BI --> REPO
    VI --> REPO
    AI --> REPO
    TI --> REPO
    DSI --> REPO
    
    REPO --> DB
    CS --> REDIS
    QS --> REDIS
    
    SF --> QS
    SF --> BS
    SF --> CS
    
    REST --> REPO
    WS --> REPO
```

---

## UML Class Diagram

```mermaid
classDiagram
    class IBlockIndexer {
        <<interface>>
        +indexBlock(blockNumber: number) Promise~BlockIndexingResult~
        +indexBlockRange(startBlock: number, endBlock: number) Promise~BlockIndexingResult[]~
    }
    
    class BlockIndexer {
        -repository: IBlockRepository
        -blockchain: AvailBlockchainService
        +indexBlock(blockNumber: number) Promise~BlockIndexingResult~
        +indexBlockRange(startBlock: number, endBlock: number) Promise~BlockIndexingResult[]~
        +extractDependentEntities(blockData: BlockData) DependentEntities
        -fetchBlockFromBlockchain(blockNumber: number) Promise~BlockData~
        -validateBlockData(blockData: BlockData) boolean
    }
    
    class IValidatorIndexer {
        <<interface>>
        +indexValidator(validatorId: string) Promise~ValidatorIndexingResult~
        +indexValidatorsBatch(validatorIds: string[]) Promise~ValidatorIndexingResult[]~
    }
    
    class ValidatorIndexer {
        -repository: IValidatorRepository
        -blockchain: AvailBlockchainService
        +indexValidator(validatorId: string) Promise~ValidatorIndexingResult~
        +indexValidatorsBatch(validatorIds: string[]) Promise~ValidatorIndexingResult[]~
        -fetchValidatorData(validatorId: string) Promise~ValidatorData~
        -fetchStakingInfo(validatorId: string) Promise~StakingData~
    }
    
    class IAccountIndexer {
        <<interface>>
        +indexAccount(accountAddress: string) Promise~AccountIndexingResult~
        +indexAccountsBatch(addresses: string[]) Promise~AccountIndexingResult[]~
    }
    
    class AccountIndexer {
        -blockchain: AvailBlockchainService
        +indexAccount(accountAddress: string) Promise~AccountIndexingResult~
        +indexAccountsBatch(addresses: string[]) Promise~AccountIndexingResult[]~
        -fetchAccountBalance(address: string) Promise~AccountBalance~
        -fetchAccountIdentity(address: string) Promise~AccountIdentity~
    }
    
    class CoreProcessors {
        -dependencies: JobProcessorDependencies
        -getService: Function
        +processBlockIndexing(job: Job) Promise~ProcessorResult~
        +processValidatorIndexing(job: Job) Promise~ProcessorResult~
        +processAccountIndexing(job: Job) Promise~ProcessorResult~
        +processTransferIndexing(job: Job) Promise~ProcessorResult~
        +processDataSubmissionIndexing(job: Job) Promise~ProcessorResult~
        -processDependencies(dependencies: DependentEntities) Promise~void~
    }
    
    class QueueService {
        -queue: Queue
        -redis: RedisClient
        +add(jobType: JobType, data: any) Promise~Job~
        +process(jobType: JobType, processor: Function) void
        +getQueueHealth() Promise~QueueHealth~
        +scheduleBlockDomainProcessing(blockData: BlockData) Promise~Job~
    }
    
    class ServiceFactory {
        -services: Map~string, any~
        -initialized: boolean
        +register(name: string, service: any) void
        +get(name: string) T
        +start() Promise~void~
        +shutdown() Promise~void~
    }
    
    IBlockIndexer <|-- BlockIndexer
    IValidatorIndexer <|-- ValidatorIndexer
    IAccountIndexer <|-- AccountIndexer
    
    CoreProcessors --> BlockIndexer : uses
    CoreProcessors --> ValidatorIndexer : uses
    CoreProcessors --> AccountIndexer : uses
    
    QueueService --> CoreProcessors : processes jobs
    ServiceFactory --> QueueService : manages
    ServiceFactory --> BlockIndexer : creates
    ServiceFactory --> ValidatorIndexer : creates
    ServiceFactory --> AccountIndexer : creates
```

---

## Data Flow Diagram

```mermaid
graph TD
    subgraph "Level 0 - Context Diagram"
        EXT[External Users/Systems]
        SYSTEM[Avail Explorer Indexer]
        BC[Avail Blockchain]
        DB[(Database)]
        
        EXT --> SYSTEM
        SYSTEM --> BC
        SYSTEM --> DB
        BC --> SYSTEM
        DB --> SYSTEM
    end
    
    subgraph "Level 1 - System Overview"
        INPUT[Blockchain Data Input]
        PROCESS[Index Processing]
        QUEUE[Queue Management]
        STORAGE[Data Storage]
        OUTPUT[API Output]
        
        INPUT --> PROCESS
        PROCESS --> QUEUE
        QUEUE --> PROCESS
        PROCESS --> STORAGE
        STORAGE --> OUTPUT
    end
    
    subgraph "Level 2 - Detailed Data Flow"
        BC2[Blockchain Network]
        
        subgraph "Indexing Process"
            FETCH[Fetch Block Data]
            EXTRACT[Extract Dependencies]
            VALIDATE[Validate Data]
        end
        
        subgraph "Queue System"
            SCHEDULE[Schedule Jobs]
            DISTRIBUTE[Distribute to Domains]
            MONITOR[Monitor Progress]
        end
        
        subgraph "Domain Processing"
            PBLOCK[Process Blocks]
            PVALIDATOR[Process Validators]
            PACCOUNT[Process Accounts]
            PTRANSFER[Process Transfers]
            PDATA[Process Data Submissions]
        end
        
        subgraph "Data Storage"
            REPO[Repositories]
            DB2[(PostgreSQL)]
            CACHE[(Redis Cache)]
        end
        
        BC2 --> FETCH
        FETCH --> EXTRACT
        EXTRACT --> VALIDATE
        VALIDATE --> SCHEDULE
        
        SCHEDULE --> DISTRIBUTE
        DISTRIBUTE --> PBLOCK
        DISTRIBUTE --> PVALIDATOR
        DISTRIBUTE --> PACCOUNT
        DISTRIBUTE --> PTRANSFER
        DISTRIBUTE --> PDATA
        
        PBLOCK --> REPO
        PVALIDATOR --> REPO
        PACCOUNT --> REPO
        PTRANSFER --> REPO
        PDATA --> REPO
        
        REPO --> DB2
        REPO --> CACHE
    end
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant Q as Queue Service
    participant CP as Core Processor
    participant BI as Block Indexer
    participant VI as Validator Indexer
    participant AI as Account Indexer
    participant BC as Blockchain
    participant DB as Database
    participant VR as Validator Repo
    participant AR as Account Repo
    
    Note over C,AR: Block Processing with Dependencies
    
    C->>Q: Add BLOCK_INDEXING job
    Q->>CP: Process block indexing job
    
    CP->>BI: indexBlock(blockNumber)
    BI->>BC: Fetch block data
    BC-->>BI: Block data + extrinsics
    BI->>BI: Extract dependent entities
    BI->>DB: Store block data
    BI-->>CP: BlockIndexingResult + dependencies
    
    Note over CP,AR: DB-First Dependency Checking
    
    loop For each validator dependency
        CP->>VR: exists(validatorId)
        VR-->>CP: boolean
        alt Validator doesn't exist
            CP->>Q: Add INDEX_VALIDATOR job
        end
    end
    
    loop For each account dependency
        CP->>AR: exists(accountAddress)
        AR-->>CP: boolean
        alt Account doesn't exist
            CP->>Q: Add INDEX_ACCOUNT job
        end
    end
    
    Note over Q,DB: Independent Domain Processing
    
    Q->>CP: Process validator indexing job
    CP->>VI: indexValidator(validatorId)
    VI->>BC: Fetch validator data
    BC-->>VI: Validator info + staking data
    VI->>DB: Store validator data
    VI-->>CP: ValidatorIndexingResult
    CP-->>Q: Job completed
    
    Q->>CP: Process account indexing job
    CP->>AI: indexAccount(accountAddress)
    AI->>BC: Fetch account data
    BC-->>AI: Account balance + identity
    AI->>DB: Store account data
    AI-->>CP: AccountIndexingResult
    CP-->>Q: Job completed
    
    CP-->>Q: Block indexing completed
    Q-->>C: All jobs processed
```

---

## Component Diagram

```mermaid
graph TB
    subgraph "Indexer System Components"
        subgraph "Queue Processing Layer"
            QS[Queue Service Component]
            CP[Core Processors Component]
            QM[Queue Monitor Component]
        end
        
        subgraph "Domain Indexer Layer"
            BIC[Block Indexer Component]
            VIC[Validator Indexer Component]
            AIC[Account Indexer Component]
            TIC[Transfer Indexer Component]
            DSIC[Data Submission Indexer Component]
        end
        
        subgraph "Service Layer"
            SF[Service Factory Component]
            BS[Blockchain Service Component]
            CS[Cache Service Component]
            SS[Sync Service Component]
        end
        
        subgraph "Data Access Layer"
            BR[Block Repository Component]
            VR[Validator Repository Component]
            AR[Account Repository Component]
            TR[Transfer Repository Component]
            DSR[Data Submission Repository Component]
        end
        
        subgraph "Infrastructure Components"
            DB[(Database Component)]
            REDIS[(Redis Component)]
            API[API Gateway Component]
        end
    end
    
    subgraph "External Interfaces"
        BC[Blockchain Network Interface]
        CLIENT[Client Interface]
    end
    
    %% Queue Layer Connections
    QS --> CP
    CP --> QM
    QS --> REDIS
    
    %% Processor to Indexer Connections
    CP --> BIC
    CP --> VIC
    CP --> AIC
    CP --> TIC
    CP --> DSIC
    
    %% Indexer to Service Connections
    BIC --> BS
    VIC --> BS
    AIC --> BS
    TIC --> BS
    DSIC --> BS
    
    %% Service to Infrastructure Connections
    BS --> BC
    CS --> REDIS
    SS --> QS
    
    %% Indexer to Repository Connections
    BIC --> BR
    VIC --> VR
    AIC --> AR
    TIC --> TR
    DSIC --> DSR
    
    %% Repository to Database Connections
    BR --> DB
    VR --> DB
    AR --> DB
    TR --> DB
    DSR --> DB
    
    %% Service Factory Connections
    SF --> QS
    SF --> BIC
    SF --> VIC
    SF --> AIC
    SF --> TIC
    SF --> DSIC
    
    %% External Connections
    CLIENT --> API
    API --> BR
    API --> VR
    API --> AR
    API --> TR
    API --> DSR
```

---

## Deployment Diagram

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Kubernetes Cluster"
            subgraph "Indexer Pods"
                POD1[Indexer Pod 1<br/>• Queue Service<br/>• Domain Indexers<br/>• Core Processors]
                POD2[Indexer Pod 2<br/>• Queue Service<br/>• Domain Indexers<br/>• Core Processors]
                POD3[Indexer Pod 3<br/>• Queue Service<br/>• Domain Indexers<br/>• Core Processors]
            end
            
            subgraph "API Pods"
                API1[API Pod 1<br/>• REST APIs<br/>• WebSocket APIs]
                API2[API Pod 2<br/>• REST APIs<br/>• WebSocket APIs]
            end
            
            subgraph "Monitoring Pods"
                MON[Monitoring Pod<br/>• Metrics Collection<br/>• Health Checks<br/>• Alerting]
            end
        end
        
        subgraph "Database Tier"
            PGPRIMARY[(PostgreSQL Primary)]
            PGREPLICA[(PostgreSQL Replica)]
        end
        
        subgraph "Cache Tier"
            REDIS1[(Redis Master)]
            REDIS2[(Redis Replica)]
        end
        
        subgraph "Message Queue"
            BULLQ[Bull Queue<br/>Redis-based]
        end
        
        subgraph "External Services"
            LB[Load Balancer]
            AVAIL[Avail Blockchain<br/>Network]
        end
    end
    
    subgraph "Development Environment"
        DEV[Development Setup<br/>• Docker Compose<br/>• Local PostgreSQL<br/>• Local Redis<br/>• Test Blockchain]
    end
    
    %% Production Connections
    LB --> API1
    LB --> API2
    
    POD1 --> PGPRIMARY
    POD2 --> PGPRIMARY
    POD3 --> PGPRIMARY
    
    API1 --> PGREPLICA
    API2 --> PGREPLICA
    
    POD1 --> REDIS1
    POD2 --> REDIS1
    POD3 --> REDIS1
    
    BULLQ --> REDIS1
    REDIS1 --> REDIS2
    
    POD1 --> AVAIL
    POD2 --> AVAIL
    POD3 --> AVAIL
    
    MON --> POD1
    MON --> POD2
    MON --> POD3
    MON --> API1
    MON --> API2
    
    PGPRIMARY --> PGREPLICA
```

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Initializing
    
    Initializing --> Ready : All services started
    Initializing --> Failed : Initialization error
    
    Ready --> Processing : Job received
    Ready --> Idle : No jobs
    
    Processing --> BlockIndexing : BLOCK_INDEXING job
    Processing --> ValidatorIndexing : INDEX_VALIDATOR job
    Processing --> AccountIndexing : INDEX_ACCOUNT job
    Processing --> TransferIndexing : INDEX_TRANSFER job
    Processing --> DataSubmissionIndexing : INDEX_DATA_SUBMISSION job
    
    state BlockIndexing {
        [*] --> FetchingBlock
        FetchingBlock --> ExtractingDependencies : Block fetched
        FetchingBlock --> BlockError : Fetch failed
        ExtractingDependencies --> StoringBlock : Dependencies extracted
        StoringBlock --> QueuingDependencies : Block stored
        QueuingDependencies --> BlockComplete : Dependencies queued
        BlockError --> [*]
        BlockComplete --> [*]
    }
    
    state ValidatorIndexing {
        [*] --> CheckingValidator
        CheckingValidator --> FetchingValidator : Validator missing
        CheckingValidator --> ValidatorSkipped : Validator exists
        FetchingValidator --> StoringValidator : Data fetched
        FetchingValidator --> ValidatorError : Fetch failed
        StoringValidator --> ValidatorComplete : Validator stored
        ValidatorError --> [*]
        ValidatorSkipped --> [*]
        ValidatorComplete --> [*]
    }
    
    state AccountIndexing {
        [*] --> CheckingAccount
        CheckingAccount --> FetchingAccount : Account missing
        CheckingAccount --> AccountSkipped : Account exists
        FetchingAccount --> StoringAccount : Data fetched
        FetchingAccount --> AccountError : Fetch failed
        StoringAccount --> AccountComplete : Account stored
        AccountError --> [*]
        AccountSkipped --> [*]
        AccountComplete --> [*]
    }
    
    BlockIndexing --> Ready : Processing complete
    ValidatorIndexing --> Ready : Processing complete
    AccountIndexing --> Ready : Processing complete
    TransferIndexing --> Ready : Processing complete
    DataSubmissionIndexing --> Ready : Processing complete
    
    Ready --> Stopping : Shutdown requested
    Processing --> Stopping : Shutdown requested
    Idle --> Stopping : Shutdown requested
    
    Stopping --> Stopped : All jobs completed
    Failed --> [*]
    Stopped --> [*]
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    BLOCK {
        int number PK
        string hash UK
        string parent_hash
        string state_root
        string extrinsics_root
        datetime timestamp
        int extrinsics_count
        datetime created_at
        datetime updated_at
    }
    
    VALIDATOR {
        string stash_address PK
        string controller_address
        string session_keys
        string identity_display
        string identity_legal
        decimal commission
        boolean active
        bigint total_stake
        datetime created_at
        datetime updated_at
    }
    
    ACCOUNT {
        string address PK
        string identity_display
        string identity_legal
        bigint free_balance
        bigint reserved_balance
        bigint frozen_balance
        int nonce
        boolean is_validator
        datetime created_at
        datetime updated_at
    }
    
    TRANSFER {
        string id PK
        string extrinsic_hash FK
        int block_number FK
        int extrinsic_index
        string from_address FK
        string to_address FK
        bigint amount
        string token_type
        bigint fees
        string status
        datetime timestamp
        datetime created_at
        datetime updated_at
    }
    
    DATA_SUBMISSION {
        int id PK
        string extrinsic_hash
        int block_number FK
        int extrinsic_index
        int app_id FK
        string rollup_name
        int data_size
        string data_hash
        string submitter FK
        datetime timestamp
        boolean success
        text blob_data
        string kate_commitment
        text proof
        datetime created_at
        datetime updated_at
    }
    
    ROLLUP {
        int app_id PK
        string name
        string description
        int first_seen_block
        int last_active_block
        int total_submissions
        bigint total_data_size
        bigint total_fees_paid
        datetime created_at
        datetime updated_at
    }
    
    NOMINATION {
        string id PK
        string nominator_address FK
        string validator_address FK
        bigint amount
        datetime created_at
        datetime updated_at
    }
    
    ERA {
        int era_index PK
        int start_block
        int end_block
        datetime start_time
        datetime end_time
        int validator_count
        bigint total_stake
        datetime created_at
        datetime updated_at
    }
    
    REWARD {
        string id PK
        int era_index FK
        string validator_address FK
        string nominator_address FK
        bigint amount
        string reward_type
        datetime created_at
        datetime updated_at
    }
    
    %% Relationships
    BLOCK ||--o{ TRANSFER : contains
    BLOCK ||--o{ DATA_SUBMISSION : contains
    
    VALIDATOR ||--o{ NOMINATION : receives
    VALIDATOR ||--o{ REWARD : earns
    
    ACCOUNT ||--o{ TRANSFER : from
    ACCOUNT ||--o{ TRANSFER : to
    ACCOUNT ||--o{ NOMINATION : makes
    ACCOUNT ||--o{ REWARD : receives
    ACCOUNT ||--o{ DATA_SUBMISSION : submits
    
    ROLLUP ||--o{ DATA_SUBMISSION : contains
    
    ERA ||--o{ REWARD : distributes
```

---

## Queue Processing Flow

```mermaid
flowchart TD
    START([System Start]) --> INIT[Initialize Queue Service]
    INIT --> REGISTER[Register Job Processors]
    
    REGISTER --> READY{Queue Ready?}
    READY -->|Yes| LISTEN[Listen for Jobs]
    READY -->|No| ERROR[Handle Error]
    
    LISTEN --> RECEIVE{Job Received?}
    RECEIVE -->|No| LISTEN
    RECEIVE -->|Yes| CLASSIFY[Classify Job Type]
    
    CLASSIFY --> BLOCK_JOB{BLOCK_INDEXING?}
    CLASSIFY --> VALIDATOR_JOB{INDEX_VALIDATOR?}
    CLASSIFY --> ACCOUNT_JOB{INDEX_ACCOUNT?}
    CLASSIFY --> TRANSFER_JOB{INDEX_TRANSFER?}
    CLASSIFY --> DATA_JOB{INDEX_DATA_SUBMISSION?}
    
    BLOCK_JOB -->|Yes| PROCESS_BLOCK[Process Block Indexing]
    VALIDATOR_JOB -->|Yes| PROCESS_VALIDATOR[Process Validator Indexing]
    ACCOUNT_JOB -->|Yes| PROCESS_ACCOUNT[Process Account Indexing]
    TRANSFER_JOB -->|Yes| PROCESS_TRANSFER[Process Transfer Indexing]
    DATA_JOB -->|Yes| PROCESS_DATA[Process Data Submission Indexing]
    
    PROCESS_BLOCK --> GET_BLOCK_INDEXER[Get Block Indexer Service]
    GET_BLOCK_INDEXER --> INDEX_BLOCK[Index Block from Blockchain]
    INDEX_BLOCK --> EXTRACT_DEPS[Extract Dependencies]
    EXTRACT_DEPS --> CHECK_DEPS[DB-First Dependency Check]
    
    CHECK_DEPS --> CHECK_VALIDATORS{Validators Missing?}
    CHECK_VALIDATORS -->|Yes| QUEUE_VALIDATORS[Queue Validator Jobs]
    CHECK_VALIDATORS -->|No| CHECK_ACCOUNTS{Accounts Missing?}
    QUEUE_VALIDATORS --> CHECK_ACCOUNTS
    
    CHECK_ACCOUNTS -->|Yes| QUEUE_ACCOUNTS[Queue Account Jobs]
    CHECK_ACCOUNTS -->|No| QUEUE_TRANSFERS{Transfers to Process?}
    QUEUE_ACCOUNTS --> QUEUE_TRANSFERS
    
    QUEUE_TRANSFERS -->|Yes| QUEUE_TRANSFER_JOBS[Queue Transfer Jobs]
    QUEUE_TRANSFERS -->|No| BLOCK_COMPLETE[Block Processing Complete]
    QUEUE_TRANSFER_JOBS --> BLOCK_COMPLETE
    
    PROCESS_VALIDATOR --> GET_VAL_INDEXER[Get Validator Indexer Service]
    GET_VAL_INDEXER --> INDEX_VALIDATOR[Index Validator from Blockchain]
    INDEX_VALIDATOR --> STORE_VALIDATOR[Store Validator Data]
    STORE_VALIDATOR --> VALIDATOR_COMPLETE[Validator Processing Complete]
    
    PROCESS_ACCOUNT --> GET_ACC_INDEXER[Get Account Indexer Service]
    GET_ACC_INDEXER --> INDEX_ACCOUNT[Index Account from Blockchain]
    INDEX_ACCOUNT --> STORE_ACCOUNT[Store Account Data]
    STORE_ACCOUNT --> ACCOUNT_COMPLETE[Account Processing Complete]
    
    PROCESS_TRANSFER --> GET_TRANS_INDEXER[Get Transfer Indexer Service]
    GET_TRANS_INDEXER --> INDEX_TRANSFERS[Extract Transfers from Block]
    INDEX_TRANSFERS --> STORE_TRANSFERS[Store Transfer Data]
    STORE_TRANSFERS --> TRANSFER_COMPLETE[Transfer Processing Complete]
    
    PROCESS_DATA --> GET_DATA_INDEXER[Get Data Submission Indexer Service]
    GET_DATA_INDEXER --> INDEX_DATA_SUBS[Index Data Submissions]
    INDEX_DATA_SUBS --> STORE_DATA_SUBS[Store Submission Data]
    STORE_DATA_SUBS --> DATA_COMPLETE[Data Submission Processing Complete]
    
    BLOCK_COMPLETE --> UPDATE_METRICS[Update Processing Metrics]
    VALIDATOR_COMPLETE --> UPDATE_METRICS
    ACCOUNT_COMPLETE --> UPDATE_METRICS
    TRANSFER_COMPLETE --> UPDATE_METRICS
    DATA_COMPLETE --> UPDATE_METRICS
    
    UPDATE_METRICS --> SUCCESS{Processing Successful?}
    SUCCESS -->|Yes| LOG_SUCCESS[Log Success]
    SUCCESS -->|No| LOG_ERROR[Log Error]
    
    LOG_SUCCESS --> LISTEN
    LOG_ERROR --> RETRY{Should Retry?}
    RETRY -->|Yes| SCHEDULE_RETRY[Schedule Retry]
    RETRY -->|No| DEAD_LETTER[Move to Dead Letter Queue]
    
    SCHEDULE_RETRY --> LISTEN
    DEAD_LETTER --> LISTEN
    
    ERROR --> SHUTDOWN[Shutdown Queue]
    SHUTDOWN --> END([System End])
```

---

## Domain Interaction Diagram

```mermaid
graph TB
    subgraph "Blockchain Network"
        AVAIL[Avail Blockchain<br/>RPC Endpoints]
    end
    
    subgraph "Queue System"
        QUEUE[Redis Queue]
        PROCESSOR[Core Processor]
    end
    
    subgraph "Domain Indexers"
        BI[Block Indexer<br/>• Fetches blocks<br/>• Extracts dependencies<br/>• Stores block data]
        
        VI[Validator Indexer<br/>• Fetches validator info<br/>• Processes staking data<br/>• Handles identity]
        
        AI[Account Indexer<br/>• Fetches account data<br/>• Processes balances<br/>• Handles identity]
        
        TI[Transfer Indexer<br/>• Extracts transfers<br/>• Processes events<br/>• Handles deduplication]
        
        DSI[Data Submission Indexer<br/>• Processes submissions<br/>• Handles app IDs<br/>• Manages rollups]
    end
    
    subgraph "Repository Layer"
        BR[Block Repository<br/>• CRUD operations<br/>• exists() check]
        
        VR[Validator Repository<br/>• CRUD operations<br/>• exists() check<br/>• Staking queries]
        
        AR[Account Repository<br/>• CRUD operations<br/>• exists() check<br/>• Balance queries]
        
        TR[Transfer Repository<br/>• CRUD operations<br/>• exists() check<br/>• Transfer queries]
        
        DSR[Data Submission Repository<br/>• CRUD operations<br/>• exists() check<br/>• Rollup queries]
    end
    
    subgraph "Database"
        DB[(PostgreSQL<br/>Persistent Storage)]
    end
    
    %% Blockchain connections
    AVAIL -.->|RPC Calls| BI
    AVAIL -.->|RPC Calls| VI
    AVAIL -.->|RPC Calls| AI
    AVAIL -.->|RPC Calls| TI
    AVAIL -.->|RPC Calls| DSI
    
    %% Queue processing flow
    QUEUE --> PROCESSOR
    PROCESSOR -->|BLOCK_INDEXING| BI
    PROCESSOR -->|INDEX_VALIDATOR| VI
    PROCESSOR -->|INDEX_ACCOUNT| AI
    PROCESSOR -->|INDEX_TRANSFER| TI
    PROCESSOR -->|INDEX_DATA_SUBMISSION| DSI
    
    %% Dependency queuing (DB-first)
    BI -.->|Check exists()| VR
    BI -.->|Check exists()| AR
    BI -.->|Queue if missing| QUEUE
    
    %% Data storage
    BI --> BR
    VI --> VR
    AI --> AR
    TI --> TR
    DSI --> DSR
    
    %% Database persistence
    BR --> DB
    VR --> DB
    AR --> DB
    TR --> DB
    DSR --> DB
    
    %% Styling
    classDef indexer fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef repo fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef queue fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef blockchain fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef database fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    
    class BI,VI,AI,TI,DSI indexer
    class BR,VR,AR,TR,DSR repo
    class QUEUE,PROCESSOR queue
    class AVAIL blockchain
    class DB database
```

---

## Summary

These software engineering charts provide comprehensive documentation of the Avail Explorer Indexer architecture:

1. **System Architecture**: High-level overview of system components and their relationships
2. **UML Class Diagram**: Object-oriented design showing classes, interfaces, and relationships
3. **Data Flow Diagram**: How data moves through the system at different levels of detail
4. **Sequence Diagram**: Time-ordered interactions between components during block processing
5. **Component Diagram**: Physical organization of software components and their dependencies
6. **Deployment Diagram**: How the system is deployed in production and development environments
7. **State Diagram**: System states and transitions during processing lifecycle
8. **Entity Relationship Diagram**: Database schema and relationships between data entities
9. **Queue Processing Flow**: Detailed flow of job processing through the queue system
10. **Domain Interaction Diagram**: How domain indexers interact with each other and external systems

These charts serve as:
- **Documentation** for new team members
- **Design reference** for system modifications
- **Communication tool** for stakeholders
- **Troubleshooting guide** for operational issues
- **Architecture validation** for design reviews

The diagrams use Mermaid syntax for easy integration into documentation systems and can be rendered in most modern markdown viewers and documentation platforms.