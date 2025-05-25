import { Router, Request, Response } from 'express';
import { db } from '../utils/database';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';

const router = Router();

// GET /api/v1/blocks - Get latest blocks
router.get('/', 
  pagination, 
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      // For now, return mock data since we don't have real blockchain data yet
      const mockBlocks = Array.from({ length: limit }, (_, i) => ({
        number: 1000000 - (page - 1) * limit - i,
        hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        parent_hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        timestamp: Date.now() - (i * 12000), // 12 seconds per block
        extrinsics: Math.floor(Math.random() * 20) + 1,
        time: new Date(Date.now() - (i * 12000)).toISOString(),
      }));

      const response: APIResponse = {
        success: true,
        data: mockBlocks,
        meta: {
          page,
          limit,
          total: 1000000, // Mock total
          source: 'database',
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
  }
);

// GET /api/v1/blocks/:numberOrHash - Get specific block
router.get('/:numberOrHash', 
  cacheMiddleware(config.cache.ttl.blockByNumber),
  async (req: Request, res: Response) => {
    try {
      const { numberOrHash } = req.params;

      // Mock block data
      const mockBlock = {
        number: parseInt(numberOrHash) || 999999,
        hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        parent_hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        state_root: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        timestamp: Date.now(),
        extrinsics_count: Math.floor(Math.random() * 20) + 1,
        time: new Date().toISOString(),
        extrinsics: Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
          module: 'system',
          call: 'transfer',
          success: Math.random() > 0.1,
        })),
      };

      const response: APIResponse = {
        success: true,
        data: mockBlock,
        meta: {
          source: 'database',
        },
      };

      res.json(response);
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
  }
);

export default router; 