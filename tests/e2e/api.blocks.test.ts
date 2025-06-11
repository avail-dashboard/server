import request from 'supertest';
import express from 'express';
import server from '../../src/index';

describe('Blocks API E2E Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Get the Express app from the server instance
    app = server.getApp();
    // Note: Service initialization is handled by Jest global setup
  });

  // Note: Service cleanup is handled by Jest global teardown

  describe('GET /api/blocks', () => {
    it('should return paginated list of blocks with default parameters', async () => {
      const response = await request(app)
        .get('/api/blocks')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          blocks: expect.any(Array),
          totalCount: expect.any(Number),
        },
        meta: {
          source: 'database',
          page: 1,
          limit: 50,
          total: expect.any(Number),
        },
      });

      // Check that blocks are in camelCase format
      if (response.body.data.blocks.length > 0) {
        const block = response.body.data.blocks[0];
        expect(block).toHaveProperty('number');
        expect(block).toHaveProperty('hash');
        expect(block).toHaveProperty('parentHash');
        expect(block).toHaveProperty('stateRoot');
        expect(block).toHaveProperty('timestamp');
      }
    });

    it('should handle pagination parameters correctly', async () => {
      const response = await request(app)
        .get('/api/blocks?page=2&limit=10')
        .expect(200);

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 10,
      });

      expect(response.body.data.blocks.length).toBeLessThanOrEqual(10);
    });

    it('should handle sorting parameters', async () => {
      const response = await request(app)
        .get('/api/blocks?sortBy=number&sortOrder=asc')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // If we have multiple blocks, check they're sorted correctly
      const blocks = response.body.data.blocks;
      if (blocks.length > 1) {
        for (let i = 1; i < blocks.length; i++) {
          expect(blocks[i].number).toBeGreaterThanOrEqual(blocks[i - 1].number);
        }
      }
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/api/blocks?limit=200')
        .expect(200);

      expect(response.body.meta.limit).toBe(100);
      expect(response.body.data.blocks.length).toBeLessThanOrEqual(100);
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/blocks?page=invalid&limit=invalid')
        .expect(200);

      // Should default to page 1, limit 50
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50);
    });
  });

  describe('GET /api/blocks/:numberOrHash', () => {
    it('should return a specific block by number', async () => {
      // First get a list of blocks to get a valid block number
      const blocksResponse = await request(app)
        .get('/api/blocks?limit=1')
        .expect(200);

      if (blocksResponse.body.data.blocks.length > 0) {
        const blockNumber = blocksResponse.body.data.blocks[0].number;

        const response = await request(app)
          .get(`/api/blocks/${blockNumber}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            number: blockNumber,
            hash: expect.any(String),
            parentHash: expect.any(String),
            stateRoot: expect.any(String),
            timestamp: expect.any(String),
          },
          meta: {
            source: 'database',
          },
        });
      }
    });

    it('should return a specific block by hash', async () => {
      // First get a list of blocks to get a valid block hash
      const blocksResponse = await request(app)
        .get('/api/blocks?limit=1')
        .expect(200);

      if (blocksResponse.body.data.blocks.length > 0) {
        const blockHash = blocksResponse.body.data.blocks[0].hash;

        const response = await request(app)
          .get(`/api/blocks/${blockHash}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            hash: blockHash,
            number: expect.any(Number),
            parentHash: expect.any(String),
            stateRoot: expect.any(String),
            timestamp: expect.any(String),
          },
          meta: {
            source: 'database',
          },
        });
      }
    });

    it('should return 404 for non-existent block number', async () => {
      const response = await request(app)
        .get('/api/blocks/999999999')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Block not found',
        },
      });
    });

    it('should return 404 for non-existent block hash', async () => {
      const response = await request(app)
        .get('/api/blocks/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Block not found',
        },
      });
    });

    it('should handle invalid block identifiers gracefully', async () => {
      const response = await request(app)
        .get('/api/blocks/invalid-block-id')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error by temporarily breaking the service
      const blockService = serviceFactory.get('blockService') as any;
      const originalGetBlocks = blockService.getBlocks;
      blockService.getBlocks = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/blocks')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch blocks',
        },
      });

      // Restore original method
      blockService.getBlocks = originalGetBlocks;
    });
  });

  describe('Response Format', () => {
    it('should return responses in camelCase format', async () => {
      const response = await request(app)
        .get('/api/blocks?limit=1')
        .expect(200);

      if (response.body.data.blocks.length > 0) {
        const block = response.body.data.blocks[0];
        
        // Check that snake_case fields are converted to camelCase
        expect(block).toHaveProperty('parentHash');
        expect(block).toHaveProperty('stateRoot');
        expect(block).toHaveProperty('extrinsicsRoot');
        expect(block).not.toHaveProperty('parent_hash');
        expect(block).not.toHaveProperty('state_root');
        expect(block).not.toHaveProperty('extrinsics_root');
      }
    });

    it('should include proper cache headers', async () => {
      const response = await request(app)
        .get('/api/blocks')
        .expect(200);

      // Check that caching middleware is working
      expect(response.headers).toHaveProperty('cache-control');
    });
  });
}); 