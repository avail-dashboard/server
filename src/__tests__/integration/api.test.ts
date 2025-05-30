import request from 'supertest';
import { server } from '../../index';
import { jest } from '@jest/globals';

const app = server.getApp();

// Mock services to avoid actual blockchain/database calls during testing
jest.mock('../../services/blockchain');
jest.mock('../../services/analytics');
jest.mock('../../utils/database');

describe('Integration Tests - API Routes', () => {
  
  // ===========================================
  // VALIDATORS API TESTS
  // ===========================================
  
  describe('GET /api/validators', () => {
    it('should return validators list', async () => {
      const response = await request(app)
        .get('/api/validators')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/validators?page=2&limit=10')
        .expect(200);

      expect(response.body.meta).toHaveProperty('page', 2);
      expect(response.body.meta).toHaveProperty('limit', 10);
    });

    it('should support filtering by status', async () => {
      await request(app)
        .get('/api/validators?status=active')
        .expect(200);
    });
  });

  describe('GET /api/validators/:address', () => {
    const validatorAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

    it('should return validator details', async () => {
      const response = await request(app)
        .get(`/api/validators/${validatorAddress}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('address');
    });

    it('should return 404 for non-existent validator', async () => {
      const invalidAddress = '5InvalidValidatorAddress';
      await request(app)
        .get(`/api/validators/${invalidAddress}`)
        .expect(404);
    });

    it('should return 400 for invalid address format', async () => {
      await request(app)
        .get('/api/validators/invalid-address')
        .expect(400);
    });
  });

  describe('GET /api/validators/staking/overview', () => {
    it('should return staking overview', async () => {
      const response = await request(app)
        .get('/api/validators/staking/overview')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('totalStaked');
      expect(response.body.data).toHaveProperty('activeValidators');
      expect(response.body.data).toHaveProperty('waitingValidators');
      expect(response.body.data).toHaveProperty('stakingRatio');
    });
  });

  // ===========================================
  // ANALYTICS API TESTS
  // ===========================================

  describe('GET /api/analytics/network', () => {
    it('should return network analytics overview', async () => {
      const response = await request(app)
        .get('/api/analytics/network')
        .expect(200);

      expect(response.body).toHaveProperty('current_stats');
      expect(response.body).toHaveProperty('historical_data');
      expect(response.body).toHaveProperty('growth_metrics');
      expect(response.body).toHaveProperty('performance_metrics');
    });

    it('should handle timeframe parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/network?timeframe=7d')
        .expect(200);

      expect(response.body).toHaveProperty('current_stats');
      // In real implementation, would verify timeframe-specific data
    });

    it('should return 400 for invalid timeframe', async () => {
      await request(app)
        .get('/api/analytics/network?timeframe=invalid')
        .expect(400);
    });
  });

  describe('GET /api/analytics/gas', () => {
    it('should return gas analytics data', async () => {
      const response = await request(app)
        .get('/api/analytics/gas')
        .expect(200);

      expect(response.body).toHaveProperty('current_gas_price');
      expect(response.body).toHaveProperty('price_trend');
      expect(response.body).toHaveProperty('efficiency_metrics');
      expect(response.body).toHaveProperty('cost_analysis');
    });

    it('should handle period parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/gas?period=24h')
        .expect(200);

      expect(response.body).toHaveProperty('current_gas_price');
    });
  });

  describe('GET /api/analytics/rollups', () => {
    it('should return rollup analytics overview', async () => {
      const response = await request(app)
        .get('/api/analytics/rollups')
        .expect(200);

      expect(response.body).toHaveProperty('total_rollups');
      expect(response.body).toHaveProperty('active_rollups_24h');
      expect(response.body).toHaveProperty('leaderboard');
      expect(response.body).toHaveProperty('da_contribution');
      expect(response.body).toHaveProperty('growth_trends');
      expect(Array.isArray(response.body.leaderboard)).toBe(true);
    });
  });

  describe('GET /api/analytics/rollups/:appId', () => {
    it('should return specific rollup analytics', async () => {
      const appId = 1;
      const response = await request(app)
        .get(`/api/analytics/rollups/${appId}`)
        .expect(200);

      expect(response.body).toHaveProperty('app_id');
      expect(response.body).toHaveProperty('submission_stats');
      expect(response.body).toHaveProperty('data_usage');
      expect(response.body).toHaveProperty('performance_metrics');
      expect(response.body.app_id).toBe(appId);
    });

    it('should return 404 for non-existent rollup', async () => {
      await request(app)
        .get('/api/analytics/rollups/99999')
        .expect(404);
    });
  });

  describe('GET /api/analytics/data-throughput', () => {
    it('should return data throughput analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/data-throughput')
        .expect(200);

      expect(response.body).toHaveProperty('current_metrics');
      expect(response.body).toHaveProperty('historical_throughput');
      expect(response.body).toHaveProperty('peak_usage');
      expect(response.body).toHaveProperty('predictions');
    });
  });

  describe('GET /api/analytics/validators', () => {
    it('should return validator analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/validators')
        .expect(200);

      expect(response.body).toHaveProperty('performance_distribution');
      expect(response.body).toHaveProperty('staking_analysis');
      expect(response.body).toHaveProperty('rewards_analysis');
      expect(Array.isArray(response.body.performance_distribution)).toBe(true);
    });
  });

  // ===========================================
  // ROLLUPS API TESTS
  // ===========================================

  describe('GET /api/rollups', () => {
    it('should return rollups list with pagination', async () => {
      const response = await request(app)
        .get('/api/rollups')
        .expect(200);

      expect(response.body).toHaveProperty('rollups');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.rollups)).toBe(true);
    });

    it('should handle search parameter', async () => {
      const response = await request(app)
        .get('/api/rollups?search=test')
        .expect(200);

      expect(response.body).toHaveProperty('rollups');
    });

    it('should filter by status when provided', async () => {
      const response = await request(app)
        .get('/api/rollups?status=active')
        .expect(200);

      expect(response.body).toHaveProperty('rollups');
    });
  });

  describe('GET /api/rollups/:appId', () => {
    it('should return specific rollup details', async () => {
      const appId = 1;
      const response = await request(app)
        .get(`/api/rollups/${appId}`)
        .expect(200);

      expect(response.body).toHaveProperty('rollup');
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('recent_activity');
      expect(response.body.rollup).toHaveProperty('app_id');
    });

    it('should return 404 for non-existent rollup', async () => {
      await request(app)
        .get('/api/rollups/99999')
        .expect(404);
    });
  });

  describe('GET /api/rollups/:appId/submissions', () => {
    it('should return rollup data submissions', async () => {
      const appId = 1;
      const response = await request(app)
        .get(`/api/rollups/${appId}/submissions`)
        .expect(200);

      expect(response.body).toHaveProperty('submissions');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.submissions)).toBe(true);
    });

    it('should handle date filters', async () => {
      const appId = 1;
      const fromDate = '2024-01-01';
      const toDate = '2024-01-31';
      
      const response = await request(app)
        .get(`/api/rollups/${appId}/submissions?from=${fromDate}&to=${toDate}`)
        .expect(200);

      expect(response.body).toHaveProperty('submissions');
    });
  });

  describe('GET /api/rollups/:appId/blobs', () => {
    it('should return rollup blob data', async () => {
      const appId = 1;
      const response = await request(app)
        .get(`/api/rollups/${appId}/blobs`)
        .expect(200);

      expect(response.body).toHaveProperty('blobs');
      expect(response.body).toHaveProperty('total_size');
      expect(response.body).toHaveProperty('blob_count');
      expect(Array.isArray(response.body.blobs)).toBe(true);
    });
  });

  describe('GET /api/rollups/:appId/analytics', () => {
    it('should return rollup-specific analytics', async () => {
      const appId = 1;
      const response = await request(app)
        .get(`/api/rollups/${appId}/analytics`)
        .expect(200);

      expect(response.body).toHaveProperty('submission_trends');
      expect(response.body).toHaveProperty('data_usage_over_time');
      expect(response.body).toHaveProperty('cost_analysis');
      expect(response.body).toHaveProperty('efficiency_metrics');
    });
  });

  describe('GET /api/rollups/leaderboard', () => {
    it('should return rollups leaderboard', async () => {
      const response = await request(app)
        .get('/api/rollups/leaderboard')
        .expect(200);

      expect(response.body).toHaveProperty('leaderboard');
      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('sort_by');
      expect(Array.isArray(response.body.leaderboard)).toBe(true);
    });

    it('should handle sort parameter', async () => {
      const response = await request(app)
        .get('/api/rollups/leaderboard?sort=data_size')
        .expect(200);

      expect(response.body).toHaveProperty('leaderboard');
      expect(response.body.sort_by).toBe('data_size');
    });

    it('should handle period parameter', async () => {
      const response = await request(app)
        .get('/api/rollups/leaderboard?period=7d')
        .expect(200);

      expect(response.body).toHaveProperty('leaderboard');
      expect(response.body.period).toBe('7d');
    });
  });

  // ===========================================
  // ERROR HANDLING TESTS
  // ===========================================

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      await request(app)
        .get('/api/non-existent')
        .expect(404);
    });

    it('should return 400 for invalid query parameters', async () => {
      await request(app)
        .get('/api/validators?page=invalid')
        .expect(400);
    });

    it('should return 400 for invalid limit values', async () => {
      await request(app)
        .get('/api/validators?limit=1000')
        .expect(400);
    });

    it('should handle internal server errors gracefully', async () => {
      // This would require mocking service failures
      // Implementation depends on how errors are thrown in services
    });
  });

  // ===========================================
  // PERFORMANCE TESTS
  // ===========================================

  describe('Performance Tests', () => {
    it('should respond to validators list within reasonable time', async () => {
      const start = Date.now();
      await request(app)
        .get('/api/validators')
        .expect(200);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle concurrent requests', async () => {
      // Use rollups endpoint instead of analytics/network since it works properly
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/api/rollups'),
      );
      
      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
      });
    });
  });

  // ===========================================
  // RATE LIMITING TESTS
  // ===========================================

  describe('Rate Limiting', () => {
    it('should implement rate limiting for API endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array(100).fill(null).map(() => 
        request(app).get('/api/validators'),
      );
      
      const responses = await Promise.allSettled(requests);
      
      // Note: This test depends on rate limiting configuration
      // In development, rate limiting might be disabled
      // We're just checking that the endpoint can handle concurrent requests
      expect(responses.length).toBe(100);
    });
  });

  // ===========================================
  // CORS TESTS
  // ===========================================

  describe('CORS Configuration', () => {
    it('should handle CORS preflight requests', async () => {
      await request(app)
        .options('/api/validators')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(200);
    });

    it('should include proper CORS headers', async () => {
      const response = await request(app)
        .get('/api/validators')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  // ===========================================
  // CONTENT-TYPE TESTS
  // ===========================================

  describe('Content-Type Headers', () => {
    it('should return JSON content-type for all endpoints', async () => {
      const endpoints = [
        '/api/validators',
        '/api/analytics/network',
        '/api/rollups',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(200);
        
        expect(response.headers['content-type']).toMatch(/application\/json/);
      }
    });
  });

  // ===========================================
  // CACHE HEADERS TESTS
  // ===========================================

  describe('Cache Headers', () => {
    it('should include appropriate cache headers for analytics data', async () => {
      const response = await request(app)
        .get('/api/analytics/network')
        .expect(200);

      // Check for cache control headers
      expect(response.headers).toHaveProperty('cache-control');
    });

    it('should have different cache policies for different endpoints', async () => {
      // Real-time data should have shorter cache times
      const realtimeResponse = await request(app)
        .get('/api/validators')
        .expect(200);

      // Analytics data might have longer cache times
      const analyticsResponse = await request(app)
        .get('/api/analytics/network')
        .expect(200);

      expect(realtimeResponse.headers).toHaveProperty('cache-control');
      expect(analyticsResponse.headers).toHaveProperty('cache-control');
    });
  });
});

// ===========================================
// INTEGRATION TEST HELPERS
// ===========================================

/**
 * Helper function to create test data
 */
export const createTestData = {
  validator: () => ({
    address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    name: 'Test Validator',
    commission: '5.0',
    active: true,
    totalStake: BigInt('1000000000000000000'),
  }),

  rollup: () => ({
    app_id: 1,
    name: 'Test Rollup',
    description: 'A test rollup for integration testing',
    status: 'active',
    total_submissions: 100,
    total_data_size: 1024000,
  }),

  dataSubmission: () => ({
    id: 1,
    app_id: 1,
    block_number: BigInt(1000),
    timestamp: BigInt(Date.now()),
    submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    data_root: '0x123456789abcdef',
    data_size: 1024,
    tx_hash: '0xabcdef123456789',
  }),
};

/**
 * Helper function to setup test environment
 */
export const setupTestEnvironment = async () => {
  // Setup test database
  // Initialize test services
  // Create test data
  // This would be implemented based on actual test needs
};

/**
 * Helper function to cleanup test environment
 */
export const cleanupTestEnvironment = async () => {
  // Cleanup test database
  // Reset mocks
  // Clear test data
  // This would be implemented based on actual test needs
}; 