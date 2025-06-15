import { BaseRepository } from '../../database/repositories/BaseRepository';
import { BlockRepository } from '../../database/repositories/BlockRepository';
import { ExtrinsicRepository } from '../../database/repositories/ExtrinsicRepository';
import { RollupRepository } from '../../database/repositories/RollupRepository';
import { DataSubmissionRepository } from '../../database/repositories/DataSubmissionRepository';

export interface SearchResult {
  type: 'block' | 'extrinsic' | 'account' | 'rollup' | 'data_submission';
  id: string;
  data: any;
  context: string;
}

export interface SearchResponse {
  query: string;
  total_results: number;
  results: SearchResult[];
}

export class SearchService extends BaseRepository {
  constructor(
    private blockRepository: BlockRepository,
    private extrinsicRepository: ExtrinsicRepository,
    private rollupRepository: RollupRepository,
    private dataSubmissionRepository: DataSubmissionRepository,
  ) {
    super();
  }

  /**
   * Universal search across all entities with exact matching
   */
  async search(query: string): Promise<SearchResponse> {
    const results: SearchResult[] = [];
    const searchTerm = query.trim();

    if (!searchTerm) {
      return {
        query: searchTerm,
        total_results: 0,
        results: [],
      };
    }

    // Determine query type and search accordingly
    const queryType = this.detectQueryType(searchTerm);

    switch (queryType) {
      case 'numeric':
        await this.searchByBlockNumber(searchTerm, results);
        break;
      case 'hash':
        await this.searchByHash(searchTerm, results);
        break;
      case 'address':
        await this.searchByAddress(searchTerm, results);
        break;
      case 'text':
        await this.searchByText(searchTerm, results);
        break;
    }

    return {
      query: searchTerm,
      total_results: results.length,
      results,
    };
  }

  /**
   * Detect the type of query based on format
   */
  private detectQueryType(query: string): 'numeric' | 'hash' | 'address' | 'text' {
    // Check if numeric (block number)
    if (/^\d+$/.test(query)) {
      return 'numeric';
    }
    
    // Check if hash (64 hex characters with 0x prefix)
    if (/^0x[a-fA-F0-9]{64}$/.test(query)) {
      return 'hash';
    }
    
    // Check if address (48+ characters, typically substrate address)
    if (query.length >= 47) {
      return 'address';
    }
    
    // Everything else is text search
    return 'text';
  }

  /**
   * Search by block number
   */
  private async searchByBlockNumber(blockNumber: string, results: SearchResult[]): Promise<void> {
    try {
      const block = await this.blockRepository.findByNumber(parseInt(blockNumber));
      if (block) {
        results.push({
          type: 'block',
          id: block.number.toString(),
          data: block,
          context: `Block #${block.number}`,
        });
      }
    } catch (error) {
      // Ignore search errors, continue with empty results
    }
  }

  /**
   * Search by hash (could be block hash, extrinsic hash, or data submission hash)
   */
  private async searchByHash(hash: string, results: SearchResult[]): Promise<void> {
    // Search blocks by hash
    try {
      const block = await this.blockRepository.findByHash(hash);
      if (block) {
        results.push({
          type: 'block',
          id: block.number.toString(),
          data: block,
          context: `Block with hash ${hash.substring(0, 10)}...`,
        });
      }
    } catch (error) {
      // Continue searching
    }

    // Search extrinsics by hash
    try {
      const extrinsic = await this.extrinsicRepository.findByHash(hash);
      if (extrinsic) {
        results.push({
          type: 'extrinsic',
          id: extrinsic.id.toString(),
          data: extrinsic,
          context: `Extrinsic with hash ${hash.substring(0, 10)}...`,
        });
      }
    } catch (error) {
      // Continue searching
    }

    // Search data submissions by hash
    try {
      const dataSubmission = await this.dataSubmissionRepository.findByHash(hash);
      if (dataSubmission) {
        results.push({
          type: 'data_submission',
          id: dataSubmission.id.toString(),
          data: dataSubmission,
          context: `Data submission with hash ${hash.substring(0, 10)}...`,
        });
      }
    } catch (error) {
      // Continue searching
    }
  }

  /**
   * Search by address (account/signer)
   */
  private async searchByAddress(address: string, results: SearchResult[]): Promise<void> {
    // Search extrinsics by signer (limit to first 10 results for search)
    try {
      const { extrinsics } = await this.extrinsicRepository.findBySigner(address, { limit: 10 });
      extrinsics.forEach(extrinsic => {
        results.push({
          type: 'extrinsic',
          id: extrinsic.id.toString(),
          data: extrinsic,
          context: `Extrinsic signed by ${address.substring(0, 10)}...`,
        });
      });
    } catch (error) {
      // Continue searching
    }

    // TODO: Add account balance search if Account repository exists
  }

  /**
   * Search by text (rollup names, etc.)
   */
  private async searchByText(text: string, results: SearchResult[]): Promise<void> {
    // Search rollups by name
    try {
      const rollups = await this.rollupRepository.findByName(text);
      rollups.forEach(rollup => {
        results.push({
          type: 'rollup',
          id: rollup.appId.toString(),
          data: rollup,
          context: `Rollup: ${rollup.name}`,
        });
      });
    } catch (error) {
      // Continue searching
    }
  }
}

/**
 * Factory function to create SearchService with dependencies
 */
export function createSearchService(
  blockRepository: BlockRepository,
  extrinsicRepository: ExtrinsicRepository,
  rollupRepository: RollupRepository,
  dataSubmissionRepository: DataSubmissionRepository,
): SearchService {
  return new SearchService(
    blockRepository,
    extrinsicRepository,
    rollupRepository,
    dataSubmissionRepository,
  );
}