import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { pagination, cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

// GET /api/blocks - Get latest blocks
router.get('/', 
  pagination, 
  cacheMiddleware(config.cache.ttl.blocks),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      // Fetch real blocks data from RPC
      const blocksResult = await blockchainService.getLatestBlocks({ 
        page, 
        limit,
        orderBy: 'number',
        order: 'desc',
      });

      // Transform blocks data using the keysToCamelCase utility
      const transformedBlocks = blocksResult.blocks.map(block => {
        // Convert bigint values to numbers for JSON serialization
        const processedBlock = {
          ...block,
          number: Number(block.number),
          timestamp: Number(block.timestamp),
          extrinsics: block.extrinsicsCount,
          time: new Date(Number(block.timestamp)).toISOString(),
        };
        
        return keysToCamelCase(processedBlock);
      });

      const response: APIResponse = {
        success: true,
        data: transformedBlocks,
        meta: {
          page,
          limit,
          total: blocksResult.total,
          source: 'rpc',
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
      const { numberOrHash } = req.params;

      // Determine if it's a number or hash and fetch accordingly
      let block;
      if (/^\d+$/.test(numberOrHash)) {
        // It's a block number
        block = await blockchainService.getBlockByNumber(BigInt(numberOrHash));
      } else {
        // It's a block hash
        block = await blockchainService.getBlockByHash(numberOrHash);
      }

      if (!block) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Block not found',
          },
        });
      }

      // Fetch extrinsics for this block
      const extrinsics = await blockchainService.getExtrinsicsByBlock(block.number);

      // Process the block data
      const processedBlock = {
        ...block,
        number: Number(block.number),
        timestamp: Number(block.timestamp),
        time: new Date(Number(block.timestamp)).toISOString(),
        extrinsics: extrinsics.map(ext => ({
          ...ext,
          timestamp: Number(ext.timestamp),
          fee: Number(ext.fee),
          tip: ext.tip ? Number(ext.tip) : 0,
        })),
      };

      // Transform to camelCase
      const transformedBlock = keysToCamelCase(processedBlock);

      const response: APIResponse = {
        success: true,
        data: transformedBlock,
        meta: {
          source: 'rpc',
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
  },
);

export default router; 