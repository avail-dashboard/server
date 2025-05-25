import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up test data directory
  const testDataDir = path.join(__dirname, '..', 'data', 'test');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    console.log('✅ Cleaned up test data directory');
  }
  
  // Clean up test logs directory
  const testLogsDir = path.join(__dirname, '..', 'logs', 'test');
  if (fs.existsSync(testLogsDir)) {
    fs.rmSync(testLogsDir, { recursive: true, force: true });
    console.log('✅ Cleaned up test logs directory');
  }
  
  console.log('✅ Test environment cleanup complete');
} 