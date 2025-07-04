import { logger, logError } from '../../../utils/logger';
import { EventRepository } from '../../../database/repositories/EventRepository';
import { EventIndexer } from './EventIndexer';
import { BlockData } from '../../types/blockchain';
import { EventData } from './EventInterfaces';

export interface EventProcessingOptions {
  skipValidation?: boolean;
  updateIfExists?: boolean;
}

export interface EventProcessingResult {
  success: boolean;
  blockNumber: number;
  blockHash: string;
  eventCount: number;
  duration: number;
  error?: string;
}

export interface IEventProcessor {
  processBlockEvents(blockData: BlockData, options?: EventProcessingOptions): Promise<void>;
  processEventsByBlockNumber(blockNumber: number, options?: EventProcessingOptions): Promise<void>;
}

export class EventProcessor implements IEventProcessor {
  private eventRepository: EventRepository;
  private eventIndexer: EventIndexer;

  constructor(
    eventRepository: EventRepository,
    eventIndexer: EventIndexer,
  ) {
    this.eventRepository = eventRepository;
    this.eventIndexer = eventIndexer;
  }

  /**
   * Process events from block data (main processor method)
   */
  async processBlockEvents(blockData: BlockData, options: EventProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing block events', {
        component: 'event-processor',
        action: 'processBlockEvents',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        eventCount: blockData.events?.length || 0,
      });

      // Use EventIndexer to extract and store events
      const result = await this.eventIndexer.indexEventsFromBlock(blockData);
      
      if (!result.success) {
        throw new Error(`Event indexing failed: ${result.error}`);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Block events processed successfully', {
        component: 'event-processor',
        action: 'processBlockEvents',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        eventCount: result.events.length,
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'event-processor',
        action: 'processBlockEvents',
        blockNumber: blockData.number,
        blockHash: blockData.hash,
        duration,
      });
      throw error;
    }
  }

  /**
   * Process events by block number (fetching block data first)
   */
  async processEventsByBlockNumber(blockNumber: number, options: EventProcessingOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing events by block number', {
        component: 'event-processor',
        action: 'processEventsByBlockNumber',
        blockNumber,
      });

      // Use EventIndexer to handle block number processing
      const result = await this.eventIndexer.indexEventsFromBlockNumber(blockNumber);
      
      if (!result.success) {
        throw new Error(`Event indexing failed: ${result.error}`);
      }

      const duration = Date.now() - startTime;
      
      logger.info('Events processed by block number successfully', {
        component: 'event-processor',
        action: 'processEventsByBlockNumber',
        blockNumber,
        eventCount: result.events.length,
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'event-processor',
        action: 'processEventsByBlockNumber',
        blockNumber,
        duration,
      });
      throw error;
    }
  }

  /**
   * Process events from blockchain data with validation
   */
  async processEvents(events: EventData[], options: EventProcessingOptions = {}): Promise<EventProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing events directly', {
        component: 'event-processor',
        action: 'processEvents',
        eventCount: events.length,
      });

      if (!events || events.length === 0) {
        logger.debug('No events to process', {
          component: 'event-processor',
          action: 'processEvents',
        });
        return {
          success: true,
          blockNumber: 0,
          blockHash: '',
          eventCount: 0,
          duration: Date.now() - startTime,
        };
      }

      // Get block info from first event
      const firstEvent = events[0];
      const blockNumber = firstEvent.blockNumber;
      const blockHash = firstEvent.blockHash || '';

      // Validate events if needed
      if (!options.skipValidation) {
        const validation = this.validateEvents(events);
        if (!validation.isValid) {
          throw new Error(`Event validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Store events in database
      const eventEntities = events.map(event => ({
        blockNumber: event.blockNumber,
        blockHash: event.blockHash || null,
        blockTimestamp: event.blockTimestamp || null,
        extrinsicIndex: event.extrinsicIndex,
        eventIndex: event.eventIndex,
        module: event.module,
        eventName: event.eventName,
        data: event.data,
        timestamp: event.timestamp || null,
        phase: event.phase,
        phaseType: event.phaseType,
        methodObject: event.methodObject,
        eventOrder: event.eventOrder,
      }));

      await this.eventRepository.createMany(eventEntities);

      const duration = Date.now() - startTime;
      
      logger.info('Events processed successfully', {
        component: 'event-processor',
        action: 'processEvents',
        blockNumber,
        blockHash,
        eventCount: events.length,
        duration,
      });

      return {
        success: true,
        blockNumber,
        blockHash,
        eventCount: events.length,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'event-processor',
        action: 'processEvents',
        eventCount: events.length,
        duration,
      });

      return {
        success: false,
        blockNumber: events[0]?.blockNumber || 0,
        blockHash: events[0]?.blockHash || '',
        eventCount: events.length,
        duration,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Validate events data structure
   */
  private validateEvents(events: EventData[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      for (const event of events) {
        if (!event.blockNumber && event.blockNumber !== 0) {
          errors.push('Event block number is required');
        }

        if (!event.eventIndex && event.eventIndex !== 0) {
          errors.push('Event index is required');
        }

        if (typeof event.blockNumber === 'number' && event.blockNumber < 0) {
          errors.push('Event block number cannot be negative');
        }

        if (typeof event.eventIndex === 'number' && event.eventIndex < 0) {
          errors.push('Event index cannot be negative');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${(error as Error).message}`],
      };
    }
  }
}

export const createEventProcessor = (
  eventRepository: EventRepository,
  eventIndexer: EventIndexer,
): EventProcessor => {
  return new EventProcessor(eventRepository, eventIndexer);
}; 