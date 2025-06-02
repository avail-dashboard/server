import { HybridRPCService } from './hybrid-rpc';
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
  private hybridRPC: HybridRPCService;
  private isInitialized = false;

  constructor() {
    this.hybridRPC = new HybridRPCService();
    // Initialize the RPC service
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.hybridRPC.initialize();
      this.isInitialized = true;
      
      // Log capabilities for monitoring
      const capabilities = this.hybridRPC.getCapabilities();
      rpcLogger.info('Blockchain Service: Initialized with Hybrid RPC', { 
        capabilities,
        polkadotAvailable: this.hybridRPC.isPolkadotAPIAvailable(),
        availRPCAvailable: this.hybridRPC.isAvailRPCAvailable(),
      });
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
      return await this.hybridRPC.getLatestBlocks(query);
    } catch (error) {
      logError(error as Error, { operation: 'getLatestBlocks', query });
      throw new Error('Failed to fetch latest blocks');
    }
  }

  async getBlockByNumber(number: bigint): Promise<Block | null> {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getBlockByNumber(number);
    } catch (error) {
      logError(error as Error, { operation: 'getBlockByNumber', number });
      return null;
    }
  }

  async getBlockByHash(hash: string): Promise<Block | null> {
    this.ensureInitialized();
    try {
      // Note: This method doesn't exist in HybridRPCService yet
      // We'll need to implement it or use a workaround
      const latestBlocks = await this.hybridRPC.getLatestBlocks({ limit: 100 });
      const found = latestBlocks.blocks.find(block => block.hash === hash);
      return found || null;
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
      return await this.hybridRPC.getLatestExtrinsics(query);
    } catch (error) {
      logError(error as Error, { operation: 'getLatestExtrinsics', query });
      throw new Error('Failed to fetch latest extrinsics');
    }
  }

  async getExtrinsicByHash(hash: string): Promise<Extrinsic | null> {
    this.ensureInitialized();
    try {
      // Note: This would need to be implemented in the Hybrid RPC service
      // For now, we'll search through recent blocks but getExtrinsicsByBlock doesn't exist
      // We'll need to implement this or use a different approach
      // For now, return null to avoid errors
      rpcLogger.warn('getExtrinsicByHash: getExtrinsicsByBlock not implemented in HybridRPCService');
      return null;
    } catch (error) {
      logError(error as Error, { operation: 'getExtrinsicByHash', hash });
      return null;
    }
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getExtrinsicsByBlock(blockNumber);
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
      return await this.hybridRPC.getAccountDetails(address);
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
      return await this.hybridRPC.getChainStats();
    } catch (error) {
      logError(error as Error, { operation: 'getChainStats' });
      throw new Error('Failed to fetch chain statistics');
    }
  }

  async getValidators(): Promise<Validator[]> {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getValidators();
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
      return await this.hybridRPC.getDataAvailabilityProof(blockHash, extrinsicIndex);
    } catch (error) {
      logError(error as Error, { operation: 'getDataAvailabilityProof', blockHash, extrinsicIndex });
      return null;
    }
  }

  async getApplicationData(blockHash: string, appId: number) {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getApplicationData(blockHash, appId);
    } catch (error) {
      logError(error as Error, { operation: 'getApplicationData', blockHash, appId });
      return [];
    }
  }

  async getDataSubmissions(query: DataSubmissionQuery = {}) {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getDataSubmissions(query);
    } catch (error) {
      logError(error as Error, { operation: 'getDataSubmissions', query });
      return { submissions: [], total: 0 };
    }
  }

  async getDataSubmissionStats() {
    this.ensureInitialized();
    try {
      // Calculate stats from real data submissions instead of throwing error
      const submissions = await this.getDataSubmissions({ limit: 1000 });
      
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
      
      const recentSubmissions = submissions.submissions.filter(s => 
        Number(s.timestamp) > oneDayAgo,
      );
      const weeklySubmissions = submissions.submissions.filter(s => 
        Number(s.timestamp) > oneWeekAgo,
      );
      
      return {
        total_submissions: submissions.total,
        daily_submissions: recentSubmissions.length,
        weekly_submissions: weeklySubmissions.length,
        total_size: submissions.submissions.reduce((sum, s) => sum + s.size, 0),
        daily_size: recentSubmissions.reduce((sum, s) => sum + s.size, 0),
        weekly_size: weeklySubmissions.reduce((sum, s) => sum + s.size, 0),
        unique_submitters: new Set(submissions.submissions.map(s => s.submitter)).size,
        active_app_ids: new Set(submissions.submissions.map(s => s.appId)).size,
        average_size: submissions.submissions.length > 0 
          ? submissions.submissions.reduce((sum, s) => sum + s.size, 0) / submissions.submissions.length 
          : 0,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getDataSubmissionStats' });
      throw new Error('Failed to fetch data submission statistics');
    }
  }

  async getBlockDataRoot(blockHash: string) {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getBlockDataRoot(blockHash);
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
      return await this.hybridRPC.getRuntimeVersion();
    } catch (error) {
      logError(error as Error, { operation: 'getRuntimeVersion' });
      return null;
    }
  }

  async getRuntimeMetadata() {
    this.ensureInitialized();
    try {
      return await this.hybridRPC.getRuntimeMetadata();
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
    return this.hybridRPC.subscribeToNewBlocks(callback);
  }

  async subscribeToFinalizedBlocks(callback: (block: Block) => void): Promise<string> {
    this.ensureInitialized();
    return this.hybridRPC.subscribeToFinalizedBlocks(callback);
  }

  async subscribeToAccountBalance(
    address: string,
    callback: (balance: { free: string; reserved: string }) => void,
  ): Promise<string> {
    this.ensureInitialized();
    return this.hybridRPC.subscribeToAccountBalance(address, callback);
  }

  async subscribeToDataAvailability(callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.hybridRPC.subscribeToDataAvailability(callback);
  }

  async subscribeToApplicationData(appId: number, callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.hybridRPC.subscribeToApplicationData(appId, callback);
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.hybridRPC.unsubscribe(subscriptionId);
  }

  // ===========================================
  // HEALTH AND MONITORING
  // ===========================================

  async getHealth(): Promise<{ rpc: boolean; details?: any }> {
    try {
      const health = await this.hybridRPC.getHealth();
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
      return await this.hybridRPC.getMetrics();
    } catch (error) {
      logError(error as Error, { operation: 'getMetrics' });
      return null;
    }
  }

  getConnectionStats() {
    this.ensureInitialized();
    return this.hybridRPC.getConnectionStats();
  }

  getSubscriptionStats() {
    this.ensureInitialized();
    return this.hybridRPC.getSubscriptionStats();
  }

  // ===========================================
  // LIFECYCLE MANAGEMENT
  // ===========================================

  async shutdown(): Promise<void> {
    try {
      await this.hybridRPC.shutdown();
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
      const validators = await this.hybridRPC.getValidators();
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