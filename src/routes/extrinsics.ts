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
    const { page = 1, limit = 20 } = req.query;

    // For now, return empty result since the service method signature changed
    // This would need to be updated to use a proper pagination method
    const result = {
      data: [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    };

    res.json({
      success: true,
      data: {
        extrinsics: result.data.map((extrinsic: any) => keysToCamelCase(extrinsic)),
        pagination: result.pagination,
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