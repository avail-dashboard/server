import request from 'supertest';
import { Application } from 'express';
import server from '../../../src/index';

describe('API Routes - camelCase Validation', () => {
  let app: Application;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    app = server.getApp();
    
    // Start server for testing
    await server.start();
  });

  afterAll(async () => {
    // Clean up after tests
    process.env.NODE_ENV = 'development';
  });

  describe('Health Endpoints', () => {
    test('GET /health should return camelCase response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      
      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/); // No snake_case patterns
    });

    test('GET /api/health should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
      
      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Block Endpoints', () => {
    test('GET /api/blocks should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/blocks?page=1&limit=2')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      
      if (response.body.data.length > 0) {
        const block = response.body.data[0];
        // Check for camelCase properties
        expect(block).toHaveProperty('blockNumber');
        expect(block).not.toHaveProperty('block_number');
        expect(block).toHaveProperty('parentHash');
        expect(block).not.toHaveProperty('parent_hash');
        expect(block).toHaveProperty('extrinsicsCount');
        expect(block).not.toHaveProperty('extrinsics_count');
      }

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/blocks/:numberOrHash should return camelCase response', async () => {
      // First get a block to test with
      const blocksResponse = await request(app)
        .get('/api/blocks?page=1&limit=1')
        .expect(200);

      if (blocksResponse.body.data.length > 0) {
        const blockNumber = blocksResponse.body.data[0].number || blocksResponse.body.data[0].blockNumber;
        
        const response = await request(app)
          .get(`/api/blocks/${blockNumber}`)
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
        
        // Check for camelCase properties
        const block = response.body.data;
        expect(block).toHaveProperty('blockNumber');
        expect(block).not.toHaveProperty('block_number');
        
        // Validate no snake_case keys exist
        const responseStr = JSON.stringify(response.body);
        expect(responseStr).not.toMatch(/_[a-z]/);
      }
    });
  });

  describe('Extrinsic Endpoints', () => {
    test('GET /api/extrinsics should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/extrinsics?page=1&limit=2')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      
      if (response.body.data.length > 0) {
        const extrinsic = response.body.data[0];
        // Check for camelCase properties
        expect(extrinsic).toHaveProperty('blockNumber');
        expect(extrinsic).not.toHaveProperty('block_number');
        expect(extrinsic).toHaveProperty('extrinsicIndex');
        expect(extrinsic).not.toHaveProperty('extrinsic_index');
      }

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Chain Endpoints', () => {
    test('GET /api/chain/stats should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/chain/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const stats = response.body.data;
      // Check for camelCase properties
      expect(stats).toHaveProperty('finalizedBlocks');
      expect(stats).not.toHaveProperty('finalized_blocks');
      expect(stats).toHaveProperty('signedExtrinsics');
      expect(stats).not.toHaveProperty('signed_extrinsics');
      expect(stats).toHaveProperty('stakedAmount');
      expect(stats).not.toHaveProperty('staked_amount');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Search Endpoints', () => {
    test('GET /api/search should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/search?q=1000')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/search should return 400 for missing query', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Account Endpoints', () => {
    test('GET /api/accounts/:address should return camelCase response', async () => {
      const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const response = await request(app)
        .get(`/api/accounts/${testAddress}`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const account = response.body.data;
      // Check for camelCase properties
      expect(account).toHaveProperty('address');
      expect(account).toHaveProperty('balance');
      expect(account).toHaveProperty('lastUpdated');
      expect(account).not.toHaveProperty('last_updated');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Data Submission Endpoints', () => {
    test('GET /api/data-submissions should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/data-submissions?page=1&limit=2')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      
      if (response.body.data.length > 0) {
        const submission = response.body.data[0];
        // Check for camelCase properties
        expect(submission).toHaveProperty('extrinsicId');
        expect(submission).not.toHaveProperty('extrinsic_id');
        expect(submission).toHaveProperty('blockNumber');
        expect(submission).not.toHaveProperty('block_number');
        expect(submission).toHaveProperty('appId');
        expect(submission).not.toHaveProperty('app_id');
      }

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/data-submissions/stats should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/data-submissions/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const stats = response.body.data;
      // Check for camelCase properties
      expect(stats).toHaveProperty('totalSubmissions');
      expect(stats).not.toHaveProperty('total_submissions');
      expect(stats).toHaveProperty('totalDataSize');
      expect(stats).not.toHaveProperty('total_data_size');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Validator Endpoints', () => {
    test('GET /api/validators should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/validators?page=1&limit=2')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      
      const data = response.body.data;
      // Check for camelCase properties
      expect(data).toHaveProperty('validators');
      expect(data).toHaveProperty('totalCount');
      expect(data).not.toHaveProperty('total_count');
      expect(data).toHaveProperty('activeCount');
      expect(data).not.toHaveProperty('active_count');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/validators/staking/overview should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/validators/staking/overview')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const overview = response.body.data;
      // Check for camelCase properties
      expect(overview).toHaveProperty('totalStaked');
      expect(overview).not.toHaveProperty('total_staked');
      expect(overview).toHaveProperty('activeValidators');
      expect(overview).not.toHaveProperty('active_validators');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/validators/nomination-pools should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/validators/nomination-pools')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Analytics Endpoints', () => {
    test('GET /api/analytics/network should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/network')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const analytics = response.body.data;
      // Check for camelCase properties
      expect(analytics).toHaveProperty('currentStats');
      expect(analytics).not.toHaveProperty('current_stats');
      expect(analytics).toHaveProperty('historicalData');
      expect(analytics).not.toHaveProperty('historical_data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/analytics/gas should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/gas')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/analytics/rollups should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/rollups')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/analytics/rollups/:appId should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/rollups/1')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/analytics/data-throughput should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/data-throughput')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/analytics/validators should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/analytics/validators')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Rollup Endpoints', () => {
    test('GET /api/rollups/leaderboard should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups/leaderboard')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const leaderboard = response.body.data;
      // Check for camelCase properties
      expect(leaderboard).toHaveProperty('totalRollups');
      expect(leaderboard).not.toHaveProperty('total_rollups');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/rollups should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups?page=1&limit=2')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const data = response.body.data;
      // Check for camelCase properties
      expect(data).toHaveProperty('rollups');
      expect(data).toHaveProperty('totalCount');
      expect(data).not.toHaveProperty('total_count');
      expect(data).toHaveProperty('activeCount');
      expect(data).not.toHaveProperty('active_count');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/rollups/:appId should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups/1')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      
      const rollup = response.body.data;
      // Check for camelCase properties
      expect(rollup).toHaveProperty('appId');
      expect(rollup).not.toHaveProperty('app_id');
      expect(rollup).toHaveProperty('totalSubmissions');
      expect(rollup).not.toHaveProperty('total_submissions');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/rollups/:appId/submissions should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups/1/submissions')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/rollups/:appId/blobs should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups/1/blobs')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('GET /api/rollups/:appId/analytics should return camelCase response', async () => {
      const response = await request(app)
        .get('/api/rollups/1/analytics')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });

  describe('Error Cases', () => {
    test('Non-existent route should return camelCase 404 response', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });

    test('Invalid parameters should return camelCase error response', async () => {
      const response = await request(app)
        .get('/api/rollups/invalid-app-id')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');

      // Validate no snake_case keys exist
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toMatch(/_[a-z]/);
    });
  });
}); 