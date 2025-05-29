import { ApiPromise, WsProvider } from '@polkadot/api';
import { EventEmitter } from 'events';
import { AvailRPCService } from './rpc';
import { logError, rpcLogger } from '../utils/logger';
import { config } from '../config';

export interface TestCapabilities {
  polkadotSDK: {
    basicRPC: boolean;
    chainQueries: boolean;
    accountQueries: boolean;
    blockQueries: boolean;
  };
  availSpecific: {
    dataAvailability: boolean;
    applicationData: boolean;
    proofs: boolean;
  };
}

export interface TestResult {
  feature: string;
  polkadotResult?: any;
  availResult?: any;
  polkadotError?: string;
  availError?: string;
  winner: 'polkadot' | 'avail' | 'both' | 'neither';
  performance: {
    polkadotTime?: number;
    availTime?: number;
  };
}

export class HybridRPCTestService extends EventEmitter {
  private polkadotAPI?: ApiPromise;
  private availRPC: AvailRPCService;
  private isInitialized = false;
  private capabilities: TestCapabilities;

  constructor() {
    super();
    this.availRPC = new AvailRPCService();
    this.capabilities = {
      polkadotSDK: {
        basicRPC: false,
        chainQueries: false,
        accountQueries: false,
        blockQueries: false,
      },
      availSpecific: {
        dataAvailability: false,
        applicationData: false,
        proofs: false,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      rpcLogger.warn('Hybrid test service already initialized');
      return;
    }

    try {
      rpcLogger.info('Initializing Hybrid RPC Test Service');

      // Initialize both services
      await Promise.all([
        this.initializePolkadotAPI(),
        this.availRPC.initialize(),
      ]);

      // Test capabilities
      await this.testAllCapabilities();

      this.isInitialized = true;
      this.emit('test:initialized', this.capabilities);

      rpcLogger.info('Hybrid RPC Test Service initialized', { capabilities: this.capabilities });
    } catch (error) {
      logError(error as Error, { component: 'hybrid-test-service' });
      throw error;
    }
  }

  private async initializePolkadotAPI(): Promise<void> {
    try {
      const provider = new WsProvider(config.dataSources.rpc.endpoints[0], 1000);
      this.polkadotAPI = await ApiPromise.create({ 
        provider,
        throwOnConnect: false,
        throwOnUnknown: false,
      });

      await this.polkadotAPI.isReady;
      this.capabilities.polkadotSDK.basicRPC = true;
      rpcLogger.info('Polkadot API initialized successfully');
    } catch (error) {
      rpcLogger.warn('Failed to initialize Polkadot API', { error });
    }
  }

  private async testAllCapabilities(): Promise<void> {
    const tests = [
      this.testChainQueries(),
      this.testBlockQueries(),
      this.testAccountQueries(),
      this.testAvailSpecificFeaturesPrivate(),
    ];

    await Promise.all(tests);
  }

  private async testChainQueries(): Promise<void> {
    if (this.polkadotAPI) {
      try {
        await this.polkadotAPI.rpc.chain.getHeader();
        await this.polkadotAPI.rpc.system.chain();
        this.capabilities.polkadotSDK.chainQueries = true;
        rpcLogger.info('Polkadot chain queries working');
      } catch (error) {
        rpcLogger.warn('Polkadot chain queries failed', { error });
      }
    }
  }

  private async testBlockQueries(): Promise<void> {
    if (this.polkadotAPI) {
      try {
        const latestHeader = await this.polkadotAPI.rpc.chain.getHeader();
        const blockNumber = latestHeader.number.toNumber();
        await this.polkadotAPI.rpc.chain.getBlock();
        this.capabilities.polkadotSDK.blockQueries = true;
        rpcLogger.info('Polkadot block queries working', { latestBlock: blockNumber });
      } catch (error) {
        rpcLogger.warn('Polkadot block queries failed', { error });
      }
    }
  }

  private async testAccountQueries(): Promise<void> {
    if (this.polkadotAPI) {
      try {
        // Test with a known account (Alice for testnets)
        const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
        await this.polkadotAPI.query.system.account(testAddress);
        this.capabilities.polkadotSDK.accountQueries = true;
        rpcLogger.info('Polkadot account queries working');
      } catch (error) {
        rpcLogger.warn('Polkadot account queries failed', { error });
      }
    }
  }

  private async testAvailSpecificFeaturesPrivate(): Promise<void> {
    try {
      // Test basic Avail functionality
      const latestBlocks = await this.availRPC.getLatestBlocks({ limit: 1 });
      if (latestBlocks.blocks.length > 0) {
        this.capabilities.availSpecific.dataAvailability = true;

        // Test data availability proof
        try {
          const testBlock = latestBlocks.blocks[0];
          await this.availRPC.getDataAvailabilityProof(testBlock.hash, 0);
          this.capabilities.availSpecific.proofs = true;
        } catch (error) {
          rpcLogger.warn('Avail proof test failed', { error });
        }

        // Test application data
        try {
          await this.availRPC.getApplicationData(latestBlocks.blocks[0].hash, 0);
          this.capabilities.availSpecific.applicationData = true;
        } catch (error) {
          rpcLogger.warn('Avail application data test failed', { error });
        }
      }
    } catch (error) {
      rpcLogger.warn('Avail specific features test failed', { error });
    }
  }

  // ===========================================
  // COMPARATIVE TESTING METHODS
  // ===========================================

  async compareLatestBlockFetch(): Promise<TestResult> {
    const result: TestResult = {
      feature: 'Latest Block Fetch',
      winner: 'neither',
      performance: {},
    };

    // Test Polkadot SDK
    if (this.capabilities.polkadotSDK.blockQueries && this.polkadotAPI) {
      try {
        const startTime = Date.now();
        const header = await this.polkadotAPI.rpc.chain.getHeader();
        const block = await this.polkadotAPI.rpc.chain.getBlock();
        result.performance.polkadotTime = Date.now() - startTime;
        
        result.polkadotResult = {
          number: header.number.toNumber(),
          hash: header.hash.toString(),
          parentHash: header.parentHash.toString(),
          extrinsicsCount: block.block.extrinsics.length,
          size: block.encodedLength,
        };
      } catch (error) {
        result.polkadotError = (error as Error).message;
      }
    }

    // Test Avail RPC
    try {
      const startTime = Date.now();
      const availBlocks = await this.availRPC.getLatestBlocks({ limit: 1 });
      result.performance.availTime = Date.now() - startTime;
      
      if (availBlocks.blocks.length > 0) {
        result.availResult = availBlocks.blocks[0];
      }
    } catch (error) {
      result.availError = (error as Error).message;
    }

    // Determine winner
    if (result.polkadotResult && result.availResult) {
      result.winner = 'both';
    } else if (result.polkadotResult) {
      result.winner = 'polkadot';
    } else if (result.availResult) {
      result.winner = 'avail';
    }

    return result;
  }

  async compareChainInfo(): Promise<TestResult> {
    const result: TestResult = {
      feature: 'Chain Information',
      winner: 'neither',
      performance: {},
    };

    // Test Polkadot SDK
    if (this.capabilities.polkadotSDK.chainQueries && this.polkadotAPI) {
      try {
        const startTime = Date.now();
        const [chain, runtime, header] = await Promise.all([
          this.polkadotAPI.rpc.system.chain(),
          this.polkadotAPI.rpc.state.getRuntimeVersion(),
          this.polkadotAPI.rpc.chain.getHeader(),
        ]);
        result.performance.polkadotTime = Date.now() - startTime;
        
        result.polkadotResult = {
          chainName: chain.toString(),
          specVersion: runtime.specVersion.toNumber(),
          implVersion: runtime.implVersion.toNumber(),
          latestBlock: header.number.toNumber(),
        };
      } catch (error) {
        result.polkadotError = (error as Error).message;
      }
    }

    // Test Avail RPC
    try {
      const startTime = Date.now();
      const chainStats = await this.availRPC.getChainStats();
      result.performance.availTime = Date.now() - startTime;
      result.availResult = chainStats;
    } catch (error) {
      result.availError = (error as Error).message;
    }

    // Determine winner
    if (result.polkadotResult && result.availResult) {
      result.winner = 'both';
    } else if (result.polkadotResult) {
      result.winner = 'polkadot';
    } else if (result.availResult) {
      result.winner = 'avail';
    }

    return result;
  }

  async compareAccountInfo(address: string): Promise<TestResult> {
    const result: TestResult = {
      feature: 'Account Information',
      winner: 'neither',
      performance: {},
    };

    // Test Polkadot SDK
    if (this.capabilities.polkadotSDK.accountQueries && this.polkadotAPI) {
      try {
        const startTime = Date.now();
        const accountInfo = await this.polkadotAPI.query.system.account(address);
        result.performance.polkadotTime = Date.now() - startTime;
        
        result.polkadotResult = {
          address,
          nonce: (accountInfo as any).nonce.toNumber(),
          data: (accountInfo as any).data.toJSON(),
        };
      } catch (error) {
        result.polkadotError = (error as Error).message;
      }
    }

    // Test Avail RPC
    try {
      const startTime = Date.now();
      const account = await this.availRPC.getAccountDetails(address);
      result.performance.availTime = Date.now() - startTime;
      result.availResult = account;
    } catch (error) {
      result.availError = (error as Error).message;
    }

    // Determine winner
    if (result.polkadotResult && result.availResult) {
      result.winner = 'both';
    } else if (result.polkadotResult) {
      result.winner = 'polkadot';
    } else if (result.availResult) {
      result.winner = 'avail';
    }

    return result;
  }

  async testAvailSpecificFeatures(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Test Data Availability Proof
    if (this.capabilities.availSpecific.dataAvailability) {
      const proofResult: TestResult = {
        feature: 'Data Availability Proof',
        winner: 'neither',
        performance: {},
      };

      try {
        const latestBlocks = await this.availRPC.getLatestBlocks({ limit: 1 });
        if (latestBlocks.blocks.length > 0) {
          const startTime = Date.now();
          const proof = await this.availRPC.getDataAvailabilityProof(latestBlocks.blocks[0].hash, 0);
          proofResult.performance.availTime = Date.now() - startTime;
          proofResult.availResult = proof;
          proofResult.winner = 'avail';
        }
      } catch (error) {
        proofResult.availError = (error as Error).message;
      }

      results.push(proofResult);
    }

    // Test Application Data
    if (this.capabilities.availSpecific.applicationData) {
      const appDataResult: TestResult = {
        feature: 'Application Data',
        winner: 'neither',
        performance: {},
      };

      try {
        const latestBlocks = await this.availRPC.getLatestBlocks({ limit: 1 });
        if (latestBlocks.blocks.length > 0) {
          const startTime = Date.now();
          const appData = await this.availRPC.getApplicationData(latestBlocks.blocks[0].hash, 0);
          appDataResult.performance.availTime = Date.now() - startTime;
          appDataResult.availResult = appData;
          appDataResult.winner = 'avail';
        }
      } catch (error) {
        appDataResult.availError = (error as Error).message;
      }

      results.push(appDataResult);
    }

    // Test Data Submissions
    try {
      const submissionsResult: TestResult = {
        feature: 'Data Submissions',
        winner: 'neither',
        performance: {},
      };

      const startTime = Date.now();
      const submissions = await this.availRPC.getDataSubmissions({ limit: 5 });
      submissionsResult.performance.availTime = Date.now() - startTime;
      submissionsResult.availResult = submissions;
      submissionsResult.winner = 'avail';
      results.push(submissionsResult);
    } catch (error) {
      results.push({
        feature: 'Data Submissions',
        winner: 'neither',
        performance: {},
        availError: (error as Error).message,
      });
    }

    return results;
  }

  async runComprehensiveTest(): Promise<{
    capabilities: TestCapabilities;
    comparisons: TestResult[];
    availSpecific: TestResult[];
    summary: {
      polkadotWins: number;
      availWins: number;
      bothWork: number;
      neitherWork: number;
    };
  }> {
    this.ensureInitialized();

    const testAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'; // Alice

    const [blockComparison, chainComparison, accountComparison, availSpecific] = await Promise.all([
      this.compareLatestBlockFetch(),
      this.compareChainInfo(),
      this.compareAccountInfo(testAddress),
      this.testAvailSpecificFeatures(),
    ]);

    const comparisons = [blockComparison, chainComparison, accountComparison];
    
    // Calculate summary
    const summary = {
      polkadotWins: comparisons.filter(r => r.winner === 'polkadot').length,
      availWins: comparisons.filter(r => r.winner === 'avail').length + availSpecific.filter(r => r.winner === 'avail').length,
      bothWork: comparisons.filter(r => r.winner === 'both').length,
      neitherWork: comparisons.filter(r => r.winner === 'neither').length + availSpecific.filter(r => r.winner === 'neither').length,
    };

    return {
      capabilities: this.capabilities,
      comparisons,
      availSpecific,
      summary,
    };
  }

  getCapabilities(): TestCapabilities {
    return { ...this.capabilities };
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Hybrid test service not initialized. Call initialize() first.');
    }
  }

  async shutdown(): Promise<void> {
    rpcLogger.info('Shutting down Hybrid RPC Test Service');

    if (this.polkadotAPI) {
      await this.polkadotAPI.disconnect();
    }

    await this.availRPC.shutdown();
    this.isInitialized = false;
    
    this.emit('test:shutdown');
  }
} 