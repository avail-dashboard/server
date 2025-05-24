# Avail Blockchain Explorer Backend

A comprehensive Node.js Express server that provides a unified API layer for the Avail blockchain explorer, integrating multiple data sources with real-time capabilities.

## Features

- **Multi-Source Data Integration**: Subscan API, Direct RPC, SubQuery support
- **Redis Caching**: High-performance caching with intelligent TTL strategies
- **PostgreSQL Storage**: Persistent data storage with optimized queries
- **Real-time WebSocket**: Live updates for blocks, transactions, and chain stats
- **Background Jobs**: Automated data synchronization and cleanup
- **Comprehensive API**: RESTful endpoints for all blockchain data
- **Rate Limiting**: Protection against abuse with configurable limits
- **Error Handling**: Robust error handling with fallback strategies

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Avail RPC endpoint access
- Subscan API key (optional)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment template:
```bash
cp env.example .env
```

3. Configure your .env file with database URLs and API keys

4. Start the server:
```bash
npm run dev
```

## API Endpoints

Base URL: `http://localhost:3001/api/v1`

### Core Endpoints

- `GET /health` - Health check
- `GET /chain/stats` - Chain statistics
- `GET /blocks` - Latest blocks
- `GET /blocks/:number` - Block by number
- `GET /extrinsics` - Latest extrinsics
- `GET /accounts/:address` - Account details
- `GET /validators` - All validators
- `GET /search?q=query` - Universal search

## WebSocket Events

Connect to: `ws://localhost:3001`

- `subscribe:blocks` - Subscribe to new blocks
- `subscribe:extrinsics` - Subscribe to new transactions
- `newBlock` - Receive new block data
- `newExtrinsic` - Receive new transaction data

## Configuration

The server uses environment variables for configuration. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `AVAIL_RPC_ENDPOINT` - Avail RPC endpoint
- `SUBSCAN_API_KEY` - Subscan API key
- `PORT` - Server port (default: 3001)

## Development

- `npm run dev` - Development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run migrate` - Run database migrations

## Performance

The server includes caching, rate limiting, and error handling to ensure high performance and reliability:

- Cached responses: < 50ms
- Fresh data: < 500ms
- Search queries: < 200ms
- Rate limiting: 100 requests/minute per IP

## Deployment

1. Build the application: `npm run build`
2. Set environment variables for production
3. Start with: `npm start`
4. Configure reverse proxy and SSL

For detailed setup instructions, see the configuration section above. 