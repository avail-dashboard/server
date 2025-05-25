#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Avail Explorer development environment...\n');

// Copy environment file if it doesn't exist
const envExample = path.join(__dirname, 'env.example');
const envFile = path.join(__dirname, '.env');

if (!fs.existsSync(envFile)) {
  console.log('📋 Creating .env file from env.example...');
  fs.copyFileSync(envExample, envFile);
  console.log('✅ .env file created\n');
} else {
  console.log('✅ .env file already exists\n');
}

// Create data directory for SQLite
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  console.log('📁 Creating data directory for SQLite...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Data directory created\n');
} else {
  console.log('✅ Data directory already exists\n');
}

console.log('🎉 Development environment setup complete!\n');
console.log('Next steps:');
console.log('1. Review and update .env file if needed');
console.log('2. Run: npm run dev');
console.log('3. The SQLite database will be created automatically at ./data/avail_explorer.db\n');

console.log('📝 Notes:');
console.log('- SQLite is used for development (no PostgreSQL setup required)');
console.log('- Redis is optional for development (caching disabled by default)');
console.log('- Check the .env file to configure API keys if needed\n'); 