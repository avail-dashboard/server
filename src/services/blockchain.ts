import { ApiPromise, WsProvider } from '@polkadot/api';
import axios, { AxiosInstance } from 'axios';
import config from '../config';
import { 
  Block, 
  Extrinsic, 
  Account, 
  ChainStats, 
  Validator, 
  DataSource,
  BlocksQuery,
  ExtrinsicsQuery 
} from '../types';
import { logRpcCall, logError } from '../utils/logger';
import { cache, CacheKeys, cacheWrapper } from '../utils/cache';

class BlockchainService {
  private api: ApiPromise | null = null;
  private subscanApi: AxiosInstance;
  private subqueryApi: AxiosInstance | null = null;
  private isRpcConnected: boolean = false;

  constructor() {
    // Initialize Subscan API client
    this.subscanApi = axios.create({
      baseURL: config.dataSources.subscan.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.dataSources.subscan.apiKey || '',
      },
    });

    // Initialize SubQuery API client if configured
    if (config.dataSources.subquery.endpoint) {
      this.subqueryApi = axios.create({
        baseURL: config.dataSources.subquery.endpoint,
        timeout: config.dataSources.subquery.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    this.setupApiClients();
  }

  private setupApiClients(): void {
    // Setup Subscan API interceptors
    this.subscanApi.interceptors.response.use(
      response => response,
      error => {
        logError(error, { component: 'subscan-api', url: error.config?.url });
        throw error;
      }
    );

    // Setup SubQuery API interceptors
    if (this.subqueryApi) {
      this.subqueryApi.interceptors.response.use(
        response => response,
        error => {
          logError(error, { component: 'subquery-api', url: error.config?.url });
          throw error;
        }
      );
    }
  }

  async connectRPC(): Promise<void> {
    try {
      const provider = new WsProvider(config.dataSources.rpc.endpoint);
      this.api = await ApiPromise.create({ provider });
      
      await this.api.isReady;
      this.isRpcConnected = true;
      
      console.log('Blockchain Service: Connected to Avail RPC');
    } catch (error) {
      this.isRpcConnected = false;
      logError(error as Error, { component: 'rpc', action: 'connect' });
      throw error;
    }
  }

  async disconnectRPC(): Promise<void> {
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
      this.isRpcConnected = false;
      console.log('Blockchain Service: Disconnected from Avail RPC');
    }
  }

  // ===========================================
  // BLOCK OPERATIONS
  // ===========================================

  async getLatestBlocks(query: BlocksQuery = {}): Promise<{ blocks: Block[]; total: number }> {
    const { page = 1, limit = 20 } = query;
    
    return cacheWrapper(
      CacheKeys.latestBlocks(),
      async () => {
        try {
          // Try Subscan first
          return await this.getLatestBlocksFromSubscan(query);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getLatestBlocks' });
          
          try {
            // Fallback to RPC
            return await this.getLatestBlocksFromRPC(query);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getLatestBlocks' });
            throw new Error('Failed to fetch latest blocks from all sources');
          }
        }
      },
      config.cache.ttl.blocks
    ).then(result => result.data);
  }

  async getBlockByNumber(number: bigint): Promise<Block | null> {
    return cacheWrapper(
      CacheKeys.blockByNumber(number),
      async () => {
        try {
          // Try Subscan first
          return await this.getBlockFromSubscan(number);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getBlockByNumber', number });
          
          try {
            // Fallback to RPC
            return await this.getBlockFromRPC(number);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getBlockByNumber', number });
            return null;
          }
        }
      },
      config.cache.ttl.blockByNumber
    ).then(result => result.data);
  }

  async getBlockByHash(hash: string): Promise<Block | null> {
    return cacheWrapper(
      CacheKeys.blockByHash(hash),
      async () => {
        try {
          // Try Subscan first
          return await this.getBlockByHashFromSubscan(hash);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getBlockByHash', hash });
          
          try {
            // Fallback to RPC
            return await this.getBlockByHashFromRPC(hash);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getBlockByHash', hash });
            return null;
          }
        }
      },
      config.cache.ttl.blockByHash
    ).then(result => result.data);
  }

  // ===========================================
  // EXTRINSIC OPERATIONS
  // ===========================================

  async getLatestExtrinsics(query: ExtrinsicsQuery = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    return cacheWrapper(
      CacheKeys.latestExtrinsics(),
      async () => {
        try {
          return await this.getLatestExtrinsicsFromSubscan(query);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getLatestExtrinsics' });
          
          try {
            return await this.getLatestExtrinsicsFromRPC(query);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getLatestExtrinsics' });
            throw new Error('Failed to fetch latest extrinsics from all sources');
          }
        }
      },
      config.cache.ttl.blocks
    ).then(result => result.data);
  }

  async getExtrinsicByHash(hash: string): Promise<Extrinsic | null> {
    return cacheWrapper(
      CacheKeys.extrinsicByHash(hash),
      async () => {
        try {
          return await this.getExtrinsicFromSubscan(hash);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getExtrinsicByHash', hash });
          
          try {
            return await this.getExtrinsicFromRPC(hash);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getExtrinsicByHash', hash });
            return null;
          }
        }
      },
      config.cache.ttl.blockByHash
    ).then(result => result.data);
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    return cacheWrapper(
      CacheKeys.extrinsicsByBlock(blockNumber),
      async () => {
        try {
          return await this.getExtrinsicsByBlockFromSubscan(blockNumber);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getExtrinsicsByBlock', blockNumber });
          
          try {
            return await this.getExtrinsicsByBlockFromRPC(blockNumber);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getExtrinsicsByBlock', blockNumber });
            return [];
          }
        }
      },
      config.cache.ttl.blockByNumber
    ).then(result => result.data);
  }

  // ===========================================
  // ACCOUNT OPERATIONS
  // ===========================================

  async getAccountDetails(address: string): Promise<Account | null> {
    return cacheWrapper(
      CacheKeys.accountDetails(address),
      async () => {
        try {
          return await this.getAccountFromSubscan(address);
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getAccountDetails', address });
          
          try {
            return await this.getAccountFromRPC(address);
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getAccountDetails', address });
            return null;
          }
        }
      },
      config.cache.ttl.accountBalance
    ).then(result => result.data);
  }

  // ===========================================
  // CHAIN STATISTICS
  // ===========================================

  async getChainStats(): Promise<ChainStats> {
    return cacheWrapper(
      CacheKeys.chainStats(),
      async () => {
        try {
          return await this.getChainStatsFromSubscan();
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getChainStats' });
          
          try {
            return await this.getChainStatsFromRPC();
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getChainStats' });
            throw new Error('Failed to fetch chain stats from all sources');
          }
        }
      },
      config.cache.ttl.chainStats
    ).then(result => result.data);
  }

  // ===========================================
  // VALIDATOR OPERATIONS
  // ===========================================

  async getValidators(): Promise<Validator[]> {
    return cacheWrapper(
      CacheKeys.validatorsList(),
      async () => {
        try {
          return await this.getValidatorsFromSubscan();
        } catch (error) {
          logError(error as Error, { source: 'subscan', operation: 'getValidators' });
          
          try {
            return await this.getValidatorsFromRPC();
          } catch (rpcError) {
            logError(rpcError as Error, { source: 'rpc', operation: 'getValidators' });
            return [];
          }
        }
      },
      config.cache.ttl.validators
    ).then(result => result.data);
  }

  // ===========================================
  // SUBSCAN API IMPLEMENTATIONS
  // ===========================================

  private async getLatestBlocksFromSubscan(query: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    const response = await this.subscanApi.post('/api/scan/blocks', {
      row: query.limit || 20,
      page: (query.page || 1) - 1,
    });

    const blocks: Block[] = response.data.data.blocks.map((block: any) => ({
      number: BigInt(block.block_num),
      hash: block.hash,
      parentHash: block.parent_hash,
      stateRoot: block.state_root,
      timestamp: BigInt(block.block_timestamp),
      extrinsicsCount: block.extrinsics_count || 0,
      authorId: block.validator,
      finalized: block.finalized,
    }));

    return {
      blocks,
      total: response.data.data.count || 0,
    };
  }

  private async getBlockFromSubscan(number: bigint): Promise<Block | null> {
    const response = await this.subscanApi.post('/api/scan/block', {
      block_num: number.toString(),
    });

    if (!response.data.data) {
      return null;
    }

    const block = response.data.data;
    return {
      number: BigInt(block.block_num),
      hash: block.hash,
      parentHash: block.parent_hash,
      stateRoot: block.state_root,
      timestamp: BigInt(block.block_timestamp),
      extrinsicsCount: block.extrinsics_count || 0,
      authorId: block.validator,
      spec: block.spec_version,
      finalized: block.finalized,
    };
  }

  private async getBlockByHashFromSubscan(hash: string): Promise<Block | null> {
    const response = await this.subscanApi.post('/api/scan/block', {
      hash,
    });

    if (!response.data.data) {
      return null;
    }

    const block = response.data.data;
    return {
      number: BigInt(block.block_num),
      hash: block.hash,
      parentHash: block.parent_hash,
      stateRoot: block.state_root,
      timestamp: BigInt(block.block_timestamp),
      extrinsicsCount: block.extrinsics_count || 0,
      authorId: block.validator,
      spec: block.spec_version,
      finalized: block.finalized,
    };
  }

  private async getLatestExtrinsicsFromSubscan(query: ExtrinsicsQuery): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    const response = await this.subscanApi.post('/api/scan/extrinsics', {
      row: query.limit || 20,
      page: (query.page || 1) - 1,
      signed: 'all',
    });

    const extrinsics: Extrinsic[] = response.data.data.extrinsics.map((ext: any) => ({
      hash: ext.extrinsic_hash,
      blockNumber: BigInt(ext.block_num),
      extrinsicIndex: ext.extrinsic_index,
      module: ext.call_module,
      call: ext.call_module_function,
      success: ext.success,
      timestamp: BigInt(ext.block_timestamp),
      signer: ext.account_id || '',
      fee: BigInt(ext.fee || 0),
    }));

    return {
      extrinsics,
      total: response.data.data.count || 0,
    };
  }

