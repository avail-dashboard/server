import request from 'supertest';
import { createTestApp } from '../../helpers/testApp';

describe('Search API Routes', () => {
  let testApp: any;

  beforeAll(async () => {
    testApp = createTestApp();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  describe('GET /api/v1/search', () => {
    it('should return search results for block number', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=1000')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should return search results for hash', async () => {
      const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(testApp.getApp())
        .get(`/api/v1/search?q=${hash}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should return search results for account address', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const response = await request(testApp.getApp())
        .get(`/api/v1/search?q=${address}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should handle empty search query', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing search query', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should respect search type filter', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=1000&type=block')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should respect limit parameter', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=test&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      
      if (Array.isArray(response.body.data)) {
        expect(response.body.data.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Search result structure', () => {
    it('should return properly structured search results', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=1000')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      if (response.body.data && Array.isArray(response.body.data)) {
        response.body.data.forEach((result: any) => {
          expect(result).toHaveProperty('type');
          expect(result).toHaveProperty('id');
          expect(result).toHaveProperty('title');
          expect(result).toHaveProperty('description');
        });
      }
    });
  });

  describe('Error handling', () => {
    it('should handle invalid search type gracefully', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=test&type=invalid')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      // Should still return results even with invalid type parameter
    });

    it('should handle invalid limit parameter', async () => {
      const response = await request(testApp.getApp())
        .get('/api/v1/search?q=test&limit=invalid')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      // Should use default limit when invalid
    });
  });
}); 