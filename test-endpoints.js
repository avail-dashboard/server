#!/usr/bin/env node

// Simple endpoint verification script
const http = require('http');

const testEndpoints = [
  { path: '/api/blocks', method: 'GET', description: 'Get blocks endpoint' },
  { path: '/api/data-submissions', method: 'GET', description: 'Get data submissions endpoint' },
  { path: '/health', method: 'GET', description: 'Health check endpoint' }
];

function makeRequest(hostname, port, path, method) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method,
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          path
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout for ${path}`));
    });

    req.end();
  });
}

async function testEndpoints() {
  const hostname = 'localhost';
  const port = 3001;  // Default port for the server

  console.log('🧪 Testing API endpoints...');
  console.log(`📡 Server: http://${hostname}:${port}`);
  console.log('=' .repeat(50));

  for (const endpoint of testEndpoints) {
    try {
      console.log(`\n🔄 Testing ${endpoint.method} ${endpoint.path}`);
      console.log(`   Description: ${endpoint.description}`);
      
      const response = await makeRequest(hostname, port, endpoint.path, endpoint.method);
      
      console.log(`   ✅ Status: ${response.statusCode}`);
      console.log(`   📦 Content-Type: ${response.headers['content-type'] || 'Unknown'}`);
      
      // Try to parse JSON response
      try {
        const jsonBody = JSON.parse(response.body);
        if (jsonBody.success !== undefined) {
          console.log(`   🎯 Success: ${jsonBody.success}`);
        }
        if (jsonBody.data && Array.isArray(jsonBody.data)) {
          console.log(`   📊 Data count: ${jsonBody.data.length}`);
        }
        if (jsonBody.error) {
          console.log(`   ⚠️  Error: ${jsonBody.error.message || jsonBody.error}`);
        }
      } catch (e) {
        // Not JSON, show first 100 chars
        const preview = response.body.substring(0, 100);
        console.log(`   📝 Response preview: ${preview}${response.body.length > 100 ? '...' : ''}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.log(`   🔌 Server might not be running on ${hostname}:${port}`);
      }
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('🏁 Endpoint testing completed');
}

// Check if server argument provided
const args = process.argv.slice(2);
if (args.length > 0) {
  const [hostname, port] = args[0].split(':');
  if (hostname && port) {
    console.log(`Using custom server: ${hostname}:${port}`);
  }
}

testEndpoints().catch(console.error);