  private async getExtrinsicFromSubscan(hash: string): Promise<Extrinsic | null> {
    const response = await this.subscanApi.post('/api/scan/extrinsic', {
      hash,
    });

    if (!response.data.data) {
      return null;
    }

    const ext = response.data.data;
    return {
      hash: ext.extrinsic_hash,
      blockNumber: BigInt(ext.block_num),
      extrinsicIndex: ext.extrinsic_index,
      module: ext.call_module,
      call: ext.call_module_function,
      success: ext.success,
      timestamp: BigInt(ext.block_timestamp),
      signer: ext.account_id || '',
      fee: BigInt(ext.fee || 0),
      args: ext.params,
    };
  }

  private async getExtrinsicsByBlockFromSubscan(blockNumber: bigint): Promise<Extrinsic[]> {
    const response = await this.subscanApi.post('/api/scan/extrinsics', {
      block: blockNumber.toString(),
      row: 100,
      page: 0,
    });

    return response.data.data.extrinsics.map((ext: any) => ({
      hash: ext.extrinsic_hash,
      blockNumber: BigInt(ext.block_num),
      extrinsicIndex: ext.extrinsic_index,
      module: ext.call_module,
      call: ext.call_module_function,
      success: ext.success,
      timestamp: BigInt(ext.block_timestamp),
      signer: ext.account_id || '',
      fee: BigInt(ext.fee || 0),
    }));
  }

