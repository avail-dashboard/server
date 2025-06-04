import { ApiPromise } from '@polkadot/api';
import { WsProvider } from '@polkadot/rpc-provider';
import { TypeRegistry } from '@polkadot/types';
import { Keyring } from '@polkadot/keyring';
import { EventEmitter } from 'events';
import { AvailRPCService } from './rpc';
import { DirectAvailWebSocketService } from './rpc/direct-websocket';
import { logError, rpcLogger } from '../utils/logger';
import config from '../config';
import {
  Block,
  Extrinsic,
  Account,
  ChainStats,
  BlocksQuery,
  ExtrinsicsQuery,
  DataSubmissionQuery,
} from '../types';
import {
  DataAvailabilityProof,
  ApplicationData,
} from '../types/rpc';
import { cryptoWaitReady } from '@polkadot/util-crypto';

export interface HybridCapabilities {
  // Standard Polkadot SDK capabilities
  standardRPC: {
    blocks: boolean;
    extrinsics: boolean;
    accounts: boolean;
    chainState: boolean;
    staking: boolean;
    runtime: boolean;
    events: boolean;
    storage: boolean;
  };
  // Avail-specific capabilities
  availSpecific: {
    dataAvailability: boolean;
    kateCommitments: boolean;
    applicationData: boolean;
    proofs: boolean;
    blobs: boolean;
  };
}

// Type guards for Polkadot API responses
interface PolkadotAccountInfo {
  nonce: {
    toNumber(): number;
  };
  data: {
    free: {
      toString(): string;
    };
    reserved: {
      toString(): string;
    };
    frozen: {
      toString(): string;
    };
    flags: {
      toString(): string;
    };
  };
}

export class HybridRPCService extends EventEmitter {
  private api?: ApiPromise;
  private availRPC: AvailRPCService;
  private directWS: DirectAvailWebSocketService | null = null;
  private registry: TypeRegistry;
  private keyring?: Keyring;
  private isInitialized = false;
  private capabilities: HybridCapabilities;

  constructor() {
    super();
    this.availRPC = new AvailRPCService();
    
    // Initialize DirectWS only if enabled in config
    if (config.dataSources.directWS.enabled) {
      this.directWS = new DirectAvailWebSocketService({
        endpoint: config.dataSources.directWS.endpoint,
        reconnectAttempts: config.dataSources.directWS.reconnectAttempts,
        reconnectDelay: config.dataSources.directWS.reconnectDelay,
        requestTimeout: config.dataSources.directWS.requestTimeout,
        pingInterval: config.dataSources.directWS.pingInterval,
      });
    }
    
    this.registry = new TypeRegistry();
    this.capabilities = this.initializeCapabilities();
    this.setupEventHandlers();
  }

  private initializeCapabilities(): HybridCapabilities {
    return {
      standardRPC: {
        blocks: true,
        extrinsics: true,
        accounts: true,
        chainState: true,
        staking: true,
        runtime: true,
        events: true,
        storage: true,
      },
      availSpecific: {
        dataAvailability: false, // Will be set during initialization
        kateCommitments: false,
        applicationData: false,
        proofs: false,
        blobs: false,
      },
    };
  }

