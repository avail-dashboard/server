Avail Explorer Backend

## Project Overview
This is the backend server for the Avail blockchain explorer, providing APIs for blockchain data access with automatic fallback support and real-time features.

## Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL (primary), Redis (caching)
- **Blockchain**: Avail SDK for Avail blockchain integration
- **Testing**: Jest with supertest
- **Process Management**: PM2 with ecosystem.config.js

## Key Scripts & Commands

### Development
```bash
npm run dev              # Start development server with hot reload
npm run dev:prod         # Start with production env config
npm run build           # TypeScript compilation
npm run start           # Start production server
```

### Testing
```bash
npm run test            # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e        # End-to-end tests only
npm run test:coverage   # Test with coverage report
npm run test:critical   # Build + lint + unit + e2e tests
```

### Code Quality
```bash
npm run lint            # ESLint check
npm run lint:fix        # ESLint with auto-fix
npm run lint:check      # ESLint with zero warnings
npm run format          # Prettier formatting
```

### Database & Sync
```bash
npm run db:init         # Initialize database
npm run sync:full       # Full blockchain sync
npm run sync:incremental # Incremental sync
npm run sync:live       # Live sync mode
npm run sync:test       # Test sync with small range
```

### Blockchain Operations
```bash
npm run verify:blockchain # Test blockchain connection
npm run demo:queue       # Demo queue service
npm run sync:e2e        # End-to-end sync test
```

## Environment Files
- `.env.local` - Local development
- `.env.test` - Testing environment
- `.env.production` - Production environment
- `env.example` - Template file

## Architecture

### Core Services
- **Blockchain Service** (`src/services/core/avail-blockchain.ts`) - Avail SDK integration
- **Connection Manager** (`src/services/core/connection-manager.ts`) - Connection pooling
- **Sync Service** (`src/services/core/sync.ts`) - Blockchain data synchronization
- **Queue Service** (`src/services/core/queue.ts`) - Bull queue for async processing

### Domain Services
- **Block Service** (`src/services/domain/block.ts`) - Block data processing
- **Extrinsic Service** (`src/services/domain/extrinsic.ts`) - Transaction processing
- **Data Availability** (`src/services/domain/dataAvailability.ts`) - DA layer integration

### API Routes
- `/api/blocks` - Block data endpoints
- `/api/extrinsics` - Transaction endpoints
- `/api/data-submissions` - Data availability endpoints
- `/api/chain` - Chain statistics
- `/api/search` - Search functionality
- `/api/validators` - Validator information
- `/api/analytics` - Analytics endpoints

## Database Schema
- **blocks** - Block information
- **extrinsics** - Transaction data
- **data_submissions** - Data availability submissions
- **validators** - Validator information
- **chain_stats** - Cached chain statistics

## Key Dependencies
- `avail-js-sdk` - Avail blockchain SDK integration
- `express` - Web framework
- `pg` - PostgreSQL client
- `bull` - Queue system
- `ioredis` - Redis client
- `winston` - Logging
- `socket.io` - WebSocket support

## Development Workflow
1. Use `npm run setup` for initial setup
2. Start with `npm run dev` for development
3. Run `npm run test:critical` before commits
4. Use `npm run verify:blockchain` to test connections
5. Use sync commands for blockchain data management

## Deployment
- Uses PM2 with `ecosystem.config.js`
- Docker support with `docker-compose-servers.yml`
- Nginx configuration in `nginx/` directory
- Health checks available at `/health`

## Testing Strategy
- Unit tests for core logic
- Integration tests for services
- E2E tests for API endpoints
- Separate test database configuration
- Coverage reporting with Jest

## Performance Features
- Connection pooling for database
- Redis caching layer
- Rate limiting middleware
- Compression middleware
- Queue-based async processing
- Real-time WebSocket updates

## Monitoring & Logging
- Winston logger with daily rotation
- Prometheus metrics support
- Application and error logs in `logs/`
- Health check endpoint for monitoring
- PM2 process monitoring

## Common Issues & Solutions
- Use `npm run verify:blockchain` for connection issues
- Check logs in `logs/` directory for debugging
- Run database migrations with `npm run db:init`
- Use test sync commands for blockchain sync debugging