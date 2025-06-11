import request from 'supertest';
import express from 'express';
import server from '../../src/index';

describe('Extrinsics API E2E Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Get the Express app from the server instance
    app = server.getApp();
    // Note: Service initialization is handled by Jest global setup
  });

  // Note: Service cleanup is handled by Jest global teardown

  describe('GET /api/extrinsics', () => {
    it('should return paginated list of extrinsics with default parameters', async () => {
      const response = await request(app)
        .get('/api/extrinsics')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          extrinsics: expect.any(Array),
          totalCount: expect.any(Number),
        },
        meta: {
          source: 'database',
          page: 1,
          limit: 50,
          total: expect.any(Number),
        },
      });

      // Check that extrinsics are in camelCase format
      if (response.body.data.extrinsics.length > 0) {
        const extrinsic = response.body.data.extrinsics[0];
        expect(extrinsic).toHaveProperty('hash');
        expect(extrinsic).toHaveProperty('blockNumber');
        expect(extrinsic).toHaveProperty('extrinsicIndex');
        expect(extrinsic).toHaveProperty('module');
        expect(extrinsic).toHaveProperty('call');
        expect(extrinsic).toHaveProperty('success');
      }
    });

    it('should handle pagination parameters correctly', async () => {
      const response = await request(app)
        .get('/api/extrinsics?page=2&limit=10')
        .expect(200);

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 10,
      });

      expect(response.body.data.extrinsics.length).toBeLessThanOrEqual(10);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/api/extrinsics?limit=200')
        .expect(200);

      expect(response.body.meta.limit).toBe(100);
      expect(response.body.data.extrinsics.length).toBeLessThanOrEqual(100);
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/extrinsics?page=invalid&limit=invalid')
        .expect(200);

      // Should default to page 1, limit 50
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50);
    });

    it('should return extrinsics sorted by block number descending by default', async () => {
      const response = await request(app)
        .get('/api/extrinsics?limit=5')
        .expect(200);

      const extrinsics = response.body.data.extrinsics;
      if (extrinsics.length > 1) {
        for (let i = 1; i < extrinsics.length; i++) {
          expect(extrinsics[i].blockNumber).toBeLessThanOrEqual(extrinsics[i - 1].blockNumber);
        }
      }
    });
  });

  describe('GET /api/extrinsics/:extrinsicId', () => {
    it('should return a specific extrinsic by blockNumber-index format', async () => {
      // First get a list of extrinsics to get a valid extrinsic
      const extrinsicsResponse = await request(app)
        .get('/api/extrinsics?limit=1')
        .expect(200);

      if (extrinsicsResponse.body.data.extrinsics.length > 0) {
        const extrinsic = extrinsicsResponse.body.data.extrinsics[0];
        const extrinsicId = `${extrinsic.blockNumber}-${extrinsic.extrinsicIndex}`;

        const response = await request(app)
          .get(`/api/extrinsics/${extrinsicId}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            blockNumber: extrinsic.blockNumber,
            extrinsicIndex: extrinsic.extrinsicIndex,
            hash: expect.any(String),
            module: expect.any(String),
            call: expect.any(String),
            success: expect.any(Boolean),
          },
          meta: {
            source: 'database',
          },
        });
      }
    });

    it('should return 400 for invalid extrinsic ID format', async () => {
      const response = await request(app)
        .get('/api/extrinsics/invalid-format')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Invalid extrinsic ID format. Expected: blockNumber-index',
        },
      });
    });

    it('should return 400 for non-numeric block number or index', async () => {
      const response = await request(app)
        .get('/api/extrinsics/abc-def')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Invalid extrinsic ID format. Block number and index must be numbers.',
        },
      });
    });

    it('should return 404 for non-existent extrinsic', async () => {
      const response = await request(app)
        .get('/api/extrinsics/999999999-999')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Extrinsic not found',
        },
      });
    });

    it('should handle valid block number but invalid index', async () => {
      // Get a valid block number first
      const blocksResponse = await request(app)
        .get('/api/blocks?limit=1')
        .expect(200);

      if (blocksResponse.body.data.blocks.length > 0) {
        const blockNumber = blocksResponse.body.data.blocks[0].number;
        
        const response = await request(app)
          .get(`/api/extrinsics/${blockNumber}-999`)
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Extrinsic not found',
          },
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error by temporarily breaking the service
      const extrinsicService = serviceFactory.get('extrinsicService') as any;
      const originalGetExtrinsics = extrinsicService.getExtrinsics;
      extrinsicService.getExtrinsics = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/extrinsics')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch extrinsics',
        },
      });

      // Restore original method
      extrinsicService.getExtrinsics = originalGetExtrinsics;
    });

    it('should handle service errors for specific extrinsic', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error
      const extrinsicService = serviceFactory.get('extrinsicService') as any;
      const originalGetExtrinsicsForBlock = extrinsicService.getExtrinsicsForBlock;
      extrinsicService.getExtrinsicsForBlock = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/extrinsics/1000000-0')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch extrinsic',
        },
      });

      // Restore original method
      extrinsicService.getExtrinsicsForBlock = originalGetExtrinsicsForBlock;
    });
  });

  describe('Response Format', () => {
    it('should return responses in camelCase format', async () => {
      const response = await request(app)
        .get('/api/extrinsics?limit=1')
        .expect(200);

      if (response.body.data.extrinsics.length > 0) {
        const extrinsic = response.body.data.extrinsics[0];
        
        // Check that snake_case fields are converted to camelCase
        expect(extrinsic).toHaveProperty('blockNumber');
        expect(extrinsic).toHaveProperty('extrinsicIndex');
        expect(extrinsic).not.toHaveProperty('block_number');
        expect(extrinsic).not.toHaveProperty('extrinsic_index');
      }
    });

    it('should include proper cache headers', async () => {
      const response = await request(app)
        .get('/api/extrinsics')
        .expect(200);

      // Check that caching middleware is working
      expect(response.headers).toHaveProperty('cache-control');
    });
  });

  describe('Data Integrity', () => {
    it('should return consistent extrinsic data between list and detail views', async () => {
      // Get an extrinsic from the list
      const listResponse = await request(app)
        .get('/api/extrinsics?limit=1')
        .expect(200);

      if (listResponse.body.data.extrinsics.length > 0) {
        const listExtrinsic = listResponse.body.data.extrinsics[0];
        const extrinsicId = `${listExtrinsic.blockNumber}-${listExtrinsic.extrinsicIndex}`;

        // Get the same extrinsic from the detail endpoint
        const detailResponse = await request(app)
          .get(`/api/extrinsics/${extrinsicId}`)
          .expect(200);

        const detailExtrinsic = detailResponse.body.data;

        // Compare key fields
        expect(detailExtrinsic.hash).toBe(listExtrinsic.hash);
        expect(detailExtrinsic.blockNumber).toBe(listExtrinsic.blockNumber);
        expect(detailExtrinsic.extrinsicIndex).toBe(listExtrinsic.extrinsicIndex);
        expect(detailExtrinsic.module).toBe(listExtrinsic.module);
        expect(detailExtrinsic.call).toBe(listExtrinsic.call);
        expect(detailExtrinsic.success).toBe(listExtrinsic.success);
      }
    });
  });
}); 