  private async getAccountFromSubscan(address: string): Promise<Account | null> {
    const response = await this.subscanApi.post('/api/scan/account', {
      address,
    });

    if (!response.data.data) {
      return null;
    }

    const account = response.data.data;
    return {
      address,
      balance: BigInt(account.balance || 0),
      nonce: account.nonce || 0,
    };
  }

  private async getChainStatsFromSubscan(): Promise<ChainStats> {
    const response = await this.subscanApi.post('/api/scan/metadata', {});
    const metadata = response.data.data;

    return {
      blockHeight: BigInt(metadata.blockNum || 0),
      blockTime: metadata.blockTime || 6,
      totalIssuance: BigInt(metadata.totalIssuance || 0),
      activeValidators: metadata.count_validator || 0,
      nominators: metadata.count_nominator || 0,
      minimumStake: BigInt(0), // Not available in metadata
      averageStake: BigInt(0), // Not available in metadata
      inflation: 0, // Not available in metadata
      stakingRatio: 0, // Not available in metadata
      lastUpdateTime: BigInt(Date.now()),
    };
  }

  private async getValidatorsFromSubscan(): Promise<Validator[]> {
    const response = await this.subscanApi.post('/api/scan/staking/validators', {
      row: 100,
      page: 0,
    });

    return response.data.data.list.map((validator: any) => ({
      address: validator.controller_account_id,
      commission: validator.validator_prefs_value,
      selfStake: BigInt(validator.bonded || 0),
      totalStake: BigInt(validator.count_nominators || 0),
      active: validator.session_key !== null,
      nominators: validator.count_nominators || 0,
    }));
  }

