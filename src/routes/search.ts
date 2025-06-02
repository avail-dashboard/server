import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  description: string;
  url: string;
}

const router = Router();

/**
 * @route GET /api/search
 * @description Universal search for blocks, extrinsics, accounts
 * @access Public
 */
router.get('/', 
  cacheMiddleware(60), // 1 minute cache
  async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Search query is required',
          },
        });
      }

      const searchResults: SearchResult[] = [];

      // Search logic based on query type
      if (/^\d+$/.test(query)) {
        // Numeric query - search for block by number
        try {
          const block = await blockchainService.getBlockByNumber(BigInt(query));
          if (block) {
            searchResults.push({
              type: 'block',
              id: query,
              title: `Block #${query}`,
              description: `Block number ${query}`,
              url: `/blocks/${query}`,
            });
          }
        } catch {
          // Block not found, continue search
        }
      } else if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
        // Hash query - could be block or extrinsic
        try {
          const block = await blockchainService.getBlockByHash(query);
          if (block) {
            searchResults.push({
              type: 'block',
              id: query,
              title: `Block ${query.substring(0, 10)}...`,
              description: `Block hash ${query}`,
              url: `/blocks/${query}`,
            });
          }
        } catch {
          // Block not found, try extrinsic
          try {
            const extrinsic = await blockchainService.getExtrinsicByHash(query);
            if (extrinsic) {
              searchResults.push({
                type: 'extrinsic',
                id: query,
                title: `Extrinsic ${query.substring(0, 10)}...`,
                description: `Extrinsic hash ${query}`,
                url: `/extrinsics/${query}`,
              });
            }
          } catch {
            // Extrinsic not found
          }
        }
      } else if (query.length >= 47) {
        // Address query
        try {
          const account = await blockchainService.getAccountDetails(query);
          if (account) {
            searchResults.push({
              type: 'account',
              id: query,
              title: `Account ${query.substring(0, 10)}...`,
              description: `Account address ${query}`,
              url: `/accounts/${query}`,
            });
          }
        } catch {
          // Account not found
        }
      }

      // Transform search results using the keysToCamelCase utility
      const transformedResults = searchResults.map(result => keysToCamelCase(result));

      const response: APIResponse = {
        success: true,
        data: transformedResults,
        meta: {
          total: transformedResults.length,
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
  },
);

export default router; 