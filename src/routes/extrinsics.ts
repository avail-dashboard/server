import { Router, Request, Response } from 'express';
import { simpleServices } from '../services/simple-services';
import { formatPaginatedResponse, formatErrorResponse, formatSingleResponse } from '../utils/responseFormatter';

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

    const extrinsicService = simpleServices.getServices().extrinsics;
    const result = await extrinsicService.getExtrinsics(
      { page, limit },
      { sort_by: sortBy, sort_order: sortOrder as 'asc' | 'desc' },
    );

    const response = formatPaginatedResponse(result, {
      source: 'database',
      page: page,
      limit: limit,
      total: result.pagination.total_count,
    });

    res.json(response);

  } catch (error) {
    console.error('Error fetching extrinsics:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch extrinsics'));
  }
});

/**
 * GET /api/extrinsics/:hash
 * Get extrinsic by hash
 */
router.get('/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    const extrinsicService = simpleServices.getServices().extrinsics;
    const extrinsic = await extrinsicService.getExtrinsic(hash);

    if (!extrinsic) {
      res.status(404).json(formatErrorResponse('Extrinsic not found', 'NOT_FOUND', 404));
      return;
    }

    res.json(formatSingleResponse(extrinsic));

  } catch (error) {
    console.error('Error fetching extrinsic:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch extrinsic'));
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
      res.status(400).json(formatErrorResponse('Invalid block number', 'INVALID_PARAMETERS', 400));
      return;
    }

    const extrinsicService = simpleServices.getServices().extrinsics;
    const extrinsics = await extrinsicService.getExtrinsicsForBlock(blockNumber);

    res.json(formatSingleResponse(extrinsics));

  } catch (error) {
    console.error('Error fetching block extrinsics:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch block extrinsics'));
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
      res.status(400).json(formatErrorResponse('Invalid block number or extrinsic index', 'INVALID_PARAMETERS', 400));
      return;
    }

    const extrinsicService = simpleServices.getServices().extrinsics;
    const blockExtrinsics = await extrinsicService.getExtrinsicsForBlock(blockNumber);
    
    // Find the extrinsic with the specified index
    const extrinsic = blockExtrinsics.find(ext => ext.extrinsic_index === index);

    if (!extrinsic) {
      res.status(404).json(formatErrorResponse('Extrinsic not found', 'NOT_FOUND', 404));
      return;
    }

    res.json(formatSingleResponse(extrinsic));

  } catch (error) {
    console.error('Error fetching extrinsic by index:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch extrinsic'));
  }
});

export default router; 