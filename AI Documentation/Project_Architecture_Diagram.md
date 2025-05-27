# Avail Explorer Backend - Project Architecture

## Overview
This document contains mermaid diagrams explaining the architecture of the Avail Explorer Backend project.

## Main Architecture Diagram

```mermaid
graph TB
    %% External Services
    subgraph "External Services"
        AVAIL[Avail Blockchain Network<br/>WebSocket RPC]
        SUBSCAN[Subscan API<br/>External Data Source]
        COINGECKO[CoinGecko API<br/>Price Data]
    end

    %% Client Layer
    subgraph "Client Layer"
        WEB[Web Frontend<br/>React/Next.js]
        MOBILE[Mobile Apps]
        API_CLIENTS[API Clients]
    end

    %% Load Balancer / Reverse Proxy
    LB[Load Balancer<br/>Nginx/Cloudflare]

    %% Main Application
    subgraph "Avail Explorer Backend"
        subgraph "API Layer"
            EXPRESS[Express.js Server<br/>Port 3001]
            WEBSOCKET[WebSocket Server<br/>Socket.io]
            MIDDLEWARE[Middleware Layer<br/>• CORS<br/>• Rate Limiting<br/>• Security Headers<br/>• Compression]
        end

        subgraph "Route Handlers"
            BLOCKS_ROUTE[Blocks Routes<br/>/api/v1/blocks]
            CHAIN_ROUTE[Chain Routes<br/>/api/v1/chain]
            EXTRINSICS_ROUTE[Extrinsics Routes<br/>/api/v1/extrinsics]
            SEARCH_ROUTE[Search Routes<br/>/api/v1/search]
            ACCOUNTS_ROUTE[Accounts Routes<br/>/api/v1/accounts]
        end

        subgraph "Service Layer"
            BLOCKCHAIN_SERVICE[Blockchain Service<br/>• Polkadot API Integration<br/>• Real-time Data Fetching<br/>• Block Processing]
            DATA_SERVICE[Data Service<br/>• Database Operations<br/>• Caching Logic<br/>• Data Validation]
        end

        subgraph "Data Layer"
            SQLITE_STORE[SQLite Store<br/>Development Database<br/>File-based Storage]
        end
    end

    %% Infrastructure Services
    subgraph "Infrastructure"
        subgraph "Development"
            SQLITE_DB[(SQLite Database<br/>./data/avail_explorer.db<br/>• Zero Config<br/>• File-based<br/>• Development Only)]
        end

        subgraph "Production"
            POSTGRES[(PostgreSQL<br/>Production Database<br/>• High Performance<br/>• Concurrent Access<br/>• ACID Compliance)]
            REDIS[(Redis Cache<br/>• Session Storage<br/>• API Caching<br/>• Real-time Data)]
        end
    end

    %% Monitoring & Logging
    subgraph "Observability"
        LOGS[Winston Logger<br/>• Daily Rotate Files<br/>• Multiple Log Levels<br/>• Structured Logging]
        METRICS[Prometheus Metrics<br/>• Performance Monitoring<br/>• Health Checks]
        HEALTH[Health Endpoints<br/>/health<br/>/metrics]
    end

    %% Data Flow Connections
    WEB --> LB
    MOBILE --> LB
    API_CLIENTS --> LB
    LB --> EXPRESS

    EXPRESS --> MIDDLEWARE
    MIDDLEWARE --> BLOCKS_ROUTE
    MIDDLEWARE --> CHAIN_ROUTE
    MIDDLEWARE --> EXTRINSICS_ROUTE
    MIDDLEWARE --> SEARCH_ROUTE
    MIDDLEWARE --> ACCOUNTS_ROUTE

    BLOCKS_ROUTE --> BLOCKCHAIN_SERVICE
    CHAIN_ROUTE --> BLOCKCHAIN_SERVICE
    EXTRINSICS_ROUTE --> BLOCKCHAIN_SERVICE
    SEARCH_ROUTE --> DATA_SERVICE
    ACCOUNTS_ROUTE --> DATA_SERVICE

    BLOCKCHAIN_SERVICE --> AVAIL
    BLOCKCHAIN_SERVICE --> SUBSCAN
    DATA_SERVICE --> COINGECKO

    BLOCKCHAIN_SERVICE --> DATA_SERVICE
    DATA_SERVICE --> SQLITE_STORE
    SQLITE_STORE --> SQLITE_DB

    %% Production connections
    DATA_SERVICE -.-> POSTGRES
    DATA_SERVICE -.-> REDIS

    %% WebSocket connections
    EXPRESS --> WEBSOCKET
    WEBSOCKET -.-> WEB
    WEBSOCKET -.-> MOBILE

    %% Monitoring connections
    EXPRESS --> LOGS
    EXPRESS --> METRICS
    EXPRESS --> HEALTH

    %% Styling
    classDef external fill:#e1f5fe
    classDef client fill:#f3e5f5
    classDef api fill:#e8f5e8
    classDef service fill:#fff3e0
    classDef data fill:#fce4ec
    classDef infra fill:#f1f8e9
    classDef monitoring fill:#fff8e1

    class AVAIL,SUBSCAN,COINGECKO external
    class WEB,MOBILE,API_CLIENTS client
    class EXPRESS,WEBSOCKET,MIDDLEWARE,BLOCKS_ROUTE,CHAIN_ROUTE,EXTRINSICS_ROUTE,SEARCH_ROUTE,ACCOUNTS_ROUTE api
    class BLOCKCHAIN_SERVICE,DATA_SERVICE service
    class SQLITE_STORE data
    class SQLITE_DB,POSTGRES,REDIS infra
    class LOGS,METRICS,HEALTH monitoring
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development Environment"
        DEV_APP[Node.js Application<br/>npm run dev]
        DEV_DB[(SQLite Database<br/>./data/avail_explorer.db)]
        DEV_APP --> DEV_DB
    end

    subgraph "Production Environment"
        subgraph "Docker Compose Stack"
            NGINX[Nginx Reverse Proxy<br/>Port 80/443]
            BACKEND[Backend Container<br/>avail-backend<br/>Port 3001]
            PG_CONTAINER[PostgreSQL Container<br/>avail-postgres<br/>Port 5432]
            REDIS_CONTAINER[Redis Container<br/>avail-redis<br/>Port 6379]
            
            %% Optional Admin Tools
            PGADMIN[pgAdmin Container<br/>Port 5050<br/>Profile: admin]
            REDIS_INSIGHT[RedisInsight Container<br/>Port 8001<br/>Profile: admin]
        end

        subgraph "Persistent Storage"
            PG_VOLUME[(postgres_data<br/>Volume)]
            REDIS_VOLUME[(redis_data<br/>Volume)]
            LOG_VOLUME[(./logs<br/>Host Mount)]
        end
    end

    subgraph "Cloud Deployment Options"
        AWS[AWS ECS/EKS<br/>• Auto Scaling<br/>• Load Balancing<br/>• RDS PostgreSQL<br/>• ElastiCache Redis]
        GCP[Google Cloud Run<br/>• Serverless<br/>• Cloud SQL<br/>• Memorystore Redis]
        AZURE[Azure Container Instances<br/>• Container Groups<br/>• Azure Database<br/>• Azure Cache]
    end

    %% Connections
    NGINX --> BACKEND
    BACKEND --> PG_CONTAINER
    BACKEND --> REDIS_CONTAINER
    PG_CONTAINER --> PG_VOLUME
    REDIS_CONTAINER --> REDIS_VOLUME
    BACKEND --> LOG_VOLUME

    %% Admin connections
    PGADMIN -.-> PG_CONTAINER
    REDIS_INSIGHT -.-> REDIS_CONTAINER

    %% Cloud deployment paths
    DEV_APP -.-> AWS
    DEV_APP -.-> GCP
    DEV_APP -.-> AZURE

    classDef dev fill:#e3f2fd
    classDef prod fill:#e8f5e8
    classDef cloud fill:#fff3e0
    classDef storage fill:#fce4ec

    class DEV_APP,DEV_DB dev
    class NGINX,BACKEND,PG_CONTAINER,REDIS_CONTAINER,PGADMIN,REDIS_INSIGHT prod
    class AWS,GCP,AZURE cloud
    class PG_VOLUME,REDIS_VOLUME,LOG_VOLUME storage
```

