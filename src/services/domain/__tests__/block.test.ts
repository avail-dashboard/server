import { BlockService, createBlockService } from '../block';
import { BlockchainService } from '../../core/blockchain';
import { BlockRepository } from '../../../database/repositories/BlockRepository';
import { Block } from '../../../database';
import { BlockData } from '../../types/blockchain';

// Mock the dependencies
jest.mock('../../core/blockchain');
jest.mock('../../../database/repositories/BlockRepository');

describe('BlockService', () => {
  let blockService: BlockService;
  let mockBlockRepository: jest.Mocked<BlockRepository>;
  let mockBlockchain: jest.Mocked<BlockchainService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    mockBlockRepository = new BlockRepository() as jest.Mocked<BlockRepository>;
    mockBlockchain = new BlockchainService() as jest.Mocked<BlockchainService>;
    
    // Create service instance
    blockService = createBlockService(mockBlockRepository, mockBlockchain);
  });

  describe('getBlock - Database First Pattern', () => {
    const mockBlockNumber = 12345;
    const mockBlockHash = '0x1234567890abcdef';
    
    const mockDbBlock: Block = {
      id: 1,
      number: BigInt(mockBlockNumber),
      hash: mockBlockHash,
      parentHash: '0xparent',
      stateRoot: '0xstate',
      timestamp: BigInt(Date.now()),
      extrinsicsCount: 5,
      createdAt: new Date(),
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
      // Arrange: Mock repository to return existing block
      mockBlockRepository.findByNumber.mockResolvedValue(mockDbBlock);

      // Act: Get block by number
      const result = await blockService.getBlock(mockBlockNumber);

      // Assert: Should return from database without calling blockchain
      expect(mockBlockRepository.findByNumber).toHaveBeenCalledWith(BigInt(mockBlockNumber));
      expect(mockBlockchain.getBlock).not.toHaveBeenCalled();
      expect(mockBlockRepository.create).not.toHaveBeenCalled();
      expect(result.number).toBe(BigInt(mockBlockNumber));
      expect(result.hash).toBe(mockBlockHash);
    });

    it('should fetch from blockchain and persist if not in database', async () => {
      // Arrange: Mock repository to return null (not found)
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockchainData);
      mockBlockRepository.create.mockResolvedValue(mockDbBlock);

      // Act: Get block by number
      const result = await blockService.getBlock(mockBlockNumber);

      // Assert: Should check database first, then fetch from blockchain, then persist
      expect(mockBlockRepository.findByNumber).toHaveBeenCalledWith(BigInt(mockBlockNumber));
      expect(mockBlockchain.getBlock).toHaveBeenCalledWith(mockBlockNumber);
      expect(mockBlockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        number: BigInt(mockBlockNumber),
        hash: mockBlockHash,
        parentHash: '0xparent',
        stateRoot: '0xstate',
        timestamp: BigInt(mockBlockchainData.timestamp),
        extrinsicsCount: 0,
      }));
      expect(result.number).toBe(BigInt(mockBlockNumber));
    });

    it('should work with block hash as identifier', async () => {
      // Arrange: Mock repository to return existing block
      mockBlockRepository.findByHash.mockResolvedValue(mockDbBlock);

      // Act: Get block by hash
      const result = await blockService.getBlock(mockBlockHash);

      // Assert: Should query by hash
      expect(mockBlockRepository.findByHash).toHaveBeenCalledWith(mockBlockHash);
      expect(result.hash).toBe(mockBlockHash);
    });

    it('should throw error if blockchain fetch fails', async () => {
      // Arrange: Mock repository to return null, blockchain to throw error
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockchain.getBlock.mockRejectedValue(new Error('Blockchain connection failed'));

      // Act & Assert: Should throw the blockchain error
      await expect(blockService.getBlock(mockBlockNumber)).rejects.toThrow('Blockchain connection failed');
      
      // Verify the sequence: database check -> blockchain call -> error
      expect(mockBlockRepository.findByNumber).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockBlockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if database persistence fails', async () => {
      // Arrange: Mock repository findByNumber to return null, blockchain to succeed, create to fail
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockchainData);
      mockBlockRepository.create.mockRejectedValue(new Error('Database insert failed'));

      // Act & Assert: Should throw the database error
      await expect(blockService.getBlock(mockBlockNumber)).rejects.toThrow('Database insert failed');
      
      // Verify the sequence: database check -> blockchain call -> database insert -> error
      expect(mockBlockRepository.findByNumber).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockBlockRepository.create).toHaveBeenCalled();
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
      id: 1,
      number: BigInt(99999),
      hash: '0xlatest',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      timestamp: BigInt(Date.now()),
      extrinsicsCount: 0,
      createdAt: new Date(),
    };

    it('should fetch latest from blockchain and check database', async () => {
      // Arrange: Mock blockchain to return latest, repository to not have it
      mockBlockchain.getLatestBlock.mockResolvedValue(mockLatestBlockData);
      mockBlockRepository.findByNumber.mockResolvedValue(null);
      mockBlockRepository.create.mockResolvedValue(mockDbBlock);

      // Act
      const result = await blockService.getLatestBlock();

      // Assert: Should get latest from blockchain, check database, then persist
      expect(mockBlockchain.getLatestBlock).toHaveBeenCalled();
      expect(mockBlockRepository.findByNumber).toHaveBeenCalledWith(BigInt(99999));
      expect(mockBlockRepository.create).toHaveBeenCalled();
      expect(result.number).toBe(BigInt(99999));
    });

    it('should return from database if latest block already exists', async () => {
      // Arrange: Mock blockchain to return latest, repository to have it
      mockBlockchain.getLatestBlock.mockResolvedValue(mockLatestBlockData);
      mockBlockRepository.findByNumber.mockResolvedValue(mockDbBlock);

      // Act
      const result = await blockService.getLatestBlock();

      // Assert: Should not persist if already exists
      expect(mockBlockchain.getLatestBlock).toHaveBeenCalled();
      expect(mockBlockRepository.findByNumber).toHaveBeenCalledWith(BigInt(99999));
      expect(mockBlockRepository.create).not.toHaveBeenCalled();
      expect(result.number).toBe(BigInt(99999));
    });
  });
}); 