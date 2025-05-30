import { EventEmitter } from 'events';
import { AvailRPCService } from './rpc';
import { AvailLightClientService } from './avail-light-client';
import { AvailBridgeService } from './avail-bridge';
import { AvailNexusService } from './avail-nexus';
import { TurboDAService } from './turbo-da';
import { logError, rpcLogger } from '../utils/logger';
import {
  Block,
  Account,
  BlocksQuery,
} from '../types';

export interface UnifiedHealthStatus {
  overall: boolean;
  services: {
    rpc: { healthy: boolean; details: any };
    lightClient: { healthy: boolean; details: any };
    bridge: { healthy: boolean; details: any };
    nexus: { healthy: boolean; details: any };
    turboDA: { healthy: boolean; details: any };
  };
}

export class UnifiedAvailService extends EventEmitter {
  public rpc: AvailRPCService;
  public lightClient: AvailLightClientService;
  public bridge: AvailBridgeService;
  public nexus: AvailNexusService;
  public turboDA: TurboDAService;
  
  private isInitialized = false;
  private servicePreferences = {
    blocks: ['lightClient', 'rpc'],
    extrinsics: ['rpc', 'nexus'],
    accounts: ['nexus', 'rpc'],
    proofs: ['bridge', 'lightClient'],
    dataSubmission: ['turboDA', 'lightClient'],
    crossChain: ['bridge'],
  };

  constructor() {
    super();
    
    this.rpc = new AvailRPCService();
    this.lightClient = new AvailLightClientService();
    this.bridge = new AvailBridgeService();
    this.nexus = new AvailNexusService();
    this.turboDA = new TurboDAService();
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Forward events from individual services
    this.rpc.on('connection:established', (data) => this.emit('rpc:connected', data));
    this.rpc.on('connection:lost', (data) => this.emit('rpc:disconnected', data));
    
    this.lightClient.on('initialized', () => this.emit('lightClient:initialized'));
    this.lightClient.on('ws:connected', () => this.emit('lightClient:ws:connected'));
    this.lightClient.on('ws:disconnected', (data) => this.emit('lightClient:ws:disconnected', data));
    
    this.bridge.on('initialized', () => this.emit('bridge:initialized'));
    this.nexus.on('initialized', () => this.emit('nexus:initialized'));
    this.turboDA.on('initialized', () => this.emit('turboDA:initialized'));
  }

  async initialize(): Promise<void> {
    rpcLogger.info('Initializing Unified Avail Service with all APIs');
    
    const initPromises = [
      this.initializeService('RPC', () => this.rpc.initialize()),
      this.initializeService('Light Client', () => this.lightClient.initialize()),
      this.initializeService('Bridge', () => this.bridge.initialize()),
      this.initializeService('Nexus', () => this.nexus.initialize()),
      this.initializeService('Turbo DA', () => this.turboDA.initialize()),
    ];

    const results = await Promise.allSettled(initPromises);
    
    // Log initialization results
    results.forEach((result, index) => {
      const serviceName = ['RPC', 'Light Client', 'Bridge', 'Nexus', 'Turbo DA'][index];
      if (result.status === 'fulfilled') {
        rpcLogger.info(`${serviceName} service initialized successfully`);
      } else {
        rpcLogger.warn(`${serviceName} service failed to initialize: ${result.reason?.message}`);
      }
    });

    this.isInitialized = true;
    this.emit('unified:initialized');
    
    rpcLogger.info('Unified Avail Service initialization complete', {
      successfulServices: results.filter(r => r.status === 'fulfilled').length,
      totalServices: results.length,
    });
  }

  private async initializeService(name: string, initFn: () => Promise<void>): Promise<void> {
    try {
      await initFn();
    } catch (error) {
      logError(error as Error, { service: name, action: 'initialize' });
      // Don't throw - allow other services to continue initializing
    }
  }

  // ===========================================
  // SMART API ROUTING METHODS
  // ===========================================