## API Flow Diagram

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant Middleware
    participant Routes
    participant Service
    participant Database
    participant Blockchain

    Client->>Express: HTTP Request
    Express->>Middleware: Apply Security & Rate Limiting
    Middleware->>Routes: Route to Handler
    Routes->>Service: Business Logic
    
    alt Data from Database
        Service->>Database: Query Local Data
        Database-->>Service: Return Cached Data
    else Data from Blockchain
        Service->>Blockchain: Fetch Live Data
        Blockchain-->>Service: Return Blockchain Data
        Service->>Database: Cache Data
    end
    
    Service-->>Routes: Processed Data
    Routes-->>Middleware: Response Data
    Middleware-->>Express: Apply Response Headers
    Express-->>Client: JSON Response

    Note over Client,Blockchain: WebSocket for Real-time Updates
    Blockchain->>Service: New Block Event
    Service->>Express: Emit WebSocket Event
    Express->>Client: Real-time Update
```

## Technology Stack

```mermaid
mindmap
  root((Avail Explorer Backend))
    Runtime
      Node.js 18+
      TypeScript
      Express.js
    API Layer
      RESTful APIs
      WebSocket (Socket.io)
      Rate Limiting
      CORS
    Data Layer
      SQLite (Development)
      PostgreSQL (Production)
      Redis (Caching)
    Blockchain Integration
      Polkadot API
      WebSocket RPC
      Subscan API
    Security
      Helmet.js
      Input Validation
      JWT (Future)
    Monitoring
      Winston Logging
      Prometheus Metrics
      Health Checks
    Testing
      Jest
      Supertest
      Unit & Integration Tests
    DevOps
      Docker
      Docker Compose
      GitHub Actions
      ESLint & Prettier
