import { Router, Request, Response } from 'express';
import { logError } from '../utils/logger';
import { APIResponse } from '../types';
import { cacheMiddleware } from '../middleware';
import config from '../config';
import blockchainService from '../services/blockchain';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

// GET /api/chain/stats - Get chain statistics
router.get('/stats', 
  cacheMiddleware(config.cache.ttl.chainStats),
  async (req: Request, res: Response) => {
    try {
      // Fetch real chain data from RPC
      const chainStats = await blockchainService.getChainStats();
      
      // Get recent extrinsics to count signed ones
      const recentExtrinsics = await blockchainService.getLatestExtrinsics({ limit: 100 });
      const signedExtrinsicsCount = recentExtrinsics.extrinsics.filter(ext => ext.isSigned).length;
      
      // Calculate staking amounts - ensure all BigInt operations are safe
      const totalIssuance = typeof chainStats.totalIssuance === 'bigint' 
        ? chainStats.totalIssuance 
        : BigInt(String(chainStats.totalIssuance || '1000000000000000000000')); // 1M AVAIL default
      
      // Safely convert staking ratio to integer percentage
      const stakingRatio = typeof chainStats.stakingRatio === 'number' ? chainStats.stakingRatio : 0.5;
      const stakingRatioPercent = Math.max(0, Math.min(100, Math.floor(stakingRatio * 100)));
      
      // Ensure we have valid BigInt values
      const stakedAmount = (totalIssuance * BigInt(stakingRatioPercent)) / BigInt(100);
      const bondedAmount = stakedAmount; // In Substrate, staked = bonded
      
      // Estimate circulating supply (total - treasury - locked)
      const treasuryAmount = totalIssuance / BigInt(20); // Estimate 5% in treasury
      const circulatingAmount = totalIssuance - treasuryAmount - stakedAmount;
      
      // Transform RPC data using the keysToCamelCase utility
      const chainData = {
        finalized_blocks: Number(chainStats.blockHeight),
        signed_extrinsics: signedExtrinsicsCount,
        staked_amount: stakedAmount.toString(),
        bonded_amount: bondedAmount.toString(),
        holders: chainStats.nominators + chainStats.activeValidators, // Estimate
        total_accounts: chainStats.nominators + chainStats.activeValidators, // Estimate
        transfers: Math.floor(signedExtrinsicsCount * 0.7), // Estimate 70% are transfers
        inflation_rate: chainStats.inflation,
        token_price: 0, // TODO: Fetch from external API
        price_change: 0, // TODO: Calculate from price history
        total_issuance: totalIssuance.toString(),
        circulating: { 
          amount: circulatingAmount.toString(), 
          percentage: totalIssuance > BigInt(0) ? Number(circulatingAmount * BigInt(100) / totalIssuance) : 0,
        },
        staking: { 
          amount: stakedAmount.toString(), 
          percentage: stakingRatioPercent,
        },
        treasury: { 
          amount: treasuryAmount.toString(), 
          percentage: totalIssuance > BigInt(0) ? Number(treasuryAmount * BigInt(100) / totalIssuance) : 0,
        },
        others: { 
          amount: '0', 
          percentage: 0,
        },
        
        // Additional fields for compatibility
        market_cap: 0, // TODO: Calculate from price and supply
        total_supply: Number(totalIssuance),
        circulating_supply: Number(circulatingAmount),
        staking_ratio: chainStats.stakingRatio,
        inflation: chainStats.inflation,
        active_validators: chainStats.activeValidators,
        block_time: chainStats.blockTime,
        last_block_timestamp: Number(chainStats.lastUpdateTime),
      };

      const response: APIResponse = {
        success: true,
        data: keysToCamelCase(chainData),
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