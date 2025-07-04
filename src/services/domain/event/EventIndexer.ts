import { logger, logError } from '../../../utils/logger';
import { EventRepository } from '../../../database/repositories/EventRepository';
import { BlockData } from '../../types/blockchain';
import { EventData } from './EventInterfaces';

export interface IEventIndexer {
  indexEventsFromBlock(blockData: BlockData): Promise<EventIndexingResult>;
  indexEventsFromBlockNumber(blockNumber: number): Promise<EventIndexingResult>;
}

export interface EventIndexingResult {
  events: EventData[];
  success: boolean;
  error?: string;
}

export class EventIndexer implements IEventIndexer {
  private eventRepository: EventRepository;

  constructor(eventRepository: EventRepository) {
    this.eventRepository = eventRepository;
  }

  /**
   * Index events from block data
   */
  async indexEventsFromBlock(blockData: BlockData): Promise<EventIndexingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Indexing events from block data', {
        component: 'event-indexer',
        action: 'indexEventsFromBlock',
        blockNumber: blockData.number,
        eventCount: blockData.events?.length || 0,
      });

      if (!blockData.events || blockData.events.length === 0) {
        logger.debug('No events to index', {
          component: 'event-indexer',
          blockNumber: blockData.number,
        });
        return { events: [], success: true };
      }

      const events: EventData[] = [];
      
      // Process each event
      for (let eventIndex = 0; eventIndex < blockData.events.length; eventIndex++) {
        const event = blockData.events[eventIndex];
        
        const eventData: EventData = {
          blockNumber: blockData.number,
          blockHash: blockData.hash,
          blockTimestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
          extrinsicIndex: event.phase?.applyExtrinsic || undefined,
          eventIndex: eventIndex,
          module: event.section || null,
          eventName: event.method || null,
          data: event.data || null,
          timestamp: blockData.timestamp ? new Date(blockData.timestamp) : new Date(),
          phase: event.phase || null,
          phaseType: this.extractPhaseType(event.phase),
          methodObject: event.data || null,
          eventOrder: eventIndex,
        };

        events.push(eventData);
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

      const result = await this.eventRepository.createMany(eventEntities);
      
      const duration = Date.now() - startTime;
      
      logger.info('Events indexed successfully', {
        component: 'event-indexer',
        action: 'indexEventsFromBlock',
        blockNumber: blockData.number,
        eventCount: events.length,
        duration,
        created: result.count,
      });

      return {
        events,
        success: true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error as Error, {
        component: 'event-indexer',
        action: 'indexEventsFromBlock',
        blockNumber: blockData.number,
        duration,
      });

      return {
        events: [],
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index events from block number (by fetching block data first)
   */
  async indexEventsFromBlockNumber(blockNumber: number): Promise<EventIndexingResult> {
    try {
      logger.debug('Indexing events from block number', {
        component: 'event-indexer',
        action: 'indexEventsFromBlockNumber',
        blockNumber,
      });

      // This method would typically fetch block data from blockchain service
      // For now, we'll return empty result as this should be called via block indexing
      logger.warn('Direct event indexing by block number not implemented - use block indexing instead', {
        component: 'event-indexer',
        blockNumber,
      });

      return {
        events: [],
        success: true,
      };

    } catch (error) {
      logError(error as Error, {
        component: 'event-indexer',
        action: 'indexEventsFromBlockNumber',
        blockNumber,
      });

      return {
        events: [],
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract phase type from event phase
   */
  private extractPhaseType(phase: any): string | null {
    if (!phase) return null;
    
    if (typeof phase === 'string') {
      return phase;
    }
    
    if (typeof phase === 'object') {
      if (phase.ApplyExtrinsic !== undefined) {
        return 'ApplyExtrinsic';
      }
      if (phase.Finalization !== undefined) {
        return 'Finalization';
      }
      if (phase.Initialization !== undefined) {
        return 'Initialization';
      }
      
      // Handle other phase types
      const keys = Object.keys(phase);
      if (keys.length > 0) {
        return keys[0];
      }
    }
    
    return null;
  }
}

/**
 * Factory function to create EventIndexer instance
 */
export const createEventIndexer = (
  eventRepository: EventRepository,
): EventIndexer => {
  return new EventIndexer(eventRepository);
}; 