```

## Key Features

1. **Dual Database Support**: SQLite for development, PostgreSQL for production
2. **Real-time Updates**: WebSocket integration for live blockchain data
3. **API Fallback**: Direct blockchain integration with external API fallbacks
4. **Comprehensive Monitoring**: Health checks, metrics, and structured logging
5. **Development-friendly**: Zero-config setup with SQLite
6. **Production-ready**: Docker containerization with orchestration
7. **Scalable Architecture**: Microservice-ready design with clear separation of concerns

## File Structure Diagram

```mermaid
graph TD
    subgraph "Project Root"
        ROOT["/"]
        PACKAGE[package.json]
        DOCKER[docker-compose.yml]
        DOCKERFILE[Dockerfile]
        TSCONFIG[tsconfig.json]
        ESLINT[.eslintrc.js]
        JEST[jest.config.js]
        ENV[.env.example]
        README[README.md]
    end

    subgraph "Source Code (/src)"
        SRC[src/]
        INDEX[index.ts<br/>Main Entry Point]
        
        subgraph "Configuration"
            CONFIG_DIR[config/]
            CONFIG_INDEX[index.ts<br/>App Configuration]
        end
        
        subgraph "API Routes"
            ROUTES_DIR[routes/]
            BLOCKS_ROUTE[blocks.ts<br/>Block Endpoints]
            CHAIN_ROUTE[chain.ts<br/>Chain Stats]
            EXTRINSICS_ROUTE[extrinsics.ts<br/>Transaction Data]
            SEARCH_ROUTE[search.ts<br/>Search Functionality]
            ACCOUNTS_ROUTE[accounts.ts<br/>Account Data]
        end
        
        subgraph "Business Logic"
            SERVICES_DIR[services/]
            BLOCKCHAIN_SERVICE[blockchain.ts<br/>Main Service Layer]
            
            subgraph "RPC Layer"
                RPC_DIR[rpc/]
                RPC_INDEX[index.ts<br/>RPC Service]
                RPC_CONNECTION[connection.ts<br/>WebSocket Management]
                RPC_METHODS[methods.ts<br/>API Methods]
                RPC_SUBSCRIPTIONS[subscriptions.ts<br/>Real-time Events]
            end
            
            subgraph "Data Layer"
                DATA_DIR[data/]
                SQLITE_STORE[sqlite-store.ts<br/>Database Operations]
            end
        end
        
        subgraph "Middleware"
            MIDDLEWARE_DIR[middleware/]
            MIDDLEWARE_INDEX[index.ts<br/>All Middleware]
        end
        
        subgraph "Utilities"
            UTILS_DIR[utils/]
            LOGGER[logger.ts<br/>Winston Logging]
            DATABASE[database.ts<br/>DB Connection]
            CACHE[cache.ts<br/>Redis Cache]
        end
        
        subgraph "Type Definitions"
            TYPES_DIR[types/]
            TYPES_INDEX[index.ts<br/>Core Types]
            RPC_TYPES[rpc.ts<br/>RPC Types]
        end
    end

    subgraph "Tests (/tests)"
        TESTS[tests/]
        TEST_SETUP[setup.ts]
        GLOBAL_SETUP[globalSetup.ts]
        GLOBAL_TEARDOWN[globalTeardown.ts]
        
        subgraph "Test Types"
            UNIT_TESTS[unit/<br/>Unit Tests]
            INTEGRATION_TESTS[integration/<br/>Integration Tests]
            E2E_TESTS[e2e/<br/>End-to-End Tests]
            FIXTURES[fixtures/<br/>Test Data]
            HELPERS[helpers/<br/>Test Utilities]
        end
    end

    subgraph "Data & Logs"
        DATA_FOLDER[data/<br/>SQLite Database]
        LOGS_FOLDER[logs/<br/>Application Logs]
        NODE_MODULES[node_modules/<br/>Dependencies]
    end

    subgraph "CI/CD"
        GITHUB_DIR[.github/]
        WORKFLOWS[workflows/<br/>GitHub Actions]
    end

    subgraph "Documentation"
        AI_DOCS[AI Documentation/<br/>Project Notes]
    end

    %% Connections
    ROOT --> SRC
    ROOT --> TESTS
    ROOT --> DATA_FOLDER
    ROOT --> LOGS_FOLDER
    ROOT --> GITHUB_DIR
    ROOT --> AI_DOCS
    
    SRC --> INDEX
    SRC --> CONFIG_DIR
    SRC --> ROUTES_DIR
    SRC --> SERVICES_DIR
    SRC --> MIDDLEWARE_DIR
    SRC --> UTILS_DIR
    SRC --> TYPES_DIR
    
    CONFIG_DIR --> CONFIG_INDEX
    ROUTES_DIR --> BLOCKS_ROUTE
    ROUTES_DIR --> CHAIN_ROUTE
    ROUTES_DIR --> EXTRINSICS_ROUTE
    ROUTES_DIR --> SEARCH_ROUTE
    ROUTES_DIR --> ACCOUNTS_ROUTE
    
    SERVICES_DIR --> BLOCKCHAIN_SERVICE
    SERVICES_DIR --> RPC_DIR
    SERVICES_DIR --> DATA_DIR
    
    RPC_DIR --> RPC_INDEX
    RPC_DIR --> RPC_CONNECTION
    RPC_DIR --> RPC_METHODS
    RPC_DIR --> RPC_SUBSCRIPTIONS
    
    DATA_DIR --> SQLITE_STORE
    
    MIDDLEWARE_DIR --> MIDDLEWARE_INDEX
    UTILS_DIR --> LOGGER
    UTILS_DIR --> DATABASE
    UTILS_DIR --> CACHE
    
    TYPES_DIR --> TYPES_INDEX
    TYPES_DIR --> RPC_TYPES
    
    TESTS --> TEST_SETUP
    TESTS --> UNIT_TESTS
    TESTS --> INTEGRATION_TESTS
    TESTS --> E2E_TESTS
    TESTS --> FIXTURES
    TESTS --> HELPERS

    %% Styling
    classDef entry fill:#e8f5e8
    classDef config fill:#e3f2fd
    classDef routes fill:#fff3e0
    classDef services fill:#f3e5f5
    classDef utils fill:#fce4ec
    classDef tests fill:#f1f8e9
    classDef data fill:#fff8e1

    class INDEX,PACKAGE,DOCKER entry
    class CONFIG_DIR,CONFIG_INDEX,TSCONFIG,ESLINT config
    class ROUTES_DIR,BLOCKS_ROUTE,CHAIN_ROUTE,EXTRINSICS_ROUTE,SEARCH_ROUTE,ACCOUNTS_ROUTE routes
    class SERVICES_DIR,BLOCKCHAIN_SERVICE,RPC_DIR,RPC_INDEX,RPC_CONNECTION,RPC_METHODS,RPC_SUBSCRIPTIONS,DATA_DIR,SQLITE_STORE services
    class UTILS_DIR,LOGGER,DATABASE,CACHE,MIDDLEWARE_DIR,MIDDLEWARE_INDEX,TYPES_DIR,TYPES_INDEX,RPC_TYPES utils
    class TESTS,TEST_SETUP,UNIT_TESTS,INTEGRATION_TESTS,E2E_TESTS,FIXTURES,HELPERS tests
    class DATA_FOLDER,LOGS_FOLDER data
