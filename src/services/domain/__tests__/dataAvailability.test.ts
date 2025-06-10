import { DataAvailabilityService, createDataAvailabilityService } from '../dataAvailability';
import db from '../../../utils/database';
import { BlockchainService } from '../../core/blockchain';
import { DataSubmission, Rollup } from '../../../types/database';
import { ExtrinsicData, BlockData } from '../../types/blockchain';

// Mock the dependencies
jest.mock('../../../utils/database');
jest.mock('../../core/blockchain');

describe('DataAvailabilityService', () => {
  let dataAvailabilityService: DataAvailabilityService;
  let mockDb: jest.Mocked<typeof db>;
  let mockBlockchain: jest.Mocked<BlockchainService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    mockDb = db as jest.Mocked<typeof db>;
    mockBlockchain = new BlockchainService() as jest.Mocked<BlockchainService>;
    
    // Create service instance
    dataAvailabilityService = createDataAvailabilityService(mockDb, mockBlockchain);
  });

  describe('getDataSubmissionsForBlock - Database First Pattern', () => {
    const mockBlockNumber = 12345;
    const mockExtrinsicHash = '0xdatasubmission123';
    
    const mockDbDataSubmission: DataSubmission = {
      id: 1,
      extrinsic_hash: mockExtrinsicHash,
      block_number: BigInt(mockBlockNumber),
      extrinsic_index: 2,
      app_id: 1,
      rollup_name: 'TestRollup',
      data_size: BigInt(1024),
      data_hash: '0xdatahash123',
      submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      timestamp: BigInt(Date.now()),
      success: true,
      blob_data: Buffer.from('test data'),
      kate_commitment: '0xcommitment123',
      proof: undefined,
      created_at: new Date(),
    };

    const mockDataSubmissionExtrinsic: ExtrinsicData = {
      hash: mockExtrinsicHash,
      index: 2,
      isSigned: true,
      method: {
        section: 'dataAvailability',
        method: 'submitData',
        args: {
          app_id: 1,
          data: '74657374206461746120666f7220617661696c', // hex for "test data for avail"
          commitment: '0xcommitment123',
        },
      },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      success: true,
    };

    const mockRegularExtrinsic: ExtrinsicData = {
      hash: '0xregular123',
      index: 1,
      isSigned: true,
      method: {
        section: 'balances',
        method: 'transfer',
        args: { dest: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', value: '1000000000000' },
      },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      success: true,
    };

    const mockBlockData: BlockData = {
      number: mockBlockNumber,
      hash: '0xblock123',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [mockRegularExtrinsic, mockDataSubmissionExtrinsic],
      events: [],
    };

    it('should return data submissions from database if they exist (database first)', async () => {
      // Arrange: Mock database to return existing data submissions
      mockDb.findMany.mockResolvedValue([mockDbDataSubmission]);

      // Act: Get data submissions for block
      const result = await dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber);

      // Assert: Should return from database without calling blockchain
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'data_submissions',
        { block_number: mockBlockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );
      expect(mockBlockchain.getBlock).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].extrinsic_hash).toBe(mockExtrinsicHash);
      expect(result[0].app_id).toBe(1);
      expect(result[0].data_size).toBe(BigInt(1024));
    });

    it('should fetch from blockchain and process if not in database', async () => {
      // Arrange: Mock database to return empty array, blockchain to return block data
      mockDb.findMany.mockResolvedValue([]);
      mockBlockchain.getBlock.mockResolvedValue(mockBlockData);
      mockDb.insert.mockResolvedValue(mockDbDataSubmission);
      mockDb.findOne.mockResolvedValue(null); // No existing rollup
      mockDb.update.mockResolvedValue(null);

      // Act: Get data submissions for block
      const result = await dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber);

      // Assert: Should check database first, then fetch from blockchain, then process and persist
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'data_submissions',
        { block_number: mockBlockNumber },
        { orderBy: 'extrinsic_index', order: 'ASC' },
      );
      expect(mockBlockchain.getBlock).toHaveBeenCalledWith(mockBlockNumber);
      expect(mockDb.insert).toHaveBeenCalledWith('data_submissions', expect.objectContaining({
        extrinsic_hash: mockExtrinsicHash,
        block_number: BigInt(mockBlockNumber),
        extrinsic_index: 2,
        app_id: 1,
        success: true,
        submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      }));
      expect(result).toHaveLength(1);
      expect(result[0].extrinsic_hash).toBe(mockExtrinsicHash);
    });

    it('should throw error if blockchain fetch fails', async () => {
      // Arrange: Mock database to return empty array, blockchain to throw error
      mockDb.findMany.mockResolvedValue([]);
      mockBlockchain.getBlock.mockRejectedValue(new Error('Blockchain connection failed'));

      // Act & Assert: Should throw the blockchain error
      await expect(dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber)).rejects.toThrow('Blockchain connection failed');
      
      // Verify the sequence: database check -> blockchain call -> error
      expect(mockDb.findMany).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('processDataSubmissionsFromBlock', () => {
    const mockDataSubmissionExtrinsic1: ExtrinsicData = {
      hash: '0xdata1',
      index: 1,
      isSigned: true,
      method: {
        section: 'dataAvailability',
        method: 'submitData',
        args: {
          app_id: 1,
          data: '48656c6c6f20576f726c64', // hex for "Hello World"
        },
      },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      success: true,
    };

    const mockDataSubmissionExtrinsic2: ExtrinsicData = {
      hash: '0xdata2',
      index: 3,
      isSigned: true,
      method: {
        section: 'dactr',
        method: 'submit_data',
        args: {
          appId: 2, // Different field name
          blob: '417661696c204441', // hex for "Avail DA"
          commitment: '0xcommitment456',
        },
      },
      signer: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      success: true,
    };

    const mockRegularExtrinsic: ExtrinsicData = {
      hash: '0xregular',
      index: 2,
      isSigned: true,
      method: {
        section: 'balances',
        method: 'transfer',
        args: {},
      },
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      success: true,
    };

    const mockBlockData: BlockData = {
      number: 12345,
      hash: '0xblock123',
      parentHash: '0xparent',
      stateRoot: '0xstate',
      extrinsicsRoot: '0xextrinsics',
      timestamp: Date.now(),
      extrinsics: [mockDataSubmissionExtrinsic1, mockRegularExtrinsic, mockDataSubmissionExtrinsic2],
      events: [],
    };

    const mockDbDataSubmission1: DataSubmission = {
      id: 1,
      extrinsic_hash: '0xdata1',
      block_number: BigInt(12345),
      extrinsic_index: 1,
      app_id: 1,
      rollup_name: undefined,
      data_size: BigInt(11), // "Hello World" length
      data_hash: '0x48656c6c6f20576f726c64000000000000000000000000000000000000000000',
      submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      timestamp: BigInt(mockBlockData.timestamp),
      success: true,
      blob_data: Buffer.from('Hello World'),
      kate_commitment: undefined,
      proof: undefined,
      created_at: new Date(),
    };

    const mockDbDataSubmission2: DataSubmission = {
      id: 2,
      extrinsic_hash: '0xdata2',
      block_number: BigInt(12345),
      extrinsic_index: 3,
      app_id: 2,
      rollup_name: undefined,
      data_size: BigInt(8), // "Avail DA" length
      data_hash: '0x417661696c204441000000000000000000000000000000000000000000000000',
      submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      timestamp: BigInt(mockBlockData.timestamp),
      success: true,
      blob_data: Buffer.from('Avail DA'),
      kate_commitment: '0xcommitment456',
      proof: undefined,
      created_at: new Date(),
    };

         it('should process only data submission extrinsics and ignore regular extrinsics', async () => {
       // Arrange: Mock database inserts and rollup operations
       mockDb.insert
         .mockResolvedValueOnce(mockDbDataSubmission1) // First data submission
         .mockResolvedValueOnce({} as Rollup) // First rollup creation
         .mockResolvedValueOnce(mockDbDataSubmission2) // Second data submission
         .mockResolvedValueOnce({} as Rollup); // Second rollup creation
       mockDb.findOne.mockResolvedValue(null); // No existing rollups
       mockDb.update.mockResolvedValue(null);

       // Act: Process data submissions from block
       const result = await dataAvailabilityService.processDataSubmissionsFromBlock(mockBlockData);

       // Assert: Should process only the 2 data submission extrinsics, not the regular one
       // Expect 4 calls: 2 for data submissions + 2 for rollup creations
       expect(mockDb.insert).toHaveBeenCalledTimes(4);
      
             // Check first data submission
       expect(mockDb.insert).toHaveBeenNthCalledWith(1, 'data_submissions', expect.objectContaining({
         extrinsic_hash: '0xdata1',
         block_number: BigInt(12345),
         extrinsic_index: 1,
         app_id: 1,
         success: true,
         submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
       }));

       // Check second data submission (3rd call because rollup creation happens in between)
       expect(mockDb.insert).toHaveBeenNthCalledWith(3, 'data_submissions', expect.objectContaining({
         extrinsic_hash: '0xdata2',
         block_number: BigInt(12345),
         extrinsic_index: 3,
         app_id: 2,
         success: true,
         submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
       }));

      expect(result).toHaveLength(2);
      expect(result[0].extrinsic_hash).toBe('0xdata1');
      expect(result[1].extrinsic_hash).toBe('0xdata2');
    });

    it('should update rollup statistics when processing data submissions', async () => {
      // Arrange: Mock existing rollup
      const existingRollup: Rollup = {
        app_id: 1,
        name: 'Existing Rollup',
        description: undefined,
        first_seen_block: BigInt(1000),
        last_active_block: BigInt(12000),
        total_submissions: 5,
        total_data_size: BigInt(5000),
        total_fees_paid: BigInt(1000000),
        website: undefined,
        logo_url: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.insert.mockResolvedValue(mockDbDataSubmission1);
      mockDb.findOne.mockResolvedValue(existingRollup);
      mockDb.update.mockResolvedValue(null);

      // Act: Process single data submission
      const singleExtrinsicBlock: BlockData = {
        ...mockBlockData,
        extrinsics: [mockDataSubmissionExtrinsic1],
      };
      
      await dataAvailabilityService.processDataSubmissionsFromBlock(singleExtrinsicBlock);

      // Assert: Should update rollup statistics
      expect(mockDb.findOne).toHaveBeenCalledWith('rollups', { app_id: 1 });
      expect(mockDb.update).toHaveBeenCalledWith(
        'rollups',
        expect.objectContaining({
          total_submissions: 6, // 5 + 1
          total_data_size: BigInt(5011), // 5000 + 11 (Hello World length)
          updated_at: expect.any(Date),
        }),
        { app_id: 1 },
      );
    });

    it('should create new rollup entry if none exists', async () => {
      // Arrange: No existing rollup
      mockDb.insert
        .mockResolvedValueOnce(mockDbDataSubmission1) // Data submission insert
        .mockResolvedValueOnce({} as Rollup); // Rollup insert
      mockDb.findOne.mockResolvedValue(null); // No existing rollup

      // Act: Process single data submission
      const singleExtrinsicBlock: BlockData = {
        ...mockBlockData,
        extrinsics: [mockDataSubmissionExtrinsic1],
      };
      
      await dataAvailabilityService.processDataSubmissionsFromBlock(singleExtrinsicBlock);

      // Assert: Should create new rollup
      expect(mockDb.findOne).toHaveBeenCalledWith('rollups', { app_id: 1 });
      expect(mockDb.insert).toHaveBeenNthCalledWith(2, 'rollups', expect.objectContaining({
        app_id: 1,
        name: 'App 1',
        total_submissions: 1,
        total_data_size: BigInt(11), // Hello World length
        total_fees_paid: BigInt(0),
      }));
    });
  });

  describe('getDataSubmissionsForRollup', () => {
    const mockAppId = 1;
    const mockDataSubmissions: DataSubmission[] = [
      {
        id: 1,
        extrinsic_hash: '0xdata1',
        block_number: BigInt(12345),
        extrinsic_index: 1,
        app_id: mockAppId,
        rollup_name: 'TestRollup',
        data_size: BigInt(1024),
        data_hash: '0xhash1',
        submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        timestamp: BigInt(Date.now()),
        success: true,
        blob_data: undefined,
        kate_commitment: undefined,
        proof: undefined,
        created_at: new Date(),
      },
      {
        id: 2,
        extrinsic_hash: '0xdata2',
        block_number: BigInt(12346),
        extrinsic_index: 2,
        app_id: mockAppId,
        rollup_name: 'TestRollup',
        data_size: BigInt(2048),
        data_hash: '0xhash2',
        submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        timestamp: BigInt(Date.now()),
        success: true,
        blob_data: undefined,
        kate_commitment: undefined,
        proof: undefined,
        created_at: new Date(),
      },
    ];

    it('should retrieve all data submissions for a specific rollup', async () => {
      // Arrange: Mock database to return rollup submissions
      mockDb.findMany.mockResolvedValue(mockDataSubmissions);

      // Act: Get data submissions for rollup
      const result = await dataAvailabilityService.getDataSubmissionsForRollup(mockAppId);

      // Assert: Should query by app_id and order by timestamp
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'data_submissions',
        { app_id: mockAppId },
        { orderBy: 'timestamp', order: 'DESC' },
      );
      expect(result).toHaveLength(2);
      expect(result[0].app_id).toBe(mockAppId);
      expect(result[1].app_id).toBe(mockAppId);
    });
  });

  describe('data submission identification', () => {
    it('should identify data submission extrinsics correctly', () => {
      const dataSubmissionExtrinsics = [
        {
          method: { section: 'dataAvailability', method: 'submitData' },
        },
        {
          method: { section: 'dataAvailability', method: 'submit_data' },
        },
        {
          method: { section: 'dactr', method: 'submitData' },
        },
        {
          method: { section: 'dactr', method: 'submit_data' },
        },
      ];

      const regularExtrinsics = [
        {
          method: { section: 'balances', method: 'transfer' },
        },
        {
          method: { section: 'staking', method: 'bond' },
        },
        {
          method: { section: 'system', method: 'remark' },
        },
      ];

      // Access private method through service instance
      const service = dataAvailabilityService as any;

      // Test data submission extrinsics
      dataSubmissionExtrinsics.forEach(extrinsic => {
        expect(service.isDataSubmissionExtrinsic(extrinsic)).toBe(true);
      });

      // Test regular extrinsics
      regularExtrinsics.forEach(extrinsic => {
        expect(service.isDataSubmissionExtrinsic(extrinsic)).toBe(false);
      });
    });
  });
}); 