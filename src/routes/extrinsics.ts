import { Router, Request, Response } from 'express';
import { serviceFactory } from '../services';
import { ExtrinsicService } from '../services/domain/extrinsic';
import { keysToCamelCase } from '../utils/caseConverter';

const router = Router();

/**
 * GET /api/extrinsics
 * Get paginated list of extrinsics
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = (req.query.sort_by as string) || 'id';
    const sortOrder = (req.query.sort_order as string) || 'desc';

    const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
    const result = await extrinsicService.getExtrinsics(
      { page, limit },
      { sort_by: sortBy, sort_order: sortOrder as 'asc' | 'desc' },
    );

    res.json({
      success: true,
      data: {
        extrinsics: result.data.map(extrinsic => keysToCamelCase(extrinsic)),
        totalCount: result.pagination.total_count,
      },
      meta: {
        source: 'database',
        page: page,
        limit: limit,
        total: result.pagination.total_count,
      },
    });

  } catch (error) {
    console.error('Error fetching extrinsics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch extrinsics',
    });
  }
});

/**
 * GET /api/extrinsics/:hash
 * Get extrinsic by hash
 */
router.get('/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
    const extrinsic = await extrinsicService.getExtrinsic(hash);

    if (!extrinsic) {
      return res.status(404).json({
        success: false,
        error: 'Extrinsic not found',
      });
    }

    res.json({
      success: true,
      data: keysToCamelCase(extrinsic),
    });

  } catch (error) {
    console.error('Error fetching extrinsic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch extrinsic',
    });
  }
});

/**
 * GET /api/extrinsics/block/:blockNumber
 * Get all extrinsics for a specific block
 */
router.get('/block/:blockNumber', async (req: Request, res: Response) => {
  try {
    const blockNumber = parseInt(req.params.blockNumber);

    if (isNaN(blockNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid block number',
      });
    }

    const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
    const extrinsics = await extrinsicService.getExtrinsicsForBlock(blockNumber);

    res.json({
      success: true,
      data: extrinsics.map(extrinsic => keysToCamelCase(extrinsic)),
    });

  } catch (error) {
    console.error('Error fetching block extrinsics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch block extrinsics',
    });
  }
});

/**
 * GET /api/extrinsics/block/:blockNumber/:index
 * Get specific extrinsic by block number and index
 */
router.get('/block/:blockNumber/:index', async (req: Request, res: Response) => {
  try {
    const blockNumber = parseInt(req.params.blockNumber);
    const index = parseInt(req.params.index);

    if (isNaN(blockNumber) || isNaN(index)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid block number or extrinsic index',
      });
    }

    const extrinsicService = serviceFactory.get<ExtrinsicService>('extrinsicService');
    const blockExtrinsics = await extrinsicService.getExtrinsicsForBlock(blockNumber);
    
    // Find the extrinsic with the specified index
    const extrinsic = blockExtrinsics.find(ext => ext.extrinsicIndex === index);

    if (!extrinsic) {
      return res.status(404).json({
        success: false,
        error: 'Extrinsic not found',
      });
    }

    res.json({
      success: true,
      data: keysToCamelCase(extrinsic),
    });

  } catch (error) {
    console.error('Error fetching extrinsic by index:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch extrinsic',
    });
  }
});

export default router; 