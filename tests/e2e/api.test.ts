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
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
    });

    it('should return API health under versioned endpoint', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
    });
  });

  describe('API Root', () => {
    it('should return API information', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('message');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('timestamp');
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/')
        .expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await request(testApp.getApp())
        .post('/api/v1/blocks')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('API Workflow', () => {
    it('should complete a typical user workflow', async () => {
      // 1. Get API info
      const apiInfo = await request(testApp.getApp())
        .get('/api/v1/')
        .expect(200);

      expect(apiInfo.body.success).toBe(true);

      // 2. Get latest blocks
      const blocks = await request(testApp.getApp())
        .get('/api/v1/blocks')
        .expect(200);

      expect(blocks.body.success).toBe(true);
      expect(Array.isArray(blocks.body.data)).toBe(true);

      // 3. Get specific block if blocks exist
      if (blocks.body.data.length > 0) {
        const blockNumber = blocks.body.data[0].number;
        const specificBlock = await request(testApp.getApp())
          .get(`/api/v1/blocks/${blockNumber}`)
          .expect(200);

        expect(specificBlock.body.success).toBe(true);
        expect(specificBlock.body.data).toHaveProperty('number');
      }

      // 4. Search for something
      const searchResults = await request(testApp.getApp())
        .get('/api/v1/search?q=1000')
        .expect(200);

      expect(searchResults.body.success).toBe(true);

      // 5. Get chain stats
      const chainStats = await request(testApp.getApp())
        .get('/api/v1/chain/stats')
        .expect(200);

      expect(chainStats.body.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time', async () => {
      const start = Date.now();
      
      await request(testApp.getApp())
        .get('/api/v1/')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });
}); 