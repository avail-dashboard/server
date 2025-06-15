import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { cacheMiddleware } from '../middleware';
import { formatSingleResponse, formatErrorResponse } from '../utils/responseFormatter';
import { serviceFactory } from '../services';
import { SearchService } from '../services/domain/search';

const router = Router();

/**
 * @route GET /api/search
 * @description Universal search for blocks, extrinsics, accounts, rollups, data submissions
 * @access Public
 */
router.get('/', 
  cacheMiddleware(60), // 1 minute cache
  async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string;

      if (!query) {
        return res.status(400).json(formatErrorResponse('Search query parameter is required', 'VALIDATION_ERROR', 400));
      }

      // Get search service from factory
      const searchService = serviceFactory.get<SearchService>('searchService');
      
      // Perform search
      const searchResponse = await searchService.search(query);

      res.json(formatSingleResponse(searchResponse, {
        total: searchResponse.total_results,
        source: 'database',
      }));
    } catch (error) {
      logError(error as Error, { component: 'search-route', action: 'search' });
      
      res.status(500).json(formatErrorResponse('Search failed', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

export default router; 