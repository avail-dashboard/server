import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import { keysToCamelCase } from '../utils/caseConverter';
import { serviceFactory, ExtrinsicService } from '../services';

const router = Router();

/**
 * @route GET /api/extrinsics
 * @description Get latest extrinsics with pagination
 * @access Public
 * @note Now uses DirectWS (wss://avail-mainnet.public.blastapi.io/) as primary data source when enabled
 */
router.get('/', 
  pagination,
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const sortBy = (req.query.sort_by as string) || 'block_number';
      const sortOrder = (req.query.sort_order as string) || 'desc';

      const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
      const result = await extrinsicService.getExtrinsics(
        { page, limit },
        { sort_by: sortBy, sort_order: sortOrder as 'asc' | 'desc' },
      );

      const response: APIResponse = {
        success: true,
        data: {
          extrinsics: result.data.map(extrinsic => keysToCamelCase(extrinsic)),
          totalCount: result.pagination.total_count,
        },
        meta: {
          source: 'database',
          page: page,
          limit: limit,
          total: result.pagination.total_count,
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
  },
);

/**
 * GET /api/extrinsics/hash/:hash
 * Get extrinsic by hash
 */
router.get('/hash/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;
    
    const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
    const extrinsic = await extrinsicService.getExtrinsic(hash);

    const response: APIResponse = {
      success: true,
      data: keysToCamelCase(extrinsic),
      meta: {
        source: 'database',
      },
    };

    res.json(response);
  } catch (error) {
    logError(error as Error, { component: 'extrinsics-route', action: 'getExtrinsicByHash' });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch extrinsic',
      },
    });
  }
});

// GET /api/extrinsics/:extrinsicId - Get detailed information for a specific extrinsic by ID (blockNumber-index)
router.get('/:extrinsicId', 
  cacheMiddleware(config.cache.ttl.blockByNumber),
  async (req: Request, res: Response) => {
    try {
      const { extrinsicId } = req.params;

      // Parse extrinsic ID (format: blockNumber-index)
      const parts = extrinsicId.split('-');
      if (parts.length !== 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Invalid extrinsic ID format. Expected: blockNumber-index',
          },
        });
      }

      const blockNumber = parseInt(parts[0], 10);
      const index = parseInt(parts[1], 10);

      if (isNaN(blockNumber) || isNaN(index)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Invalid extrinsic ID format. Block number and index must be numbers.',
          },
        });
      }

      // Get all extrinsics for the block and find the one with the matching index
      const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
      const blockExtrinsics = await extrinsicService.getExtrinsicsForBlock(blockNumber);
      const extrinsic = blockExtrinsics.find(ext => ext.extrinsic_index === index);

      if (!extrinsic) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Extrinsic not found',
          },
        });
      }

      const response: APIResponse = {
        success: true,
        data: keysToCamelCase(extrinsic),
        meta: {
          source: 'database',
        },
      };

      res.json(response);
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