import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import { formatSingleResponse, formatErrorResponse } from '../utils/responseFormatter';
import { serviceFactory } from '../services';
import { TransferService, TransferFilters, PaginationOptions } from '../services/domain/transfer';

const router = Router();

// GET /api/transfers - Get transfers with filtering and pagination
router.get('/',
  cacheMiddleware(config.cache.ttl.blockByHash),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      
      // Parse query parameters for filtering
      const filters: TransferFilters = {};
      if (req.query.from) {filters.fromAddress = req.query.from as string;}
      if (req.query.to) {filters.toAddress = req.query.to as string;}
      if (req.query.minAmount) {filters.minAmount = req.query.minAmount as string;}
      if (req.query.maxAmount) {filters.maxAmount = req.query.maxAmount as string;}
      if (req.query.blockNumber) {filters.blockNumber = parseInt(req.query.blockNumber as string);}
      if (req.query.blockHash) {filters.blockHash = req.query.blockHash as string;}
      if (req.query.startDate) {filters.startDate = new Date(req.query.startDate as string);}
      if (req.query.endDate) {filters.endDate = new Date(req.query.endDate as string);}

      // Parse pagination options
      const options: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sortBy: (req.query.sortBy as 'timestamp' | 'amount' | 'blockNumber') || 'timestamp',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await transferService.getTransfers(filters, options);

      res.json(formatSingleResponse(result, {
        filters,
        pagination: options,
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransfers' });
      res.status(500).json(formatErrorResponse('Failed to fetch transfers', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/transfers/stats - Get transfer statistics
router.get('/stats',
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      const period = req.query.period as string || '24h';
      
      const stats = await transferService.getTransferStatistics(period);

      res.json(formatSingleResponse(stats, {
        period,
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransferStats' });
      res.status(500).json(formatErrorResponse('Failed to fetch transfer statistics', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/transfers/hash/:hash - Get transfer by transaction hash
router.get('/hash/:hash',
  cacheMiddleware(config.cache.ttl.blockByHash),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      const hash = req.params.hash;

      const transfer = await transferService.getTransferByHash(hash);

      if (!transfer) {
        return res.status(404).json(formatErrorResponse('Transfer not found', 'TRANSFER_NOT_FOUND', 404));
      }

      res.json(formatSingleResponse(transfer, {
        hash,
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransferByHash', hash: req.params.hash });
      res.status(500).json(formatErrorResponse('Failed to fetch transfer', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/transfers/block/:blockNumber - Get transfers by block number
router.get('/block/:blockNumber',
  cacheMiddleware(config.cache.ttl.blockByHash),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      const blockNumber = parseInt(req.params.blockNumber);

      if (isNaN(blockNumber)) {
        return res.status(400).json(formatErrorResponse('Invalid block number', 'INVALID_BLOCK_NUMBER', 400));
      }

      // Parse pagination options
      const options: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sortBy: (req.query.sortBy as 'timestamp' | 'amount' | 'blockNumber') || 'timestamp',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await transferService.getTransfersByBlock(blockNumber, options);

      res.json(formatSingleResponse(result, {
        blockNumber,
        pagination: options,
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransfersByBlock', blockNumber: req.params.blockNumber });
      res.status(500).json(formatErrorResponse('Failed to fetch transfers for block', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/transfers/account/:address - Get transfers by account address
router.get('/account/:address',
  cacheMiddleware(config.cache.ttl.blockByHash),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      const address = req.params.address;

      // Basic address validation
      if (!address || address.length < 10) {
        return res.status(400).json(formatErrorResponse('Invalid address format', 'INVALID_ADDRESS', 400));
      }

      // Parse pagination options
      const options: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        sortBy: (req.query.sortBy as 'timestamp' | 'amount' | 'blockNumber') || 'timestamp',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await transferService.getTransfersByAccount(address, options);

      res.json(formatSingleResponse(result, {
        address,
        pagination: options,
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransfersByAccount', address: req.params.address });
      res.status(500).json(formatErrorResponse('Failed to fetch transfers for account', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

// GET /api/transfers/:id - Get specific transfer by ID
router.get('/:id',
  cacheMiddleware(config.cache.ttl.blockByHash),
  async (req: Request, res: Response) => {
    try {
      const transferService = serviceFactory.get<TransferService>('transferService');
      const transferId = req.params.id;

      const transfer = await transferService.getTransfer(transferId);

      if (!transfer) {
        return res.status(404).json(formatErrorResponse('Transfer not found', 'TRANSFER_NOT_FOUND', 404));
      }

      res.json(formatSingleResponse(transfer, {
        cached: true,
      }));
    } catch (error) {
      logError(error as Error, { component: 'transfers-route', action: 'getTransfer', transferId: req.params.id });
      res.status(500).json(formatErrorResponse('Failed to fetch transfer', 'INTERNAL_SERVER_ERROR'));
    }
  },
);

export default router; 