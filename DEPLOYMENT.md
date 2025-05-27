# Deployment Guide - Avail Blockchain Explorer Backend

This guide covers different deployment options for the Avail Blockchain Explorer Backend.

## 🚀 Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
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
DATABASE_URL=postgresql://avail_user:your_password@postgres:5432/avail_explorer
REDIS_URL=redis://redis:6379
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_at_least_32_characters
```

### 2. Start with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check health
curl http://localhost:3001/health
```

### 3. Optional Admin Tools

Start with admin interfaces for database management:

```bash
# Start with admin tools
docker-compose --profile admin up -d

# Access pgAdmin at http://localhost:5050
# Access RedisInsight at http://localhost:8001
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

### 2. Database Setup

```bash
# Create database
createdb avail_explorer

# Create user
psql -c "CREATE USER avail_user WITH PASSWORD 'your_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE avail_explorer TO avail_user;"
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

## ☁️ Cloud Deployment

### AWS Deployment

#### Using ECS with Fargate

1. **Build and push to ECR:**
```bash
# Create ECR repository
aws ecr create-repository --repository-name avail-explorer-backend

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t avail-explorer-backend .
docker tag avail-explorer-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/avail-explorer-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/avail-explorer-backend:latest
```

2. **Create RDS PostgreSQL instance and ElastiCache Redis cluster**

3. **Deploy using ECS task definition with environment variables**

#### Using EC2

```bash
# Connect to EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Docker
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker ubuntu

# Clone and deploy
git clone <your-repo>
cd server
docker-compose up -d
```

### Google Cloud Platform

#### Using Cloud Run

1. **Build and push to Container Registry:**
```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Build and push
docker build -t gcr.io/your-project/avail-explorer-backend .
docker push gcr.io/your-project/avail-explorer-backend
```

2. **Deploy to Cloud Run:**
```bash
gcloud run deploy avail-explorer-backend \
  --image gcr.io/your-project/avail-explorer-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="your-connection-string",REDIS_URL="your-redis-url"
```

### DigitalOcean

#### Using App Platform

1. Create `app.yaml`:
```yaml
name: avail-explorer
services:
- name: backend
  source_dir: /server
  github:
    repo: your-username/your-repo
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: DATABASE_URL
    value: your-database-url
  - key: REDIS_URL
    value: your-redis-url
  - key: NODE_ENV
    value: production
```

2. Deploy:
```bash
doctl apps create --spec app.yaml
```

## 🔒 Production Considerations

### Security Checklist

- [ ] Use strong, unique passwords for all services
- [ ] Configure SSL/TLS termination (nginx, load balancer, or cloud provider)
- [ ] Set up firewall rules (only allow necessary ports)
- [ ] Use environment variables for all secrets
- [ ] Enable database SSL connections
- [ ] Configure proper CORS origins
- [ ] Set up rate limiting
- [ ] Regularly update dependencies

### Performance Optimization

- [ ] Configure database connection pooling
- [ ] Set up Redis clustering for high availability
- [ ] Use a CDN for static assets
- [ ] Configure horizontal scaling
- [ ] Set up database read replicas
- [ ] Monitor memory usage and set appropriate limits
- [ ] Configure log rotation

### Monitoring Setup

#### Application Monitoring
```bash
# Health checks
curl -f http://localhost:3001/health || exit 1

# Metrics endpoint
curl http://localhost:3001/metrics
```

#### Database Monitoring
```sql
-- Check connection count
SELECT count(*) FROM pg_stat_activity;

-- Check slow queries
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

#### Redis Monitoring
```bash
# Check memory usage
redis-cli info memory

# Monitor commands
redis-cli monitor
```

### Backup Strategy

#### Database Backup
```bash
# Daily backup script
#!/bin/bash
pg_dump -h localhost -U avail_user avail_explorer > "backup_$(date +%Y%m%d_%H%M%S).sql"

# Upload to cloud storage
aws s3 cp backup_*.sql s3://your-backup-bucket/
```

#### Redis Backup
```bash
# Redis automatically creates snapshots
# Configure in redis.conf:
save 900 1    # Save if at least 1 key changed in 900 seconds
save 300 10   # Save if at least 10 keys changed in 300 seconds
save 60 10000 # Save if at least 10000 keys changed in 60 seconds
```

## 🔄 Continuous Deployment

### GitHub Actions Example

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Build and Deploy
      run: |
        docker build -t avail-explorer-backend ./server
        # Add your deployment commands here
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3001/health"
MAX_RETRIES=5
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
  if curl -f $HEALTH_URL > /dev/null 2>&1; then
    echo "✅ Health check passed"
    exit 0
  else
    echo "❌ Health check failed (attempt $i/$MAX_RETRIES)"
    if [ $i -lt $MAX_RETRIES ]; then
      sleep $RETRY_DELAY
    fi
  fi
done

echo "🚨 Health check failed after $MAX_RETRIES attempts"
exit 1
```

## 📊 Scaling Considerations

### Horizontal Scaling
- Use load balancer (nginx, HAProxy, or cloud load balancer)
- Configure session affinity for WebSocket connections
- Use Redis for shared session storage
- Consider database read replicas

### Vertical Scaling
- Monitor CPU and memory usage
- Increase instance size as needed
- Configure appropriate connection limits

### Database Scaling
- Use connection pooling (recommended: 20 connections per instance)
- Consider read replicas for read-heavy workloads
- Implement database sharding if needed
- Use database monitoring tools

This deployment guide should help you successfully deploy the Avail Blockchain Explorer Backend in various environments. Choose the deployment method that best fits your infrastructure and requirements. 