```

## Code Flow Diagram

```mermaid
graph TD
    subgraph "Application Startup"
        START[Application Start]
        LOAD_CONFIG[Load Configuration<br/>src/config/index.ts]
        INIT_LOGGER[Initialize Logger<br/>src/utils/logger.ts]
        INIT_DB[Initialize Database<br/>src/utils/database.ts]
        INIT_CACHE[Initialize Cache<br/>src/utils/cache.ts]
        CREATE_APP[Create Express App<br/>src/index.ts]
    end

    subgraph "Request Processing Flow"
        REQUEST[Incoming HTTP Request]
        
        subgraph "Middleware Chain"
            SECURITY[Security Middleware<br/>Helmet, CORS]
            RATE_LIMIT[Rate Limiting<br/>Express Rate Limit]
            COMPRESSION[Compression<br/>Gzip Response]
            BODY_PARSER[Body Parser<br/>JSON/URL Encoded]
            REQUEST_TIMER[Request Timer<br/>Performance Tracking]
            CACHE_CHECK[Cache Middleware<br/>Redis Check]
        end
        
        subgraph "Route Handling"
            ROUTER[Express Router<br/>Route Matching]
            ROUTE_HANDLER[Route Handler<br/>blocks.ts, chain.ts, etc.]
            VALIDATION[Input Validation<br/>Express Validator]
        end
        
        subgraph "Service Layer"
            BLOCKCHAIN_SVC[Blockchain Service<br/>src/services/blockchain.ts]
            
            subgraph "Data Sources"
                RPC_SERVICE[RPC Service<br/>src/services/rpc/]
                RPC_CONNECTION[WebSocket Connection<br/>connection.ts]
                RPC_METHODS[RPC Methods<br/>methods.ts]
                AVAIL_NETWORK[Avail Blockchain<br/>External Network]
            end
            
            subgraph "Data Processing"
                DATA_TRANSFORM[Data Transformation<br/>Format Conversion]
                DATA_VALIDATION[Data Validation<br/>Type Checking]
                CACHE_STORE[Cache Storage<br/>Redis Store]
            end
        end
        
        subgraph "Response Generation"
            RESPONSE_FORMAT[Format Response<br/>APIResponse Type]
            ERROR_HANDLER[Error Handler<br/>middleware/index.ts]
            RESPONSE_LOGGER[Response Logger<br/>Winston Logger]
            SEND_RESPONSE[Send HTTP Response]
        end
    end

    subgraph "Real-time Updates"
        WEBSOCKET_SERVER[WebSocket Server<br/>Socket.io]
        SUBSCRIPTION_MGR[Subscription Manager<br/>rpc/subscriptions.ts]
        BLOCK_EVENTS[New Block Events]
        CLIENT_NOTIFY[Notify Connected Clients]
    end

    subgraph "Background Processes"
        HEALTH_CHECK[Health Check Endpoint<br/>/health]
        METRICS_COLLECTION[Metrics Collection<br/>Prometheus]
        LOG_ROTATION[Log Rotation<br/>Winston Daily Rotate]
    end

    %% Startup Flow
    START --> LOAD_CONFIG
    LOAD_CONFIG --> INIT_LOGGER
    INIT_LOGGER --> INIT_DB
    INIT_DB --> INIT_CACHE
    INIT_CACHE --> CREATE_APP

    %% Request Flow
    REQUEST --> SECURITY
    SECURITY --> RATE_LIMIT
    RATE_LIMIT --> COMPRESSION
    COMPRESSION --> BODY_PARSER
    BODY_PARSER --> REQUEST_TIMER
    REQUEST_TIMER --> CACHE_CHECK
    
    CACHE_CHECK --> ROUTER
    ROUTER --> ROUTE_HANDLER
    ROUTE_HANDLER --> VALIDATION
    VALIDATION --> BLOCKCHAIN_SVC
    
    BLOCKCHAIN_SVC --> RPC_SERVICE
    RPC_SERVICE --> RPC_CONNECTION
    RPC_CONNECTION --> RPC_METHODS
    RPC_METHODS --> AVAIL_NETWORK
    
    AVAIL_NETWORK --> DATA_TRANSFORM
    DATA_TRANSFORM --> DATA_VALIDATION
    DATA_VALIDATION --> CACHE_STORE
    CACHE_STORE --> RESPONSE_FORMAT
    
    RESPONSE_FORMAT --> ERROR_HANDLER
    ERROR_HANDLER --> RESPONSE_LOGGER
    RESPONSE_LOGGER --> SEND_RESPONSE

    %% WebSocket Flow
    AVAIL_NETWORK --> BLOCK_EVENTS
    BLOCK_EVENTS --> SUBSCRIPTION_MGR
    SUBSCRIPTION_MGR --> WEBSOCKET_SERVER
    WEBSOCKET_SERVER --> CLIENT_NOTIFY

    %% Background Processes
    CREATE_APP --> HEALTH_CHECK
    CREATE_APP --> METRICS_COLLECTION
    INIT_LOGGER --> LOG_ROTATION

    %% Styling
    classDef startup fill:#e8f5e8
    classDef middleware fill:#e3f2fd
    classDef routing fill:#fff3e0
    classDef service fill:#f3e5f5
    classDef data fill:#fce4ec
    classDef response fill:#f1f8e9
    classDef realtime fill:#fff8e1
    classDef background fill:#e1f5fe

    class START,LOAD_CONFIG,INIT_LOGGER,INIT_DB,INIT_CACHE,CREATE_APP startup
    class SECURITY,RATE_LIMIT,COMPRESSION,BODY_PARSER,REQUEST_TIMER,CACHE_CHECK middleware
    class ROUTER,ROUTE_HANDLER,VALIDATION routing
    class BLOCKCHAIN_SVC,RPC_SERVICE,RPC_CONNECTION,RPC_METHODS service
    class AVAIL_NETWORK,DATA_TRANSFORM,DATA_VALIDATION,CACHE_STORE data
    class RESPONSE_FORMAT,ERROR_HANDLER,RESPONSE_LOGGER,SEND_RESPONSE response
    class WEBSOCKET_SERVER,SUBSCRIPTION_MGR,BLOCK_EVENTS,CLIENT_NOTIFY realtime
    class HEALTH_CHECK,METRICS_COLLECTION,LOG_ROTATION background