  private setupEventHandlers(): void {
    // Forward Direct WebSocket events (only if enabled)
    if (this.directWS) {
      this.directWS.on('connected', () => {
        this.emit('hybrid:directws:connected');
        rpcLogger.info('DirectWS: Primary connection established');
      });

      this.directWS.on('disconnected', (info) => {
        this.emit('hybrid:directws:disconnected', info);
        rpcLogger.warn('DirectWS: Primary connection lost', info);
      });

      this.directWS.on('error', (error) => {
        this.emit('hybrid:directws:error', error);
        logError(error, { component: 'hybrid-rpc-directws' });
      });
    }

    // Forward Avail RPC events
    this.availRPC.on('rpc:connection:established', (connection) => {
      this.emit('hybrid:avail:connected', connection);
    });

    this.availRPC.on('rpc:connection:lost', (connection) => {
      this.emit('hybrid:avail:disconnected', connection);
    });

    this.availRPC.on('rpc:connection:error', (connection, error) => {
      this.emit('hybrid:avail:error', connection, error);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      rpcLogger.warn('Hybrid RPC service already initialized');
      return;
    }

    try {
      const directWSEnabled = config.dataSources.directWS.enabled;
      rpcLogger.info('Initializing Hybrid RPC Service', { directWSEnabled });

      // Initialize crypto
      await cryptoWaitReady();
      
      // Initialize keyring
      this.keyring = new Keyring({ type: 'sr25519' });

      // Initialize Direct WebSocket as primary (if enabled)
      if (this.directWS) {
        try {
          await this.directWS.connect();
          rpcLogger.info('DirectWS: Primary connection established successfully');
        } catch (error) {
          rpcLogger.warn('DirectWS: Primary connection failed, will use fallbacks', { error });
        }
      }

      // Initialize Polkadot API as secondary
      await this.initializePolkadotAPI();

      // Initialize Avail RPC as tertiary fallback
      await this.availRPC.initialize();

      // Test capabilities
      await this.testCapabilities();

      this.isInitialized = true;
      this.emit('hybrid:initialized', this.capabilities);

      rpcLogger.info('Hybrid RPC Service initialized successfully', { 
        capabilities: this.capabilities,
        directWSHealthy: this.directWS?.isHealthy() || false,
        polkadotAPIAvailable: this.isPolkadotAPIAvailable(),
        availRPCAvailable: this.isAvailRPCAvailable(),
      });
    } catch (error) {
      logError(error as Error, { component: 'hybrid-rpc-service', action: 'initialize' });
      throw error;
    }
  }

  private async initializePolkadotAPI(): Promise<void> {
    try {
      const provider = new WsProvider(config.dataSources.rpc.endpoints[0]);
      
      // Configure API to handle Avail-specific features
      this.api = await ApiPromise.create({ 
        provider,
        throwOnConnect: false,
        throwOnUnknown: false,
        // Suppress warnings for unknown types and extensions
        noInitWarn: true,
        // Add custom types for Avail if needed
        types: {
          // Add any Avail-specific types here if available
        },
        // Suppress specific warnings
        typesBundle: {
          spec: {
            avail: {
              types: [
                {
                  // Version range for Avail runtime
                  minmax: [0, undefined],
                  types: {
                    // Define CheckAppId and other Avail-specific types
                    CheckAppId: 'u32',
                    AppId: 'u32',
                    // Add other Avail-specific types as needed
                  },
                },
              ],
            },
          },
        },
      });

      await this.api.isReady;
      this.emit('hybrid:polkadot:connected');
      
      rpcLogger.info('Polkadot API initialized successfully for Avail network');
    } catch (error) {
      rpcLogger.warn('Failed to initialize Polkadot API, falling back to Avail RPC only', { error });
      this.capabilities.standardRPC = {
        blocks: false,
        extrinsics: false,
        accounts: false,
        chainState: false,
        staking: false,
        runtime: false,
        events: false,
        storage: false,
      };
    }
  }

  private async testCapabilities(): Promise<void> {
    try {
      // Test Avail-specific capabilities
      if (this.availRPC) {
        // Test data availability proof
        try {
          const latestBlocks = await this.availRPC.getLatestBlocks({ limit: 1 });
          if (latestBlocks.blocks.length > 0) {
            const testBlock = latestBlocks.blocks[0];
            await this.availRPC.getDataAvailabilityProof(testBlock.hash, 0);
            this.capabilities.availSpecific.dataAvailability = true;
            this.capabilities.availSpecific.proofs = true;
          }
        } catch (error) {
          rpcLogger.warn('Data availability proof test failed', { error });
        }

        // Test application data
        try {
          await this.availRPC.getApplicationData('latest', 0);
          this.capabilities.availSpecific.applicationData = true;
          this.capabilities.availSpecific.blobs = true;
        } catch (error) {
          rpcLogger.warn('Application data test failed', { error });
        }
      }

      rpcLogger.info('Capability testing completed', { capabilities: this.capabilities });
    } catch (error) {
      logError(error as Error, { component: 'hybrid-rpc-capabilities' });
    }
  }

  // ===========================================
  // HYBRID BLOCK OPERATIONS
  // ===========================================

  async getLatestBlocks(query?: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    this.ensureInitialized();

    // Try DirectWS first (primary)
    if (this.directWS?.isHealthy()) {
      try {
        const blocks = await this.directWS.getLatestBlocks(query?.limit || 10);
        return { blocks, total: blocks.length };
      } catch (error) {
        rpcLogger.warn('DirectWS getLatestBlocks failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    return this.availRPC.getLatestBlocks(query);
  }

  private async getLatestBlocksPolkadot(query?: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    if (!this.api) {
      throw new Error('Polkadot API not initialized');
    }

    const limit = query?.limit || 10;
    const latestHeader = await this.api.rpc.chain.getHeader();
    const latestNumber = latestHeader.number.toNumber();

    const blocks: Block[] = [];
    const startBlock = Math.max(0, latestNumber - limit + 1);

    for (let i = latestNumber; i >= startBlock && blocks.length < limit; i--) {
      try {
        const hash = await this.api.rpc.chain.getBlockHash(i);
        const [block, header] = await Promise.all([
          this.api.rpc.chain.getBlock(hash),
          this.api.rpc.chain.getHeader(hash),
        ]);

        const blockData: Block = {
          number: BigInt(i),
          hash: hash.toString(),
          parentHash: header.parentHash.toString(),
          stateRoot: header.stateRoot.toString(),
          timestamp: BigInt(Date.now()), // Would need to extract from timestamp extrinsic
          extrinsicsCount: block.block.extrinsics.length,
          extrinsicsRoot: header.extrinsicsRoot.toString(),
          size: block.encodedLength,
        };

        blocks.push(blockData);
      } catch (error) {
        rpcLogger.warn(`Failed to fetch block ${i}`, { error });
      }
    }

    return { blocks, total: latestNumber + 1 };
  }

  async getBlockByNumber(blockNumber: bigint): Promise<Block | null> {
    this.ensureInitialized();

    // Try DirectWS first (primary)
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getBlockByNumber(blockNumber);
      } catch (error) {
        rpcLogger.warn('DirectWS getBlockByNumber failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    return this.availRPC.getBlockByNumber(blockNumber);
  }

  private async getBlockByNumberPolkadot(blockNumber: bigint): Promise<Block | null> {
    if (!this.api) {
      throw new Error('Polkadot API not initialized');
    }

    try {
      const hash = await this.api.rpc.chain.getBlockHash(Number(blockNumber));
      const [block, header] = await Promise.all([
        this.api.rpc.chain.getBlock(hash),
        this.api.rpc.chain.getHeader(hash),
      ]);

      return {
        number: blockNumber,
        hash: hash.toString(),
        parentHash: header.parentHash.toString(),
        stateRoot: header.stateRoot.toString(),
        timestamp: BigInt(Date.now()), // Extract from timestamp extrinsic
        extrinsicsCount: block.block.extrinsics.length,
        extrinsicsRoot: header.extrinsicsRoot.toString(),
        size: block.encodedLength,
      };
    } catch (error) {
      rpcLogger.warn(`Block ${blockNumber} not found`, { error });
      return null;
    }
  }

  // ===========================================
  // HYBRID EXTRINSIC OPERATIONS  
  // ===========================================

  async getLatestExtrinsics(query?: ExtrinsicsQuery): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    this.ensureInitialized();

    // For now, use Avail RPC due to complex extrinsic parsing requirements
    // DirectWS could be enhanced later for better extrinsic support
    return this.availRPC.getLatestExtrinsics(query);
  }

  async getExtrinsicsByBlock(blockNumber: bigint): Promise<Extrinsic[]> {
    this.ensureInitialized();

    // Try DirectWS first (primary)
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getExtrinsicsByBlock(blockNumber);
      } catch (error) {
        rpcLogger.warn('DirectWS getExtrinsicsByBlock failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    return this.availRPC.getExtrinsicsByBlock(blockNumber);
  }

  private async getLatestExtrinsicsPolkadot(query?: ExtrinsicsQuery): Promise<{ extrinsics: Extrinsic[]; total: number }> {
    if (!this.api) {
      throw new Error('Polkadot API not initialized');
    }

    const limit = query?.limit || 10;
    const latestHeader = await this.api.rpc.chain.getHeader();
    const latestNumber = latestHeader.number.toNumber();

    const extrinsics: Extrinsic[] = [];
    let totalExtrinsics = 0;

    // Search through recent blocks for extrinsics
    for (let blockNum = latestNumber; blockNum >= Math.max(0, latestNumber - 100) && extrinsics.length < limit; blockNum--) {
      try {
        const hash = await this.api.rpc.chain.getBlockHash(blockNum);
        const block = await this.api.rpc.chain.getBlock(hash);
        
        totalExtrinsics += block.block.extrinsics.length;

        block.block.extrinsics.forEach((ext, index) => {
          if (extrinsics.length >= limit) {
            return;
          }

          const extrinsic: Extrinsic = {
            hash: ext.hash.toString(),
            blockNumber: BigInt(blockNum),
            extrinsicIndex: index,
            module: ext.method.section,
            call: ext.method.method,
            signer: ext.signer?.toString() || '',
            signature: ext.signature?.toString() || '',
            fee: BigInt(0), // Would need to calculate from events
            success: true, // Would need to check events
            timestamp: BigInt(Date.now()), // Extract from block
          };

          extrinsics.push(extrinsic);
        });
      } catch (error) {
        rpcLogger.warn(`Failed to fetch extrinsics from block ${blockNum}`, { error });
      }
    }

    return { extrinsics, total: totalExtrinsics };
  }

  // ===========================================
  // HYBRID ACCOUNT OPERATIONS
  // ===========================================

  async getAccountDetails(address: string): Promise<Account | null> {
    this.ensureInitialized();

    // Try DirectWS first (primary)
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getAccountDetails(address);
      } catch (error) {
        rpcLogger.warn('DirectWS getAccountDetails failed, falling back to Polkadot API', { error });
      }
    }

    // Try Polkadot API as secondary
    if (this.capabilities.standardRPC.accounts && this.api) {
      try {
        return await this.getAccountDetailsPolkadot(address);
      } catch (error) {
        rpcLogger.warn('Polkadot API account fetch failed, falling back to Avail RPC', { error });
      }
    }

    // Final fallback to Avail RPC
    return this.availRPC.getAccountDetails(address);
  }

  private async getAccountDetailsPolkadot(address: string): Promise<Account | null> {
    if (!this.api) {
      throw new Error('Polkadot API not initialized');
    }

    try {
      const accountInfo = await this.api.query.system.account(address);
      
      // Type-safe casting for Polkadot API response
      const accountData = accountInfo as unknown as PolkadotAccountInfo;

      return {
        address,
        balance: BigInt(accountData.data.free.toString()),
        nonce: accountData.nonce.toNumber(),
        accountInfo: {
          free: BigInt(accountData.data.free.toString()),
          reserved: BigInt(accountData.data.reserved.toString()),
          frozen: BigInt(accountData.data.frozen.toString()),
          flags: BigInt(accountData.data.flags.toString()),
        },
      };
    } catch (error) {
      rpcLogger.warn(`Account details not found for ${address}`, { error });
      return null;
    }
  }

  // ===========================================
  // AVAIL-SPECIFIC OPERATIONS (Enhanced with DirectWS)
  // ===========================================

  async getDataAvailabilityProof(blockHash: string, extrinsicIndex: number): Promise<DataAvailabilityProof | null> {
    this.ensureInitialized();
    
    // Try DirectWS first for Avail-specific methods
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getDataAvailabilityProof(blockHash, extrinsicIndex);
      } catch (error) {
        rpcLogger.warn('DirectWS getDataAvailabilityProof failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    if (!this.capabilities.availSpecific.dataAvailability) {
      throw new Error('Data availability proofs not supported');
    }
    return this.availRPC.getDataAvailabilityProof(blockHash, extrinsicIndex);
  }

  async getApplicationData(blockHash: string, appId: number): Promise<ApplicationData[]> {
    this.ensureInitialized();
    
    // Try DirectWS first for Avail-specific methods
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getApplicationData(blockHash, appId);
      } catch (error) {
        rpcLogger.warn('DirectWS getApplicationData failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    if (!this.capabilities.availSpecific.applicationData) {
      throw new Error('Application data not supported');
    }
    return this.availRPC.getApplicationData(blockHash, appId);
  }

  async getDataSubmissions(query: DataSubmissionQuery = {}) {
    rpcLogger.error('hybridRPC_getDataSubmissions_CALLED', { query });
    this.ensureInitialized();
    
    // For data submissions, skip DirectWS as it has issues with extrinsic extraction
    // Go directly to AvailRPC where our enhanced method is implemented
    rpcLogger.error('hybridRPC_skipping_DirectWS_for_data_submissions', { reason: 'DirectWS extrinsic extraction issues' });
    
    rpcLogger.error('hybridRPC_falling_back_to_AvailRPC', { capabilities: this.capabilities.availSpecific.blobs });
    // Use Avail RPC directly
    if (!this.capabilities.availSpecific.blobs) {
      throw new Error('Data submissions not supported');
    }
    return this.availRPC.getDataSubmissions(query);
  }

  async getBlockDataRoot(blockHash: string): Promise<string | null> {
    this.ensureInitialized();
    
    // Try DirectWS first for Avail-specific methods
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getBlockDataRoot(blockHash);
      } catch (error) {
        rpcLogger.warn('DirectWS getBlockDataRoot failed, falling back to Avail RPC', { error });
      }
    }

    // Fallback to Avail RPC
    return this.availRPC.getBlockDataRoot(blockHash);
  }

  // ===========================================
  // NEW AVAIL DA EXPLORER FEATURES
  // ===========================================

  async getAppIds(): Promise<any[]> {
    this.ensureInitialized();
    // This would need to be implemented in AvailRPCService
    // For now, return empty array
    return [];
  }

  async createAppId(_name: string, _signer: string): Promise<any> {
    this.ensureInitialized();
    // This would need to be implemented in AvailRPCService
    // For now, throw not implemented error
    throw new Error('createAppId not yet implemented');
  }

  async getRollupAnalytics(appId: number, timeframe: 'day' | 'week' | 'month' = 'day'): Promise<any> {
    this.ensureInitialized();
    // This would need to be implemented in AvailRPCService
    // For now, return basic analytics
    return {
      appId,
      timeframe,
      dataSubmissions: 0,
      totalSize: 0,
      fees: 0,
    };
  }

  async getValidators(): Promise<any[]> {
    this.ensureInitialized();
    
    if (this.capabilities.standardRPC.staking && this.api) {
      try {
        // Try Polkadot SDK first for better performance
        const validators = await this.api.query.staking.validators.entries();
        return validators.map(([key, value]) => ({
          address: key.args[0].toString(),
          preferences: value.toJSON(),
        }));
      } catch (error) {
        rpcLogger.warn('Polkadot API validator fetch failed, falling back to Avail RPC', { error });
      }
    }
    
    return this.availRPC.getValidators();
  }

  async getNominationPools(): Promise<any[]> {
    this.ensureInitialized();
    // This would need to be implemented in AvailRPCService
    // For now, return empty array
    return [];
  }

  async getStakingInfo(): Promise<any> {
    this.ensureInitialized();
    
    if (this.capabilities.standardRPC.staking && this.api) {
      try {
        const [activeEra, totalIssuance, validatorCount] = await Promise.all([
          this.api.query.staking.activeEra(),
          this.api.query.balances.totalIssuance(),
          this.api.query.staking.validatorCount(),
        ]);
        
        return {
          activeEra: activeEra.toJSON(),
          totalIssuance: totalIssuance.toString(),
          validatorCount: (validatorCount as any).toNumber(),
        };
      } catch (error) {
        rpcLogger.warn('Polkadot API staking info failed, falling back to Avail RPC', { error });
      }
    }
    
    // Use getChainStats as fallback since getStakingInfo doesn't exist
    const chainStats = await this.availRPC.getChainStats();
    return {
      activeValidators: chainStats.activeValidators,
      nominators: chainStats.nominators,
      minimumStake: chainStats.minimumStake,
      totalIssuance: chainStats.totalIssuance,
    };
  }

  // ===========================================
  // HYBRID CHAIN STATE OPERATIONS
  // ===========================================

  async getChainStats(): Promise<ChainStats> {
    this.ensureInitialized();

    // Try DirectWS first (primary)
    if (this.directWS?.isHealthy()) {
      try {
        return await this.directWS.getChainStats();
      } catch (error) {
        rpcLogger.warn('DirectWS getChainStats failed, falling back to Polkadot API', { error });
      }
    }

    // Try Polkadot API as secondary
    if (this.capabilities.standardRPC.chainState && this.api) {
      try {
        return await this.getChainStatsPolkadot();
      } catch (error) {
        rpcLogger.warn('Polkadot API chain stats failed, falling back to Avail RPC', { error });
      }
    }

    // Final fallback to Avail RPC
    return this.availRPC.getChainStats();
  }

  private async getChainStatsPolkadot(): Promise<ChainStats> {
    if (!this.api) {
      throw new Error('Polkadot API not initialized');
    }

    const [header] = await Promise.all([
      this.api.rpc.chain.getHeader(),
      this.api.rpc.state.getRuntimeVersion(),
    ]);

    return {
      blockHeight: BigInt(header.number.toNumber()),
      blockTime: 20000, // Default 20s, would need to calculate
      totalIssuance: BigInt(0), // Would need to query balances.totalIssuance
      activeValidators: 0, // Would need to query staking.validatorCount
      nominators: 0, // Would need to query staking.counterForNominators
      minimumStake: BigInt(0), // Would need to query staking.minNominatorBond
      averageStake: BigInt(0), // Would need to calculate
      inflation: 0, // Would need to calculate
      stakingRatio: 0, // Would need to calculate
      lastUpdateTime: BigInt(Date.now()),
    };
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  getCapabilities(): HybridCapabilities {
    return { ...this.capabilities };
  }

  isPolkadotAPIAvailable(): boolean {
    return !!this.api && this.api.isConnected;
  }

  isAvailRPCAvailable(): boolean {
    return this.availRPC ? true : false;
  }

  isDirectWSAvailable(): boolean {
    return this.directWS ? this.directWS.isHealthy() : false;
  }

  // ===========================================
  // RUNTIME OPERATIONS
  // ===========================================

  async getRuntimeVersion(): Promise<any> {
    this.ensureInitialized();
    
    if (this.capabilities.standardRPC.runtime && this.api) {
      try {
        return await this.api.rpc.state.getRuntimeVersion();
      } catch (error) {
        rpcLogger.warn('Polkadot API runtime version failed, falling back to Avail RPC', { error });
      }
    }
    
    return this.availRPC.getRuntimeVersion();
  }

  async getRuntimeMetadata(): Promise<any> {
    this.ensureInitialized();
    
    if (this.capabilities.standardRPC.runtime && this.api) {
      try {
        return await this.api.rpc.state.getMetadata();
      } catch (error) {
        rpcLogger.warn('Polkadot API runtime metadata failed, falling back to Avail RPC', { error });
      }
    }
    
    return this.availRPC.getRuntimeMetadata();
  }

  // ===========================================
  // SUBSCRIPTION OPERATIONS
  // ===========================================

  async subscribeToNewBlocks(callback: (block: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.availRPC.subscribeToNewBlocks(callback);
  }

  async subscribeToFinalizedBlocks(callback: (block: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.availRPC.subscribeToFinalizedBlocks(callback);
  }

  async subscribeToAccountBalance(address: string, callback: (balance: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.availRPC.subscribeToAccountBalance(address, callback);
  }

  async subscribeToDataAvailability(callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.availRPC.subscribeToDataAvailability(callback);
  }

  async subscribeToApplicationData(appId: number, callback: (data: any) => void): Promise<string> {
    this.ensureInitialized();
    return this.availRPC.subscribeToApplicationData(appId, callback);
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.availRPC.unsubscribe(subscriptionId);
  }

  // ===========================================
  // HEALTH AND MONITORING
  // ===========================================

  async getHealth(): Promise<{ healthy: boolean; details?: any }> {
    this.ensureInitialized();
    
    try {
      // Check all available services
      const availHealth = await this.availRPC.getHealth();
      const polkadotHealth = this.isPolkadotAPIAvailable();
      const directWSHealth = this.isDirectWSAvailable();
      
      return {
        healthy: directWSHealth || availHealth.healthy || polkadotHealth,
        details: {
          directWS: {
            healthy: directWSHealth,
            stats: this.directWS?.getConnectionStats() || {},
          },
          availRPC: availHealth,
          polkadotAPI: polkadotHealth,
          capabilities: this.capabilities,
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

  async getMetrics() {
    this.ensureInitialized();
    
    try {
      const availMetrics = await this.availRPC.getMetrics();
      const capabilities = this.getCapabilities();
      
      return {
        ...availMetrics,
        hybrid: {
          directWSAvailable: this.isDirectWSAvailable(),
          directWSStats: this.directWS?.getConnectionStats() || {},
          polkadotAPIAvailable: this.isPolkadotAPIAvailable(),
          availRPCAvailable: this.isAvailRPCAvailable(),
          capabilities,
        },
      };
    } catch (error) {
      logError(error as Error, { operation: 'getMetrics' });
      return {
        hybrid: {
          directWSAvailable: this.isDirectWSAvailable(),
          directWSStats: this.directWS?.getConnectionStats() || {},
          polkadotAPIAvailable: this.isPolkadotAPIAvailable(),
          availRPCAvailable: this.isAvailRPCAvailable(),
          capabilities: this.getCapabilities(),
          error: (error as Error).message,
        },
      };
    }
  }

  getConnectionStats() {
    this.ensureInitialized();
    
    const availStats = this.availRPC.getConnectionStats();
    
    return {
      ...availStats,
      hybrid: {
        directWS: {
          connected: this.isDirectWSAvailable(),
          stats: this.directWS?.getConnectionStats() || {},
        },
        polkadotConnected: this.isPolkadotAPIAvailable(),
        availConnected: this.isAvailRPCAvailable(),
        capabilities: this.getCapabilities(),
      },
    };
  }

  getSubscriptionStats() {
    this.ensureInitialized();
    return this.availRPC.getSubscriptionStats();
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Hybrid RPC Service not initialized. Call initialize() first.');
    }
  }

  async shutdown(): Promise<void> {
    rpcLogger.info('Shutting down Hybrid RPC Service');

    // Shutdown DirectWS first
    if (this.directWS) {
      await this.directWS.shutdown();
    }

    if (this.api) {
      await this.api.disconnect();
    }

    await this.availRPC.shutdown();
    this.isInitialized = false;
    
    this.emit('hybrid:shutdown');
  }
} 