  // ===========================================
  // RPC IMPLEMENTATIONS (Simplified)
  // ===========================================

  private async getLatestBlocksFromRPC(query: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    const start = Date.now();
    
    try {
      const latestHash = await this.api.rpc.chain.getFinalizedHead();
      const latestHeader = await this.api.rpc.chain.getHeader(latestHash);
      const latestNumber = latestHeader.number.toNumber();
      
      const limit = query.limit || 20;
      const blocks: Block[] = [];
      
      for (let i = 0; i < limit && latestNumber - i >= 0; i++) {
        const blockNumber = latestNumber - i;
        const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
        const block = await this.api.rpc.chain.getBlock(blockHash);
        const header = block.block.header;
        
        blocks.push({
          number: BigInt(header.number.toNumber()),
          hash: blockHash.toString(),
          parentHash: header.parentHash.toString(),
          stateRoot: header.stateRoot.toString(),
          timestamp: BigInt(Date.now()), // RPC doesn't have timestamp
          extrinsicsCount: block.block.extrinsics.length,
          finalized: true,
        });
      }
      
      const duration = Date.now() - start;
      logRpcCall('getLatestBlocks', duration, true);
      
      return { blocks, total: latestNumber };
    } catch (error) {
      const duration = Date.now() - start;
      logRpcCall('getLatestBlocks', duration, false);
      throw error;
    }
  }

  private async getBlockFromRPC(number: bigint): Promise<Block | null> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    const start = Date.now();
    
