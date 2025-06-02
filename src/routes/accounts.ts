import { Router, Request, Response } from 'express';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { asyncHandler, createValidationError, createNotFoundError, createExternalServiceError } from '../utils/asyncHandler';

const router = Router();

// GET /api/accounts/:address - Get account details
router.get('/:address', 
  cacheMiddleware(config.cache.ttl.accountBalance),
  asyncHandler(async (req: Request, res: Response) => {
    const { address } = req.params;

    // Validate address format (basic validation)
    if (!address || address.length < 47) {
      throw createValidationError('Invalid account address format', 'address', address);
    }

    // Fetch account details from RPC
    let account;
    try {
      account = await blockchainService.getAccountDetails(address);
    } catch (rpcError) {
      throw createExternalServiceError('Blockchain RPC', rpcError as Error);
    }

    if (!account) {
      throw createNotFoundError('Account', address);
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
  }),
);

export default router; 