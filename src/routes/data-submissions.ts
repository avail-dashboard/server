import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import { formatPaginatedResponse, formatErrorResponse, formatSingleResponse } from '../utils/responseFormatter';
import { serviceFactory } from '../services';
import { IDataSubmissionService, DataSubmissionFilterOptions } from '../services/domain/dataSubmission';

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

      const dataSubmissionService = serviceFactory.get<IDataSubmissionService>('dataSubmissionApiService');
      const filters: DataSubmissionFilterOptions = { appId: undefined, submitter: undefined, success: undefined };
      const result = await dataSubmissionService.getDataSubmissions(
        filters,
        { page, limit, sortBy: sortBy as 'timestamp' | 'dataSize' | 'blockNumber', sortOrder: sortOrder as 'asc' | 'desc' },
      );

      const response = formatPaginatedResponse(result, {
        source: 'database',
        page: page,
        limit: limit,
        total: result.pagination.total_count,
      });

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmissions' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch data submissions', 'INTERNAL_SERVER_ERROR'));
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
      const dataSubmissionService = serviceFactory.get<IDataSubmissionService>('dataSubmissionApiService');
      const stats = await dataSubmissionService.getDataSubmissionStatistics();

      res.json(formatSingleResponse(stats));
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getStats' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch data submission statistics', 'INTERNAL_SERVER_ERROR'));
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
      const dataSubmissionService = serviceFactory.get<IDataSubmissionService>('dataSubmissionApiService');
      const result = await dataSubmissionService.getDataSubmissionsByApp(parseInt(appId, 10));
      const submissions = result.data;

      res.json(formatSingleResponse({
        dataSubmissions: submissions,
        totalCount: submissions.length,
        appId: parseInt(appId, 10),
      }, {
        source: 'database',
        total: submissions.length,
        app_id: appId,
      }));
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmissionsForRollup' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch data submissions for rollup', 'INTERNAL_SERVER_ERROR'));
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
        return res.status(400).json(formatErrorResponse('Invalid submission ID format. Expected: blockNumber-extrinsicIndex', 'INVALID_PARAMETERS', 400));
      }

      const blockNumber = parseInt(parts[0], 10);
      const extrinsicIndex = parseInt(parts[1], 10);

      if (isNaN(blockNumber) || isNaN(extrinsicIndex)) {
        return res.status(400).json(formatErrorResponse('Invalid submission ID format. Block number and extrinsic index must be numbers.', 'INVALID_PARAMETERS', 400));
      }

      const dataSubmissionService = serviceFactory.get<IDataSubmissionService>('dataSubmissionApiService');
      const blockResult = await dataSubmissionService.getDataSubmissionsByBlock(blockNumber);
      const submission = blockResult.data.find((sub: any) => sub.extrinsicIndex === extrinsicIndex);

      if (!submission) {
        return res.status(404).json(formatErrorResponse('Data submission not found', 'NOT_FOUND', 404));
      }

      res.json(formatSingleResponse(submission));
    } catch (error) {
      logError(error as Error, { component: 'data-submissions-route', action: 'getDataSubmission' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch data submission', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

export default router; 