import request from 'supertest';
import express from 'express';
import blocksRouter from '../../../src/routes/blocks';
import blockchainService from '../../../src/services/blockchain';
import { logError } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/services/blockchain');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware', () => ({
  pagination: jest.fn((req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.query.page = req.query.page || '1';
    req.query.limit = req.query.limit || '10';
    req.query.offset = req.query.offset || '0';
    next();
  }),
  errorHandler: jest.fn((_err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: _err.message });
  }),
  responseLogger: jest.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  }),
  cacheMiddleware: jest.fn(() => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
}));
jest.mock('../../../src/config', () => ({
  __esModule: true,
  default: {
    cache: {
      ttl: {
        blocks: 60,
        blockByNumber: 300,
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

describe('Blocks Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/blocks', blocksRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('GET /api/blocks', () => {
    const mockBlocksResult = {
      blocks: [
        {
          number: BigInt(1000),
          hash: '0x123abc',
          parentHash: '0x456def',
          stateRoot: '0x789ghi',
          extrinsicsRoot: '0xabcjkl',
          timestamp: BigInt(1640995200000),
          extrinsicsCount: 5,
          size: 1024,
          finalized: true,
          authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          weight: '100000',
          spec: 1000,
        },
        {
          number: BigInt(999),
          hash: '0x456def',
          parentHash: '0x789ghi',
          stateRoot: '0xabcjkl',
          extrinsicsRoot: '0xdefmno',
          timestamp: BigInt(1640995140000),
          extrinsicsCount: 3,
          size: 512,
          finalized: true,
          authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          weight: '80000',
          spec: 1000,
        },
      ],
      total: 1000,
    };

    it('should return latest blocks with default pagination', async () => {
      mockedBlockchainService.getLatestBlocks.mockResolvedValue(mockBlocksResult);

      const response = await request(app)
        .get('/api/blocks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        number: 1000,
        hash: '0x123abc',
        extrinsics: 5,
      });
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 1000,
        source: 'rpc',
      });
    });

    it('should handle custom pagination parameters', async () => {
      mockedBlockchainService.getLatestBlocks.mockResolvedValue(mockBlocksResult);

      const response = await request(app)
        .get('/api/blocks?page=2&limit=5')
        .expect(200);

      expect(mockedBlockchainService.getLatestBlocks).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        orderBy: 'number',
        order: 'desc',
      });

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 5,
      });
    });

    it('should handle service errors gracefully', async () => {
      const error = new Error('RPC connection failed');
      mockedBlockchainService.getLatestBlocks.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/blocks')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch blocks',
      });

      expect(mockedLogError).toHaveBeenCalledWith(error, {
        component: 'blocks-route',
        action: 'getBlocks',
      });
    });

    it('should transform BigInt values correctly', async () => {
      mockedBlockchainService.getLatestBlocks.mockResolvedValue(mockBlocksResult);

      const response = await request(app)
        .get('/api/blocks')
        .expect(200);

      expect(typeof response.body.data[0].number).toBe('number');
      expect(typeof response.body.data[0].timestamp).toBe('number');
      expect(response.body.data[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('GET /api/blocks/:numberOrHash', () => {
    const mockBlock = {
      number: 1000,
      hash: '0x123abc',
      parentHash: '0x456def',
      stateRoot: '0x789ghi',
      extrinsicsRoot: '0xabcjkl',
      timestamp: 1640995200000,
      extrinsicsCount: 5,
      size: 1024,
      finalized: true,
      authorId: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      weight: '100000',
      spec: 1000,
    };

    const mockExtrinsics = [
      {
        hash: '0xext1',
        blockNumber: 1000,
        extrinsicIndex: 0,
        module: 'timestamp',
        call: 'set',
        success: true,
        timestamp: 1640995200000,
        signer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        fee: 1000,
        tip: 100,
        args: {},
      },
    ];

    it('should fetch block by number', async () => {
      (mockedBlockchainService.getBlockByNumber as any).mockResolvedValue(mockBlock);
      (mockedBlockchainService.getExtrinsicsByBlock as any).mockResolvedValue(mockExtrinsics);

      const response = await request(app)
        .get('/api/blocks/1000')
        .expect(200);

      expect(mockedBlockchainService.getBlockByNumber).toHaveBeenCalledWith(BigInt(1000));
      expect(mockedBlockchainService.getExtrinsicsByBlock).toHaveBeenCalledWith(BigInt(1000));
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.number).toBe(1000);
      expect(response.body.data.extrinsics).toHaveLength(1);
    });

    it('should fetch block by hash', async () => {
      (mockedBlockchainService.getBlockByHash as any).mockResolvedValue(mockBlock);
      (mockedBlockchainService.getExtrinsicsByBlock as any).mockResolvedValue(mockExtrinsics);

      const response = await request(app)
        .get('/api/blocks/0x123abc')
        .expect(200);

      expect(mockedBlockchainService.getBlockByHash).toHaveBeenCalledWith('0x123abc');
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent block', async () => {
      mockedBlockchainService.getBlockByNumber.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/blocks/999999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Block not found',
      });
    });

    it('should handle service errors for specific block', async () => {
      const error = new Error('Block fetch failed');
      mockedBlockchainService.getBlockByNumber.mockRejectedValue(error);

      const response = await request(app)
        .get('/api/blocks/1000')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch block',
      });

      expect(mockedLogError).toHaveBeenCalledWith(error, {
        component: 'blocks-route',
        action: 'getBlock',
      });
    });

    it('should transform extrinsic data correctly', async () => {
      (mockedBlockchainService.getBlockByNumber as any).mockResolvedValue(mockBlock);
      (mockedBlockchainService.getExtrinsicsByBlock as any).mockResolvedValue(mockExtrinsics);

      const response = await request(app)
        .get('/api/blocks/1000')
        .expect(200);

      const extrinsic = response.body.data.extrinsics[0];
      expect(typeof extrinsic.timestamp).toBe('number');
      expect(typeof extrinsic.fee).toBe('number');
      expect(typeof extrinsic.tip).toBe('number');
    });

    it('should handle extrinsics without tip', async () => {
      const mockExtrinsicsWithoutTip = [
        {
          ...mockExtrinsics[0],
          tip: undefined,
        },
      ];

      (mockedBlockchainService.getBlockByNumber as any).mockResolvedValue(mockBlock);
      (mockedBlockchainService.getExtrinsicsByBlock as any).mockResolvedValue(mockExtrinsicsWithoutTip);

      const response = await request(app)
        .get('/api/blocks/1000')
        .expect(200);

      const extrinsic = response.body.data.extrinsics[0];
      expect(extrinsic.tip).toBe(0);
    });
  });
}); 