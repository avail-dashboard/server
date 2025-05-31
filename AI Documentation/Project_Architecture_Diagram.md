# Avail Explorer Backend - Project Architecture

## Overview
This document contains mermaid diagrams explaining the architecture of the Avail Explorer Backend project.

## Main Architecture Diagram

```mermaid
graph TB
    %% External Services
    subgraph "External Services"
        AVAIL[Avail Blockchain Network<br/>WebSocket RPC]
        TURBO_DA[Turbo DA API<br/>Data Availability]
        NEXUS[Avail Nexus API<br/>Rollup Data]
        BRIDGE[Avail Bridge API<br/>Cross-chain Data]
    end

    %% Client Layer
    subgraph "Client Layer"
        WEB[Web Frontend<br/>React/Next.js]
        MOBILE[Mobile Apps]
        API_CLIENTS[API Clients]
    end

    %% Load Balancer / Reverse Proxy
    subgraph "Load Balancer / Reverse Proxy"
        NGINX[Nginx<br/>Domain Routing<br/>• api.avail.naxatar.com<br/>• pg.avail.naxatar.com<br/>• redis.avail.naxatar.com]
    end

    %% Main Application
    subgraph "Avail Explorer Backend"
        subgraph "API Layer"
            EXPRESS[Express.js Server<br/>Port 3001]
            WEBSOCKET_SERVER[WebSocket Server<br/>Socket.io]
            MIDDLEWARE[Middleware Layer<br/>• CORS<br/>• Rate Limiting<br/>• Security Headers<br/>• Compression<br/>• JWT Auth]
        end

        subgraph "Route Handlers"
            BLOCKS_ROUTE[Blocks Routes<br/>/api/blocks]
            CHAIN_ROUTE[Chain Routes<br/>/api/chain]
            EXTRINSICS_ROUTE[Extrinsics Routes<br/>/api/extrinsics]
            SEARCH_ROUTE[Search Routes<br/>/api/search]
            ACCOUNTS_ROUTE[Accounts Routes<br/>/api/accounts]
            VALIDATORS_ROUTE[Validators Routes<br/>/api/validators]
            ANALYTICS_ROUTE[Analytics Routes<br/>/api/analytics]
            ROLLUPS_ROUTE[Rollups Routes<br/>/api/rollups]
            DATA_SUB_ROUTE[Data Submissions Routes<br/>/api/data-submissions]
        end

        subgraph "Service Layer"
            UNIFIED_AVAIL[Unified Avail Service<br/>• Multi-source Integration<br/>• Unified Data API<br/>• Service Orchestration]
            BLOCKCHAIN_SERVICE[Blockchain Service<br/>• Polkadot API Integration<br/>• Real-time Data Fetching<br/>• Block Processing]
            HYBRID_RPC[Hybrid RPC Service<br/>• Multi-provider Support<br/>• Failover Logic<br/>• Load Balancing]
            ANALYTICS_SERVICE[Analytics Service<br/>• Performance Metrics<br/>• Usage Statistics<br/>• Historical Data]
            WEBSOCKET_SERVICE[WebSocket Service<br/>• Real-time Events<br/>• Client Management<br/>• Event Broadcasting]
            JOBS_SERVICE[Jobs Service<br/>• Background Processing<br/>• Scheduled Tasks<br/>• Queue Management]
            
            subgraph "Specialized Services"
                TURBO_DA_SERVICE[Turbo DA Service<br/>• DA Layer Integration<br/>• Data Retrieval]
                NEXUS_SERVICE[Avail Nexus Service<br/>• Rollup Management<br/>• Cross-rollup Data]
                LIGHT_CLIENT[Avail Light Client<br/>• Light Node Integration<br/>• Minimal Sync]
                BRIDGE_SERVICE[Avail Bridge Service<br/>• Cross-chain Bridge<br/>• Transfer Tracking]
            end

            DATA_SERVICE[Data Service<br/>• Database Operations<br/>• Caching Logic<br/>• Data Validation]
        end

        subgraph "Data Layer"
            DATA_DIR[data/]
            POSTGRES_STORE[postgres-store.ts<br/>Database Operations]
        end
    end

    %% Infrastructure Services
    subgraph "Infrastructure"
        subgraph "All Environments"
            POSTGRES[(PostgreSQL 15<br/>Database<br/>• High Performance<br/>• Concurrent Access<br/>• ACID Compliance)]
            REDIS_CACHE[(Redis 7<br/>Cache & Sessions<br/>• IORedis Client<br/>• Session Storage<br/>• API Caching<br/>• Real-time Data)]
            BULL_QUEUE[Bull Queue<br/>• Job Processing<br/>• Background Tasks<br/>• Redis-backed]
        end
    end

    %% Monitoring & Logging
    subgraph "Observability"
        LOGS[Winston Logger<br/>• Daily Rotate Files<br/>• Multiple Log Levels<br/>• Structured Logging]
        METRICS[Prometheus Metrics<br/>• prom-client<br/>• Performance Monitoring<br/>• Health Checks]
        HEALTH[Health Endpoints<br/>/health<br/>/metrics]
    end

    %% Data Flow Connections
    WEB --> NGINX
    MOBILE --> NGINX
    API_CLIENTS --> NGINX
    NGINX --> EXPRESS

    EXPRESS --> MIDDLEWARE
    MIDDLEWARE --> BLOCKS_ROUTE
    MIDDLEWARE --> CHAIN_ROUTE
    MIDDLEWARE --> EXTRINSICS_ROUTE
    MIDDLEWARE --> SEARCH_ROUTE
    MIDDLEWARE --> ACCOUNTS_ROUTE
    MIDDLEWARE --> VALIDATORS_ROUTE
    MIDDLEWARE --> ANALYTICS_ROUTE
    MIDDLEWARE --> ROLLUPS_ROUTE
    MIDDLEWARE --> DATA_SUB_ROUTE

    BLOCKS_ROUTE --> UNIFIED_AVAIL
    CHAIN_ROUTE --> BLOCKCHAIN_SERVICE
    EXTRINSICS_ROUTE --> HYBRID_RPC
    SEARCH_ROUTE --> DATA_SERVICE
    ACCOUNTS_ROUTE --> DATA_SERVICE
    VALIDATORS_ROUTE --> BLOCKCHAIN_SERVICE
    ANALYTICS_ROUTE --> ANALYTICS_SERVICE
    ROLLUPS_ROUTE --> NEXUS_SERVICE
    DATA_SUB_ROUTE --> TURBO_DA_SERVICE

    UNIFIED_AVAIL --> BLOCKCHAIN_SERVICE
    UNIFIED_AVAIL --> HYBRID_RPC
    UNIFIED_AVAIL --> TURBO_DA_SERVICE
    UNIFIED_AVAIL --> NEXUS_SERVICE
    UNIFIED_AVAIL --> LIGHT_CLIENT
    UNIFIED_AVAIL --> BRIDGE_SERVICE

    BLOCKCHAIN_SERVICE --> AVAIL
    HYBRID_RPC --> AVAIL
    HYBRID_RPC --> TURBO_DA
    TURBO_DA_SERVICE --> TURBO_DA
    NEXUS_SERVICE --> NEXUS
    BRIDGE_SERVICE --> BRIDGE

    WEBSOCKET_SERVICE --> WEBSOCKET_SERVER
    JOBS_SERVICE --> BULL_QUEUE

    BLOCKCHAIN_SERVICE --> DATA_SERVICE
    ANALYTICS_SERVICE --> DATA_SERVICE
    DATA_SERVICE --> POSTGRES_STORE

    %% Production connections
    DATA_SERVICE -.-> POSTGRES
    DATA_SERVICE -.-> REDIS_CACHE
    JOBS_SERVICE -.-> BULL_QUEUE

    %% WebSocket connections
    EXPRESS --> WEBSOCKET_SERVER
    WEBSOCKET_SERVER -.-> WEB
    WEBSOCKET_SERVER -.-> MOBILE
    WEBSOCKET_SERVICE --> WEBSOCKET_SERVER

    %% Monitoring connections
    EXPRESS --> LOGS
    EXPRESS --> METRICS
    EXPRESS --> HEALTH

    %% Styling
    classDef external fill:#e1f5fe
    classDef client fill:#f3e5f5
    classDef proxy fill:#e8f5e8
    classDef api fill:#e8f5e8
    classDef service fill:#fff3e0
    classDef specialized fill:#f3e5f5
    classDef data fill:#fce4ec
    classDef infra fill:#f1f8e9
    classDef monitoring fill:#fff8e1

    class AVAIL,TURBO_DA,NEXUS,BRIDGE external
    class WEB,MOBILE,API_CLIENTS client
    class NGINX proxy
    class EXPRESS,WEBSOCKET_SERVER,MIDDLEWARE,BLOCKS_ROUTE,CHAIN_ROUTE,EXTRINSICS_ROUTE,SEARCH_ROUTE,ACCOUNTS_ROUTE,VALIDATORS_ROUTE,ANALYTICS_ROUTE,ROLLUPS_ROUTE,DATA_SUB_ROUTE api
    class UNIFIED_AVAIL,BLOCKCHAIN_SERVICE,HYBRID_RPC,ANALYTICS_SERVICE,WEBSOCKET_SERVICE,JOBS_SERVICE,DATA_SERVICE service
    class TURBO_DA_SERVICE,NEXUS_SERVICE,LIGHT_CLIENT,BRIDGE_SERVICE specialized
    class POSTGRES_STORE data
    class POSTGRES,REDIS_CACHE,BULL_QUEUE infra
    class LOGS,METRICS,HEALTH monitoring
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development Environment"
        DEV_APP[Node.js Application<br/>tsx watch src/index.ts]
        DEV_DB[(PostgreSQL Database<br/>Development Instance<br/>• Network-based<br/>• Production-ready<br/>• Consistent Environment)]
        DEV_APP --> DEV_DB
    end

    subgraph "Production Environment"
        subgraph "Domain Configuration"
            DOMAIN_API[api.avail.naxatar.com<br/>Port 80/443]
            DOMAIN_PG[pg.avail.naxatar.com<br/>Port 80/443]
            DOMAIN_REDIS[redis.avail.naxatar.com<br/>Port 80/443]
        end

        subgraph "Docker Compose Stack"
            NGINX[Nginx Reverse Proxy<br/>Multi-domain Routing<br/>SSL Termination]
            BACKEND[Backend Container<br/>avail-backend<br/>Port 3001<br/>Health Checks]
            PG_CONTAINER[PostgreSQL 15 Container<br/>avail-postgres<br/>Port 5432<br/>Init Scripts]
            REDIS_CONTAINER[Redis 7 Container<br/>avail-redis<br/>Port 6379<br/>Persistence Enabled]
            
            %% Optional Admin Tools
            PGADMIN[pgAdmin Container<br/>Port 5050<br/>Profile: admin]
            REDIS_INSIGHT[RedisInsight Container<br/>Port 8001<br/>Profile: admin]
        end

        subgraph "Persistent Storage"
            PG_VOLUME[(postgres_data<br/>Volume)]
            REDIS_VOLUME[(redis_data<br/>Volume)]
            LOG_VOLUME[(./logs<br/>Host Mount)]
        end

        subgraph "Environment Configuration"
            ENV_VARS[Environment Variables<br/>• DATABASE_URL<br/>• REDIS_URL<br/>• AVAIL_RPC_ENDPOINT<br/>• JWT_SECRET<br/>• CORS_ORIGIN<br/>• Feature Flags]
        end
    end

    subgraph "Cloud Deployment Options"
        AWS[AWS ECS/EKS<br/>• Auto Scaling<br/>• Load Balancing<br/>• RDS PostgreSQL<br/>• ElastiCache Redis]
        GCP[Google Cloud Run<br/>• Serverless<br/>• Cloud SQL<br/>• Memorystore Redis]
        AZURE[Azure Container Instances<br/>• Container Groups<br/>• Azure Database<br/>• Azure Cache]
    end

    %% Domain routing
    DOMAIN_API --> NGINX
    DOMAIN_PG --> NGINX
    DOMAIN_REDIS --> NGINX

    %% Connections
    NGINX --> BACKEND
    NGINX --> PG_CONTAINER
    NGINX --> REDIS_CONTAINER
    
    BACKEND --> PG_CONTAINER
    BACKEND --> REDIS_CONTAINER
    BACKEND --> ENV_VARS
    
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
    classDef domain fill:#e8f5e8
    classDef prod fill:#e8f5e8
    classDef cloud fill:#fff3e0
    classDef storage fill:#fce4ec
    classDef config fill:#f3e5f5

    class DEV_APP,DEV_DB dev
    class DOMAIN_API,DOMAIN_PG,DOMAIN_REDIS domain
    class NGINX,BACKEND,PG_CONTAINER,REDIS_CONTAINER,PGADMIN,REDIS_INSIGHT prod
    class AWS,GCP,AZURE cloud
    class PG_VOLUME,REDIS_VOLUME,LOG_VOLUME storage
    class ENV_VARS config
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
      TypeScript 5.3+
      Express.js 4.18+
      tsx (Development)
    API Layer
      RESTful APIs
      WebSocket (Socket.io 4.7+)
      Rate Limiting
      CORS
      JWT Authentication
      Express Validator
    Data Layer
      PostgreSQL 15 (All Environments)
      Redis 7 (IORedis 5.3+)
      Bull Queue (Job Processing)
    Blockchain Integration
      Polkadot API 10.11+
      Smoldot 2.0+ (Light Client)
      WebSocket RPC
      Hybrid RPC Service
      Multiple Provider Support
    External APIs
      Turbo DA API
      Avail Nexus API
      Avail Bridge API
    Services Architecture
      Unified Avail Service
      Specialized Services
      Analytics Service
      WebSocket Service
      Jobs Service
    Security
      Helmet.js 7.1+
      Input Validation (Joi 17.11+)
      JWT (Future Implementation)
      Rate Limiting
    Monitoring
      Winston Logging 3.11+
      Daily Rotate Files
      Prometheus Metrics (prom-client 15.1+)
      Health Checks
    Testing
      Jest 29.7+
      Supertest 7.1+
      Unit & Integration Tests
      Coverage Reports
    DevOps
      Docker & Docker Compose
      Nginx (Multi-domain)
      GitHub Actions
      ESLint 8.55+ & Prettier 3.1+
      TypeScript Strict Mode
```

