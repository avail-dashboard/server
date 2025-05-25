import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';

const router = Router();

// GET /api/v1/extrinsics - Get extrinsics
router.get('/', 
  pagination,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const blockNumber = req.query.block ? parseInt(req.query.block as string) : undefined;

      // Mock extrinsics data
      const mockExtrinsics = Array.from({ length: limit }, (_, i) => ({
        id: (page - 1) * limit + i + 1,
        hash: `0x${Math.random().toString(16).substring(2).padStart(64, '0')}`,
        block_number: blockNumber || (999999 - Math.floor(Math.random() * 1000)),
        extrinsic_index: i,
        module: ['system', 'balances', 'staking', 'utility'][Math.floor(Math.random() * 4)],
        call: ['transfer', 'transferKeepAlive', 'bond', 'batch'][Math.floor(Math.random() * 4)],
        success: Math.random() > 0.1,
        timestamp: Date.now() - (i * 6000), // 6 seconds between extrinsics
        signer: `5${Math.random().toString(36).substring(2, 48)}`,
        fee: Math.floor(Math.random() * 1000000000000), // Random fee as number instead of BigInt
        time: new Date(Date.now() - (i * 6000)).toISOString(),
      }));

      const response: APIResponse = {
        success: true,
        data: mockExtrinsics,
        meta: {
          page,
          limit,
          total: blockNumber ? limit : 5500000, // If specific block, return count; otherwise mock total
          source: 'database',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'extrinsics-route', action: 'getExtrinsics' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch extrinsics',
        },
      });
    }
  }
);

export default router; 