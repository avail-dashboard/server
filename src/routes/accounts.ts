import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

// GET /api/accounts/:address - Get account details
router.get('/:address', 
  cacheMiddleware(config.cache.ttl.accountBalance),
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      // Fetch account details from RPC
      const accountDetails = await blockchainService.getAccountDetails(address);

      if (!accountDetails) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Account not found',
          },
        });
      }

      // Transform account data using the keysToCamelCase utility
      const transformedAccount = keysToCamelCase(accountDetails);

      const response: APIResponse = {
        success: true,
        data: transformedAccount,
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'accounts-route', action: 'getAccount' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch account details',
        },
      });
    }
  },
);

export default router; 