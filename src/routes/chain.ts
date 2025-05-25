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
      
      // Get recent extrinsics to count signed ones
      const recentExtrinsics = await blockchainService.getLatestExtrinsics({ limit: 100 });
      const signedExtrinsicsCount = recentExtrinsics.extrinsics.filter(ext => ext.isSigned).length;
      
      // Calculate staking amounts
      const totalIssuance = chainStats.totalIssuance;
      const stakedAmount = (totalIssuance * BigInt(Math.floor(chainStats.stakingRatio * 100))) / BigInt(100);
      const bondedAmount = stakedAmount; // In Substrate, staked = bonded
      
      // Estimate circulating supply (total - treasury - locked)
      const treasuryAmount = totalIssuance / BigInt(20); // Estimate 5% in treasury
      const circulatingAmount = totalIssuance - treasuryAmount - stakedAmount;
      
      // Transform RPC data to match frontend ChainData interface
      const chainData = {
        finalizedBlocks: Number(chainStats.blockHeight),
        signedExtrinsics: signedExtrinsicsCount,
        stakedAmount: stakedAmount.toString(),
        bondedAmount: bondedAmount.toString(),
        holders: chainStats.nominators + chainStats.activeValidators, // Estimate
        totalAccounts: chainStats.nominators + chainStats.activeValidators, // Estimate
        transfers: Math.floor(signedExtrinsicsCount * 0.7), // Estimate 70% are transfers
        inflationRate: chainStats.inflation,
        tokenPrice: 0, // TODO: Fetch from external API
        priceChange: 0, // TODO: Calculate from price history
        totalIssuance: totalIssuance.toString(),
        circulating: { 
          amount: circulatingAmount.toString(), 
          percentage: totalIssuance > 0 ? Number(circulatingAmount * BigInt(100) / totalIssuance) : 0,
        },
        staking: { 
          amount: stakedAmount.toString(), 
          percentage: Math.floor(chainStats.stakingRatio * 100),
        },
        treasury: { 
          amount: treasuryAmount.toString(), 
          percentage: totalIssuance > 0 ? Number(treasuryAmount * BigInt(100) / totalIssuance) : 0,
        },
        others: { 
          amount: '0', 
          percentage: 0,
        },
        
        // Additional fields for compatibility
        marketCap: 0, // TODO: Calculate from price and supply
        totalSupply: Number(totalIssuance),
        circulatingSupply: Number(circulatingAmount),
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