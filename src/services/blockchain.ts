import { availRPCService } from './rpc';
import { 
  Block, 
  Extrinsic, 
  Account, 
  ChainStats, 
  Validator, 
  BlocksQuery,
  ExtrinsicsQuery, 
  DataSubmissionQuery,
} from '../types';
import { logError, rpcLogger } from '../utils/logger';

class BlockchainService {
  private isInitialized = false;

  constructor() {
    // Initialize the RPC service
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await availRPCService.initialize();
      this.isInitialized = true;
      rpcLogger.info('Blockchain Service: Initialized with Avail RPC');
    } catch (error) {
      logError(error as Error, { component: 'blockchain-service', action: 'initialize' });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Blockchain service not initialized');
    }
  }

  // ===========================================
  // BLOCK OPERATIONS
  // ===========================================

  async getLatestBlocks(query: BlocksQuery = {}): Promise<{ blocks: Block[]; total: number }> {
    this.ensureInitialized();
    try {
      return await availRPCService.getLatestBlocks(query);
    } catch (error) {
      logError(error as Error, { operation: 'getLatestBlocks', query });
      throw new Error('Failed to fetch latest blocks');
    }
  }

  async getBlockByNumber(number: bigint): Promise<Block | null> {
    this.ensureInitialized();
    try {
      return await availRPCService.getBlockByNumber(number);
    } catch (error) {
      logError(error as Error, { operation: 'getBlockByNumber', number });
      return null;
    }
  }

  async getBlockByHash(hash: string): Promise<Block | null> {
    this.ensureInitialized();
    try {
      return await availRPCService.getBlockByHash(hash);
    } catch (error) {
      logError(error as Error, { operation: 'getBlockByHash', hash });
      return null;
    }
  }

  // ===========================================
  // EXTRINSIC OPERATIONS
  // ===========================================

  async getLatestExtrinsics(query: ExtrinsicsQuery = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    this.ensureInitialized();
    try {
      return await availRPCService.getLatestExtrinsics(query);
    } catch (error) {
      logError(error as Error, { operation: 'getLatestExtrinsics', query });
      throw new Error('Failed to fetch latest extrinsics');
    }
  }

  async getExtrinsicByHash(hash: string): Promise<Extrinsic | null> {
    this.ensureInitialized();
    try {
      // Note: This would need to be implemented in the RPC service
      // For now, we'll search through recent blocks
      const latestBlocks = await availRPCService.getLatestBlocks({ limit: 10 });
      
      for (const block of latestBlocks.blocks) {
        const extrinsics = await availRPCService.getExtrinsicsByBlock(block.number);
        const found = extrinsics.find(ext => ext.hash === hash);
        if (found) {
          return found;
        }
      }
      
      return null;
    } catch (error) {
      logError(error as Error, { operation: 'getExtrinsicByHash', hash });
      return null;
    }
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    this.ensureInitialized();
    try {
      return await availRPCService.getExtrinsicsByBlock(blockNumber);
    } catch (error) {
      logError(error as Error, { operation: 'getExtrinsicsByBlock', blockNumber });
      return [];
    }
  }

  // ===========================================
  // ACCOUNT OPERATIONS
  // ===========================================

  async getAccountDetails(address: string): Promise<Account | null> {
    this.ensureInitialized();
    try {
      return await availRPCService.getAccountDetails(address);
    } catch (error) {
      logError(error as Error, { operation: 'getAccountDetails', address });
      return null;
    }
  }

  // ===========================================
  // CHAIN STATE OPERATIONS
  // ===========================================

  async getChainStats(): Promise<ChainStats> {
    this.ensureInitialized();
    try {
      return await availRPCService.getChainStats();
    } catch (error) {
      logError(error as Error, { operation: 'getChainStats' });
      throw new Error('Failed to fetch chain statistics');
    }
  }

  async getValidators(): Promise<Validator[]> {
    this.ensureInitialized();
    try {
      return await availRPCService.getValidators();
    } catch (error) {
      logError(error as Error, { operation: 'getValidators' });
      return [];
    }
  }

  // ===========================================
  // AVAIL-SPECIFIC OPERATIONS
  // ===========================================

  async getDataAvailabilityProof(blockHash: string, extrinsicIndex: number) {
    this.ensureInitialized();
    try {
      return await availRPCService.getDataAvailabilityProof(blockHash, extrinsicIndex);
    } catch (error) {
      logError(error as Error, { operation: 'getDataAvailabilityProof', blockHash, extrinsicIndex });
      return null;
    }
  }

  async getApplicationData(blockHash: string, appId: number) {
    this.ensureInitialized();
    try {
      return await availRPCService.getApplicationData(blockHash, appId);
    } catch (error) {
      logError(error as Error, { operation: 'getApplicationData', blockHash, appId });
      return [];
    }
  }

  async getDataSubmissions(query: DataSubmissionQuery = {}) {
    this.ensureInitialized();
    try {
      return await availRPCService.getDataSubmissions(query);
    } catch (error) {
      logError(error as Error, { operation: 'getDataSubmissions', query });
      return { submissions: [], total: 0 };
    }
  }

  async getDataSubmissionStats() {
    this.ensureInitialized();
    try {
      return await availRPCService.getDataSubmissionStats();
    } catch (error) {
      logError(error as Error, { operation: 'getDataSubmissionStats' });
      return {
        totalSubmissions: 0,
        totalDataSize: 0,
        uniqueApps: 0,
        uniqueSubmitters: 0,
        averageSize: 0,
        submissionsToday: 0,
        dataSizeToday: 0,
      };
    }
  }

  async getBlockDataRoot(blockHash: string) {
    this.ensureInitialized();
    try {
      return await availRPCService.getBlockDataRoot(blockHash);
    } catch (error) {
      logError(error as Error, { operation: 'getBlockDataRoot', blockHash });
      return null;
    }
  }

  // ===========================================
  // RUNTIME OPERATIONS
  // ===========================================

  async getRuntimeVersion() {
    this.ensureInitialized();
    try {
      return await availRPCService.getRuntimeVersion();
    } catch (error) {
      logError(error as Error, { operation: 'getRuntimeVersion' });
      return null;
    }
  }

  async getRuntimeMetadata() {
    this.ensureInitialized();
    try {
      return await availRPCService.getRuntimeMetadata();
    } catch (error) {
      logError(error as Error, { operation: 'getRuntimeMetadata' });
      return null;
    }
  }

  // ===========================================
  // SUBSCRIPTION OPERATIONS
  // ===========================================

  async subscribeToNewBlocks(callback: (block: Block) => void): Promise<string> {
    this.ensureInitialized();
    return availRPCService.subscribeToNewBlocks(callback);
  }

  async subscribeToFinalizedBlocks(callback: (block: Block) => void): Promise<string> {
    this.ensureInitialized();
    return availRPCService.subscribeToFinalizedBlocks(callback);
  }

  async subscribeToAccountBalance(
    address: string,
    callback: (balance: { free: string; reserved: string }) => void,
  ): Promise<string> {
    this.ensureInitialized();
    return availRPCService.subscribeToAccountBalance(address, callback);
  }

  async subscribeToDataAvailability(callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return availRPCService.subscribeToDataAvailability(callback);
  }

  async subscribeToApplicationData(appId: number, callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return availRPCService.subscribeToApplicationData(appId, callback);
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    return availRPCService.unsubscribe(subscriptionId);
  }

  // ===========================================
  // HEALTH AND MONITORING
  // ===========================================

  async getHealth(): Promise<{ rpc: boolean; details?: any }> {
    try {
      const health = await availRPCService.getHealth();
      return {
        rpc: health.healthy,
        details: health.details,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getHealth' });
      return { rpc: false, details: { error: (error as Error).message } };
    }
  }

  async getMetrics() {
    this.ensureInitialized();
    try {
      return await availRPCService.getMetrics();
    } catch (error) {
      logError(error as Error, { operation: 'getMetrics' });
      return null;
    }
  }

  getConnectionStats() {
    this.ensureInitialized();
    return availRPCService.getConnectionStats();
  }

  getSubscriptionStats() {
    this.ensureInitialized();
    return availRPCService.getSubscriptionStats();
  }

  // ===========================================
  // LIFECYCLE MANAGEMENT
  // ===========================================

  async shutdown(): Promise<void> {
    try {
      await availRPCService.shutdown();
      this.isInitialized = false;
      rpcLogger.info('Blockchain Service: Shutdown complete');
    } catch (error) {
      logError(error as Error, { component: 'blockchain-service', action: 'shutdown' });
    }
  }

  // ===========================================
  // ENHANCED VALIDATOR OPERATIONS
  // ===========================================

  async getValidatorDetails(address: string): Promise<Validator | null> {
    this.ensureInitialized();
    try {
      const validators = await availRPCService.getValidators();
      return validators.find(v => v.address === address) || null;
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorDetails', address });
      return null;
    }
  }

  async getValidatorNominations(address: string) {
    this.ensureInitialized();
    try {
      // TODO: Implement nomination fetching from RPC
      return {
        data: [],
        total_count: 0,
        pagination: {
          page: 1,
          limit: 100,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorNominations', address });
      return {
        data: [],
        total_count: 0,
        pagination: {
          page: 1,
          limit: 100,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }

  async getValidatorBlocks(address: string, options: { limit?: number } = {}) {
    this.ensureInitialized();
    try {
      // TODO: Implement validator block history from RPC
      return {
        data: [],
        total_count: 0,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorBlocks', address, options });
      return {
        data: [],
        total_count: 0,
      };
    }
  }

  async getValidatorSlashingHistory(address: string) {
    this.ensureInitialized();
    try {
      // TODO: Implement slashing history from RPC
      return [];
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorSlashingHistory', address });
      return [];
    }
  }

  async calculateValidatorUptime(address: string): Promise<number> {
    this.ensureInitialized();
    try {
      // TODO: Implement uptime calculation
      return 0;
    } catch (error) {
      logError(error as Error, { operation: 'calculateValidatorUptime', address });
      return 0;
    }
  }

  async getValidatorAverageBlockTime(address: string): Promise<number> {
    this.ensureInitialized();
    try {
      // TODO: Implement average block time calculation
      return 0;
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorAverageBlockTime', address });
      return 0;
    }
  }

  // ===========================================
  // STAKING OPERATIONS
  // ===========================================

  async getStakingOverview() {
    this.ensureInitialized();
    try {
      const [chainStats, validators] = await Promise.all([
        this.getChainStats(),
        this.getValidators(),
      ]);

      const activeValidators = validators.filter(v => v.active);
      const totalStaked = activeValidators.reduce((sum, v) => {
        const stakeAmount = v.totalStake || BigInt(0);
        return sum + stakeAmount;
      }, BigInt(0));

      return {
        total_staked: totalStaked.toString(),
        active_validators: activeValidators.length,
        total_nominators: chainStats.nominators,
        current_era: 0, // TODO: Get current era from RPC
        inflation_rate: chainStats.inflation,
        average_commission: 0, // TODO: Calculate from validators
        nomination_pools: [], // TODO: Implement nomination pools
      };
    } catch (error) {
      logError(error as Error, { operation: 'getStakingOverview' });
      throw new Error('Failed to fetch staking overview');
    }
  }

  async getNominationPools(options: { page?: number; limit?: number } = {}) {
    this.ensureInitialized();
    try {
      // TODO: Implement nomination pools from RPC
      return {
        data: [],
        pagination: {
          page: options.page || 1,
          limit: options.limit || 50,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getNominationPools', options });
      return {
        data: [],
        pagination: {
          page: options.page || 1,
          limit: options.limit || 50,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }

  async getNominationPool(poolId: number) {
    this.ensureInitialized();
    try {
      // TODO: Implement specific nomination pool from RPC
      return null;
    } catch (error) {
      logError(error as Error, { operation: 'getNominationPool', poolId });
      return null;
    }
  }

  async getNominationPoolMembers(poolId: number) {
    this.ensureInitialized();
    try {
      // TODO: Implement nomination pool members from RPC
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 100,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getNominationPoolMembers', poolId });
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 100,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }

  // ===========================================
  // ERA OPERATIONS
  // ===========================================

  async getEras(options: { page?: number; limit?: number } = {}) {
    this.ensureInitialized();
    try {
      // TODO: Implement era history from RPC
      return {
        data: [],
        pagination: {
          page: options.page || 1,
          limit: options.limit || 20,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getEras', options });
      return {
        data: [],
        pagination: {
          page: options.page || 1,
          limit: options.limit || 20,
          total_count: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }

  async getEra(eraIndex: number) {
    this.ensureInitialized();
    try {
      // TODO: Implement specific era from RPC
      return null;
    } catch (error) {
      logError(error as Error, { operation: 'getEra', eraIndex });
      return null;
    }
  }

  async getEraRewards(eraIndex: number) {
    this.ensureInitialized();
    try {
      // TODO: Implement era rewards from RPC
      return [];
    } catch (error) {
      logError(error as Error, { operation: 'getEraRewards', eraIndex });
      return [];
    }
  }

  async getEraSlashingEvents(eraIndex: number) {
    this.ensureInitialized();
    try {
      // TODO: Implement era slashing events from RPC
      return [];
    } catch (error) {
      logError(error as Error, { operation: 'getEraSlashingEvents', eraIndex });
      return [];
    }
  }
}

export default new BlockchainService(); 