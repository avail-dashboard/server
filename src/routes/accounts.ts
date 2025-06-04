import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

// GET /api/accounts/discover - Get sample valid addresses for testing
router.get('/discover', 
  cacheMiddleware(config.cache.ttl.validators),
  async (req: Request, res: Response) => {
    try {
      // Get sample validator addresses that should work with the accounts endpoint
      const validators = await blockchainService.getValidators();
      
      const sampleAddresses = validators.slice(0, 5).map(validator => ({
        address: validator.address,
        type: 'validator',
        description: validator.identity?.display || `Validator with ${validator.commission} commission`,
        active: validator.active,
        commission: validator.commission,
        totalStake: validator.totalStake?.toString(),
      }));

      const response: APIResponse = {
        success: true,
        data: {
          sampleAddresses,
          usage: {
            example: `GET /api/accounts/${sampleAddresses[0]?.address}`,
            note: 'These are real validator addresses on the Avail network that should return account data'
          },
          total: sampleAddresses.length,
        },
        meta: {
          source: 'rpc',
          note: 'Sample validator addresses for testing the accounts endpoint',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'accounts-route', action: 'discover' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to discover sample addresses',
        },
      });
    }
  },
);

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
          meta: {
            suggestion: 'Use GET /api/accounts/discover to find valid addresses for testing',
            note: 'Only accounts with on-chain activity or validator status have account data',
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