## Key Features

1. **Unified Service Architecture**: Centralized service orchestration through unified-avail.ts for seamless multi-source integration
2. **Hybrid RPC Support**: Multi-provider RPC service with automatic failover and load balancing capabilities
3. **Specialized Data Sources**: Integration with Turbo DA, Avail Nexus, Avail Bridge, and Light Client services
4. **PostgreSQL Database**: PostgreSQL 15 for all environments with consistent schema and performance
5. **Advanced Caching**: Redis 7 with IORedis client for high-performance caching and session management
6. **Real-time Updates**: WebSocket integration with Socket.io for live blockchain data and analytics
7. **Background Job Processing**: Bull queue system for asynchronous task processing and scheduled operations
8. **Comprehensive API Coverage**: Full REST API with blocks, chain, extrinsics, validators, rollups, analytics, and search endpoints
9. **Production-Ready Infrastructure**: Docker containerization with multi-domain nginx configuration
10. **Advanced Monitoring**: Prometheus metrics, Winston logging with daily rotation, and health endpoints
11. **Analytics & Performance Tracking**: Dedicated analytics service for usage statistics and performance metrics
12. **Multi-Environment Support**: Development-friendly setup with production-grade deployment options
13. **Type-Safe Development**: Full TypeScript implementation with strict type checking
14. **Comprehensive Testing**: Jest-based testing with unit, integration, and E2E test coverage
15. **Domain-Based Deployment**: Multi-domain nginx setup with api.avail.naxatar.com routing

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
        ENV[env.example]
        README[README.md]
        DEPLOYMENT[DEPLOYMENT.md]
        INSTALL[install.sh]
        SETUP_DEV[setup-dev.js]
        NGINX_CONF[nginx.conf]
        AVAIL_NGINX[avail-nginx.conf]
        API_CONF[api-avail.conf]
        PG_CONF[pg-avail.conf]
        REDIS_CONF[redis-avail.conf]
        INIT_SQL[init.sql]
        SCHEMA_V2[database-schema-v2.sql]
        GITIGNORE[.gitignore]
        DOCKERIGNORE[.dockerignore]
    end

    subgraph "Source Code (/src)"
        SRC[src/]
        INDEX[index.ts<br/>Main Entry Point]
        TEST_RUNNER[test-runner.ts<br/>Test Utilities]
        TEST_AVAIL[test-avail-apis.ts<br/>API Testing]
        
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
            VALIDATORS_ROUTE[validators.ts<br/>Validator Information]
            ANALYTICS_ROUTE[analytics.ts<br/>Analytics Endpoints]
            ROLLUPS_ROUTE[rollups.ts<br/>Rollup Data]
            DATA_SUB_ROUTE[data-submissions.ts<br/>Data Submission Tracking]
        end
        
        subgraph "Business Logic"
            SERVICES_DIR[services/]
            BLOCKCHAIN_SERVICE[blockchain.ts<br/>Main Blockchain Service]
            UNIFIED_AVAIL[unified-avail.ts<br/>Unified Service Layer]
            HYBRID_RPC[hybrid-rpc.ts<br/>Multi-provider RPC]
            HYBRID_RPC_TEST[hybrid-rpc-test.ts<br/>RPC Testing]
            ANALYTICS_SERVICE[analytics.ts<br/>Analytics Service]
            WEBSOCKET_SERVICE[websocket.ts<br/>WebSocket Management]
            JOBS_SERVICE[jobs.ts<br/>Background Jobs]
            
            subgraph "Specialized Services"
                TURBO_DA[turbo-da.ts<br/>Turbo DA Integration]
                AVAIL_NEXUS[avail-nexus.ts<br/>Nexus API Service]
                LIGHT_CLIENT[avail-light-client.ts<br/>Light Client Service]
                BRIDGE_SERVICE[avail-bridge.ts<br/>Bridge Service]
            end
            
            subgraph "RPC Layer"
                RPC_DIR[rpc/]
                RPC_INDEX[index.ts<br/>RPC Service]
                RPC_CONNECTION[connection.ts<br/>WebSocket Management]
                RPC_METHODS[methods.ts<br/>API Methods]
                RPC_SUBSCRIPTIONS[subscriptions.ts<br/>Real-time Events]
            end
            
            subgraph "Data Layer"
                DATA_DIR[data/]
                POSTGRES_STORE[postgres-store.ts<br/>Database Operations]
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
        
        subgraph "Test Organization"
            SRC_TESTS[src/__tests__/<br/>Source Tests]
            UNIT_TESTS[unit/<br/>Unit Tests]
            INTEGRATION_TESTS[integration/<br/>Integration Tests]
            E2E_TESTS[e2e/<br/>End-to-End Tests]
            FIXTURES[fixtures/<br/>Test Data]
            HELPERS[helpers/<br/>Test Utilities]
        end
    end

    subgraph "Data & Logs"
        LOGS_FOLDER[logs/<br/>Application Logs]
        DIST_FOLDER[dist/<br/>Compiled JavaScript]
        NODE_MODULES[node_modules/<br/>Dependencies]
        DUMP_RDB[dump.rdb<br/>Redis Dump]
    end

    subgraph "CI/CD"
        GITHUB_DIR[.github/]
        WORKFLOWS[workflows/<br/>GitHub Actions]
    end

    subgraph "Documentation"
        AI_DOCS[AI Documentation/<br/>Project Notes & Architecture]
        SCOPE_DOC[Avail DA Explorer Scope.md]
        DEPLOYMENT_STATUS[deployment-status.md]
    end

    %% Connections
    ROOT --> SRC
    ROOT --> TESTS
    ROOT --> DATA_FOLDER
    ROOT --> LOGS_FOLDER
    ROOT --> DIST_FOLDER
    ROOT --> GITHUB_DIR
    ROOT --> AI_DOCS
    
    SRC --> INDEX
    SRC --> TEST_RUNNER
    SRC --> TEST_AVAIL
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
    ROUTES_DIR --> VALIDATORS_ROUTE
    ROUTES_DIR --> ANALYTICS_ROUTE
    ROUTES_DIR --> ROLLUPS_ROUTE
    ROUTES_DIR --> DATA_SUB_ROUTE
    
    SERVICES_DIR --> BLOCKCHAIN_SERVICE
    SERVICES_DIR --> UNIFIED_AVAIL
    SERVICES_DIR --> HYBRID_RPC
    SERVICES_DIR --> HYBRID_RPC_TEST
    SERVICES_DIR --> ANALYTICS_SERVICE
    SERVICES_DIR --> WEBSOCKET_SERVICE
    SERVICES_DIR --> JOBS_SERVICE
    SERVICES_DIR --> TURBO_DA
    SERVICES_DIR --> AVAIL_NEXUS
    SERVICES_DIR --> LIGHT_CLIENT
    SERVICES_DIR --> BRIDGE_SERVICE
    SERVICES_DIR --> RPC_DIR
    SERVICES_DIR --> DATA_DIR
    
    RPC_DIR --> RPC_INDEX
    RPC_DIR --> RPC_CONNECTION
    RPC_DIR --> RPC_METHODS
    RPC_DIR --> RPC_SUBSCRIPTIONS
    
    DATA_DIR --> POSTGRES_STORE
    
    MIDDLEWARE_DIR --> MIDDLEWARE_INDEX
    UTILS_DIR --> LOGGER
    UTILS_DIR --> DATABASE
    UTILS_DIR --> CACHE
    
    TYPES_DIR --> TYPES_INDEX
    TYPES_DIR --> RPC_TYPES
    
    TESTS --> TEST_SETUP
    TESTS --> SRC_TESTS
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
    classDef specialized fill:#fce4ec
    classDef utils fill:#f1f8e9
    classDef tests fill:#fff8e1
    classDef data fill:#e1f5fe

    class INDEX,TEST_RUNNER,TEST_AVAIL,PACKAGE,DOCKER entry
    class CONFIG_DIR,CONFIG_INDEX,TSCONFIG,ESLINT,ENV,NGINX_CONF config
    class ROUTES_DIR,BLOCKS_ROUTE,CHAIN_ROUTE,EXTRINSICS_ROUTE,SEARCH_ROUTE,ACCOUNTS_ROUTE,VALIDATORS_ROUTE,ANALYTICS_ROUTE,ROLLUPS_ROUTE,DATA_SUB_ROUTE routes
    class SERVICES_DIR,BLOCKCHAIN_SERVICE,UNIFIED_AVAIL,HYBRID_RPC,ANALYTICS_SERVICE,WEBSOCKET_SERVICE,JOBS_SERVICE,RPC_DIR,RPC_INDEX,RPC_CONNECTION,RPC_METHODS,RPC_SUBSCRIPTIONS,DATA_DIR,POSTGRES_STORE services
    class TURBO_DA,AVAIL_NEXUS,LIGHT_CLIENT,BRIDGE_SERVICE specialized
    class UTILS_DIR,LOGGER,DATABASE,CACHE,MIDDLEWARE_DIR,MIDDLEWARE_INDEX,TYPES_DIR,TYPES_INDEX,RPC_TYPES utils
    class TESTS,TEST_SETUP,SRC_TESTS,UNIT_TESTS,INTEGRATION_TESTS,E2E_TESTS,FIXTURES,HELPERS tests
    class DATA_FOLDER,LOGS_FOLDER,DIST_FOLDER,NODE_MODULES,DUMP_RDB data
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

    Client->>Express: GET /api/blocks
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
        EXPRESS[Express.js 4.18+<br/>Web Framework]
        TYPESCRIPT[TypeScript 5.3+<br/>Type Safety]
        POLKADOT[Polkadot API 10.11+<br/>Blockchain Integration]
        SMOLDOT[Smoldot 2.0+<br/>Light Client]
    end

    subgraph "Database Layer"
        POSTGRES[PostgreSQL<br/>Database]
        PG_DRIVER[pg 8.11+<br/>PostgreSQL Driver]
        REDIS[Redis<br/>Caching]
        IOREDIS[IORedis 5.3+<br/>Redis Client]
    end

    subgraph "Job Processing"
        BULL[Bull 4.12+<br/>Job Queue]
        NODE_CRON[Node-cron 3.0+<br/>Scheduled Tasks]
    end

    subgraph "Middleware & Security"
        HELMET[Helmet 7.1+<br/>Security Headers]
        CORS[CORS 2.8+<br/>Cross-Origin]
        COMPRESSION[Compression 1.7+<br/>Gzip]
        RATE_LIMIT[Express Rate Limit 7.1+<br/>API Protection]
        JOI[Joi 17.11+<br/>Schema Validation]
        EXPRESS_VALIDATOR[Express Validator 7.0+<br/>Input Validation]
    end

    subgraph "Real-time & Communication"
        SOCKETIO[Socket.io 4.7+<br/>WebSocket]
        AXIOS[Axios 1.6+<br/>HTTP Client]
    end

    subgraph "Monitoring & Logging"
        WINSTON[Winston 3.11+<br/>Logging]
        DAILY_ROTATE[Winston Daily Rotate 4.7+<br/>Log Rotation]
        PROMETHEUS[prom-client 15.1+<br/>Metrics]
    end

    subgraph "Testing & Quality"
        JEST[Jest 29.7+<br/>Testing Framework]
        SUPERTEST[Supertest 7.1+<br/>API Testing]
        TS_JEST[ts-jest 29.1+<br/>TypeScript Testing]
        ESLINT[ESLint 8.55+<br/>Code Quality]
        PRETTIER[Prettier 3.1+<br/>Code Formatting]
        TYPESCRIPT_ESLINT[TypeScript ESLint 6.13+<br/>TS Linting]
    end

    subgraph "Development Tools"
        TSX[tsx 4.6+<br/>TypeScript Execution]
        NODEMON[Nodemon 3.0+<br/>Development Server]
        DOTENV[Dotenv 16.3+<br/>Environment Variables]
        JS_YAML[js-yaml 4.1+<br/>YAML Processing]
    end

    subgraph "Polkadot Ecosystem"
        POLKADOT_AUGMENT[API Augment 16.1+<br/>Type Augmentation]
        POLKADOT_KEYRING[Keyring 13.5+<br/>Key Management]
        POLKADOT_RPC_CORE[RPC Core 16.1+<br/>RPC Framework]
        POLKADOT_RPC_PROVIDER[RPC Provider 10.11+<br/>Connection Layer]
        POLKADOT_TYPES[Types 16.1+<br/>Type Definitions]
        POLKADOT_UTIL[Util 13.5+<br/>Utility Functions]
        POLKADOT_UTIL_CRYPTO[Util Crypto 13.5+<br/>Cryptography]
    end

    %% Core framework dependencies
    EXPRESS --> HELMET
    EXPRESS --> CORS
    EXPRESS --> COMPRESSION
    EXPRESS --> RATE_LIMIT
    EXPRESS --> EXPRESS_VALIDATOR
    EXPRESS --> SOCKETIO
    
    %% Database connections
    POSTGRES --> PG_DRIVER
    REDIS --> IOREDIS
    
    %% Job processing
    BULL --> IOREDIS
    
    %% Blockchain dependencies
    POLKADOT --> POLKADOT_AUGMENT
    POLKADOT --> POLKADOT_KEYRING
    POLKADOT --> POLKADOT_RPC_CORE
    POLKADOT --> POLKADOT_RPC_PROVIDER
    POLKADOT --> POLKADOT_TYPES
    POLKADOT --> POLKADOT_UTIL
    POLKADOT --> POLKADOT_UTIL_CRYPTO
    
    %% Monitoring
    WINSTON --> DAILY_ROTATE
    
    %% Testing
    JEST --> TS_JEST
    JEST --> SUPERTEST
    ESLINT --> TYPESCRIPT_ESLINT
    ESLINT --> PRETTIER
    
    %% Development
    TYPESCRIPT --> TSX
    TSX --> NODEMON

    classDef core fill:#e8f5e8
    classDef database fill:#e3f2fd
    classDef jobs fill:#f3e5f5
    classDef middleware fill:#fff3e0
    classDef realtime fill:#fce4ec
    classDef monitoring fill:#f1f8e9
    classDef testing fill:#fff8e1
    classDef dev fill:#e1f5fe
    classDef polkadot fill:#f9f9f9

    class EXPRESS,TYPESCRIPT,POLKADOT,SMOLDOT core
    class POSTGRES,PG_DRIVER,REDIS,IOREDIS database
    class BULL,NODE_CRON jobs
    class HELMET,CORS,COMPRESSION,RATE_LIMIT,JOI,EXPRESS_VALIDATOR middleware
    class SOCKETIO,AXIOS realtime
    class WINSTON,DAILY_ROTATE,PROMETHEUS monitoring
    class JEST,SUPERTEST,TS_JEST,ESLINT,PRETTIER,TYPESCRIPT_ESLINT testing
    class TSX,NODEMON,DOTENV,JS_YAML dev
    class POLKADOT_AUGMENT,POLKADOT_KEYRING,POLKADOT_RPC_CORE,POLKADOT_RPC_PROVIDER,POLKADOT_TYPES,POLKADOT_UTIL,POLKADOT_UTIL_CRYPTO polkadot
