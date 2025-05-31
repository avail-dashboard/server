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

console.log('🎉 Development environment setup complete!\n');
console.log('Next steps:');
console.log('1. Review and update .env file with your PostgreSQL connection details');
console.log('2. Ensure PostgreSQL is running and accessible');
console.log('3. Run: npm run dev');
console.log('4. The database tables will be created automatically on first run\n');

console.log('📝 Notes:');
console.log('- PostgreSQL is required for all environments');
console.log('- Redis is optional for development (caching disabled by default)');
console.log('- Update DATABASE_URL in .env with your PostgreSQL connection string\n'); 