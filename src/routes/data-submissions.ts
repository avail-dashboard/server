import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination } from '../middleware';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

/**
 * @route GET /api/data-submissions
 * @description Get data submissions with filtering
 * @access Public
 */
router.get('/', 
  pagination,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const appId = req.query.appId ? parseInt(req.query.appId as string) : undefined;
      const submitter = req.query.submitter as string;
      const orderBy = (req.query.orderBy as string) || 'timestamp';
      const order = (req.query.order as 'asc' | 'desc') || 'desc';

      // Fetch data submissions from blockchain service
      const submissionsResult = await blockchainService.getDataSubmissions({
        page,
        limit,
        appId,
        submitter,
        orderBy: orderBy as 'timestamp' | 'size' | 'appId',
        order,
      });

      // Transform submissions using the keysToCamelCase utility
      const transformedSubmissions = submissionsResult.submissions.map((submission) => 
        keysToCamelCase(submission),
      );

      const response: APIResponse = {
        success: true,
        data: transformedSubmissions,
        meta: {
          page,
          limit,
          total: submissionsResult.total,
          source: 'rpc',
        },
      };

      res.json(response);
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
router.get('/stats', 
  async (req: Request, res: Response) => {
    try {
      // Fetch data submission stats
      const stats = await blockchainService.getDataSubmissionStats();

      // Transform stats using the keysToCamelCase utility
      const transformedStats = keysToCamelCase(stats);

      const response: APIResponse = {
        success: true,
        data: transformedStats,
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
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