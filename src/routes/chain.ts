import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';

const router = Router();

// GET /api/v1/chain/stats - Get chain statistics
router.get('/stats', 
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      // Mock chain data for development
      const mockChainData = {
        finalizedBlocks: 999999 + Math.floor(Math.random() * 100),
        totalAccounts: 450000 + Math.floor(Math.random() * 1000),
        totalExtrinsics: 5500000 + Math.floor(Math.random() * 10000),
        tokenPrice: 0.0525 + (Math.random() - 0.5) * 0.01, // Mock price around $0.0525
        priceChange: (Math.random() - 0.5) * 20, // ±10% change
        marketCap: 25000000 + Math.floor(Math.random() * 1000000),
        totalSupply: 1000000000, // 1B AVAIL
        circulatingSupply: 850000000, // 850M AVAIL
        stakingRatio: 65.5 + (Math.random() - 0.5) * 10,
        inflation: 7.2 + (Math.random() - 0.5) * 2,
        activeValidators: 50 + Math.floor(Math.random() * 10),
        blockTime: 20.1 + (Math.random() - 0.5) * 2, // seconds
        lastBlockTimestamp: Date.now(),
      };

      const response: APIResponse = {
        success: true,
        data: mockChainData,
        meta: {
          source: 'database',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'chain-route', action: 'getStats' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch chain statistics',
        },
      });
    }
  },
);

export default router; 