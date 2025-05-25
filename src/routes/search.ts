import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { searchRateLimit } from '../middleware';

const router = Router();

// GET /api/v1/search - Universal search
router.get('/', 
  searchRateLimit,
  async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Search query is required',
          },
        });
      }

      // Mock search results based on query pattern
      const searchResults = [];

      // Check if query looks like a block number
      if (/^\d+$/.test(query)) {
        searchResults.push({
          type: 'block',
          id: query,
          title: `Block #${query}`,
          description: `Block number ${query}`,
          url: `/blocks/${query}`,
        });
      }

      // Check if query looks like a hash
      if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
        searchResults.push({
          type: 'block',
          id: query,
          title: `Block ${query.substring(0, 20)}...`,
          description: `Block with hash ${query}`,
          url: `/blocks/${query}`,
        });
        
        searchResults.push({
          type: 'extrinsic',
          id: query,
          title: `Extrinsic ${query.substring(0, 20)}...`,
          description: `Extrinsic with hash ${query}`,
          url: `/extrinsics/${query}`,
        });
      }

      // Check if query looks like an account address
      if (/^5[a-zA-Z0-9]{47}$/.test(query)) {
        searchResults.push({
          type: 'account',
          id: query,
          title: `Account ${query.substring(0, 20)}...`,
          description: `Account address ${query}`,
          url: `/accounts/${query}`,
        });
      }

      // If no specific matches, add some generic results
      if (searchResults.length === 0) {
        searchResults.push({
          type: 'info',
          id: 'no-results',
          title: 'No results found',
          description: `No results found for "${query}"`,
          url: null,
        });
      }

      const response: APIResponse = {
        success: true,
        data: searchResults,
        meta: {
          total: searchResults.length,
          source: 'database',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'search-route', action: 'search' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Search failed',
        },
      });
    }
  }
);

export default router; 