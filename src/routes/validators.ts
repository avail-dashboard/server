import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import { formatSingleResponse, formatErrorResponse } from '../utils/responseFormatter';
import { simpleServices } from '../services/simple-services';

const router = Router();

// GET /api/validators - Get validators list
router.get('/', 
  cacheMiddleware(config.cache.ttl.validators),
  async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '20', status, minStake, maxStake, hasIdentity } = req.query;

      const validatorService = simpleServices.getServices().validators;

      // Parse pagination
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

      // Build filters
      const filters: any = {};
      if (status) {
        filters.status = status;
      }
      if (minStake) {
        filters.minTotalBonded = BigInt(minStake as string);
      }
      if (maxStake) {
        filters.maxTotalBonded = BigInt(maxStake as string);
      }
      if (hasIdentity !== undefined) {
        filters.hasIdentity = hasIdentity === 'true';
      }

      const validatorList = await validatorService.getValidators(filters, { page: pageNum, limit: limitNum });

      res.json(formatSingleResponse(validatorList, {
        source: 'database',
        pagination: validatorList.pagination,
      }));
    } catch (error) {
      logError(error as Error, { component: 'validators-route', action: 'list' });
      res.status(500).json(formatErrorResponse('Failed to fetch validators', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/validators/:address - Get specific validator details
router.get('/:address',
  cacheMiddleware(config.cache.ttl.validators),
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      // Validate address format
      if (!address || address.length < 40) {
        res.status(400).json(formatErrorResponse('Invalid validator address format', 'INVALID_ADDRESS', 400));
        return;
      }

      const validatorService = simpleServices.getServices().validators;

      const validatorDetails = await validatorService.getValidator(address);

      res.json(formatSingleResponse(validatorDetails, {
        source: 'database',
        note: 'Validator details with enhanced metadata',
      }));
    } catch (error) {
      logError(error as Error, { component: 'validators-route', action: 'getDetails', address: req.params.address });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch validator details',
        },
      });
    }
  },
);

// GET /api/validators/staking/overview - Get staking overview
router.get('/staking/overview',
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const validatorService = simpleServices.getServices().validators;

      const stakingOverview = await validatorService.getStakingOverview();

      res.json(formatSingleResponse(stakingOverview, {
        source: 'blockchain+database',
        note: 'Staking overview with real-time chain data',
      }));
    } catch (error) {
      logError(error as Error, { component: 'validators-route', action: 'getStakingOverview' });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch staking overview',
        },
      });
    }
  },
);

// GET /api/validators/nomination-pools - Get nomination pools (placeholder)
router.get('/nomination-pools',
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      // TODO: Implement nomination pools fetching
      const poolsData = {
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };

      res.json(formatSingleResponse(poolsData, {
        source: 'rpc',
      }));
    } catch (error) {
      logError(error as Error, { component: 'validators-route', action: 'getNominationPools' });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch nomination pools',
        },
      });
    }
  },
);

export default router; 