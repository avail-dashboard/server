import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import { formatSingleResponse, formatErrorResponse } from '../utils/responseFormatter';
import { ServiceFactory } from '../services';
import { AccountService } from '../services/domain/account';

const router = Router();

// GET /api/accounts/discover - Get sample valid addresses for testing
router.get('/discover', 
  cacheMiddleware(config.cache.ttl.validators),
  async (req: Request, res: Response) => {
    try {
      const serviceFactory = ServiceFactory.getInstance();
      const accountService = serviceFactory.get<AccountService>('accountService');
      
      const sampleAddresses = await accountService.discoverSampleAddresses();

      res.json(formatSingleResponse({ addresses: sampleAddresses }, {
        source: 'database',
        note: 'Sample validator addresses for testing the accounts endpoint',
      }));
    } catch (error) {
      logError(error as Error, { component: 'accounts-route', action: 'discover' });
      
      res.status(500).json(formatErrorResponse('Failed to discover sample addresses', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/accounts/:address - Get account details
router.get('/:address', 
  cacheMiddleware(config.cache.ttl.accountBalance),
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      // Validate address format
      if (!address || address.length < 40) {
        return res.status(400).json(formatErrorResponse('Invalid account address format', 'INVALID_ADDRESS', 400));
      }

      const serviceFactory = ServiceFactory.getInstance();
      const accountService = serviceFactory.get<AccountService>('accountService');
      
      // Get account details and balance
      const [accountDetails, accountBalance] = await Promise.all([
        accountService.getAccount(address),
        accountService.getAccountBalance(address),
      ]);

      const responseData = {
        account: accountDetails,
        balance: accountBalance,
      };

      res.json(formatSingleResponse(responseData, {
        source: 'blockchain+database',
        note: 'Account details from database, balance from blockchain RPC',
      }));
    } catch (error) {
      logError(error as Error, { component: 'accounts-route', action: 'getAccount' });
      
      res.status(500).json(formatErrorResponse('Failed to fetch account details', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

export default router; 