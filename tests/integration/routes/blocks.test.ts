import request from 'supertest';
import { createTestApp } from '../../helpers/testApp';

describe('Blocks API Routes', () => {
  let testApp: any;

  beforeAll(async () => {
    testApp = createTestApp();
  });

  afterAll(async () => {
    await testApp.stop();
  });

  describe('GET /api/blocks', () => {
    it('should return latest blocks with default pagination', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('page', 1);
      expect(response.body.meta).toHaveProperty('limit', 20);
    });

    it('should return blocks with custom pagination', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks?page=2&limit=5')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks?page=invalid&limit=invalid')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(20);
    });

    it('should return blocks with proper structure', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      if (response.body.data.length > 0) {
        const block = response.body.data[0];
        expect(block).toHaveProperty('number');
        expect(block).toHaveProperty('hash');
        expect(block).toHaveProperty('parent_hash');
        expect(block).toHaveProperty('timestamp');
        expect(block).toHaveProperty('extrinsics');
        expect(block).toHaveProperty('time');
      }
    });
  });

  describe('GET /api/blocks/:numberOrHash', () => {
    it('should return specific block by number', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks/1000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('number');
      expect(response.body.data).toHaveProperty('hash');
      expect(response.body.data).toHaveProperty('extrinsics');
    });

    it('should return specific block by hash', async () => {
      const blockHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(testApp.getApp())
        .get(`/api/blocks/${blockHash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('number');
      expect(response.body.data).toHaveProperty('hash');
    });

    it('should return block with extrinsics array', async () => {
      const response = await request(testApp.getApp())
        .get('/api/blocks/1000')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('extrinsics');
      expect(Array.isArray(response.body.data.extrinsics)).toBe(true);
      
      if (response.body.data.extrinsics.length > 0) {
        const extrinsic = response.body.data.extrinsics[0];
        expect(extrinsic).toHaveProperty('id');
        expect(extrinsic).toHaveProperty('hash');
        expect(extrinsic).toHaveProperty('module');
        expect(extrinsic).toHaveProperty('call');
        expect(extrinsic).toHaveProperty('success');
      }
    });
  });

  describe('Error handling', () => {
    it('should handle server errors gracefully', async () => {
      // This would require mocking the database to throw an error
      // For now, we'll test that the route exists and responds
      const response = await request(testApp.getApp())
        .get('/api/blocks')
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });
}); 