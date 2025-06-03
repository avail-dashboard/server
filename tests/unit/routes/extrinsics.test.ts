import request from 'supertest';
import express from 'express';
import extrinsicsRouter from '../../../src/routes/extrinsics';
import blockchainService from '../../../src/services/blockchain';
import { logError } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/services/blockchain');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware', () => ({
  pagination: jest.fn((req, res, next) => {
    req.query.page = req.query.page || '1';
    req.query.limit = req.query.limit || '10';
    req.query.offset = req.query.offset || '0';
    next();
  }),
  cacheMiddleware: jest.fn(() => (req, res, next) => next()),
}));
jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    cache: {
      ttl: {
        extrinsics: 60,
        extrinsicByHash: 300,
      },
    },
    server: {
      isDev: true,
      isTest: true,
      isProd: false,
    },
    logging: {
      level: 'info',
    },
    security: {
      apiRateLimit: 100,
    },
  },
}));

const mockedBlockchainService = blockchainService as jest.Mocked<typeof blockchainService>;
const mockedLogError = logError as jest.MockedFunction<typeof logError>;

describe('Extrinsics Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/extrinsics', extrinsicsRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('GET /api/extrinsics', () => {
    const mockExtrinsicsResult = {
      extrinsics: [
        {
          hash: '0xext1',
          blockNumber: BigInt(1000),
          extrinsicIndex: 0,
          module: 'System',
          call: 'remark',
          success: true,
          timestamp: BigInt(1640995200000),
          signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          fee: BigInt(1000),
          tip: BigInt(100),
          args: {},
        },
        {
          hash: '0xext2',
          blockNumber: BigInt(999),
          extrinsicIndex: 1,
          module: 'Balances',
          call: 'transfer',
          success: true,
          timestamp: BigInt(1640995140000),
          signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          fee: BigInt(2000),
          tip: BigInt(200),
          args: { dest: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', value: '1000000000000' },
        },
      ],
      total: 1000,
    };

    it('should return latest extrinsics with default pagination', async () => {
      mockedBlockchainService.getLatestExtrinsics.mockResolvedValue(mockExtrinsicsResult);

      const response = await request(app)
        .get('/api/extrinsics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        hash: '0xext1',
        blockNumber: 1000,
        module: 'System',
        call: 'remark',
      });
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 1000,
        source: 'rpc',
      });
    });

    it('should handle custom pagination parameters', async () => {
      mockedBlockchainService.getLatestExtrinsics.mockResolvedValue(mockExtrinsicsResult);

      const response = await request(app)
        .get('/api/extrinsics?page=2&limit=5')
        .expect(200);

      expect(mockedBlockchainService.getLatestExtrinsics).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        orderBy: 'timestamp',
        order: 'desc',
      });

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 5,
      });
    });

    it('should handle block filter parameter', async () => {
      mockedBlockchainService.getExtrinsicsByBlock.mockResolvedValue(mockExtrinsicsResult.extrinsics);

      const response = await request(app)
        .get('/api/extrinsics?block=1000')
        .expect(200);

      expect(mockedBlockchainService.getExtrinsicsByBlock).toHaveBeenCalledWith(BigInt(1000));
      expect(response.body.success).toBe(true);
    });

    it('should handle service errors gracefully', async () => {
      const error = new Error('RPC connection failed');
      mockedBlockchainService.getLatestExtrinsics.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/extrinsics')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch extrinsics',
      });

      expect(mockedLogError).toHaveBeenCalledWith(error, {
        component: 'extrinsics-route',
        action: 'getExtrinsics',
      });
    });

    it('should transform BigInt values correctly', async () => {
      mockedBlockchainService.getLatestExtrinsics.mockResolvedValue(mockExtrinsicsResult);

      const response = await request(app)
        .get('/api/extrinsics')
        .expect(200);

      expect(typeof response.body.data[0].blockNumber).toBe('number');
      expect(typeof response.body.data[0].timestamp).toBe('number');
      expect(typeof response.body.data[0].fee).toBe('number');
      expect(typeof response.body.data[0].tip).toBe('number');
      expect(response.body.data[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('GET /api/extrinsics/:hash', () => {
    const mockExtrinsic = {
      hash: '0xext1',
      blockNumber: BigInt(1000),
      extrinsicIndex: 0,
      module: 'System',
      call: 'remark',
      success: true,
      timestamp: BigInt(1640995200000),
      signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      fee: BigInt(1000),
      tip: BigInt(100),
      args: {},
      events: [],
    };

    it('should fetch extrinsic by hash', async () => {
      mockedBlockchainService.getExtrinsicByHash.mockResolvedValue(mockExtrinsic);

      const response = await request(app)
        .get('/api/extrinsics/0xext1')
        .expect(200);

      expect(mockedBlockchainService.getExtrinsicByHash).toHaveBeenCalledWith('0xext1');
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.hash).toBe('0xext1');
      expect(response.body.data.blockNumber).toBe(1000);
    });

    it('should return 404 for non-existent extrinsic', async () => {
      mockedBlockchainService.getExtrinsicByHash.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/extrinsics/0xnonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Extrinsic not found',
      });
    });

    it('should handle service errors for specific extrinsic', async () => {
      const error = new Error('Extrinsic fetch failed');
      mockedBlockchainService.getExtrinsicByHash.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/extrinsics/0xext1')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch extrinsic',
      });

      expect(mockedLogError).toHaveBeenCalledWith(error, {
        component: 'extrinsics-route',
        action: 'getExtrinsic',
      });
    });

    it('should transform extrinsic data correctly', async () => {
      mockedBlockchainService.getExtrinsicByHash.mockResolvedValue(mockExtrinsic);

      const response = await request(app)
        .get('/api/extrinsics/0xext1')
        .expect(200);

      const extrinsic = response.body.data;
      expect(typeof extrinsic.timestamp).toBe('number');
      expect(typeof extrinsic.fee).toBe('number');
      expect(typeof extrinsic.tip).toBe('number');
      expect(typeof extrinsic.blockNumber).toBe('number');
    });

    it('should handle extrinsics without tip', async () => {
      const mockExtrinsicWithoutTip = {
        ...mockExtrinsic,
        tip: undefined,
      };

      mockedBlockchainService.getExtrinsicByHash.mockResolvedValue(mockExtrinsicWithoutTip);

      const response = await request(app)
        .get('/api/extrinsics/0xext1')
        .expect(200);

      const extrinsic = response.body.data;
      expect(extrinsic.tip).toBe(0);
    });
  });
}); 