import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination } from '../middleware';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

/**
 * @route GET /api/extrinsics
 * @description Get latest extrinsics with pagination
 * @access Public
 * @note Now uses DirectWS (wss://mainnet-rpc.avail.so/ws) as primary data source when enabled
 */
router.get('/', 
  pagination,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const blockNumber = req.query.block ? BigInt(req.query.block as string) : undefined;

      let extrinsicsResult;

      if (blockNumber) {
        // Fetch extrinsics for a specific block
        const extrinsics = await blockchainService.getExtrinsicsByBlock(blockNumber);
        extrinsicsResult = {
          extrinsics,
          total: extrinsics.length,
        };
      } else {
        // Fetch latest extrinsics across all blocks
        extrinsicsResult = await blockchainService.getLatestExtrinsics({
          page,
          limit,
        });
      }

      // Transform RPC data using the keysToCamelCase utility
      const transformedExtrinsics = extrinsicsResult.extrinsics.map(ext => {
        // Convert numeric fields appropriately
        const processedExt = {
          ...ext,
          blockNumber: Number(ext.blockNumber),
          timestamp: Number(ext.timestamp),
          fee: Number(ext.fee),
          tip: ext.tip ? Number(ext.tip) : 0,
        };
        
        return keysToCamelCase(processedExt);
      });

      const response: APIResponse = {
        success: true,
        data: transformedExtrinsics,
        meta: {
          page,
          limit,
          total: extrinsicsResult.total,
          source: 'rpc',
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

// GET /api/extrinsics/:hash - Get specific extrinsic
router.get('/:hash', 
  async (req: Request, res: Response) => {
    try {
      const { hash } = req.params;

      // Fetch extrinsic by hash
      const extrinsic = await blockchainService.getExtrinsicByHash(hash);

      if (!extrinsic) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Extrinsic not found',
          },
        });
      }

      // Transform extrinsic data using the keysToCamelCase utility
      const processedExtrinsic = {
        ...extrinsic,
        blockNumber: Number(extrinsic.blockNumber),
        timestamp: Number(extrinsic.timestamp),
        fee: Number(extrinsic.fee),
        tip: extrinsic.tip ? Number(extrinsic.tip) : 0,
      };

      const transformedExtrinsic = keysToCamelCase(processedExtrinsic);

      const response: APIResponse = {
        success: true,
        data: transformedExtrinsic,
        meta: {
          source: 'rpc',
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