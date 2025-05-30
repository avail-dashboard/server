import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';

const router = Router();

// GET /api/accounts/:address - Get account details
router.get('/:address', 
  cacheMiddleware(config.cache.ttl.accountBalance),
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      // Validate address format (basic validation)
      if (!address || address.length < 47) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ADDRESS',
            message: 'Invalid account address format',
          },
        });
      }

      // Fetch account details from RPC
      const account = await blockchainService.getAccountDetails(address);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account not found',
          },
        });
      }

      // Transform account data to match API response format
      const transformedAccount = {
        address: account.address,
        balance: Number(account.balance),
        nonce: account.nonce,
        lastUpdated: account.lastUpdated,
        accountInfo: account.accountInfo ? {
          free: Number(account.accountInfo.free),
          reserved: Number(account.accountInfo.reserved),
          frozen: Number(account.accountInfo.frozen),
          flags: Number(account.accountInfo.flags),
        } : null,
      };

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