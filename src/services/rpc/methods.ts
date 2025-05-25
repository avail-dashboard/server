import { ApiPromise } from '@polkadot/api';
import { Header, SignedBlock } from '@polkadot/types/interfaces';
import { u32, Vec } from '@polkadot/types';
import { RPCConnectionManager } from './connection';
import { logError, rpcLogger } from '../../utils/logger';
import { cache, CacheKeys } from '../../utils/cache';
import config from '../../config';
import {
  RPCMethodCall,
  RPCMethodResponse,
  DataAvailabilityProof,
  ApplicationData,
  AccountInfo,
  AccountBalance,
  RuntimeVersion,
  RuntimeMetadata,
  RPCConnection,
} from '../../types/rpc';
import {
  Block,
  Extrinsic,
  Account,
  ChainStats,
  Validator,
  BlocksQuery,
  ExtrinsicsQuery,
} from '../../types';

export class RPCMethodsService {
  private connectionManager: RPCConnectionManager;

  constructor(connectionManager: RPCConnectionManager) {
    this.connectionManager = connectionManager;
  }

  // ===========================================
  // CORE RPC EXECUTION
  // ===========================================

  private async executeRPCCall<T>(
    methodCall: RPCMethodCall,
    cacheKey?: string,
    cacheTTL?: number,
  ): Promise<RPCMethodResponse<T>> {
    const startTime = Date.now();
    let connection: RPCConnection | null = null;

    try {
      // Check cache first if enabled
      if (cacheKey && config.features.caching) {
        const cached = await cache.get(cacheKey);
        if (cached) {
          return {
            success: true,
            data: cached,
            metadata: {
              method: methodCall.method,
              duration: Date.now() - startTime,
              endpoint: 'cache',
              cached: true,
              timestamp: new Date(),
            },
          };
        }
      }

      // Get healthy connection
      connection = this.connectionManager.getHealthyConnection();
      if (!connection) {
        throw new Error('No healthy RPC connections available');
      }

      // Execute RPC call
      const result = await this.callRPCMethod(connection.api, methodCall);
      const duration = Date.now() - startTime;

      // Update connection metrics
      this.connectionManager.updateConnectionMetrics(connection.id, duration, true);

      // Cache result if enabled
      if (cacheKey && cacheTTL && config.features.caching) {
        await cache.set(cacheKey, result, cacheTTL);
      }

      rpcLogger.debug('RPC call successful', {
        method: methodCall.method,
        duration,
        endpoint: connection.endpoint,
        cached: false,
      });

      return {
        success: true,
        data: result,
        metadata: {
          method: methodCall.method,
          duration,
          endpoint: connection.endpoint,
          cached: false,
          timestamp: new Date(),
        },
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (connection) {
        this.connectionManager.updateConnectionMetrics(connection.id, duration, false);
      }

      logError(error as Error, {
        method: methodCall.method,
        params: methodCall.params,
        endpoint: connection?.endpoint,
        duration,
      });

      return {
        success: false,
        error: {
          code: -1,
          message: (error as Error).message,
          endpoint: connection?.endpoint,
        },
        metadata: {
          method: methodCall.method,
          duration,
          endpoint: connection?.endpoint || 'unknown',
          cached: false,
          timestamp: new Date(),
        },
      };
    }
  }

  private async callRPCMethod(api: ApiPromise, methodCall: RPCMethodCall): Promise<any> {
    const { method, params } = methodCall;
    
    // Parse method path (e.g., 'chain.getBlock' -> ['chain', 'getBlock'])
    const methodParts = method.split('.');
    
    if (methodParts.length !== 2) {
      throw new Error(`Invalid RPC method format: ${method}`);
    }

    const [module, methodName] = methodParts;
    
    // Navigate to the method
    const rpcModule = (api.rpc as any)[module];
    if (!rpcModule) {
      throw new Error(`RPC module not found: ${module}`);
    }

    const rpcMethod = rpcModule[methodName];
    if (!rpcMethod) {
      throw new Error(`RPC method not found: ${method}`);
    }

    // Execute the method with parameters
    return await rpcMethod(...params);
  }

  // ===========================================
  // BLOCK OPERATIONS
  // ===========================================

  async getLatestBlocks(query: BlocksQuery = {}): Promise<{ blocks: Block[]; total: number }> {
    const { limit = 20, page = 1 } = query;
    
    try {
      // Get latest block number
      const latestHeader = await this.executeRPCCall<Header>({
        method: 'chain.getHeader',
        params: [],
      });

      if (!latestHeader.success || !latestHeader.data) {
        throw new Error('Failed to get latest block header');
      }

      const latestBlockNumber = latestHeader.data.number.toNumber();
      const startBlock = Math.max(1, latestBlockNumber - ((page - 1) * limit) - limit + 1);
      const endBlock = Math.max(1, latestBlockNumber - ((page - 1) * limit));

      // Fetch blocks in parallel
      const blockPromises: Promise<Block | null>[] = [];
      for (let i = endBlock; i >= startBlock; i--) {
        blockPromises.push(this.getBlockByNumber(BigInt(i)));
      }

      const blocks = (await Promise.all(blockPromises)).filter(Boolean) as Block[];

      return {
        blocks,
        total: latestBlockNumber,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getLatestBlocks', query });
      throw error;
    }
  }

  async getBlockByNumber(blockNumber: bigint): Promise<Block | null> {
    const cacheKey = CacheKeys.blockByNumber(blockNumber);
    
    const response = await this.executeRPCCall<SignedBlock>(
      {
        method: 'chain.getBlock',
        params: [await this.getBlockHashByNumber(blockNumber)],
      },
      cacheKey,
      config.cache.ttl.blockByNumber,
    );

    if (!response.success || !response.data) {
      return null;
    }

    return this.transformSignedBlockToBlock(response.data);
  }

  async getBlockByHash(blockHash: string): Promise<Block | null> {
    const cacheKey = CacheKeys.blockByHash(blockHash);
    
    const response = await this.executeRPCCall<SignedBlock>(
      {
        method: 'chain.getBlock',
        params: [blockHash],
      },
      cacheKey,
      config.cache.ttl.blockByHash,
    );

    if (!response.success || !response.data) {
      return null;
    }

    return this.transformSignedBlockToBlock(response.data);
  }

  private async getBlockHashByNumber(blockNumber: bigint): Promise<string> {
    const response = await this.executeRPCCall<string>({
      method: 'chain.getBlockHash',
      params: [blockNumber.toString()],
    });

    if (!response.success || !response.data) {
      throw new Error(`Failed to get block hash for block ${blockNumber}`);
    }

    return response.data;
  }

  private transformSignedBlockToBlock(signedBlock: SignedBlock): Block {
    const header = signedBlock.block.header;
    const extrinsics = signedBlock.block.extrinsics;

    return {
      number: BigInt(header.number.toString()),
      hash: header.hash.toString(),
      parentHash: header.parentHash.toString(),
      stateRoot: header.stateRoot.toString(),
      timestamp: BigInt(Date.now()), // TODO: Extract from block
      extrinsicsCount: extrinsics.length,
      extrinsicsRoot: header.extrinsicsRoot.toString(),
      size: JSON.stringify(signedBlock).length,
      finalized: true, // TODO: Check finalization status
    };
  }

  // ===========================================
  // EXTRINSIC OPERATIONS
  // ===========================================

  async getLatestExtrinsics(query: ExtrinsicsQuery = {}): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    const { limit = 20, page = 1 } = query;
    
    try {
      // Get latest blocks and extract extrinsics
      const blocksResult = await this.getLatestBlocks({ limit: Math.ceil(limit / 5), page: 1 });
      const allExtrinsics: Extrinsic[] = [];

      for (const block of blocksResult.blocks) {
        const blockExtrinsics = await this.getExtrinsicsByBlock(block.number);
        allExtrinsics.push(...blockExtrinsics);
      }

      // Sort by timestamp and paginate
      allExtrinsics.sort((a, b) => Number(b.timestamp - a.timestamp));
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedExtrinsics = allExtrinsics.slice(startIndex, endIndex);

      return {
        extrinsics: paginatedExtrinsics,
        total: allExtrinsics.length,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getLatestExtrinsics', query });
      throw error;
    }
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    try {
      const block = await this.getBlockByNumber(blockNumber);
      if (!block) {
        return [];
      }

      const blockHash = await this.getBlockHashByNumber(blockNumber);
      const signedBlock = await this.executeRPCCall<SignedBlock>({
        method: 'chain.getBlock',
        params: [blockHash],
      });

      if (!signedBlock.success || !signedBlock.data) {
        return [];
      }

      return signedBlock.data.block.extrinsics.map((ext, index) => 
        this.transformExtrinsic(ext, blockNumber, index, block.timestamp),
      );
    } catch (error) {
      logError(error as Error, { operation: 'getExtrinsicsByBlock', blockNumber });
      return [];
    }
  }

  private transformExtrinsic(
    extrinsic: any,
    blockNumber: bigint,
    index: number,
    timestamp: bigint,
  ): Extrinsic {
    return {
      hash: extrinsic.hash.toString(),
      blockNumber,
      extrinsicIndex: index,
      module: extrinsic.method.section,
      call: extrinsic.method.method,
      success: true, // TODO: Check events for success/failure
      timestamp,
      signer: extrinsic.signer?.toString() || '',
      fee: BigInt(0), // TODO: Calculate fee from events
      args: extrinsic.method.args,
    };
  }

  // ===========================================
  // ACCOUNT OPERATIONS
  // ===========================================

  async getAccountDetails(address: string): Promise<Account | null> {
    try {
      const [accountInfo, balance] = await Promise.all([
        this.getAccountInfo(address),
        this.getAccountBalance(address),
      ]);

      if (!accountInfo || !balance) {
        return null;
      }

      return {
        address,
        balance: BigInt(balance.free),
        nonce: parseInt(accountInfo.nonce),
        accountInfo: {
          free: BigInt(balance.free),
          reserved: BigInt(balance.reserved),
          frozen: BigInt(balance.miscFrozen),
          flags: BigInt(0),
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getAccountDetails', address });
      return null;
    }
  }

  private async getAccountInfo(address: string): Promise<AccountInfo | null> {
    const response = await this.executeRPCCall<AccountInfo>({
      method: 'system.account',
      params: [address],
    });

    return response.success ? response.data || null : null;
  }

  private async getAccountBalance(address: string): Promise<AccountBalance | null> {
    const response = await this.executeRPCCall<any>({
      method: 'system.account',
      params: [address],
    });

    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data.data;
    return {
      free: data.free.toString(),
      reserved: data.reserved.toString(),
      miscFrozen: data.miscFrozen.toString(),
      feeFrozen: data.feeFrozen.toString(),
      total: (BigInt(data.free) + BigInt(data.reserved)).toString(),
      transferable: (BigInt(data.free) - BigInt(data.miscFrozen)).toString(),
    };
  }

  // ===========================================
  // CHAIN STATE OPERATIONS
  // ===========================================

  async getChainStats(): Promise<ChainStats> {
    try {
      const [header, validators, totalIssuance] = await Promise.all([
        this.executeRPCCall<Header>({ method: 'chain.getHeader', params: [] }),
        this.getValidators(),
        this.getTotalIssuance(),
      ]);

      if (!header.success || !header.data) {
        throw new Error('Failed to get chain header');
      }

      const blockHeight = BigInt(header.data.number.toString());
      
      return {
        blockHeight,
        blockTime: 6, // Avail block time in seconds
        totalIssuance: BigInt(totalIssuance || '0'),
        activeValidators: validators.length,
        nominators: 0, // TODO: Get nominator count
        minimumStake: BigInt(0), // TODO: Get minimum stake
        averageStake: BigInt(0), // TODO: Calculate average stake
        inflation: 0, // TODO: Calculate inflation
        stakingRatio: 0, // TODO: Calculate staking ratio
        lastUpdateTime: BigInt(Date.now()),
      };
    } catch (error) {
      logError(error as Error, { operation: 'getChainStats' });
      throw error;
    }
  }

  private async getTotalIssuance(): Promise<string> {
    const response = await this.executeRPCCall<string>({
      method: 'query.balances.totalIssuance',
      params: [],
    });

    return response.success ? response.data || '0' : '0';
  }

  // ===========================================
  // VALIDATOR OPERATIONS
  // ===========================================

  async getValidators(): Promise<Validator[]> {
    const cacheKey = CacheKeys.validatorsList();
    
    try {
      const response = await this.executeRPCCall<Vec<u32>>(
        {
          method: 'query.session.validators',
          params: [],
        },
        cacheKey,
        config.cache.ttl.validators,
      );

      if (!response.success || !response.data) {
        return [];
      }

      // Transform validator data
      const validators: Validator[] = [];
      for (const validatorId of response.data) {
        const validator = await this.getValidatorInfo(validatorId.toString());
        if (validator) {
          validators.push(validator);
        }
      }

      return validators;
    } catch (error) {
      logError(error as Error, { operation: 'getValidators' });
      return [];
    }
  }

  private async getValidatorInfo(address: string): Promise<Validator | null> {
    try {
      const [prefs, exposure, identity] = await Promise.all([
        this.getValidatorPrefs(address),
        this.getValidatorExposure(address),
        this.getValidatorIdentity(address),
      ]);

      return {
        address,
        identity,
        commission: prefs?.commission || '0',
        selfStake: BigInt(exposure?.own || '0'),
        totalStake: BigInt(exposure?.total || '0'),
        active: true,
        nominators: exposure?.others?.length || 0,
        ownStake: BigInt(exposure?.own || '0'),
        othersStake: BigInt(
          exposure?.others?.reduce((sum, nominator) => sum + BigInt(nominator.value), BigInt(0)) || '0',
        ),
        prefs: prefs ? {
          commission: prefs.commission,
          blocked: prefs.blocked,
        } : undefined,
      };
    } catch (error) {
      logError(error as Error, { operation: 'getValidatorInfo', address });
      return null;
    }
  }

  private async getValidatorPrefs(address: string): Promise<{ commission: string; blocked: boolean } | null> {
    const response = await this.executeRPCCall({
      method: 'query.staking.validators',
      params: [address],
    });

    return response.success ? response.data : null;
  }

  private async getValidatorExposure(address: string): Promise<any> {
    const response = await this.executeRPCCall({
      method: 'query.staking.erasStakers',
      params: [null, address], // null for current era
    });

    return response.success ? response.data : null;
  }

  private async getValidatorIdentity(address: string): Promise<any> {
    const response = await this.executeRPCCall({
      method: 'query.identity.identityOf',
      params: [address],
    });

    return response.success ? response.data?.unwrapOr(null) : null;
  }

  // ===========================================
  // AVAIL-SPECIFIC OPERATIONS
  // ===========================================

  async getDataAvailabilityProof(
    blockHash: string,
    extrinsicIndex: number,
  ): Promise<DataAvailabilityProof | null> {
    try {
      const response = await this.executeRPCCall<DataAvailabilityProof>({
        method: 'kate.queryProof',
        params: [blockHash, extrinsicIndex],
      });

      return response.success ? response.data || null : null;
    } catch (error) {
      logError(error as Error, { 
        operation: 'getDataAvailabilityProof', 
        blockHash, 
        extrinsicIndex,
      });
      return null;
    }
  }

  async getApplicationData(blockHash: string, appId: number): Promise<ApplicationData[]> {
    try {
      const response = await this.executeRPCCall<ApplicationData[]>({
        method: 'kate.queryDataProof',
        params: [blockHash, appId],
      });

      return response.success ? response.data || [] : [];
    } catch (error) {
      logError(error as Error, { 
        operation: 'getApplicationData', 
        blockHash, 
        appId,
      });
      return [];
    }
  }

  async getBlockDataRoot(blockHash: string): Promise<string | null> {
    try {
      const response = await this.executeRPCCall<string>({
        method: 'kate.blockLength',
        params: [blockHash],
      });

      return response.success ? response.data || null : null;
    } catch (error) {
      logError(error as Error, { operation: 'getBlockDataRoot', blockHash });
      return null;
    }
  }

  // ===========================================
  // RUNTIME OPERATIONS
  // ===========================================

  async getRuntimeVersion(): Promise<RuntimeVersion | null> {
    try {
      const response = await this.executeRPCCall<RuntimeVersion>({
        method: 'state.getRuntimeVersion',
        params: [],
      });

      return response.success ? response.data || null : null;
    } catch (error) {
      logError(error as Error, { operation: 'getRuntimeVersion' });
      return null;
    }
  }

  async getRuntimeMetadata(): Promise<RuntimeMetadata | null> {
    try {
      const response = await this.executeRPCCall<RuntimeMetadata>({
        method: 'state.getMetadata',
        params: [],
      });

      return response.success ? response.data || null : null;
    } catch (error) {
      logError(error as Error, { operation: 'getRuntimeMetadata' });
      return null;
    }
  }

  // ===========================================
  // HEALTH CHECK
  // ===========================================

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const healthStatus = await this.connectionManager.getHealthStatus();
      
      return {
        healthy: healthStatus.healthy,
        details: {
          activeConnections: healthStatus.activeConnections,
          totalConnections: healthStatus.totalConnections,
          healthChecks: healthStatus.healthChecks,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getHealth' });
      return {
        healthy: false,
        details: { error: (error as Error).message },
      };
    }
  }
} 