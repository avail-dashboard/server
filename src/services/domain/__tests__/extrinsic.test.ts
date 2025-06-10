import { ExtrinsicService, createExtrinsicService, FeeCalculation } from '../extrinsic';
import db from '../../../utils/database';
import { BlockchainService } from '../../core/blockchain';
import { Extrinsic } from '../../../types/database';
import { ExtrinsicData, BlockData } from '../../types/blockchain';

// Mock the dependencies
jest.mock('../../../utils/database');
jest.mock('../../core/blockchain');

describe('ExtrinsicService', () => {
  let extrinsicService: ExtrinsicService;
  let mockDb: jest.Mocked<typeof db>;
  let mockBlockchain: jest.Mocked<BlockchainService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    mockDb = db as jest.Mocked<typeof db>;
    mockBlockchain = new BlockchainService() as jest.Mocked<BlockchainService>;
    
    // Create service instance
    extrinsicService = createExtrinsicService(mockDb, mockBlockchain);
  });

  describe('getExtrinsicsForBlock - Database First Pattern', () => {
    const mockBlockNumber = 12345;
    const mockExtrinsicHash = '0xextrinsic123';
    
    const mockDbExtrinsic: Extrinsic = {
      id: 1,
      hash: mockExtrinsicHash,
      block_number: BigInt(mockBlockNumber),
      extrinsic_index: 0,
      module: 'balances',
      call: 'transfer',
      success: true,
      timestamp: BigInt(Date.now()),
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      fee: BigInt(1000000),
      created_at: new Date(),
    };

    const mockExtrinsicData: ExtrinsicData = {
      hash: mockExtrinsicHash,
      index: 0,
      isSigned: true,
      method: {
        section: 'balances',
        method: 'transfer',
        args: { dest: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', value: '1000000000000' },
      },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      nonce: 1,
      tip: '0',
      fee: '1000000',
      success: true,
    };

    const mockBlockData: BlockData = {
      number: mockBlockNumber,
      hash: '0xblock123',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [mockExtrinsicData],
      events: [],
    };

    it('should return extrinsics from database if they exist (database first)', async () => {
      // Arrange: Mock database to return existing extrinsics
      mockDb.findMany.mockResolvedValue([mockDbExtrinsic]);

      // Act: Get extrinsics for block
      const result = await extrinsicService.getExtrinsicsForBlock(mockBlockNumber);

      // Assert: Should return from database without calling blockchain
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'extrinsics',
        { block_number: mockBlockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );
      expect(mockBlockchain.getBlock).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe(mockExtrinsicHash);
      expect(result[0].block_number).toBe(BigInt(mockBlockNumber));
    });

    it('should fetch from blockchain and process if not in database', async () => {
      // Arrange: Mock database to return empty array, blockchain to return block data
      mockDb.findMany.mockResolvedValue([]);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockData);
      mockDb.insert.mockResolvedValue(mockDbExtrinsic);

      // Act: Get extrinsics for block
      const result = await extrinsicService.getExtrinsicsForBlock(mockBlockNumber);

      // Assert: Should check database first, then fetch from blockchain, then process and persist
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'extrinsics',
        { block_number: mockBlockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );
      expect(mockBlockchain.getBlock).toHaveBeenCalledWith(mockBlockNumber);
      expect(mockDb.insert).toHaveBeenCalledWith('extrinsics', expect.objectContaining({
        hash: mockExtrinsicHash,
        block_number: BigInt(mockBlockNumber),
        extrinsic_index: 0,
        module: 'balances',
        call: 'transfer',
        success: true,
        signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        fee: BigInt(1000000), // base fee + tip
      }));
      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe(mockExtrinsicHash);
    });

    it('should throw error if blockchain fetch fails', async () => {
      // Arrange: Mock database to return empty array, blockchain to throw error
      mockDb.findMany.mockResolvedValue([]);
      mockBlockchain.getBlock.mockRejectedValue(new Error('Blockchain connection failed'));

      // Act & Assert: Should throw the blockchain error
      await expect(extrinsicService.getExtrinsicsForBlock(mockBlockNumber)).rejects.toThrow('Blockchain connection failed');
      
      // Verify the sequence: database check -> blockchain call -> error
      expect(mockDb.findMany).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('processExtrinsicsFromBlock', () => {
    const mockExtrinsicData1: ExtrinsicData = {
      hash: '0xext1',
      index: 0,
      isSigned: true,
      method: { section: 'balances', method: 'transfer', args: {} },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      fee: '1000000',
      tip: '500000',
      success: true,
    };

    const mockExtrinsicData2: ExtrinsicData = {
      hash: '0xext2',
      index: 1,
      isSigned: false,
      method: { section: 'timestamp', method: 'set', args: {} },
      fee: '0',
      success: true,
    };

    const mockBlockData: BlockData = {
      number: 12345,
      hash: '0xblock123',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [mockExtrinsicData1, mockExtrinsicData2],
      events: [],
    };

    const mockDbExtrinsic1: Extrinsic = {
      id: 1,
      hash: '0xext1',
      block_number: BigInt(12345),
      extrinsic_index: 0,
      module: 'balances',
      call: 'transfer',
      success: true,
      timestamp: BigInt(mockBlockData.timestamp),
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      fee: BigInt(1500000), // 1000000 + 500000
      created_at: new Date(),
    };

    const mockDbExtrinsic2: Extrinsic = {
      id: 2,
      hash: '0xext2',
      block_number: BigInt(12345),
      extrinsic_index: 1,
      module: 'timestamp',
      call: 'set',
      success: true,
      timestamp: BigInt(mockBlockData.timestamp),
      signer: undefined,
      fee: BigInt(0),
      created_at: new Date(),
    };

    it('should process multiple extrinsics and calculate fees correctly', async () => {
      // Arrange: Mock database inserts
      mockDb.insert
        .mockResolvedValueOnce(mockDbExtrinsic1)
        .mockResolvedValueOnce(mockDbExtrinsic2);

      // Act: Process extrinsics from block
      const result = await extrinsicService.processExtrinsicsFromBlock(mockBlockData);

      // Assert: Should process both extrinsics with correct fee calculations
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      
      // Check first extrinsic (signed with fee and tip)
      expect(mockDb.insert).toHaveBeenNthCalledWith(1, 'extrinsics', expect.objectContaining({
        hash: '0xext1',
        block_number: BigInt(12345),
        extrinsic_index: 0,
        module: 'balances',
        call: 'transfer',
        success: true,
        signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        fee: BigInt(1500000), // 1000000 base + 500000 tip
      }));

      // Check second extrinsic (unsigned with no fee)
      expect(mockDb.insert).toHaveBeenNthCalledWith(2, 'extrinsics', expect.objectContaining({
        hash: '0xext2',
        block_number: BigInt(12345),
        extrinsic_index: 1,
        module: 'timestamp',
        call: 'set',
        success: true,
        signer: undefined,
        fee: BigInt(0),
      }));

      expect(result).toHaveLength(2);
      expect(result[0].hash).toBe('0xext1');
      expect(result[1].hash).toBe('0xext2');
    });

    it('should handle fee calculation errors gracefully', async () => {
      // Arrange: Create extrinsic with invalid fee data
      const invalidExtrinsicData: ExtrinsicData = {
        hash: '0xbadext',
        index: 0,
        isSigned: true,
        method: { section: 'balances', method: 'transfer', args: {} },
        fee: 'invalid_fee', // This will cause BigInt conversion to fail
        success: true,
      };

      const blockWithInvalidData: BlockData = {
        ...mockBlockData,
        extrinsics: [invalidExtrinsicData],
      };

      const mockDbExtrinsicWithZeroFee: Extrinsic = {
        id: 1,
        hash: '0xbadext',
        block_number: BigInt(12345),
        extrinsic_index: 0,
        module: 'balances',
        call: 'transfer',
        success: true,
        timestamp: BigInt(mockBlockData.timestamp),
        signer: undefined,
        fee: BigInt(0), // Should default to 0 when calculation fails
        created_at: new Date(),
      };

      mockDb.insert.mockResolvedValue(mockDbExtrinsicWithZeroFee);

      // Act: Process extrinsics with invalid fee data
      const result = await extrinsicService.processExtrinsicsFromBlock(blockWithInvalidData);

      // Assert: Should handle error gracefully and use zero fee
      expect(mockDb.insert).toHaveBeenCalledWith('extrinsics', expect.objectContaining({
        hash: '0xbadext',
        fee: BigInt(0), // Should default to 0 when fee calculation fails
      }));
      expect(result).toHaveLength(1);
    });
  });

  describe('getExtrinsic by hash', () => {
    const mockExtrinsicHash = '0xextrinsic123';
    const mockDbExtrinsic: Extrinsic = {
      id: 1,
      hash: mockExtrinsicHash,
      block_number: BigInt(12345),
      extrinsic_index: 0,
      module: 'balances',
      call: 'transfer',
      success: true,
      timestamp: BigInt(Date.now()),
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      fee: BigInt(1000000),
      created_at: new Date(),
    };

    it('should return extrinsic from database if it exists', async () => {
      // Arrange: Mock database to return existing extrinsic
      mockDb.findOne.mockResolvedValue(mockDbExtrinsic);

      // Act: Get extrinsic by hash
      const result = await extrinsicService.getExtrinsic(mockExtrinsicHash);

      // Assert: Should return from database
      expect(mockDb.findOne).toHaveBeenCalledWith('extrinsics', { hash: mockExtrinsicHash });
      expect(result.hash).toBe(mockExtrinsicHash);
      expect(result.block_number).toBe(BigInt(12345));
    });

    it('should throw error if extrinsic not found and block lookup not implemented', async () => {
      // Arrange: Mock database to return null
      mockDb.findOne.mockResolvedValue(null);

      // Act & Assert: Should throw error about block lookup not implemented
      await expect(extrinsicService.getExtrinsic(mockExtrinsicHash)).rejects.toThrow(
        `Extrinsic ${mockExtrinsicHash} not found in database and block lookup not implemented`,
      );
      
      expect(mockDb.findOne).toHaveBeenCalledWith('extrinsics', { hash: mockExtrinsicHash });
    });
  });

  describe('fee calculation', () => {
    it('should calculate fees correctly with base fee and tip', () => {
      const extrinsicData: ExtrinsicData = {
        hash: '0xtest',
        index: 0,
        isSigned: true,
        method: { section: 'balances', method: 'transfer', args: {} },
        fee: '1000000',
        tip: '500000',
        success: true,
      };

      // Access private method through service instance
      const service = extrinsicService as any;
      const feeCalculation: FeeCalculation = service.calculateFees(extrinsicData);

      expect(feeCalculation.baseFee).toBe(BigInt(1000000));
      expect(feeCalculation.tip).toBe(BigInt(500000));
      expect(feeCalculation.totalFee).toBe(BigInt(1500000));
    });

    it('should handle missing fee and tip values', () => {
      const extrinsicData: ExtrinsicData = {
        hash: '0xtest',
        index: 0,
        isSigned: false,
        method: { section: 'timestamp', method: 'set', args: {} },
        success: true,
        // No fee or tip provided
      };

      // Access private method through service instance
      const service = extrinsicService as any;
      const feeCalculation: FeeCalculation = service.calculateFees(extrinsicData);

      expect(feeCalculation.baseFee).toBe(BigInt(0));
      expect(feeCalculation.tip).toBe(BigInt(0));
      expect(feeCalculation.totalFee).toBe(BigInt(0));
    });
  });
}); 