```

## Future Enhancements

### Planned Features
- **Advanced Authentication**: JWT-based authentication system with role-based access control
- **GraphQL API**: GraphQL endpoint for more flexible data querying alongside REST APIs
- **Advanced Analytics Dashboard**: Real-time analytics visualization with custom metrics
- **Validator Staking Information**: Comprehensive validator data including staking rewards and performance
- **Cross-Chain Bridge Monitoring**: Enhanced bridge transaction tracking and status monitoring
- **API Rate Limiting Tiers**: Tiered rate limiting based on user authentication levels
- **Data Export Features**: CSV/JSON export capabilities for historical data
- **Enhanced Search**: Full-text search with advanced filtering and sorting options

### Infrastructure Improvements
- **Kubernetes Deployment**: K8s manifests for cloud-native deployment
- **Auto-Scaling**: Horizontal pod autoscaling based on metrics
- **CDN Integration**: Content delivery network for static assets and API responses
- **Advanced Monitoring**: Grafana dashboards with custom alerts and notifications
- **Backup & Recovery**: Automated database backup and disaster recovery procedures
- **Multi-Region Deployment**: Geographic distribution for improved performance

### Technical Enhancements
- **API Versioning Strategy**: Comprehensive API versioning with backward compatibility
- **Enhanced Error Handling**: Detailed error responses with correlation IDs
- **Performance Optimization**: Query optimization and advanced caching strategies
- **Real-time Subscriptions**: GraphQL subscriptions for real-time data updates
- **Mobile SDK**: Native mobile SDKs for iOS and Android applications
- **Advanced Testing**: Property-based testing and performance testing suites

### Documentation & Developer Experience
- **Interactive API Documentation**: Swagger/OpenAPI 3.0 with interactive testing
- **SDK Generation**: Auto-generated SDKs for multiple programming languages
- **Developer Portal**: Comprehensive developer documentation and tutorials
- **Postman Collections**: Pre-configured API collections for testing and development 