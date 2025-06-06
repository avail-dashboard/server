# Deployment Guide - Avail Blockchain Explorer Backend

This guide covers different deployment options for the Avail Blockchain Explorer Backend.

## 🚀 Quick Start (Native)

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Redis 6+ (optional, for caching)
- Basic understanding of environment variables

### 1. Environment Setup

Create a `.env` file in the server directory:

```bash
# Copy the example
cp env.example .env

# Edit with your values
nano .env
```

Required environment variables:
```env
DATABASE_URL=postgresql://avail_user:your_password@localhost:5432/avail_explorer
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_at_least_32_characters
NODE_ENV=production
```

### 2. Quick Installation

```bash
# Run the automated setup script
./install.sh

# Or manual setup:
npm install
npm run build
npm run migrate
```

### 3. Start the Server

```bash
# Development
npm run dev

# Production
npm start

# With PM2 (recommended for production)
npm install -g pm2
pm2 start ecosystem.config.js
```

### 4. Health Check

```bash
curl http://localhost:3001/health
```

## 🔧 Manual Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### 1. System Dependencies

**macOS:**
```bash
brew install postgresql redis
brew services start postgresql
brew services start redis
```

**Ubuntu:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib redis-server
sudo systemctl start postgresql
sudo systemctl start redis-server
```

### 3. Application Setup

```bash
# Run the installation script
./install.sh

# Or manual setup:
npm install
cp env.example .env
# Edit .env with your configuration
npm run build
```

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```



### Monitoring Setup

#### Application Monitoring
```bash
# Health checks
curl -f http://localhost:3001/health || exit 1

# Metrics endpoint
curl http://localhost:3001/metrics
```
