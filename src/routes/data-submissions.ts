import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import { keysToCamelCase } from '../utils/caseConverter';
import { serviceFactory, DataAvailabilityService } from '../services';

const router = Router();

/**
 * @route GET /api/data-submissions
 * @description Get data submissions with filtering
 * @access Public
 */
router.get('/', 
  pagination, 
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const sortBy = (req.query.sort_by as string) || 'block_number';
      const sortOrder = (req.query.sort_order as string) || 'desc';

      const dataAvailabilityService = serviceFactory.get<DataAvailabilityService>('dataAvailabilityService');
      const result = await dataAvailabilityService.getDataSubmissions(
        { page, limit },
        { sort_by: sortBy, sort_order: sortOrder as 'asc' | 'desc' },
      );

      const response: APIResponse = {
        success: true,
        data: {
          dataSubmissions: result.data.map(submission => keysToCamelCase(submission)),
          totalCount: result.pagination.total_count,
        },
        meta: {
          source: 'database',
          page: page,
          limit: limit,
          total: result.pagination.total_count,
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
      const dataAvailabilityService = serviceFactory.get<DataAvailabilityService>('dataAvailabilityService');
      const stats = await dataAvailabilityService.getDataSubmissionStats();

      const response: APIResponse = {
        success: true,
        data: keysToCamelCase(stats),
        meta: {
          source: 'database',
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

/**
 * @route GET /api/data-submissions/rollup/:appId
 * @description Get data submissions for a specific rollup/app
 * @access Public
 */
router.get('/rollup/:appId', 
  pagination,
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const { appId } = req.params;

      // Get data submissions for the specific rollup (returns array, not paginated)
      const dataAvailabilityService = serviceFactory.get<DataAvailabilityService>('dataAvailabilityService');
      const submissions = await dataAvailabilityService.getDataSubmissionsForRollup(parseInt(appId, 10));

      const response: APIResponse = {
        success: true,
        data: {
          dataSubmissions: submissions.map(submission => keysToCamelCase(submission)),
          totalCount: submissions.length,
          appId: parseInt(appId, 10),
        },
        meta: {
          source: 'database',
          total: submissions.length,
          app_id: appId,
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmissionsForRollup' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submissions for rollup',
        },
      });
    }
  },
);

/**
 * @route GET /api/data-submissions/:submissionId
 * @description Get detailed information for a specific data submission
 * @access Public
 */
router.get('/:submissionId', 
  cacheMiddleware(config.cache.ttl.blockByNumber),
  async (req: Request, res: Response) => {
    try {
      const { submissionId } = req.params;

      // Parse submission ID (format: blockNumber-extrinsicIndex)
      const parts = submissionId.split('-');
      if (parts.length !== 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Invalid submission ID format. Expected: blockNumber-extrinsicIndex',
          },
        });
      }

      const blockNumber = parseInt(parts[0], 10);
      const extrinsicIndex = parseInt(parts[1], 10);

      if (isNaN(blockNumber) || isNaN(extrinsicIndex)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Invalid submission ID format. Block number and extrinsic index must be numbers.',
          },
        });
      }

      const dataAvailabilityService = serviceFactory.get<DataAvailabilityService>('dataAvailabilityService');
      const blockSubmissions = await dataAvailabilityService.getDataSubmissionsForBlock(blockNumber);
      const submission = blockSubmissions.find(sub => sub.extrinsicIndex === extrinsicIndex);

      if (!submission) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Data submission not found',
          },
        });
      }

      const response: APIResponse = {
        success: true,
        data: keysToCamelCase(submission),
        meta: {
          source: 'database',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmission' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch data submission',
        },
      });
    }
  },
);

export default router; 