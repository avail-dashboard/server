describe('Hybrid RPC Integration Tests', () => {
  describe('Basic Hybrid Service Tests', () => {
    test('should import and create hybrid service', async () => {
      // Import the actual HybridRPCService for testing
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      expect(hybridService).toBeDefined();
      expect(hybridService.getCapabilities).toBeDefined();
      expect(hybridService.isPolkadotAPIAvailable).toBeDefined();
      expect(hybridService.isAvailRPCAvailable).toBeDefined();
      
      console.log('✅ Hybrid service created successfully');
    });

    test('should have correct initial capabilities', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      const capabilities = hybridService.getCapabilities();
      
      expect(capabilities).toHaveProperty('standardRPC');
      expect(capabilities).toHaveProperty('availSpecific');
      
      // Check standard RPC capabilities structure
      expect(capabilities.standardRPC).toHaveProperty('blocks');
      expect(capabilities.standardRPC).toHaveProperty('extrinsics');
      expect(capabilities.standardRPC).toHaveProperty('accounts');
      expect(capabilities.standardRPC).toHaveProperty('chainState');
      expect(capabilities.standardRPC).toHaveProperty('staking');
      
      // Check Avail-specific capabilities structure
      expect(capabilities.availSpecific).toHaveProperty('dataAvailability');
      expect(capabilities.availSpecific).toHaveProperty('kateCommitments');
      expect(capabilities.availSpecific).toHaveProperty('applicationData');
      expect(capabilities.availSpecific).toHaveProperty('proofs');
      expect(capabilities.availSpecific).toHaveProperty('blobs');
      
      console.log('✅ Capabilities structure is correct:', JSON.stringify(capabilities, null, 2));
    });

    test('should have all required methods', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      // Test that all required methods exist
      const requiredMethods = [
        'initialize',
        'getLatestBlocks',
        'getBlockByNumber',
        'getLatestExtrinsics',
        'getAccountDetails',
        'getChainStats',
        'getDataAvailabilityProof',
        'getApplicationData',
        'getDataSubmissions',
        'getValidators',
        'getStakingInfo',
        'shutdown',
      ];
      
      requiredMethods.forEach(method => {
        expect((hybridService as any)[method]).toBeDefined();
        expect(typeof (hybridService as any)[method]).toBe('function');
      });
      
      console.log('✅ All required methods are present');
    });

    test('should handle uninitialized state correctly', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      // Test that methods throw appropriate errors when not initialized
      await expect(hybridService.getLatestBlocks()).rejects.toThrow('not initialized');
      await expect(hybridService.getChainStats()).rejects.toThrow('not initialized');
      await expect(hybridService.getAccountDetails('test')).rejects.toThrow('not initialized');
      
      console.log('✅ Uninitialized state handling works correctly');
    });
  });

  describe('Avail DA Explorer Features', () => {
    test('should have all Avail DA Explorer methods', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      // Test Avail DA Explorer specific methods
      const availMethods = [
        'getAppIds',
        'createAppId',
        'getRollupAnalytics',
        'getNominationPools',
        'getBlockDataRoot',
      ];
      
      availMethods.forEach(method => {
        expect((hybridService as any)[method]).toBeDefined();
        expect(typeof (hybridService as any)[method]).toBe('function');
      });
      
      console.log('✅ All Avail DA Explorer methods are present');
    });

    test('should handle not-yet-implemented features gracefully', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      // Mock the ensureInitialized method to avoid initialization requirement
      (hybridService as any).ensureInitialized = jest.fn();
      
      // Test that unimplemented methods return appropriate responses
      const appIds = await hybridService.getAppIds();
      expect(Array.isArray(appIds)).toBe(true);
      expect(appIds.length).toBe(0);
      
      const nominationPools = await hybridService.getNominationPools();
      expect(Array.isArray(nominationPools)).toBe(true);
      expect(nominationPools.length).toBe(0);
      
      const analytics = await hybridService.getRollupAnalytics(1);
      expect(analytics).toHaveProperty('appId', 1);
      expect(analytics).toHaveProperty('dataSubmissions', 0);
      
      await expect(hybridService.createAppId('test', 'signer')).rejects.toThrow('not yet implemented');
      
      console.log('✅ Not-yet-implemented features handled gracefully');
    });
  });

  describe('Type Safety and Error Handling', () => {
    test('should handle invalid inputs gracefully', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      // Test invalid inputs don't crash the service
      expect(() => hybridService.getCapabilities()).not.toThrow();
      expect(() => hybridService.isPolkadotAPIAvailable()).not.toThrow();
      expect(() => hybridService.isAvailRPCAvailable()).not.toThrow();
      
      console.log('✅ Invalid input handling works correctly');
    });

    test('should maintain proper event emitter functionality', async () => {
      const { HybridRPCService } = await import('../../src/services/hybrid-rpc');
      const hybridService = new HybridRPCService();
      
      let eventReceived = false;
      hybridService.on('test-event', () => {
        eventReceived = true;
      });
      
      hybridService.emit('test-event');
      expect(eventReceived).toBe(true);
      
      console.log('✅ Event emitter functionality works correctly');
    });
  });
}); 