import { logger, logError } from '../../utils/logger';
import { AvailBlockchainService } from '../core/avail-blockchain';
import { BaseService, ServiceHealth } from '../types/service';

// Service interfaces
export interface ChainInfo {
  name: string;
  version: string;
  chainType: string;
  properties: Record<string, any>;
}

export interface ChainConstants {
  blockTime: number;
  epochDuration: number;
  sessionsPerEra: number;
  bondingDuration: number;
  maxNominatorRewardedPerValidator: number;
  minNominatorBond: string;
  minValidatorBond: string;
}

export interface IChainService {
  getChainInfo(): Promise<ChainInfo>;
  getConstants(): Promise<ChainConstants>;
}

/**
 * ChainService - Provides chain metadata and constants
 * 
 * Responsibilities:
 * - Get chain information and metadata
 * - Fetch chain constants
 * - Provide network parameters
 */
export class ChainService implements BaseService, IChainService {
  private blockchain: AvailBlockchainService;
  private isRunning = false;

  constructor(blockchain: AvailBlockchainService) {
    this.blockchain = blockchain;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    logger.info('ChainService: Starting service', { component: 'chain-service' });
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('ChainService: Stopping service', { component: 'chain-service' });
    this.isRunning = false;
  }

  async getHealth(): Promise<ServiceHealth> {
    return {
      healthy: this.isRunning,
      lastCheck: new Date(),
      details: {
        service: 'ChainService',
        version: '1.0.0',
      },
    };
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get chain information
   * PERFORMANCE: Uses cached blockchain methods (500-1000ms → <50ms for cached data)
   */
  async getChainInfo(): Promise<ChainInfo> {
    try {
      logger.debug('ChainService: Getting chain info', { component: 'chain-service' });

      // Use cached system RPC calls for better performance
      const { chain: chainName, version, properties } = await this.blockchain.getSystemRpc();

      const chainInfo: ChainInfo = {
        name: chainName.toString(),
        version: version.toString(),
        chainType: 'Substrate',
        properties: properties.toJSON() as Record<string, any>,
      };

      logger.debug('ChainService: Chain info retrieved', { 
        component: 'chain-service',
        name: chainInfo.name,
        version: chainInfo.version,
      });

      return chainInfo;

    } catch (error) {
      logError(error as Error, { 
        component: 'chain-service', 
        action: 'getChainInfo',
      });
      throw error;
    }
  }

  /**
   * Get chain constants
   * PERFORMANCE: Uses cached blockchain methods (300-800ms → <50ms for cached data)
   */
  async getConstants(): Promise<ChainConstants> {
    try {
      logger.debug('ChainService: Getting chain constants', { component: 'chain-service' });

      // Use cached constants for better performance
      const consts = await this.blockchain.getChainConstants();
      
      // Get various chain constants from cached data
      const blockTime = 12; // Default 12 seconds for Avail
      const epochDuration = consts.babe?.epochDuration?.toNumber() || 200;
      const sessionsPerEra = consts.staking?.sessionsPerEra?.toNumber() || 6;
      const bondingDuration = consts.staking?.bondingDuration?.toNumber() || 28;
      const maxNominatorRewardedPerValidator = consts.staking?.maxNominatorRewardedPerValidator?.toNumber() || 256;
      const minNominatorBond = consts.staking?.minNominatorBond?.toString() || '0';
      const minValidatorBond = consts.staking?.minValidatorBond?.toString() || '0';

      const constants: ChainConstants = {
        blockTime,
        epochDuration,
        sessionsPerEra,
        bondingDuration,
        maxNominatorRewardedPerValidator,
        minNominatorBond,
        minValidatorBond,
      };

      logger.debug('ChainService: Chain constants retrieved', { 
        component: 'chain-service',
        blockTime: constants.blockTime,
        epochDuration: constants.epochDuration,
        sessionsPerEra: constants.sessionsPerEra,
      });

      return constants;

    } catch (error) {
      logError(error as Error, { 
        component: 'chain-service', 
        action: 'getConstants',
      });
      throw error;
    }
  }
}

// Factory function
export const createChainService = (blockchain: AvailBlockchainService): ChainService => {
  return new ChainService(blockchain);
}; 