  async getLatestBlocks(query?: BlocksQuery): Promise<{ blocks: Block[]; total: number }> {
    const services = this.servicePreferences.blocks;
    
    for (const serviceKey of services) {
      try {
        switch (serviceKey) {
          case 'lightClient':
            if (this.lightClient.isConnected()) {
              // Use light client for latest blocks (more reliable)
              const status = await this.lightClient.getStatus();
              const latestBlockNumber = status.blocks.latest;
              const blockData = await this.lightClient.getBlockData(latestBlockNumber);
              
              return {
                blocks: [this.transformLightClientBlock(blockData)],
                total: 1,
              };
            }
            break;
            
          case 'rpc':
            if (this.rpc.isReady()) {
              return await this.rpc.getLatestBlocks(query);
            }
            break;
        }
      } catch (error) {
        logError(error as Error, { 
          method: 'getLatestBlocks', 
          service: serviceKey,
          fallbackAttempt: true,
        });
      }
    }
    
    throw new Error('All block services are unavailable');
  }

  async getBlockByNumber(blockNumber: number): Promise<Block> {
    const services = ['nexus', 'lightClient', 'rpc'];
    
    for (const serviceKey of services) {
      try {
        switch (serviceKey) {
          case 'nexus':
            if (this.nexus.isReady()) {
              const blockData = await this.nexus.getBlockByHeight(blockNumber);
              return this.transformNexusBlock(blockData);
            }
            break;
            
          case 'lightClient':
            if (this.lightClient.isConnected()) {
              const blockData = await this.lightClient.getBlockData(blockNumber);
              return this.transformLightClientBlock(blockData);
            }
            break;
            
          case 'rpc':
            if (this.rpc.isReady()) {
              const block = await this.rpc.getBlockByNumber(BigInt(blockNumber));
              if (block) {
                return block;
              }
            }
            break;
        }
      } catch (error) {
        logError(error as Error, { 
          method: 'getBlockByNumber', 
          service: serviceKey,
          blockNumber,
          fallbackAttempt: true,
        });
      }
    }
    
    throw new Error(`Block ${blockNumber} not found in any service`);
  }

  async getBlockWithProofs(blockNumber: number): Promise<Block & { proofs?: any }> {
    try {
      // Get block data first
      const block = await this.getBlockByNumber(blockNumber);
      
      // Try to get proofs from Bridge API
      if (this.bridge.isReady()) {
        try {
          const proofs = await this.bridge.generateMerkleProof(block.hash, 0);
          return { ...block, proofs };
        } catch (error) {
          logError(error as Error, { method: 'getBlockWithProofs', step: 'proofs' });
          // Return block without proofs if proof generation fails
        }
      }
      
      return block;
    } catch (error) {
      logError(error as Error, { method: 'getBlockWithProofs', blockNumber });
      throw error;
    }
  }

  async getAccountDetails(address: string): Promise<Account> {
    const services = this.servicePreferences.accounts;
    
    for (const serviceKey of services) {
      try {
        switch (serviceKey) {
          case 'nexus':
            if (this.nexus.isReady()) {
              const accountState = await this.nexus.getAccountState(address);
              return this.transformNexusAccount(accountState);
            }
            break;
            
          case 'rpc':
            if (this.rpc.isReady()) {
              const account = await this.rpc.getAccountDetails(address);
              if (account) {
                return account;
              }
            }
            break;
        }
      } catch (error) {
        logError(error as Error, { 
          method: 'getAccountDetails', 
          service: serviceKey,
          address,
          fallbackAttempt: true,
        });
      }
    }
    
    throw new Error(`Account ${address} not found in any service`);
  }

  async submitDataToAvail(data: any, appId = 0): Promise<any> {
    const services = this.servicePreferences.dataSubmission;
    
    for (const serviceKey of services) {
      try {
        switch (serviceKey) {
          case 'turboDA':
            if (this.turboDA.isReady()) {
              if (typeof data === 'object') {
                return await this.turboDA.submitJsonData(data, appId);
              } else if (typeof data === 'string') {
                return await this.turboDA.submitTextData(data, appId);
              } else if (Buffer.isBuffer(data)) {
                return await this.turboDA.submitRawData(data, appId);
              }
            }
            break;
            
          case 'lightClient':
            if (this.lightClient.isConnected()) {
              return await this.lightClient.submitData(data, appId);
            }
            break;
        }
      } catch (error) {
        logError(error as Error, { 
          method: 'submitDataToAvail', 
          service: serviceKey,
          appId,
          fallbackAttempt: true,
        });
      }
    }
    
    throw new Error('All data submission services are unavailable');
  }

