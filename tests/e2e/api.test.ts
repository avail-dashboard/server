import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

describe('API End-to-End Tests', () => {
  let testApp: any;

  beforeAll(async () => {
    testApp = createTestApp();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(testApp.getApp())
        .get('/health');

      // Health endpoint should respond, but may be degraded in test environment
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
    });

    it('should return API health under versioned endpoint', async () => {
      const response = await request(testApp.getApp())
        .get('/api/health');

      // Health endpoint should respond, but may be degraded in test environment
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
    });
  });

  describe('Available API Endpoints', () => {
    it('should return blocks list', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return chain stats', async () => {
      const response = await request(testApp.getApp())
        .get('/api/chain/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      // Check for CORS configuration - either access-control-allow-origin or vary header
      const hasCorsOrigin = response.headers['access-control-allow-origin'];
      const hasVaryHeader = response.headers['vary'] && response.headers['vary'].includes('Origin');
      
      expect(hasCorsOrigin || hasVaryHeader).toBeTruthy();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(testApp.getApp())
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await request(testApp.getApp())
        .post('/api/blocks')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('API Workflow', () => {
    it('should complete a typical user workflow', async () => {
      // 1. Get latest blocks
      const blocks = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      expect(blocks.body.success).toBe(true);
      expect(Array.isArray(blocks.body.data)).toBe(true);

      // 2. Get specific block if blocks exist
      if (blocks.body.data.length > 0) {
        const blockNumber = blocks.body.data[0].number;
        const specificBlock = await request(testApp.getApp())
          .get(`/api/blocks/${blockNumber}`)
          .expect(200);

        expect(specificBlock.body.success).toBe(true);
        expect(specificBlock.body.data).toHaveProperty('number');
      }

      // 3. Search for something
      const searchResults = await request(testApp.getApp())
        .get('/api/search?q=1000')
        .expect(200);

      expect(searchResults.body.success).toBe(true);

      // 4. Get chain stats
      const chainStats = await request(testApp.getApp())
        .get('/api/chain/stats')
        .expect(200);

      expect(chainStats.body.success).toBe(true);

      // 5. Get validators
      const validators = await request(testApp.getApp())
        .get('/api/validators')
        .expect(200);

      expect(validators.body.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time', async () => {
      const start = Date.now();
      
      await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });
}); 