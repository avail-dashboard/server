import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';

const router = Router();

// GET /api/validators - Get validators list
router.get('/', 
  cacheMiddleware(config.cache.ttl.validators),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Get validators from blockchain service
      const validators = await blockchainService.getValidators();

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedValidators = validators.slice(startIndex, endIndex);

      const response: APIResponse = {
        success: true,
        data: {
          validators: paginatedValidators,
          total_count: validators.length,
          active_count: validators.filter(v => v.active).length,
          waiting_count: validators.filter(v => !v.active).length,
          slashed_count: 0, // TODO: Implement slashing detection
        },
        meta: {
          page,
          limit,
          total: validators.length,
          source: 'rpc',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'validators-route', action: 'list' });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch validators',
        },
      });
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
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ADDRESS',
            message: 'Invalid validator address format',
          },
        });
      }

      // Get all validators and find the specific one
      const validators = await blockchainService.getValidators();
      const validator = validators.find(v => v.address === address);

      if (!validator) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'VALIDATOR_NOT_FOUND',
            message: `Validator with address ${address} not found`,
          },
        });
      }

      const response: APIResponse = {
        success: true,
        data: {
          ...validator,
          nominations: [], // TODO: Implement nominations fetching
          recent_blocks: [], // TODO: Implement recent blocks fetching
          slashing_history: [], // TODO: Implement slashing history
          performance_metrics: {
            blocks_authored: 0, // TODO: Calculate from blockchain data
            uptime_percentage: 0, // TODO: Calculate uptime
            average_block_time: 0, // TODO: Calculate average block time
          },
        },
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
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
      const [chainStats, validators] = await Promise.all([
        blockchainService.getChainStats(),
        blockchainService.getValidators(),
      ]);

      const activeValidators = validators.filter(v => v.active);
      
      // Calculate total staked from validators' totalStake (bigint)
      const totalStaked = activeValidators.reduce((sum, v) => {
        const stakeAmount = v.totalStake || BigInt(0);
        return sum + stakeAmount;
      }, BigInt(0));
      
      // Calculate average commission from validators' commission (string percentage)
      const averageCommission = activeValidators.length > 0 
        ? activeValidators.reduce((sum, v) => {
          const commission = parseFloat(v.commission || '0');
          return sum + (isNaN(commission) ? 0 : commission);
        }, 0) / activeValidators.length
        : 0;

      const stakingOverview = {
        total_staked: totalStaked.toString(),
        active_validators: activeValidators.length,
        total_nominators: chainStats.nominators,
        current_era: 0, // TODO: Get current era from RPC
        inflation_rate: chainStats.inflation,
        average_commission: averageCommission,
        nomination_pools: [], // TODO: Implement nomination pools
      };

      const response: APIResponse = {
        success: true,
        data: stakingOverview,
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
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
      const response: APIResponse = {
        success: true,
        data: {
          data: [],
          pagination: {
            page: 1,
            limit: 50,
            total_count: 0,
            total_pages: 0,
            has_next: false,
            has_prev: false,
          },
        },
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
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