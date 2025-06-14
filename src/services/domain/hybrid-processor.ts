import { BlockchainService, createBlockchainService } from '../core/blockchain';
import { AvailBlockchainService, createAvailBlockchainService } from '../core/avail-blockchain';
import { logger, logError } from '../../utils/logger';
import { BlockData } from '../types/blockchain';

export interface HybridExtractionResult {
  blockData: BlockData;
  extractionMethod: 'avail-sdk' | 'polkadot-js' | 'events-fallback';
  success: boolean;
  dataSubmissions?: Array<{
    extrinsicIndex: number;
    txHash: string;
    submitter?: string;
    dataSize?: number;
    appId?: number;
    success: boolean;
  }>;
  errors?: string[];
  performanceMetrics?: {
    duration: number;
    method: string;
  };
}

export interface ValidationResult {
  consistent: boolean;
  discrepancies: Array<{
    field: string;
    availSdk: any;
    polkadotJs: any;
    severity: 'low' | 'medium' | 'high';
  }>;
}

/**
 * HybridProcessor - Implements smart routing between avail-sdk and polkadot.js
 * 
 * Priority system: avail-sdk → polkadot.js → events fallback
 * Includes cross-validation, error handling, and performance tracking
 */
export class HybridProcessor {
  private availService: AvailBlockchainService;
  private polkadotService: BlockchainService;
  private performanceStats = new Map<string, number[]>();

  constructor() {
    this.availService = createAvailBlockchainService();
    this.polkadotService = createBlockchainService();
  }

  /**
   * Initialize both services
   */
  async initialize(): Promise<void> {
    logger.info('HybridProcessor: Initializing both SDKs', { component: 'hybrid-processor' });
    
    try {
      await Promise.all([
        this.availService.start(),
        this.polkadotService.start(),
      ]);
      
      logger.info('HybridProcessor: Both services initialized successfully', { 
        component: 'hybrid-processor', 
      });
    } catch (error) {
      logError(error as Error, {
        component: 'hybrid-processor',
        action: 'initialize',
      });
      throw error;
    }
  }

  /**
   * Extract block data using smart routing with fallback
   */
  async extractBlockData(blockNumber: number): Promise<HybridExtractionResult> {
    const startTime = Date.now();
    
    logger.debug('HybridProcessor: Starting block extraction', {
      component: 'hybrid-processor',
      blockNumber,
    });

    // Try avail-sdk first (highest priority)
    try {
      const result = await this.tryAvailSdkExtraction(blockNumber);
      
      this.recordPerformance('avail-sdk', Date.now() - startTime);
      
      logger.info('HybridProcessor: Successful extraction via avail-sdk', {
        component: 'hybrid-processor',
        blockNumber,
        method: 'avail-sdk',
        dataSubmissions: result.dataSubmissions?.length || 0,
      });
      
      return result;
      
    } catch (availError) {
      logger.warn('HybridProcessor: Avail-SDK extraction failed, trying polkadot.js', {
        component: 'hybrid-processor',
        blockNumber,
        error: (availError as Error).message,
      });
      
      // Try polkadot.js fallback
      try {
        const result = await this.tryPolkadotJsExtraction(blockNumber);
        
        this.recordPerformance('polkadot-js', Date.now() - startTime);
        
        logger.info('HybridProcessor: Successful extraction via polkadot.js fallback', {
          component: 'hybrid-processor',
          blockNumber,
          method: 'polkadot-js',
        });
        
        return result;
        
      } catch (polkadotError) {
        logger.warn('HybridProcessor: Polkadot.js extraction failed, using events fallback', {
          component: 'hybrid-processor',
          blockNumber,
          availError: (availError as Error).message,
          polkadotError: (polkadotError as Error).message,
        });
        
        // Last resort: events-only fallback
        const result = await this.tryEventsFallbackExtraction(blockNumber);
        
        this.recordPerformance('events-fallback', Date.now() - startTime);
        
        return result;
      }
    }
  }

