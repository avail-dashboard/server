import { logger, logError } from '../../../utils/logger';
import { EraRepository } from '../../../database/repositories/EraRepository';
import { EraIndexer } from './EraIndexer';

export interface EraProcessingOptions {
  skipValidation?: boolean;
  updateIfExists?: boolean;
}

export interface EraProcessingResult {
  success: boolean;
  eraNumber: number;
  duration: number;
  error?: string;
}

export interface IEraProcessor {
  processEra(eraNumber: number, options?: EraProcessingOptions): Promise<void>;
  processCurrentEra(options?: EraProcessingOptions): Promise<void>;
  processEraTransition(currentEra: number, newEra: number, transitionBlock: number): Promise<void>;
}

export class EraProcessor implements IEraProcessor {
  private eraRepository: EraRepository;
  private eraIndexer: EraIndexer;

  constructor(
    eraRepository: EraRepository,
    eraIndexer: EraIndexer,
  ) {
    this.eraRepository = eraRepository;
    this.eraIndexer = eraIndexer;
  }

  /**
   * Process specific era by number
   */
  async processEra(eraNumber: number, options: EraProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing era', {
        component: 'era-processor',
        action: 'processEra',
        eraNumber,
      });

      // Use EraIndexer to handle era indexing
      const result = await this.eraIndexer.indexEra(eraNumber);
      
      if (!result.success) {
        throw new Error(`Era indexing failed: ${result.error}`);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Era processed successfully', {
        component: 'era-processor',
        action: 'processEra',
        eraNumber,
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'era-processor',
        action: 'processEra',
        eraNumber,
        duration,
      });
      throw error;
    }
  }

  /**
   * Process current era from blockchain
   */
  async processCurrentEra(options: EraProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing current era', {
        component: 'era-processor',
        action: 'processCurrentEra',
      });

      // Use EraIndexer to handle current era indexing
      const result = await this.eraIndexer.indexCurrentEra();
      
      if (!result.success) {
        throw new Error(`Current era indexing failed: ${result.error}`);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Current era processed successfully', {
        component: 'era-processor',
        action: 'processCurrentEra',
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'era-processor',
        action: 'processCurrentEra',
        duration,
      });
      throw error;
    }
  }

  /**
   * Process era transition
   */
  async processEraTransition(
    currentEra: number, 
    newEra: number, 
    transitionBlock: number
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing era transition', {
        component: 'era-processor',
        action: 'processEraTransition',
        currentEra,
        newEra,
        transitionBlock,
      });

      // Use EraIndexer to handle era transition
      const result = await this.eraIndexer.handleEraTransition(
        currentEra,
        newEra,
        transitionBlock
      );
      
      if (!result.success) {
        throw new Error(`Era transition failed: ${result.error}`);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Era transition processed successfully', {
        component: 'era-processor',
        action: 'processEraTransition',
        currentEra,
        newEra,
        transitionBlock,
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'era-processor',
        action: 'processEraTransition',
        currentEra,
        newEra,
        transitionBlock,
        duration,
      });
      throw error;
    }
  }

  /**
   * Process era with validation
   */
  async processEraWithValidation(eraNumber: number, options: EraProcessingOptions = {}): Promise<EraProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing era with validation', {
        component: 'era-processor',
        action: 'processEraWithValidation',
        eraNumber,
      });

      // Validate era number if needed
      if (!options.skipValidation) {
        if (eraNumber < 0) {
          throw new Error('Era number cannot be negative');
        }
      }

      // Check if era already exists
      const existingEra = await this.eraRepository.findByNumber(eraNumber);
      if (existingEra && !options.updateIfExists) {
        logger.debug('Era already exists, skipping processing', {
          component: 'era-processor',
          eraNumber,
        });
        return {
          success: true,
          eraNumber,
          duration: Date.now() - startTime,
        };
      }

      // Process the era
      await this.processEra(eraNumber, options);

      const duration = Date.now() - startTime;
      
      logger.info('Era processed with validation successfully', {
        component: 'era-processor',
        action: 'processEraWithValidation',
        eraNumber,
        duration,
      });

      return {
        success: true,
        eraNumber,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'era-processor',
        action: 'processEraWithValidation',
        eraNumber,
        duration,
      });

      return {
        success: false,
        eraNumber,
        duration,
        error: (error as Error).message,
      };
    }
  }
}

export const createEraProcessor = (
  eraRepository: EraRepository,
  eraIndexer: EraIndexer,
): EraProcessor => {
  return new EraProcessor(eraRepository, eraIndexer);
}; 