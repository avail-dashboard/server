import { Router, Request, Response } from 'express';
import { serviceFactory, BlockApiService } from '../services';
import { formatPaginatedResponse, formatSingleResponse, formatErrorResponse } from '../utils/responseFormatter';

const router = Router();

/**
 * GET /api/blocks/latest
 * Get the latest finalized block
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const blockService = serviceFactory.get<BlockApiService>('blockService');
    const block = await blockService.getLatestBlock();

    res.json(formatSingleResponse(block));
  } catch (error) {
    console.error('Error fetching latest block:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch latest block'));
  }
});

/**
 * GET /api/blocks
 * Get paginated list of blocks
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = (req.query.sort_by as string) || 'number';
    const sortOrder = (req.query.sort_order as string) || 'desc';

    const blockService = serviceFactory.get<BlockApiService>('blockService');
    const result = await blockService.getBlocks(
      { page, limit },
      { sort_by: sortBy, sort_order: sortOrder as 'asc' | 'desc' },
    );

    res.json(formatPaginatedResponse(result));
  } catch (error) {
    console.error('Error fetching blocks:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch blocks'));
  }
});

/**
 * GET /api/blocks/:identifier
 * Get block by hash or number
 */
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const identifier = req.params.identifier;
    
    // Parse as number if it's a valid integer, otherwise treat as hash
    const blockIdentifier = /^\d+$/.test(identifier) ? parseInt(identifier) : identifier;
    
    const blockService = serviceFactory.get<BlockApiService>('blockService');
    const block = await blockService.getBlock(blockIdentifier);

    res.json(formatSingleResponse(block));
  } catch (error) {
    console.error('Error fetching block:', error);
    res.status(500).json(formatErrorResponse('Failed to fetch block'));
  }
});

export default router; 