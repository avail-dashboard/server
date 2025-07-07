import { Event, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type EventCreateInput = Omit<Prisma.EventCreateInput, 'id' | 'createdAt'>;

export class EventRepository extends BaseRepository {
  /**
   * Find event by ID
   */
  async findById(id: number): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    });
  }

  /**
   * Find events by block number
   */
  async findByBlock(blockNumber: number): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: { blockNumber },
      orderBy: { eventOrder: 'asc' },
    });
  }

  /**
   * Find events by extrinsic index
   */
  async findByExtrinsic(blockNumber: number, extrinsicIndex: number): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        blockNumber,
        extrinsicIndex,
      },
      orderBy: { eventOrder: 'asc' },
    });
  }

  /**
   * Find events by module
   */
  async findByModule(module: string, params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  } = {}): Promise<{ events: Event[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where: { module },
        skip,
        take: limit,
        orderBy: { blockNumber: orderBy },
      }),
      this.prisma.event.count({
        where: { module },
      }),
    ]);

    return { events, total };
  }

  /**
   * Find events by module and event name
   */
  async findByModuleAndEvent(
    module: string,
    eventName: string,
    params: {
      page?: number;
      limit?: number;
      orderBy?: 'asc' | 'desc';
    } = {},
  ): Promise<{ events: Event[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          module,
          eventName,
        },
        skip,
        take: limit,
        orderBy: { blockNumber: orderBy },
      }),
      this.prisma.event.count({
        where: {
          module,
          eventName,
        },
      }),
    ]);

    return { events, total };
  }

  /**
   * Get events with pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  } = {}): Promise<{ events: Event[]; total: number }> {
    const { page = 1, limit = 20, orderBy = 'desc' } = params;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        skip,
        take: limit,
        orderBy: { blockNumber: orderBy },
      }),
      this.prisma.event.count(),
    ]);

    return { events, total };
  }

  /**
   * Create new event
   */
  async create(data: EventCreateInput): Promise<Event> {
    return this.prisma.event.create({
      data,
    });
  }

  /**
   * Create multiple events efficiently
   */
  async createMany(events: EventCreateInput[]): Promise<{ count: number }> {
    return this.prisma.event.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  /**
   * Get events in block range
   */
  async findInBlockRange(fromBlock: number, toBlock: number): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        blockNumber: {
          gte: fromBlock,
          lte: toBlock,
        },
      },
      orderBy: [
        { blockNumber: 'asc' },
        { eventOrder: 'asc' },
      ],
    });
  }

  /**
   * Get event count
   */
  async count(): Promise<number> {
    return this.prisma.event.count();
  }

  /**
   * Get event count by module
   */
  async countByModule(module: string): Promise<number> {
    return this.prisma.event.count({
      where: { module },
    });
  }

  /**
   * Update event
   */
  async update(id: number, data: Partial<EventCreateInput>): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete event
   */
  async delete(id: number): Promise<Event> {
    return this.prisma.event.delete({
      where: { id },
    });
  }

  /**
   * Delete events by block number
   */
  async deleteByBlock(blockNumber: number): Promise<{ count: number }> {
    return this.prisma.event.deleteMany({
      where: { blockNumber },
    });
  }
}