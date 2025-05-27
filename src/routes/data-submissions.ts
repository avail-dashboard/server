import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination } from '../middleware';
import blockchainService from '../services/blockchain';

const router = Router();

// GET /api/v1/data-submissions - Get data submissions
router.get('/', 
  pagination,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const appId = req.query.appId ? parseInt(req.query.appId as string) : undefined;
      const submitter = req.query.submitter as string;
      const orderBy = (req.query.orderBy as string) || 'timestamp';
      const order = (req.query.order as string) || 'desc';

      const submissionsResult = await blockchainService.getDataSubmissions({
        page,
        limit,
        appId,
        submitter,
        orderBy: orderBy as 'timestamp' | 'size' | 'appId',
        order: order as 'asc' | 'desc',
      });

      // Transform data for API response
      const transformedSubmissions = submissionsResult.submissions.map(submission => ({
        extrinsicId: submission.extrinsicId,
        blockNumber: Number(submission.blockNumber),
        extrinsicIndex: submission.extrinsicIndex,
        appId: submission.appId,
        size: submission.size,
        dataHash: submission.dataHash,
        submitter: submission.submitter,
        timestamp: Number(submission.timestamp),
        success: submission.success,
      }));

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
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmissions' });
      
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

// GET /api/v1/data-submissions/stats - Get data submission statistics
router.get('/stats', 
  async (req: Request, res: Response) => {
    try {
      const stats = await blockchainService.getDataSubmissionStats();

      const response: APIResponse = {
        success: true,
        data: stats,
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmissionStats' });
      
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