  async getBridgeTransactions(availAddress?: string, ethAddress?: string): Promise<any> {
    if (!this.bridge.isReady()) {
      throw new Error('Bridge service is not available');
    }
    
    return await this.bridge.getBridgeTransactions(availAddress, ethAddress);
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    if (this.nexus.isReady()) {
      try {
        return await this.nexus.getTransactionStatus(txHash);
      } catch (error) {
        logError(error as Error, { method: 'getTransactionStatus', service: 'nexus', txHash });
      }
    }
    
    // Fallback to searching through recent blocks via RPC
    if (this.rpc.isReady()) {
      // Implementation would search recent blocks for the transaction
      // This is a simplified version
      throw new Error('Transaction status lookup via RPC not implemented yet');
    }
    
    throw new Error('Transaction status services are unavailable');
  }

  // ===========================================
  // UTILITY & TRANSFORM METHODS
  // ===========================================

  private transformLightClientBlock(blockData: any): Block {
    return {
      number: BigInt(parseInt(blockData.block.header.number, 16)),
      hash: blockData.block.header.parent_hash, // This needs proper hash calculation
      parentHash: blockData.block.header.parent_hash,
      stateRoot: blockData.block.header.state_root,
      extrinsicsRoot: blockData.block.header.extrinsics_root,
      timestamp: BigInt(Date.now()), // This should be extracted from block
      extrinsicsCount: blockData.block.extrinsics.length,
    };
  }

  private transformNexusBlock(blockData: any): Block {
    return {
      number: BigInt(blockData.number),
      hash: blockData.hash,
      parentHash: blockData.parentHash,
      stateRoot: blockData.stateRoot,
      extrinsicsRoot: blockData.extrinsicsRoot,
      timestamp: BigInt(new Date(blockData.timestamp).getTime()),
      extrinsicsCount: blockData.extrinsics.length,
    };
  }

  private transformNexusAccount(accountState: any): Account {
    return {
      address: accountState.account,
      balance: BigInt(accountState.balance.free || 0),
      nonce: accountState.nonce,
      accountInfo: {
        free: BigInt(accountState.balance.free || 0),
        reserved: BigInt(accountState.balance.reserved || 0),
        frozen: BigInt(accountState.balance.miscFrozen || 0),
        flags: BigInt(0),
      },
    };
  }

  async getHealthStatus(): Promise<UnifiedHealthStatus> {
    const [rpcHealth, lightClientHealth, bridgeHealth, nexusHealth, turboDAHealth] = await Promise.allSettled([
      this.rpc.getHealth(),
      this.lightClient.getHealth(),
      this.bridge.getHealth(),
      this.nexus.getHealth(),
      this.turboDA.getHealth(),
    ]);

    const services = {
      rpc: this.extractHealthResult(rpcHealth),
      lightClient: this.extractHealthResult(lightClientHealth),
      bridge: this.extractHealthResult(bridgeHealth),
      nexus: this.extractHealthResult(nexusHealth),
      turboDA: this.extractHealthResult(turboDAHealth),
    };

    const healthyServices = Object.values(services).filter(s => s.healthy).length;
    const overall = healthyServices >= 2; // At least 2 services should be healthy

    return {
      overall,
      services,
    };
  }

  private extractHealthResult(result: PromiseSettledResult<any>): { healthy: boolean; details: any } {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        healthy: false,
        details: { error: result.reason?.message || 'Service check failed' },
      };
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async shutdown(): Promise<void> {
    rpcLogger.info('Shutting down Unified Avail Service');
    
    await Promise.allSettled([
      this.rpc.shutdown(),
      this.lightClient.shutdown(),
      this.bridge.shutdown(),
      this.nexus.shutdown(),
      this.turboDA.shutdown(),
    ]);
    
    this.isInitialized = false;
    rpcLogger.info('Unified Avail Service shutdown complete');
  }
} 