import { BlockService, createBlockService } from '../block';
import db from '../../../utils/database';
import { BlockchainService } from '../../core/blockchain';
import { Block } from '../../../types/database';
import { BlockData } from '../../types/blockchain';

// Mock the dependencies
jest.mock('../../../utils/database');
jest.mock('../../core/blockchain');

describe('BlockService', () => {
  let blockService: BlockService;
  let mockDb: jest.Mocked<typeof db>;
  let mockBlockchain: jest.Mocked<BlockchainService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    mockDb = db as jest.Mocked<typeof db>;
    mockBlockchain = new BlockchainService() as jest.Mocked<BlockchainService>;
    
    // Create service instance
    blockService = createBlockService(mockDb, mockBlockchain);
  });

  describe('getBlock - Database First Pattern', () => {
    const mockBlockNumber = 12345;
    const mockBlockHash = '0x1234567890abcdef';
    
    const mockDbBlock: Block = {
      number: BigInt(mockBlockNumber),
      hash: mockBlockHash,
      parent_hash: '0xparent',
      state_root: '0xstate',
      timestamp: BigInt(Date.now()),
      extrinsics_count: 5,
      created_at: new Date(),
    };

    const mockBlockchainData: BlockData = {
      number: mockBlockNumber,
      hash: mockBlockHash,
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [],
      events: [],
    };

    it('should return block from database if it exists (database first)', async () => {
      // Arrange: Mock database to return existing block
      mockDb.findOne.mockResolvedValue(mockDbBlock);

      // Act: Get block by number
      const result = await blockService.getBlock(mockBlockNumber);

      // Assert: Should return from database without calling blockchain
      expect(mockDb.findOne).toHaveBeenCalledWith('blocks', { number: mockBlockNumber });
      expect(mockBlockchain.getBlock).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result.number).toBe(BigInt(mockBlockNumber));
      expect(result.hash).toBe(mockBlockHash);
    });

    it('should fetch from blockchain and persist if not in database', async () => {
      // Arrange: Mock database to return null (not found)
      mockDb.findOne.mockResolvedValue(null);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockchainData);
      mockDb.insert.mockResolvedValue(mockDbBlock);

      // Act: Get block by number
      const result = await blockService.getBlock(mockBlockNumber);

      // Assert: Should check database first, then fetch from blockchain, then persist
      expect(mockDb.findOne).toHaveBeenCalledWith('blocks', { number: mockBlockNumber });
      expect(mockBlockchain.getBlock).toHaveBeenCalledWith(mockBlockNumber);
      expect(mockDb.insert).toHaveBeenCalledWith('blocks', expect.objectContaining({
        number: BigInt(mockBlockNumber),
        hash: mockBlockHash,
        parent_hash: '0xparent',
        state_root: '0xstate',
        timestamp: BigInt(mockBlockchainData.timestamp),
        extrinsics_count: 0,
      }));
      expect(result.number).toBe(BigInt(mockBlockNumber));
    });

    it('should work with block hash as identifier', async () => {
      // Arrange: Mock database to return existing block
      mockDb.findOne.mockResolvedValue(mockDbBlock);

      // Act: Get block by hash
      const result = await blockService.getBlock(mockBlockHash);

      // Assert: Should query by hash
      expect(mockDb.findOne).toHaveBeenCalledWith('blocks', { hash: mockBlockHash });
      expect(result.hash).toBe(mockBlockHash);
    });

    it('should throw error if blockchain fetch fails', async () => {
      // Arrange: Mock database to return null, blockchain to throw error
      mockDb.findOne.mockResolvedValue(null);
      mockBlockchain.getBlock.mockRejectedValue(new Error('Blockchain connection failed'));

      // Act & Assert: Should throw the blockchain error
      await expect(blockService.getBlock(mockBlockNumber)).rejects.toThrow('Blockchain connection failed');
      
      // Verify the sequence: database check -> blockchain call -> error
      expect(mockDb.findOne).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should throw error if database persistence fails', async () => {
      // Arrange: Mock database findOne to return null, blockchain to succeed, insert to fail
      mockDb.findOne.mockResolvedValue(null);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockchainData);
      mockDb.insert.mockRejectedValue(new Error('Database insert failed'));

      // Act & Assert: Should throw the database error
      await expect(blockService.getBlock(mockBlockNumber)).rejects.toThrow('Database insert failed');
      
      // Verify the sequence: database check -> blockchain call -> database insert -> error
      expect(mockDb.findOne).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getLatestBlock', () => {
    const mockLatestBlockData: BlockData = {
      number: 99999,
      hash: '0xlatest',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [],
      events: [],
    };

    const mockDbBlock: Block = {
      number: BigInt(99999),
      hash: '0xlatest',
      parent_hash: '0xparent',
      state_root: '0xstate',
      timestamp: BigInt(Date.now()),
      extrinsics_count: 0,
      created_at: new Date(),
    };

    it('should fetch latest from blockchain and check database', async () => {
      // Arrange: Mock blockchain to return latest, database to not have it
      mockBlockchain.getLatestBlock.mockResolvedValue(mockLatestBlockData);
      mockDb.findOne.mockResolvedValue(null);
      mockDb.insert.mockResolvedValue(mockDbBlock);

      // Act
      const result = await blockService.getLatestBlock();

      // Assert: Should get latest from blockchain, check database, then persist
      expect(mockBlockchain.getLatestBlock).toHaveBeenCalled();
      expect(mockDb.findOne).toHaveBeenCalledWith('blocks', { number: 99999 });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result.number).toBe(BigInt(99999));
    });

    it('should return from database if latest block already exists', async () => {
      // Arrange: Mock blockchain to return latest, database to have it
      mockBlockchain.getLatestBlock.mockResolvedValue(mockLatestBlockData);
      mockDb.findOne.mockResolvedValue(mockDbBlock);

      // Act
      const result = await blockService.getLatestBlock();

      // Assert: Should not persist if already exists
      expect(mockBlockchain.getLatestBlock).toHaveBeenCalled();
      expect(mockDb.findOne).toHaveBeenCalledWith('blocks', { number: 99999 });
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result.number).toBe(BigInt(99999));
    });
  });
}); 