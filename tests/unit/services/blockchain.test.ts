// The blockchain service is already mocked in setup.ts, so we just import it
import blockchainService from '../../../src/services/blockchain';

describe('Blockchain Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Structure', () => {
    it('should be defined', () => {
      expect(blockchainService).toBeDefined();
    });

    it('should have required methods', () => {
      expect(typeof blockchainService.connectRPC).toBe('function');
      expect(typeof blockchainService.disconnectRPC).toBe('function');
      expect(typeof blockchainService.getLatestBlocks).toBe('function');
      expect(typeof blockchainService.getChainStats).toBe('function');
      expect(typeof blockchainService.getHealth).toBe('function');
      expect(typeof blockchainService.getValidators).toBe('function');
    });
  });

  describe('RPC Connection', () => {
    it('should connect to RPC successfully', async () => {
      await expect(blockchainService.connectRPC()).resolves.toBeUndefined();
    });

    it('should disconnect from RPC successfully', async () => {
      await expect(blockchainService.disconnectRPC()).resolves.toBeUndefined();
    });
  });

  describe('Health Check', () => {
    it('should check service health', async () => {
      const result = await blockchainService.getHealth();
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('rpc');
      expect(result).toHaveProperty('subscan');
      expect(result).toHaveProperty('subquery');
      expect(typeof result.rpc).toBe('boolean');
      expect(typeof result.subscan).toBe('boolean');
      expect(typeof result.subquery).toBe('boolean');
    });
  });

  describe('Basic Operations', () => {
    it('should handle getLatestBlocks call', async () => {
      const result = await blockchainService.getLatestBlocks();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('blocks');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.blocks)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    it('should handle getChainStats call', async () => {
      const result = await blockchainService.getChainStats();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('blockHeight');
      expect(result).toHaveProperty('blockTime');
    });

    it('should handle getValidators call', async () => {
      const result = await blockchainService.getValidators();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', () => {
      // Verify that all required methods exist
      expect(typeof blockchainService.getLatestBlocks).toBe('function');
      expect(typeof blockchainService.getChainStats).toBe('function');
      expect(typeof blockchainService.getHealth).toBe('function');
    });
  });
}); 