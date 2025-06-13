import { DataAvailabilityService, createDataAvailabilityService } from '../dataAvailability';
import { BlockchainService } from '../../core/blockchain';
import { DataSubmissionRepository } from '../../../database/repositories/DataSubmissionRepository';
import { RollupRepository } from '../../../database/repositories/RollupRepository';
import { DataSubmission, Rollup } from '../../../database';
import { ExtrinsicData, BlockData } from '../../types/blockchain';

// Mock the dependencies
jest.mock('../../core/blockchain');
jest.mock('../../../database/repositories/DataSubmissionRepository');
jest.mock('../../../database/repositories/RollupRepository');

describe('DataAvailabilityService', () => {
  let dataAvailabilityService: DataAvailabilityService;
  let mockDataSubmissionRepository: jest.Mocked<DataSubmissionRepository>;
  let mockRollupRepository: jest.Mocked<RollupRepository>;
  let mockBlockchain: jest.Mocked<BlockchainService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mocked instances
    mockDataSubmissionRepository = new DataSubmissionRepository() as jest.Mocked<DataSubmissionRepository>;
    mockRollupRepository = new RollupRepository() as jest.Mocked<RollupRepository>;
    mockBlockchain = new BlockchainService() as jest.Mocked<BlockchainService>;
    
    // Create service instance
    dataAvailabilityService = createDataAvailabilityService(
      mockDataSubmissionRepository,
      mockRollupRepository,
      mockBlockchain
    );
  });

  describe('getDataSubmissionsForBlock - Database First Pattern', () => {
    const mockBlockNumber = 12345;
    const mockExtrinsicHash = '0xdatasubmission123';
    
    const mockDbDataSubmission: DataSubmission = {
      id: 1,
      extrinsicHash: mockExtrinsicHash,
      blockNumber: BigInt(mockBlockNumber),
      extrinsicIndex: 2,
      appId: 1,
      rollupName: 'TestRollup',
      dataSize: BigInt(1024),
      dataHash: '0xdatahash123',
      submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      timestamp: BigInt(Date.now()),
      success: true,
      blobData: Buffer.from('test data'),
      kateCommitment: '0xcommitment123',
      proof: null,
      createdAt: new Date(),
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
      // Arrange: Mock repository to return existing data submissions
      mockDataSubmissionRepository.findMany.mockResolvedValue({
        submissions: [mockDbDataSubmission],
        total: 1
      });

      // Act: Get data submissions for block
      const result = await dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber);

      // Assert: Should return from database without calling blockchain
      expect(mockDataSubmissionRepository.findMany).toHaveBeenCalledWith(
        {},
        { page: 1, limit: 1000 }
      );
      expect(mockBlockchain.getBlock).not.toHaveBeenCalled();
      expect(mockDataSubmissionRepository.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].extrinsicHash).toBe(mockExtrinsicHash);
      expect(result[0].appId).toBe(1);
      expect(result[0].dataSize).toBe(BigInt(1024));
    });

    it('should fetch from blockchain and process if not in database', async () => {
      // Arrange: Mock repository to return empty array, blockchain to return block data
      mockDataSubmissionRepository.findMany.mockResolvedValue({
        submissions: [],
        total: 0
      });
      mockBlockchain.getBlock.mockResolvedValue(mockBlockData);
      mockDataSubmissionRepository.create.mockResolvedValue(mockDbDataSubmission);
      mockRollupRepository.incrementStats.mockRejectedValue(new Error('Not found')); // No existing rollup
      mockRollupRepository.create.mockResolvedValue({} as Rollup);

      // Act: Get data submissions for block
      const result = await dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber);

      // Assert: Should check database first, then fetch from blockchain, then process and persist
      expect(mockDataSubmissionRepository.findMany).toHaveBeenCalledWith(
        {},
        { page: 1, limit: 1000 }
      );
      expect(mockBlockchain.getBlock).toHaveBeenCalledWith(mockBlockNumber);
      expect(mockDataSubmissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        extrinsicHash: mockExtrinsicHash,
        blockNumber: BigInt(mockBlockNumber),
        extrinsicIndex: 2,
        appId: 1,
        success: true,
        submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      }));
      expect(result).toHaveLength(1);
      expect(result[0].extrinsicHash).toBe(mockExtrinsicHash);
    });

    it('should throw error if blockchain fetch fails', async () => {
      // Arrange: Mock repository to return empty array, blockchain to throw error
      mockDataSubmissionRepository.findMany.mockResolvedValue({
        submissions: [],
        total: 0
      });
      mockBlockchain.getBlock.mockRejectedValue(new Error('Blockchain connection failed'));

      // Act & Assert: Should throw the blockchain error
      await expect(dataAvailabilityService.getDataSubmissionsForBlock(mockBlockNumber)).rejects.toThrow('Blockchain connection failed');
      
      // Verify the sequence: database check -> blockchain call -> error
      expect(mockDataSubmissionRepository.findMany).toHaveBeenCalled();
      expect(mockBlockchain.getBlock).toHaveBeenCalled();
      expect(mockDataSubmissionRepository.create).not.toHaveBeenCalled();
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
      extrinsicHash: '0xdata1',
      blockNumber: BigInt(12345),
      extrinsicIndex: 1,
      appId: 1,
      rollupName: null,
      dataSize: BigInt(11), // "Hello World" length
      dataHash: '0x48656c6c6f20576f726c64000000000000000000000000000000000000000000',
      submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      timestamp: BigInt(mockBlockData.timestamp),
      success: true,
      blobData: Buffer.from('Hello World'),
      kateCommitment: null,
      proof: null,
      createdAt: new Date(),
    };

    const mockDbDataSubmission2: DataSubmission = {
      id: 2,
      extrinsicHash: '0xdata2',
      blockNumber: BigInt(12345),
      extrinsicIndex: 3,
      appId: 2,
      rollupName: null,
      dataSize: BigInt(8), // "Avail DA" length
      dataHash: '0x417661696c204441000000000000000000000000000000000000000000000000',
      submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      timestamp: BigInt(mockBlockData.timestamp),
      success: true,
      blobData: Buffer.from('Avail DA'),
      kateCommitment: '0xcommitment456',
      proof: null,
      createdAt: new Date(),
    };

         it('should process only data submission extrinsics and ignore regular extrinsics', async () => {
       // Arrange: Mock repository operations
       mockDataSubmissionRepository.create
         .mockResolvedValueOnce(mockDbDataSubmission1) // First data submission
         .mockResolvedValueOnce(mockDbDataSubmission2); // Second data submission
       mockRollupRepository.incrementStats.mockRejectedValue(new Error('Not found')); // No existing rollups
       mockRollupRepository.create.mockResolvedValue({} as Rollup);

       // Act: Process data submissions from block
       const result = await dataAvailabilityService.processDataSubmissionsFromBlock(mockBlockData);

       // Assert: Should process only the 2 data submission extrinsics, not the regular one
       expect(mockDataSubmissionRepository.create).toHaveBeenCalledTimes(2);
      
             // Check first data submission
       expect(mockDataSubmissionRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
         extrinsicHash: '0xdata1',
         blockNumber: BigInt(12345),
         extrinsicIndex: 1,
         appId: 1,
         success: true,
         submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
       }));

       // Check second data submission
       expect(mockDataSubmissionRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
         extrinsicHash: '0xdata2',
         blockNumber: BigInt(12345),
         extrinsicIndex: 3,
         appId: 2,
         success: true,
         submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
       }));

      expect(result).toHaveLength(2);
      expect(result[0].extrinsicHash).toBe('0xdata1');
      expect(result[1].extrinsicHash).toBe('0xdata2');
    });

    it('should update rollup statistics when processing data submissions', async () => {
      // Arrange: Mock existing rollup
      const existingRollup: Rollup = {
        appId: 1,
        name: 'Existing Rollup',
        description: null,
        firstSeenBlock: BigInt(1000),
        lastActiveBlock: BigInt(12000),
        totalSubmissions: 5,
        totalDataSize: BigInt(5000),
        totalFeesPaid: BigInt(1000000),
        website: null,
        logoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDataSubmissionRepository.create.mockResolvedValue(mockDbDataSubmission1);
      mockRollupRepository.incrementStats.mockResolvedValue(existingRollup);

      // Act: Process single data submission
      const singleExtrinsicBlock: BlockData = {
        ...mockBlockData,
        extrinsics: [mockDataSubmissionExtrinsic1],
      };
      
      await dataAvailabilityService.processDataSubmissionsFromBlock(singleExtrinsicBlock);

      // Assert: Should update rollup statistics
      expect(mockRollupRepository.incrementStats).toHaveBeenCalledWith(1, {
        submissionsIncrement: 1,
        dataSizeIncrement: BigInt(11), // Hello World length
      });
    });

    it('should create new rollup entry if none exists', async () => {
      // Arrange: No existing rollup
      mockDataSubmissionRepository.create.mockResolvedValue(mockDbDataSubmission1);
      mockRollupRepository.incrementStats.mockRejectedValue(new Error('Not found')); // No existing rollup
      mockRollupRepository.create.mockResolvedValue({} as Rollup);

      // Act: Process single data submission
      const singleExtrinsicBlock: BlockData = {
        ...mockBlockData,
        extrinsics: [mockDataSubmissionExtrinsic1],
      };
      
      await dataAvailabilityService.processDataSubmissionsFromBlock(singleExtrinsicBlock);

      // Assert: Should create new rollup
      expect(mockRollupRepository.incrementStats).toHaveBeenCalledWith(1, {
        submissionsIncrement: 1,
        dataSizeIncrement: BigInt(11),
      });
      expect(mockRollupRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        appId: 1,
        name: 'App 1',
        totalSubmissions: 1,
        totalDataSize: BigInt(11), // Hello World length
        totalFeesPaid: BigInt(0),
      }));
    });
  });

  describe('getDataSubmissionsForRollup', () => {
    const mockAppId = 1;
    const mockDataSubmissions: DataSubmission[] = [
      {
        id: 1,
        extrinsicHash: '0xdata1',
        blockNumber: BigInt(12345),
        extrinsicIndex: 1,
        appId: mockAppId,
        rollupName: 'TestRollup',
        dataSize: BigInt(1024),
        dataHash: '0xhash1',
        submitter: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        timestamp: BigInt(Date.now()),
        success: true,
        blobData: null,
        kateCommitment: null,
        proof: null,
        createdAt: new Date(),
      },
      {
        id: 2,
        extrinsicHash: '0xdata2',
        blockNumber: BigInt(12346),
        extrinsicIndex: 2,
        appId: mockAppId,
        rollupName: 'TestRollup',
        dataSize: BigInt(2048),
        dataHash: '0xhash2',
        submitter: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        timestamp: BigInt(Date.now()),
        success: true,
        blobData: null,
        kateCommitment: null,
        proof: null,
        createdAt: new Date(),
      },
    ];

    it('should retrieve all data submissions for a specific rollup', async () => {
      // Arrange: Mock repository to return rollup submissions
      mockDataSubmissionRepository.findByAppId.mockResolvedValue({
        submissions: mockDataSubmissions,
        total: 2
      });

      // Act: Get data submissions for rollup
      const result = await dataAvailabilityService.getDataSubmissionsForRollup(mockAppId);

      // Assert: Should query by appId
      expect(mockDataSubmissionRepository.findByAppId).toHaveBeenCalledWith(
        mockAppId,
        { page: 1, limit: 1000 }
      );
      expect(result).toHaveLength(2);
      expect(result[0].appId).toBe(mockAppId);
      expect(result[1].appId).toBe(mockAppId);
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