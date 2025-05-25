import { availRPCService } from './rpc';
import { 
  Block, 
  Extrinsic, 
  Account, 
  ChainStats, 
  Validator, 
  BlocksQuery,
  ExtrinsicsQuery, 
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
}

export default new BlockchainService(); 