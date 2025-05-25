import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  console.log('🧪 Setting up test environment...');
  
  // Create test environment file if it doesn't exist
  const testEnvPath = path.join(__dirname, '..', '.env.test');
  if (!fs.existsSync(testEnvPath)) {
    const testEnvContent = `
NODE_ENV=test
PORT=3002
DATABASE_TYPE=sqlite
SQLITE_PATH=:memory:
ENABLE_CACHING=false
ENABLE_WEBSOCKETS=false
ENABLE_RATE_LIMITING=false
ENABLE_ANALYTICS=false
ENABLE_METRICS=false
LOG_LEVEL=error
CORS_ORIGIN=http://localhost:3000
REDIS_URL=redis://localhost:6379/15
`.trim();
    
    fs.writeFileSync(testEnvPath, testEnvContent);
    console.log('✅ Created .env.test file');
  }
  
  // Create test data directory
  const testDataDir = path.join(__dirname, '..', 'data', 'test');
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
    console.log('✅ Created test data directory');
  }
  
  // Create test logs directory
  const testLogsDir = path.join(__dirname, '..', 'logs', 'test');
  if (!fs.existsSync(testLogsDir)) {
    fs.mkdirSync(testLogsDir, { recursive: true });
    console.log('✅ Created test logs directory');
  }
  
  console.log('✅ Test environment setup complete');
} 