#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const API_PREFIX = '/api';

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class APITester {
  constructor() {
    this.results = {
      working: [],
      failing: [],
      notImplemented: []
    };
  }

  async testEndpoint(method, path, description, expectedStatus = 200) {
    try {
      console.log(`${colors.blue}Testing:${colors.reset} ${method} ${path} - ${description}`);
      
      const config = {
        method: method.toLowerCase(),
        url: `${BASE_URL}${path}`,
        timeout: 10000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      };

      const response = await axios(config);
      
      if (response.status === expectedStatus || (response.status >= 200 && response.status < 300)) {
        console.log(`${colors.green}✅ WORKING${colors.reset} - Status: ${response.status}`);
        this.results.working.push({
          method,
          path,
          description,
          status: response.status,
          responseSize: JSON.stringify(response.data).length
        });
        return { success: true, status: response.status, data: response.data };
      } else if (response.status === 404) {
        console.log(`${colors.yellow}❌ NOT IMPLEMENTED${colors.reset} - Status: ${response.status}`);
        this.results.notImplemented.push({
          method,
          path,
          description,
          status: response.status,
          error: 'Endpoint not found'
        });
        return { success: false, status: response.status, error: 'Not implemented' };
      } else {
        console.log(`${colors.red}❌ FAILING${colors.reset} - Status: ${response.status}`);
        this.results.failing.push({
          method,
          path,
          description,
          status: response.status,
          error: response.data?.error || 'Unknown error'
        });
        return { success: false, status: response.status, error: response.data };
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`${colors.red}❌ CONNECTION REFUSED${colors.reset} - Server not running`);
        this.results.failing.push({
          method,
          path,
          description,
          status: 'CONNECTION_REFUSED',
          error: 'Server not running'
        });
      } else if (error.response) {
        console.log(`${colors.red}❌ FAILING${colors.reset} - Status: ${error.response.status}`);
        this.results.failing.push({
          method,
          path,
          description,
          status: error.response.status,
          error: error.response.data?.error || error.message
        });
      } else {
        console.log(`${colors.red}❌ ERROR${colors.reset} - ${error.message}`);
        this.results.failing.push({
          method,
          path,
          description,
          status: 'ERROR',
          error: error.message
        });
      }
      return { success: false, error: error.message };
    }
  }

  async runTests() {
    console.log(`${colors.bold}${colors.blue}🚀 Starting API Endpoint Tests${colors.reset}\n`);

    // Health endpoints
    console.log(`${colors.bold}=== Health Endpoints ===${colors.reset}`);
    await this.testEndpoint('GET', '/health', 'Root health check');
    await this.testEndpoint('GET', `${API_PREFIX}/health`, 'API health check');

    // Internal Next.js API Routes (these would be in a Next.js app, not this Express server)
    console.log(`\n${colors.bold}=== Internal Next.js API Routes (Frontend calls) ===${colors.reset}`);
    await this.testEndpoint('GET', '/api/health', 'Frontend health check');
    await this.testEndpoint('GET', '/api/chain', 'Frontend chain statistics');
    await this.testEndpoint('GET', '/api/blocks', 'Frontend blocks listing');
    await this.testEndpoint('GET', '/api/blocks/1', 'Frontend block details');
    await this.testEndpoint('GET', '/api/data-submissions', 'Frontend data submissions');
    await this.testEndpoint('GET', '/api/data-submissions/stats', 'Frontend data submission stats');
    await this.testEndpoint('GET', '/api/extrinsics', 'Frontend extrinsics listing');
    await this.testEndpoint('GET', '/api/search?q=test', 'Frontend search functionality');

    // Core Data APIs
    console.log(`\n${colors.bold}=== Core Data APIs ===${colors.reset}`);
    await this.testEndpoint('GET', `${API_PREFIX}/chain/stats`, 'Chain statistics');
    await this.testEndpoint('GET', `${API_PREFIX}/blocks`, 'Blocks listing');
    await this.testEndpoint('GET', `${API_PREFIX}/blocks?page=1&limit=10`, 'Blocks with pagination');
    await this.testEndpoint('GET', `${API_PREFIX}/blocks/1`, 'Block by ID');
    await this.testEndpoint('GET', `${API_PREFIX}/blocks/latest`, 'Latest block');
    await this.testEndpoint('GET', `${API_PREFIX}/extrinsics`, 'Extrinsics listing');
    await this.testEndpoint('GET', `${API_PREFIX}/extrinsics?block=1`, 'Extrinsics with block filter');
    await this.testEndpoint('GET', `${API_PREFIX}/search?q=test`, 'Search functionality');
    await this.testEndpoint('GET', `${API_PREFIX}/data-submissions`, 'Data submissions');
    await this.testEndpoint('GET', `${API_PREFIX}/data-submissions/stats`, 'Data submission statistics');

    // Account & Validator APIs
    console.log(`\n${colors.bold}=== Account & Validator APIs ===${colors.reset}`);
    await this.testEndpoint('GET', `${API_PREFIX}/accounts/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`, 'Account details');
    await this.testEndpoint('GET', `${API_PREFIX}/validators`, 'Validators listing');
    await this.testEndpoint('GET', `${API_PREFIX}/validators?page=1&limit=10`, 'Validators with pagination');
    await this.testEndpoint('GET', `${API_PREFIX}/validators/5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`, 'Validator details');
    await this.testEndpoint('GET', `${API_PREFIX}/validators/staking/overview`, 'Staking overview');
    await this.testEndpoint('GET', `${API_PREFIX}/validators/nomination-pools`, 'Nomination pools');

    // Analytics APIs
    console.log(`\n${colors.bold}=== Analytics APIs ===${colors.reset}`);
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/network`, 'Network analytics');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/network?period=24h`, 'Network analytics with period');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/gas`, 'Gas analytics');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/gas?period=7d&granularity=1h`, 'Gas analytics with params');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/rollups`, 'Rollup analytics');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/data-throughput`, 'Data throughput analytics');
    await this.testEndpoint('GET', `${API_PREFIX}/analytics/validators`, 'Validator analytics');

    // Rollup APIs
    console.log(`\n${colors.bold}=== Rollup APIs ===${colors.reset}`);
    await this.testEndpoint('GET', `${API_PREFIX}/rollups/leaderboard`, 'Rollup leaderboard');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups`, 'Rollups listing');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups?search=test`, 'Rollups with search');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups/1`, 'Rollup details');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups/1/submissions`, 'Rollup submissions');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups/1/blobs`, 'Rollup blobs');
    await this.testEndpoint('GET', `${API_PREFIX}/rollups/1/analytics`, 'Rollup analytics');

    this.printSummary();
  }

  printSummary() {
    console.log(`\n${colors.bold}${colors.blue}📊 Test Results Summary${colors.reset}`);
    console.log(`${colors.bold}===========================================${colors.reset}`);
    
    console.log(`\n${colors.green}✅ Working Endpoints (${this.results.working.length}):${colors.reset}`);
    this.results.working.forEach(result => {
      console.log(`  ${result.method} ${result.path} - ${result.description} (${result.status})`);
    });

    console.log(`\n${colors.yellow}❌ Not Implemented (${this.results.notImplemented.length}):${colors.reset}`);
    this.results.notImplemented.forEach(result => {
      console.log(`  ${result.method} ${result.path} - ${result.description} (${result.status})`);
    });

    console.log(`\n${colors.red}❌ Failing Endpoints (${this.results.failing.length}):${colors.reset}`);
    this.results.failing.forEach(result => {
      console.log(`  ${result.method} ${result.path} - ${result.description} (${result.status}) - ${result.error}`);
    });

    // Recommendations
    console.log(`\n${colors.bold}${colors.blue}🔧 Recommendations:${colors.reset}`);
    
    if (this.results.notImplemented.length > 0) {
      console.log(`${colors.yellow}• ${this.results.notImplemented.length} endpoints need to be implemented${colors.reset}`);
    }
    
    if (this.results.failing.length > 0) {
      console.log(`${colors.red}• ${this.results.failing.length} endpoints have errors that need fixing${colors.reset}`);
    }
    
    if (this.results.working.length > 0) {
      console.log(`${colors.green}• ${this.results.working.length} endpoints are working correctly${colors.reset}`);
    }

    const total = this.results.working.length + this.results.notImplemented.length + this.results.failing.length;
    const workingPercentage = ((this.results.working.length / total) * 100).toFixed(1);
    
    console.log(`\n${colors.bold}Overall Status: ${workingPercentage}% of endpoints are working${colors.reset}`);
  }
}

// Run the tests
const tester = new APITester();
tester.runTests().catch(console.error); 