```

## Request Lifecycle Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant Middleware
    participant Router
    participant BlocksRoute
    participant BlockchainService
    participant RPCService
    participant AvailNetwork
    participant Database
    participant Cache

    Note over Client,Cache: Complete Request Lifecycle

    Client->>Express: GET /api/v1/blocks
    Express->>Middleware: Apply Security Headers
    Middleware->>Middleware: Rate Limiting Check
    Middleware->>Middleware: Compression Setup
    Middleware->>Cache: Check Cache for Data
    
    alt Cache Hit
        Cache-->>Middleware: Return Cached Data
        Middleware-->>Express: Cached Response
        Express-->>Client: JSON Response (Fast)
    else Cache Miss
        Middleware->>Router: Route to Handler
        Router->>BlocksRoute: /blocks endpoint
        BlocksRoute->>BlocksRoute: Validate Parameters
        BlocksRoute->>BlockchainService: getLatestBlocks()
        
        BlockchainService->>RPCService: Fetch Block Data
        RPCService->>AvailNetwork: WebSocket RPC Call
        AvailNetwork-->>RPCService: Raw Block Data
        RPCService-->>BlockchainService: Processed Data
        
        BlockchainService->>Database: Store/Update Data
        BlockchainService->>Cache: Cache Response
        BlockchainService-->>BlocksRoute: Formatted Blocks
        
        BlocksRoute->>BlocksRoute: Transform to API Format
        BlocksRoute-->>Router: API Response
        Router-->>Middleware: Response Data
        Middleware->>Middleware: Add Response Headers
        Middleware-->>Express: Final Response
        Express-->>Client: JSON Response
    end

    Note over Client,Cache: WebSocket Real-time Updates
    AvailNetwork->>RPCService: New Block Event
    RPCService->>BlockchainService: Process New Block
    BlockchainService->>Express: Emit WebSocket Event
    Express->>Client: Real-time Block Update
```

