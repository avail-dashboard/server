import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';

const router = Router();

// GET /api/v1/chain/stats - Get chain statistics
router.get('/stats', 
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      // Fetch real chain data from RPC
      const chainStats = await blockchainService.getChainStats();
      
      // Transform RPC data to match frontend ChainData interface
      const chainData = {
        finalizedBlocks: Number(chainStats.blockHeight),
        signedExtrinsics: 0, // TODO: Calculate from database
        stakedAmount: '0', // TODO: Calculate from staking data
        bondedAmount: '0', // TODO: Calculate from staking data
        holders: 0, // TODO: Calculate from database
        totalAccounts: 0, // TODO: Calculate from database
        transfers: 0, // TODO: Calculate from database
        inflationRate: chainStats.inflation,
        tokenPrice: 0, // TODO: Fetch from external API
        priceChange: 0, // TODO: Calculate from price history
        totalIssuance: chainStats.totalIssuance.toString(),
        circulating: { amount: '0', percentage: 0 }, // TODO: Calculate
        staking: { amount: '0', percentage: 0 }, // TODO: Calculate
        treasury: { amount: '0', percentage: 0 }, // TODO: Calculate
        others: { amount: '0', percentage: 0 }, // TODO: Calculate
        
        // Additional fields for compatibility
        marketCap: 0, // TODO: Calculate from price and supply
        totalSupply: Number(chainStats.totalIssuance),
        circulatingSupply: 0, // TODO: Calculate
        stakingRatio: chainStats.stakingRatio,
        inflation: chainStats.inflation,
        activeValidators: chainStats.activeValidators,
        blockTime: chainStats.blockTime,
        lastBlockTimestamp: Number(chainStats.lastUpdateTime),
      };

      const response: APIResponse = {
        success: true,
        data: chainData,
        meta: {
          source: 'rpc',
        },
      };

      res.json(response);
    } catch (error) {
      logError(error as Error, { component: 'chain-route', action: 'getStats' });
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch chain statistics',
        },
      });
    }
  },
);

export default router; 