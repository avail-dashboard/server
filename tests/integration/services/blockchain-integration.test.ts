import { BlockchainService } from '../../../src/services/core/blockchain';

// Integration test for BlockchainService with real RPC endpoints
describe('BlockchainService Integration', () => {
  let blockchainService: BlockchainService;

  beforeEach(() => {
    blockchainService = new BlockchainService();
  });

  afterEach(async () => {
    if (blockchainService.isHealthy()) {
      await blockchainService.stop();
    }
  });

  // Skip this test by default since it requires network access
  // Run with: npm test -- --testNamePattern="Real RPC Connection"
  describe.skip('Real RPC Connection', () => {
    it('should connect to Avail mainnet RPC', async () => {
      // This test connects to real Avail RPC endpoints
      await blockchainService.start();
      
      expect(blockchainService.isHealthy()).toBe(true);
      
      const health = await blockchainService.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.details?.chain).toBeDefined();
      
      // Test basic RPC calls
      const api = await blockchainService.getApi();
      expect(api).toBeDefined();
      
      const chainInfo = await blockchainService.getChainInfo();
      expect(chainInfo.chain).toBeDefined();
      expect(chainInfo.specName).toBeDefined();
      
      // Test block retrieval
      const latestBlock = await blockchainService.getLatestBlock();
      expect(latestBlock.number).toBeGreaterThan(0);
      expect(latestBlock.hash).toBeDefined();
      
      console.log('✅ Successfully connected to Avail mainnet');
      console.log(`Chain: ${chainInfo.chain}`);
      console.log(`Latest block: ${latestBlock.number}`);
      console.log(`Provider: ${health.details?.provider}`);
    }, 30000); // 30 second timeout for network operations

    it('should handle RPC failover', async () => {
      await blockchainService.start();
      
      const connections = blockchainService.getConnections();
      expect(connections.length).toBeGreaterThan(1);
      
      // Verify multiple providers are available
      const providers = connections.map(c => c.provider);
      expect(providers).toContain('Avail Official');
      expect(providers).toContain('BlastAPI');
      
      console.log('✅ Multiple RPC providers configured:');
      connections.forEach(conn => {
        console.log(`  - ${conn.provider}: ${conn.url}`);
      });
    }, 30000);

    it('should track circuit breaker states', async () => {
      await blockchainService.start();
      
      const states = blockchainService.getCircuitBreakerStates();
      expect(states.length).toBeGreaterThan(0);
      
      // All circuit breakers should start in CLOSED state
      states.forEach(state => {
        expect(state.state.state).toBe('CLOSED');
        expect(state.state.failureCount).toBe(0);
      });
      
      console.log('✅ Circuit breakers initialized correctly');
    }, 30000);
  });

  describe('Service Factory Integration', () => {
    it('should work with service factory', async () => {
      const { serviceFactory } = await import('../../../src/services');
      
      // Initialize core services
      await serviceFactory.initializeCoreServices();
      
      // Get blockchain service from factory
      const blockchain = serviceFactory.get<BlockchainService>('blockchain');
      expect(blockchain).toBeDefined();
      expect(blockchain.isHealthy()).toBe(true);
      
      // Test health status
      const healthStatus = await serviceFactory.getHealthStatus();
      expect(healthStatus.blockchain).toBeDefined();
      expect(healthStatus.blockchain.healthy).toBe(true);
      
      // Cleanup
      await serviceFactory.shutdown();
    });
  });
}); 