import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { pagination } from '../middleware';

const router = Router();

/**
 * @route GET /api/extrinsics
 * @description Get latest extrinsics with pagination
 * @access Public
 * @note Now uses DirectWS (wss://avail-mainnet.public.blastapi.io/) as primary data source when enabled
 */
router.get('/', 
  pagination,
  async (req: Request, res: Response) => {
    try {
      throw new Error('Missing service');
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
  },
);

// GET /api/extrinsics/:hash - Get specific extrinsic
router.get('/:hash', 
  async (req: Request, res: Response) => {
    try {
      throw new Error('Missing service');
    } catch (error) {
      logError(error as Error, { component: 'extrinsics-route', action: 'getExtrinsic' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch extrinsic',
        },
      });
    }
  },
);

export default router; 