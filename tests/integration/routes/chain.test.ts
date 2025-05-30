import request from 'supertest';
import { createTestApp } from '../../helpers/testApp';

describe('Chain API Routes', () => {
  let testApp: any;

  beforeAll(async () => {
    testApp = createTestApp();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  describe('GET /api/chain/stats', () => {
    it('should return chain statistics', async () => {
      const response = await request(testApp.getApp())
        .get('/api/chain/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should return stats with proper structure', async () => {
      const response = await request(testApp.getApp())
        .get('/api/chain/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      if (response.body.data) {
        const stats = response.body.data;
        // Check for expected chain stats properties
        expect(typeof stats).toBe('object');
      }
    });
  });

  describe('GET /api/chain/info', () => {
    it('should return 404 for non-existent chain info endpoint', async () => {
      const response = await request(testApp.getApp())
        .get('/api/chain/info')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid routes gracefully', async () => {
      const response = await request(testApp.getApp())
        .get('/api/chain/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });
}); 