## Module Dependencies

```mermaid
graph LR
    subgraph "Core Dependencies"
        EXPRESS[Express.js<br/>Web Framework]
        TYPESCRIPT[TypeScript<br/>Type Safety]
        POLKADOT[Polkadot API<br/>Blockchain Integration]
    end

    subgraph "Database Layer"
        SQLITE[SQLite<br/>Development DB]
        POSTGRES[PostgreSQL<br/>Production DB]
        REDIS[Redis<br/>Caching]
    end

    subgraph "Middleware & Security"
        HELMET[Helmet<br/>Security Headers]
        CORS[CORS<br/>Cross-Origin]
        COMPRESSION[Compression<br/>Gzip]
        RATE_LIMIT[Rate Limiting<br/>API Protection]
    end

    subgraph "Real-time & Communication"
        SOCKETIO[Socket.io<br/>WebSocket]
        BULL[Bull<br/>Job Queue]
    end

    subgraph "Monitoring & Logging"
        WINSTON[Winston<br/>Logging]
        PROMETHEUS[Prometheus<br/>Metrics]
        CRON[Node-cron<br/>Scheduled Tasks]
    end

    subgraph "Testing & Quality"
        JEST[Jest<br/>Testing Framework]
        ESLINT[ESLint<br/>Code Quality]
        PRETTIER[Prettier<br/>Code Formatting]
    end

    subgraph "Validation & Utilities"
        JOI[Joi<br/>Schema Validation]
        AXIOS[Axios<br/>HTTP Client]
        DOTENV[Dotenv<br/>Environment]
    end

    %% Dependencies flow
    EXPRESS --> HELMET
    EXPRESS --> CORS
    EXPRESS --> COMPRESSION
    EXPRESS --> RATE_LIMIT
    EXPRESS --> SOCKETIO
    
    POLKADOT --> SQLITE
    POLKADOT --> POSTGRES
    POLKADOT --> REDIS
    
    WINSTON --> PROMETHEUS
    JEST --> ESLINT
    ESLINT --> PRETTIER

    classDef core fill:#e8f5e8
    classDef database fill:#e3f2fd
    classDef middleware fill:#fff3e0
    classDef realtime fill:#f3e5f5
    classDef monitoring fill:#fce4ec
    classDef testing fill:#f1f8e9
    classDef utils fill:#fff8e1

    class EXPRESS,TYPESCRIPT,POLKADOT core
    class SQLITE,POSTGRES,REDIS database
    class HELMET,CORS,COMPRESSION,RATE_LIMIT middleware
    class SOCKETIO,BULL realtime
    class WINSTON,PROMETHEUS,CRON monitoring
    class JEST,ESLINT,PRETTIER testing
    class JOI,AXIOS,DOTENV utils
```

## Future Enhancements

- Authentication & Authorization (JWT)
- Advanced Analytics Routes
- Validator Information
- Enhanced Caching Strategies
- Kubernetes Deployment
- API Documentation (Swagger/OpenAPI) 