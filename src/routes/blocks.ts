import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

// GET /api/blocks - Get latest blocks
router.get('/', 
  pagination, 
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      throw new Error('Missing service');
      const response: APIResponse = {
        success: true,
        data: [],
        meta: {
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'blocks-route', action: 'getBlocks' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch blocks',
        },
      });
    }
  },
);

// GET /api/blocks/:numberOrHash - Get specific block
router.get('/:numberOrHash', 
  cacheMiddleware(config.cache.ttl.blockByNumber),
  async (req: Request, res: Response) => {
    try {
      throw new Error('Missing service');
    } catch (error) {
      logError(error as Error, { component: 'blocks-route', action: 'getBlock' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch block',
        },
      });
    }
  },
);

export default router; 