    try {
      const blockHash = await this.api.rpc.chain.getBlockHash(number.toString());
      const block = await this.api.rpc.chain.getBlock(blockHash);
      const header = block.block.header;
      
      const duration = Date.now() - start;
      logRpcCall('getBlock', duration, true);
      
      return {
        number: BigInt(header.number.toNumber()),
        hash: blockHash.toString(),
        parentHash: header.parentHash.toString(),
        stateRoot: header.stateRoot.toString(),
        timestamp: BigInt(Date.now()), // RPC doesn't have timestamp
        extrinsicsCount: block.block.extrinsics.length,
        finalized: true,
      };
    } catch (error) {
      const duration = Date.now() - start;
      logRpcCall('getBlock', duration, false);
      return null;
    }
  }

  private async getBlockByHashFromRPC(hash: string): Promise<Block | null> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    const start = Date.now();
    
    try {
      const block = await this.api.rpc.chain.getBlock(hash);
      const header = block.block.header;
      
      const duration = Date.now() - start;
      logRpcCall('getBlockByHash', duration, true);
      
      return {
        number: BigInt(header.number.toNumber()),
        hash: hash,
        parentHash: header.parentHash.toString(),
        stateRoot: header.stateRoot.toString(),
        timestamp: BigInt(Date.now()),
        extrinsicsCount: block.block.extrinsics.length,
        finalized: true,
      };
    } catch (error) {
      const duration = Date.now() - start;
      logRpcCall('getBlockByHash', duration, false);
      return null;
    }
  }

  private async getLatestExtrinsicsFromRPC(query: ExtrinsicsQuery): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    // Simplified implementation - would need more complex logic for RPC
    throw new Error('RPC extrinsic fetching not implemented');
  }

  private async getExtrinsicFromRPC(hash: string): Promise<Extrinsic | null> {
    // Simplified implementation - would need more complex logic for RPC
    throw new Error('RPC extrinsic fetching not implemented');
  }

  private async getExtrinsicsByBlockFromRPC(blockNumber: bigint): Promise<Extrinsic[]> {
    // Simplified implementation - would need more complex logic for RPC
    throw new Error('RPC extrinsic fetching not implemented');
  }

  private async getAccountFromRPC(address: string): Promise<Account | null> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    const start = Date.now();
    
    try {
      const accountInfo = await this.api.query.system.account(address);
      
      const duration = Date.now() - start;
      logRpcCall('getAccount', duration, true);
      
      return {
        address,
        balance: BigInt((accountInfo as any).data.free.toString()),
        nonce: (accountInfo as any).nonce.toNumber(),
      };
    } catch (error) {
      const duration = Date.now() - start;
      logRpcCall('getAccount', duration, false);
      return null;
    }
  }

  private async getChainStatsFromRPC(): Promise<ChainStats> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    const start = Date.now();
    
    try {
      const [latestHeader, totalIssuance] = await Promise.all([
        this.api.rpc.chain.getHeader(),
        this.api.query.balances.totalIssuance(),
      ]);
      
      const duration = Date.now() - start;
      logRpcCall('getChainStats', duration, true);
      
      return {
        blockHeight: BigInt(latestHeader.number.toNumber()),
        blockTime: 6, // Default Avail block time
        totalIssuance: BigInt(totalIssuance.toString()),
        activeValidators: 0, // Would need staking pallet query
        nominators: 0, // Would need staking pallet query
        minimumStake: BigInt(0),
        averageStake: BigInt(0),
        inflation: 0,
        stakingRatio: 0,
        lastUpdateTime: BigInt(Date.now()),
      };
    } catch (error) {
      const duration = Date.now() - start;
      logRpcCall('getChainStats', duration, false);
      throw error;
    }
  }

  private async getValidatorsFromRPC(): Promise<Validator[]> {
    if (!this.api || !this.isRpcConnected) {
      throw new Error('RPC not connected');
    }

    // Simplified implementation - would need staking pallet queries
    return [];
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  async getHealth(): Promise<{ rpc: boolean; subscan: boolean; subquery: boolean }> {
    const [rpcHealth, subscanHealth, subqueryHealth] = await Promise.all([
      this.checkRpcHealth(),
      this.checkSubscanHealth(),
      this.checkSubqueryHealth(),
    ]);

    return {
      rpc: rpcHealth,
      subscan: subscanHealth,
      subquery: subqueryHealth,
    };
  }

  private async checkRpcHealth(): Promise<boolean> {
    if (!this.api || !this.isRpcConnected) {
      return false;
    }

    try {
      await this.api.rpc.system.health();
      return true;
    } catch {
      return false;
    }
  }

  private async checkSubscanHealth(): Promise<boolean> {
    try {
      const response = await this.subscanApi.post('/api/scan/metadata', {});
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async checkSubqueryHealth(): Promise<boolean> {
    if (!this.subqueryApi) {
      return false;
    }

    try {
      const response = await this.subqueryApi.post('/', {
        query: '{ _metadata { lastProcessedHeight } }',
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const blockchainService = new BlockchainService();
export default blockchainService; 