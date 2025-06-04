import { Router, Request, Response } from 'express';
import { APIResponse, DataSubmissionQuery } from '../types';
import { logError } from '../utils/logger';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

/**
 * @route GET /api/data-submissions
 * @description Get data submissions with filtering
 * @access Public
 */
router.get(
  '/',
  pagination,
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      const { page = 1, limit = 10, appId, submitter, orderBy, order } = req.query;
      
      const query: DataSubmissionQuery = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        appId: appId ? parseInt(appId as string) : undefined,
        submitter: submitter as string,
        orderBy: orderBy as 'timestamp' | 'size' | 'appId',
        order: order as 'asc' | 'desc',
      };

      const result = await blockchainService.getDataSubmissions(query);
      
      // Convert BigInts to strings for JSON serialization
      const serializedSubmissions = result.submissions.map(submission => ({
        ...submission,
        blockNumber: submission.blockNumber.toString(),
        timestamp: submission.timestamp.toString(),
      }));

      const response: APIResponse<typeof serializedSubmissions> = {
        success: true,
        data: serializedSubmissions,
        meta: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          source: 'rpc' as const,
        },
      };

      res.json(keysToCamelCase(response));
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getSubmissions' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submissions',
        },
      });
    }
  },
);

/**
 * @route GET /api/data-submissions/stats
 * @description Get data submission statistics
 * @access Public
 */
router.get(
  '/stats',
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const stats = await blockchainService.getDataSubmissionStats();

      const response: APIResponse<typeof stats> = {
        success: true,
        data: stats,
        meta: {
          source: 'rpc' as const,
        },
      };

      res.json(keysToCamelCase(response));
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getStats' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submission statistics',
        },
      });
    }
  },
);

export default router; 