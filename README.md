# Avail Explorer Backend

Backend server for the Avail blockchain explorer with automatic API integration and fallback support.

## Features

- **PostgreSQL Database**: Production-ready database for all environments
- **Automatic API Integration**: Direct backend APIs with external API fallbacks
- **Real-time Updates**: WebSocket support for live data
- **Health Monitoring**: Comprehensive health checks and monitoring
- **Development-friendly**: Easy PostgreSQL setup for local development

## Quick Start (Development)

### Prerequisites
- Node.js 18+
- npm or yarn
- PostgreSQL 12+

### Setup

1. **Clone and install:**
```bash
git clone <repository>
cd server
npm install
```

2. **Quick setup (recommended):**
```bash
npm run setup
```
This will:
- Create `.env` file from template
- Set up development defaults

3. **Start development server:**
```bash
npm run dev
```

The server will start on `http://localhost:3001` with:
- ✅ PostgreSQL database connection
- ✅ API endpoints ready
- ✅ WebSocket support
- ⚠️ Redis optional (caching disabled by default)

## Database Configuration

### Development & Production (PostgreSQL)
```bash
# .env
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=development
```

**Pros:**
- ✅ High performance
- ✅ Concurrent connections
- ✅ Production-ready
- ✅ Advanced features
- ✅ Consistent across environments

**Cons:**
- ⚠️ Requires PostgreSQL server
- ⚠️ More complex initial setup

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

### Optional (with defaults)
```bash
# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Database
DATABASE_TYPE=postgresql

# Features
ENABLE_WEBSOCKETS=true
ENABLE_CACHING=false  # Redis required if true
ENABLE_RATE_LIMITING=true
```

## API Endpoints

The server provides these main endpoints:

### Core Data
- `GET /api/blocks` - Latest blocks with pagination
- `GET /api/blocks/:numberOrHash` - Specific block details
- `GET /api/chain/stats` - Chain statistics
- `GET /api/extrinsics` - Extrinsics with filtering
- `GET /api/search` - Search functionality

### System
- `GET /health` - Server health check
- WebSocket at `/` - Real-time updates

## Development Workflow

### 1. Quick Start
```bash
npm run setup  # One-time setup
npm run dev    # Start development server
```

### 2. Database Management
```bash
# Tables are created automatically on first run
# Connect to database
psql $DATABASE_URL

# View tables
\dt

# View schema
\d blocks
```

### 3. Testing API Integration
```bash
# Health check
curl http://localhost:3001/health

# Get latest blocks
curl http://localhost:3001/api/blocks

# Chain statistics
curl http://localhost:3001/api/chain/stats
```

## Production Deployment

### 1. Environment Setup
```bash
# Set production environment
export NODE_ENV=production
export DATABASE_URL=postgresql://user:password@host:port/database

# Optional: Enable caching
export ENABLE_CACHING=true
export REDIS_URL=redis://host:port
```

### 2. Database Setup
```bash
# Build and run migrations
npm run build
npm run migrate  # Creates tables in PostgreSQL
```

### 3. Start Production Server
```bash
npm start
```

## Architecture

### Database Layer
```
┌─────────────────┐    ┌─────────────────┐
│   Development   │    │   Production    │
│   PostgreSQL    │    │   PostgreSQL    │
│                 │    │                 │
│ • Network DB    │    │ • Network DB    │
│ • High perf     │    │ • High perf     │
│ • Scalable      │    │ • Scalable      │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────┬───────────────┘
                 │
         ┌─────────────────┐
         │ Unified DB API  │
         │                 │
         │ • Same interface│
         │ • Auto-detection│
         │ • Type safety   │
         └─────────────────┘
```

### API Integration
```
Frontend ──┐
           │
           ▼
    ┌─────────────┐     ┌─────────────┐
    │   Next.js   │────▶│   Backend   │
    │ API Routes  │     │   Server    │
    └─────────────┘     └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  Database   │
                        │ PostgreSQL  │
                        └─────────────┘
```

## Troubleshooting

### Database Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check tables
psql $DATABASE_URL -c "\dt"

# Run migrations manually
npm run migrate
```

### Connection Issues
```bash
# Check health endpoint
curl http://localhost:3001/health

# Check logs
npm run dev  # Watch console output

# Verify environment
cat .env
```

### PostgreSQL Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check tables
psql $DATABASE_URL -c "\dt"

# Run migrations manually
npm run migrate
```

## Performance Notes

### PostgreSQL
- **Read performance**: Excellent
- **Write performance**: Excellent
- **Concurrent connections**: High
- **Scalability**: Horizontal and vertical

## Support

For issues:
1. Check server logs
2. Verify environment variables
3. Test database connection
4. Check health endpoint: `/health`

The system is designed to be production-ready with PostgreSQL for all environments. 