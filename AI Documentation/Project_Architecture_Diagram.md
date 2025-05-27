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

## Future Enhancements

- Authentication & Authorization (JWT)
- Advanced Analytics Routes
- Validator Information
- Enhanced Caching Strategies
- Kubernetes Deployment
- API Documentation (Swagger/OpenAPI) 