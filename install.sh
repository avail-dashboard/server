#!/bin/bash

# Avail Blockchain Explorer Backend Setup Script
set -e

echo "🚀 Setting up Avail Blockchain Explorer Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo "📦 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Please install Node.js 18+.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed.${NC}"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file from template..."
    cp env.example .env
    echo -e "${YELLOW}📝 Please edit .env file with your configuration before starting the server${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Check for PostgreSQL
echo "🐘 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✅ PostgreSQL detected${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL not detected. Please install and configure PostgreSQL 12+${NC}"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt install postgresql postgresql-contrib"
fi

# Check for Redis
echo "🗄️  Checking Redis..."
if command -v redis-cli &> /dev/null; then
    echo -e "${GREEN}✅ Redis detected${NC}"
    
    # Test Redis connection
    if redis-cli ping | grep -q PONG; then
        echo -e "${GREEN}✅ Redis is running${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis is installed but not running${NC}"
        echo "   Start with: brew services start redis (macOS) or sudo systemctl start redis (Ubuntu)"
    fi
else
    echo -e "${YELLOW}⚠️  Redis not detected. Please install and start Redis 6+${NC}"
    echo "   macOS: brew install redis && brew services start redis"
    echo "   Ubuntu: sudo apt install redis-server && sudo systemctl start redis-server"
    echo "   Docker: docker run -d -p 6379:6379 redis:7-alpine"
fi

# Build the project
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your database URLs and API keys:"
echo "   - DATABASE_URL=postgresql://user:password@localhost:5432/avail_explorer"
echo "   - REDIS_URL=redis://localhost:6379"
echo ""
echo "2. Create the PostgreSQL database:"
echo "   createdb avail_explorer"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Test the server:"
echo "   curl http://localhost:3001/health"
echo ""
echo -e "${GREEN}🚀 Your Avail Blockchain Explorer Backend is ready!${NC}" 