  /**
   * Cross-validate data when both SDKs work
   */
  async crossValidateBlock(blockNumber: number): Promise<ValidationResult> {
    logger.debug('HybridProcessor: Cross-validating block data', {
      component: 'hybrid-processor',
      blockNumber,
    });

    try {
      const [availResult, polkadotResult] = await Promise.allSettled([
        this.tryAvailSdkExtraction(blockNumber),
        this.tryPolkadotJsExtraction(blockNumber),
      ]);

      if (availResult.status === 'fulfilled' && polkadotResult.status === 'fulfilled') {
        return this.compareResults(availResult.value, polkadotResult.value);
      } else {
        return {
          consistent: false,
          discrepancies: [{
            field: 'extraction',
            availSdk: availResult.status === 'fulfilled' ? 'success' : 'failed',
            polkadotJs: polkadotResult.status === 'fulfilled' ? 'success' : 'failed',
            severity: 'high' as const,
          }],
        };
      }
    } catch (error) {
      logError(error as Error, {
        component: 'hybrid-processor',
        action: 'crossValidateBlock',
        blockNumber,
      });
      
      return {
        consistent: false,
        discrepancies: [{
          field: 'validation',
          availSdk: 'error',
          polkadotJs: 'error',
          severity: 'high' as const,
        }],
      };
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    for (const [method, times] of this.performanceStats.entries()) {
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      stats[method] = { avg, min, max, count: times.length };
    }
    
    return stats;
  }

  /**
   * Cleanup and disconnect both services
   */
  async disconnect(): Promise<void> {
    logger.info('HybridProcessor: Disconnecting services', { component: 'hybrid-processor' });
    
    await Promise.all([
      this.availService.stop().catch(err => 
        logger.warn('Failed to stop avail service', { error: err.message }),
      ),
      this.polkadotService.stop().catch(err => 
        logger.warn('Failed to stop polkadot service', { error: err.message }),
      ),
    ]);
  }

  // Private methods

  /**
   * Try extraction using avail-sdk
   */
  private async tryAvailSdkExtraction(blockNumber: number): Promise<HybridExtractionResult> {
    const blockData = await this.availService.getBlock(blockNumber);
    const dataSubmissions = await this.availService.getBlockWithDataSubmissions(blockNumber);
    
    return {
      blockData,
      extractionMethod: 'avail-sdk',
      success: true,
      dataSubmissions: dataSubmissions.dataSubmissions,
      performanceMetrics: {
        duration: 0, // Will be set by caller
        method: 'avail-sdk',
      },
    };
  }

  /**
   * Try extraction using polkadot.js
   */
  private async tryPolkadotJsExtraction(blockNumber: number): Promise<HybridExtractionResult> {
    const blockData = await this.polkadotService.getBlock(blockNumber);
    
    // Polkadot.js doesn't have enhanced data submission extraction
    // so we get basic block data only
    return {
      blockData,
      extractionMethod: 'polkadot-js',
      success: true,
      dataSubmissions: [], // Limited extraction capabilities
      performanceMetrics: {
        duration: 0, // Will be set by caller
        method: 'polkadot-js',
      },
    };
  }

  /**
   * Fallback extraction using events only
   */
  private async tryEventsFallbackExtraction(blockNumber: number): Promise<HybridExtractionResult> {
    try {
      // Try to get basic block structure via polkadot.js
      const api = await this.polkadotService.getApi();
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const events = await api.query.system.events.at(blockHash);
      
      // Extract data submissions from events only
      const dataSubmissions: Array<{
        extrinsicIndex: number;
        txHash: string;
        submitter?: string;
        dataSize?: number;
        appId?: number;
        success: boolean;
      }> = [];
      
      events.forEach((record, index) => {
        const { event, phase } = record;
        if (event.section === 'dataAvailability' && event.method === 'DataSubmitted') {
          if (phase.isApplyExtrinsic) {
            dataSubmissions.push({
              extrinsicIndex: phase.asApplyExtrinsic.toNumber(),
              txHash: `0x${index.toString(16).padStart(64, '0')}`, // Placeholder
              submitter: event.data[0]?.toString(),
              success: true,
              // Missing: dataSize, appId (not available in events)
            });
          }
        }
      });
      
      return {
        blockData: {
          hash: blockHash.toString(),
          number: blockNumber,
          parentHash: '',
          stateRoot: '',
          extrinsicsRoot: '',
          timestamp: Date.now(),
          extrinsics: [],
          events: [],
        },
        extractionMethod: 'events-fallback',
        success: true,
        dataSubmissions,
        errors: ['Limited data available from events-only extraction'],
      };
      
    } catch (error) {
      return {
        blockData: {
          hash: '',
          number: blockNumber,
          parentHash: '',
          stateRoot: '',
          extrinsicsRoot: '',
          timestamp: Date.now(),
          extrinsics: [],
          events: [],
        },
        extractionMethod: 'events-fallback',
        success: false,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Compare results from both SDKs
   */
  private compareResults(
    availResult: HybridExtractionResult, 
    polkadotResult: HybridExtractionResult,
  ): ValidationResult {
    const discrepancies: ValidationResult['discrepancies'] = [];
    
    // Compare basic block data
    if (availResult.blockData.hash !== polkadotResult.blockData.hash) {
      discrepancies.push({
        field: 'blockHash',
        availSdk: availResult.blockData.hash,
        polkadotJs: polkadotResult.blockData.hash,
        severity: 'high',
      });
    }
    
    if (availResult.blockData.number !== polkadotResult.blockData.number) {
      discrepancies.push({
        field: 'blockNumber',
        availSdk: availResult.blockData.number,
        polkadotJs: polkadotResult.blockData.number,
        severity: 'high',
      });
    }
    
    // Compare data submissions count
    const availSubmissions = availResult.dataSubmissions?.length || 0;
    const polkadotSubmissions = polkadotResult.dataSubmissions?.length || 0;
    
    if (availSubmissions !== polkadotSubmissions) {
      discrepancies.push({
        field: 'dataSubmissionsCount',
        availSdk: availSubmissions,
        polkadotJs: polkadotSubmissions,
        severity: 'medium',
      });
    }
    
    const consistent = discrepancies.length === 0;
    
    if (consistent) {
      logger.debug('HybridProcessor: Cross-validation successful - data consistent', {
        component: 'hybrid-processor',
      });
    } else {
      logger.warn('HybridProcessor: Cross-validation found discrepancies', {
        component: 'hybrid-processor',
        discrepancies: discrepancies.length,
      });
    }
    
    return { consistent, discrepancies };
  }

  /**
   * Record performance metrics
   */
  private recordPerformance(method: string, duration: number): void {
    if (!this.performanceStats.has(method)) {
      this.performanceStats.set(method, []);
    }
    
    const times = this.performanceStats.get(method)!;
    times.push(duration);
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift();
    }
  }
}