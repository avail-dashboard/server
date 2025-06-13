# Service Architecture Documentation

## Overview
The Avail Explorer Backend uses a **factory-based dependency injection** pattern to manage services. All services are created through factory functions to ensure consistent dependency management and proper initialization order.

## Service Dependency Graph

```
Database (PostgreSQL)
│
├── Core Services (Level 1)
│   ├── ConnectionManager
│   ├── BlockchainService
│   └── QueueService
│
└── Domain Services (Level 2)
    ├── BlockService         (depends: Database, BlockchainService)
    ├── ExtrinsicService     (depends: Database, BlockchainService)
    ├── DataAvailabilityService (depends: Database, BlockchainService)
    ├── SyncService          (depends: Database, BlockchainService, QueueService)
    ├── BlockIndexerService  (depends: Database, BlockchainService)
    └── DataProcessorService (depends: Database, BlockchainService)
```

## Initialization Order

### 1. **Database Connection**
- PostgreSQL connection must be established first
- All services depend on database access

### 2. **Core Services (can be parallel)**
- **ConnectionManager**: Manages blockchain RPC connections
- **BlockchainService**: Wraps ConnectionManager, provides blockchain API
- **QueueService**: Redis-based job queue for async processing

### 3. **Domain Services (after core services)**
- All domain services depend on database + one or more core services
- Created through factory functions with explicit dependencies
- Registered in ServiceFactory for centralized management

## Factory Pattern Implementation

### Core Services
```typescript
// All core services use factory functions
import { createConnectionManager } from './core/connection-manager';
import { createBlockchainService } from './core/blockchain';  
import { createQueueService } from './core/queue';

// Usage
const connectionManager = createConnectionManager();
const blockchainService = createBlockchainService();
const queueService = createQueueService();
```

### Domain Services
```typescript
// Domain services require explicit dependencies
import { createBlockService } from './domain/block';

// Usage - dependencies injected via parameters
const blockService = createBlockService(database, blockchainService);
```

## ServiceFactory Pattern

### Registration and Retrieval
```typescript
// Register services
serviceFactory.register('blockchain', blockchainService);
serviceFactory.register('blockService', blockService);

// Retrieve services  
const blockchain = serviceFactory.get('blockchain');
```

### Initialization Flow
```typescript
// 1. Initialize core services
await serviceFactory.initializeCoreServices();

// 2. Initialize domain services (with dependencies)
await serviceFactory.initializeDomainServices();  

// 3. Start all services
await serviceFactory.initializeAllServices();
```

## Service Contracts

### IService Interface (Recommended)
```typescript
interface IService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): Promise<ServiceHealth>;
}
```

### Service Types by Category

#### **Core Services**
- **ConnectionManager**: Blockchain connection pooling and failover
- **BlockchainService**: Polkadot API abstraction, block/extrinsic fetching
- **QueueService**: Bull queue for async job processing

#### **Domain Services**  
- **BlockService**: Block data operations (database-first with blockchain fallback)
- **ExtrinsicService**: Transaction data operations
- **DataAvailabilityService**: Data submission operations (Avail DA layer)
- **SyncService**: Blockchain synchronization orchestration
- **BlockIndexerService**: Block indexing from RPC to database
- **DataProcessorService**: Raw blockchain data processing and storage

## Dependency Injection Benefits

### 1. **Testability**
```typescript
// Easy to mock dependencies for testing
const mockBlockchain = createMockBlockchainService();
const blockService = createBlockService(testDb, mockBlockchain);
```

### 2. **Configurability** 
```typescript
// Different configurations for different environments
const blockchain = createBlockchainService(productionConfig);
const blockchain = createBlockchainService(testConfig);
```

### 3. **Lifecycle Management**
```typescript
// Clear startup/shutdown order
await serviceFactory.shutdown(); // Stops all services in reverse order
```

## Error Handling Strategy

### Service Startup Failures
- If any core service fails to start, entire application fails
- Domain service failures are logged but don't prevent startup
- ServiceFactory provides detailed error reporting

### Runtime Failures
- Services implement circuit breaker patterns for external dependencies
- Failed services can be restarted individually
- Health checks monitor service status

## Migration Notes

### Previous Pattern (Deprecated)
```typescript
// OLD: Singleton exports (problematic for testing/DI)
export const blockchainService = new BlockchainService();
```

### Current Pattern (Recommended)
```typescript  
// NEW: Factory functions with explicit dependencies
export const createBlockchainService = (): BlockchainService => {
  return new BlockchainService();
};
```

## Usage Examples

### In Application Code
```typescript
// Get services from factory
const blockService = serviceFactory.get('blockService');
const syncService = serviceFactory.get('syncService');

// Use services
const latestBlock = await blockService.getLatestBlock();
await syncService.startSync('incremental');
```

### In Tests
```typescript
// Create isolated service instances for testing
const testDb = createTestDatabase();
const mockBlockchain = createMockBlockchainService();
const blockService = createBlockService(testDb, mockBlockchain);
```

### In Scripts
```typescript
// Standalone scripts can create services directly
const blockchain = createBlockchainService();
await blockchain.start();
const block = await blockchain.getBlock(12345);
```

## Best Practices

### 1. **Always Use Factory Functions**
- Never export service instances directly
- Always export factory functions and type definitions

### 2. **Explicit Dependencies**
- Don't hide dependencies in service constructors
- Make all dependencies explicit in factory function parameters

### 3. **Service Registration**
- Register all services in ServiceFactory for centralized management
- Use consistent naming conventions for service keys

### 4. **Error Handling**
- Implement proper start/stop lifecycle methods
- Provide meaningful health check responses
- Log service state changes

### 5. **Testing**
- Create mock factories for testing
- Test service initialization and shutdown
- Test service interactions through dependency injection

This architecture ensures **maintainable**, **testable**, and **scalable** service management throughout the Avail Explorer Backend.