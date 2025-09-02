import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import { formatErrorResponse } from '../utils/responseFormatter';
import { simpleServices } from '../services/simple-services';

const router = Router();

// GET /api/chain/info - Get chain information
router.get('/info', 
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const chainService = simpleServices.getServices().chain;
      const chainInfo = await chainService.getChainInfo();
      
      res.json({
        success: true,
        data: chainInfo,
      });
    } catch (error) {
      logError(error as Error, { component: 'chain-route', action: 'getChainInfo' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch chain information', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/chain/constants - Get chain constants
router.get('/constants', 
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const chainService = simpleServices.getServices().chain;
      const constants = await chainService.getConstants();
      
      res.json({
        success: true,
        data: constants,
      });
    } catch (error) {
      logError(error as Error, { component: 'chain-route', action: 'getConstants' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch chain constants', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

export default router; 