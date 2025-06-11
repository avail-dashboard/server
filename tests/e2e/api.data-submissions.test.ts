import request from 'supertest';
import express from 'express';
import server from '../../src/index';

describe('Data Submissions API E2E Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Get the Express app from the server instance
    app = server.getApp();
    // Note: Service initialization is handled by Jest global setup
  });

  // Note: Service cleanup is handled by Jest global teardown

  describe('GET /api/data-submissions', () => {
    it('should return paginated list of data submissions with default parameters', async () => {
      const response = await request(app)
        .get('/api/data-submissions')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          submissions: expect.any(Array),
          totalCount: expect.any(Number),
        },
        meta: {
          source: 'database',
          page: 1,
          limit: 50,
          total: expect.any(Number),
        },
      });

      // Check that submissions are in camelCase format
      if (response.body.data.submissions.length > 0) {
        const submission = response.body.data.submissions[0];
        expect(submission).toHaveProperty('blockNumber');
        expect(submission).toHaveProperty('extrinsicIndex');
        expect(submission).toHaveProperty('appId');
        expect(submission).toHaveProperty('dataRoot');
      }
    });

    it('should handle pagination parameters correctly', async () => {
      const response = await request(app)
        .get('/api/data-submissions?page=2&limit=10')
        .expect(200);

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 10,
      });

      expect(response.body.data.submissions.length).toBeLessThanOrEqual(10);
    });

    it('should handle sorting by timestamp', async () => {
      const response = await request(app)
        .get('/api/data-submissions?sortBy=timestamp&sortOrder=desc')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Check that submissions are sorted by timestamp descending
      const submissions = response.body.data.submissions;
      if (submissions.length > 1) {
        for (let i = 1; i < submissions.length; i++) {
          const currentTime = new Date(submissions[i].timestamp).getTime();
          const previousTime = new Date(submissions[i - 1].timestamp).getTime();
          expect(currentTime).toBeLessThanOrEqual(previousTime);
        }
      }
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app)
        .get('/api/data-submissions?limit=200')
        .expect(200);

      expect(response.body.meta.limit).toBe(100);
      expect(response.body.data.submissions.length).toBeLessThanOrEqual(100);
    });

    it('should handle filtering by app_id', async () => {
      // First get submissions to find a valid app_id
      const allResponse = await request(app)
        .get('/api/data-submissions?limit=50')
        .expect(200);

      if (allResponse.body.data.submissions.length > 0) {
        const appId = allResponse.body.data.submissions[0].appId;

        const response = await request(app)
          .get(`/api/data-submissions?filters[app_id]=${appId}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        
        // All returned submissions should have the same app_id
        response.body.data.submissions.forEach((submission: any) => {
          expect(submission.appId).toBe(appId);
        });
      }
    });

    it('should handle multiple filters', async () => {
      const response = await request(app)
        .get('/api/data-submissions?filters[app_id]=1&filters[block_number]=100')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('submissions');
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/data-submissions?page=invalid&limit=invalid')
        .expect(200);

      // Should default to page 1, limit 50
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50);
    });
  });

  describe('GET /api/data-submissions/:submissionId', () => {
    it('should return a specific data submission by blockNumber-extrinsicIndex', async () => {
      // First get a list of submissions to get a valid submission ID
      const submissionsResponse = await request(app)
        .get('/api/data-submissions?limit=1')
        .expect(200);

      if (submissionsResponse.body.data.submissions.length > 0) {
        const submission = submissionsResponse.body.data.submissions[0];
        const submissionId = `${submission.blockNumber}-${submission.extrinsicIndex}`;

        const response = await request(app)
          .get(`/api/data-submissions/${submissionId}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            blockNumber: submission.blockNumber,
            extrinsicIndex: submission.extrinsicIndex,
            appId: expect.any(Number),
            dataRoot: expect.any(String),
            timestamp: expect.any(String),
          },
          meta: {
            source: 'database',
          },
        });
      }
    });

    it('should validate submission ID format (blockNumber-extrinsicIndex)', async () => {
      const response = await request(app)
        .get('/api/data-submissions/invalid-format')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Invalid submission ID format. Expected: blockNumber-extrinsicIndex',
        },
      });
    });

    it('should return 404 for non-existent submission', async () => {
      const response = await request(app)
        .get('/api/data-submissions/999999999-999')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Data submission not found',
        },
      });
    });

    it('should handle invalid block number or extrinsic index', async () => {
      const response = await request(app)
        .get('/api/data-submissions/invalid-invalid')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Invalid submission ID format. Expected: blockNumber-extrinsicIndex',
        },
      });
    });
  });

  describe('GET /api/data-submissions/rollup/:appId', () => {
    it('should return submissions for a specific rollup (app_id)', async () => {
      // First get submissions to find a valid app_id
      const submissionsResponse = await request(app)
        .get('/api/data-submissions?limit=10')
        .expect(200);

      if (submissionsResponse.body.data.submissions.length > 0) {
        const appId = submissionsResponse.body.data.submissions[0].appId;

        const response = await request(app)
          .get(`/api/data-submissions/rollup/${appId}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: expect.any(Array),
          meta: {
            source: 'database',
          },
        });

        // All returned submissions should have the same app_id
        response.body.data.forEach((submission: any) => {
          expect(submission.appId).toBe(appId);
        });
      }
    });

    it('should return empty array for non-existent app_id', async () => {
      const response = await request(app)
        .get('/api/data-submissions/rollup/999999999')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: [],
        meta: {
          source: 'database',
        },
      });
    });

    it('should handle invalid app_id format', async () => {
      const response = await request(app)
        .get('/api/data-submissions/rollup/invalid')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Invalid app ID format',
        },
      });
    });

    it('should return submissions sorted by timestamp descending', async () => {
      // Get submissions to find a valid app_id with multiple submissions
      const submissionsResponse = await request(app)
        .get('/api/data-submissions?limit=50')
        .expect(200);

      if (submissionsResponse.body.data.submissions.length > 0) {
        const appId = submissionsResponse.body.data.submissions[0].appId;

        const response = await request(app)
          .get(`/api/data-submissions/rollup/${appId}`)
          .expect(200);

        const submissions = response.body.data;
        if (submissions.length > 1) {
          // Check that submissions are sorted by timestamp descending
          for (let i = 1; i < submissions.length; i++) {
            const currentTime = new Date(submissions[i].timestamp).getTime();
            const previousTime = new Date(submissions[i - 1].timestamp).getTime();
            expect(currentTime).toBeLessThanOrEqual(previousTime);
          }
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully for list endpoint', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error by temporarily breaking the service
      const dataAvailabilityService = serviceFactory.get('dataAvailabilityService') as any;
      const originalGetDataSubmissions = dataAvailabilityService.getDataSubmissions;
      dataAvailabilityService.getDataSubmissions = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/data-submissions')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submissions',
        },
      });

      // Restore original method
      dataAvailabilityService.getDataSubmissions = originalGetDataSubmissions;
    });

    it('should handle server errors gracefully for single submission endpoint', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error
      const dataAvailabilityService = serviceFactory.get('dataAvailabilityService') as any;
      const originalGetDataSubmissions = dataAvailabilityService.getDataSubmissions;
      dataAvailabilityService.getDataSubmissions = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/data-submissions/1000000-0')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submission',
        },
      });

      // Restore original method
      dataAvailabilityService.getDataSubmissions = originalGetDataSubmissions;
    });

    it('should handle server errors gracefully for rollup endpoint', async () => {
      // Import serviceFactory to mock services
      const { serviceFactory } = await import('../../src/services');
      
      // Mock a service error
      const dataAvailabilityService = serviceFactory.get('dataAvailabilityService') as any;
      const originalGetDataSubmissions = dataAvailabilityService.getDataSubmissions;
      dataAvailabilityService.getDataSubmissions = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/data-submissions/rollup/1')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch rollup data submissions',
        },
      });

      // Restore original method
      dataAvailabilityService.getDataSubmissions = originalGetDataSubmissions;
    });
  });

  describe('Response Format', () => {
    it('should return responses in camelCase format', async () => {
      const response = await request(app)
        .get('/api/data-submissions?limit=1')
        .expect(200);

      if (response.body.data.submissions.length > 0) {
        const submission = response.body.data.submissions[0];
        
        // Check that snake_case fields are converted to camelCase
        expect(submission).toHaveProperty('blockNumber');
        expect(submission).toHaveProperty('extrinsicIndex');
        expect(submission).toHaveProperty('appId');
        expect(submission).toHaveProperty('dataRoot');
        expect(submission).not.toHaveProperty('block_number');
        expect(submission).not.toHaveProperty('extrinsic_index');
        expect(submission).not.toHaveProperty('app_id');
        expect(submission).not.toHaveProperty('data_root');
      }
    });

    it('should validate data types in responses', async () => {
      const response = await request(app)
        .get('/api/data-submissions?limit=1')
        .expect(200);

      if (response.body.data.submissions.length > 0) {
        const submission = response.body.data.submissions[0];
        
        expect(typeof submission.blockNumber).toBe('number');
        expect(typeof submission.extrinsicIndex).toBe('number');
        expect(typeof submission.appId).toBe('number');
        expect(typeof submission.dataRoot).toBe('string');
        expect(typeof submission.timestamp).toBe('string');
        
        // Validate timestamp is a valid ISO string
        expect(new Date(submission.timestamp).toISOString()).toBe(submission.timestamp);
      }
    });

    it('should include proper cache headers', async () => {
      const response = await request(app)
        .get('/api/data-submissions')
        .expect(200);

      // Check that caching middleware is working
      expect(response.headers).toHaveProperty('cache-control');
    });
  });
}); 