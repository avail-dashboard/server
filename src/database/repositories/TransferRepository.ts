import { Transfer, TransferStatus } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export type TransferWithRelations = Transfer & {
  fromAccount: {
    address: string;
    identityName: string | null;
  };
  toAccount: {
    address: string;
    identityName: string | null;
  };
  block: {
    number: number;
    timestamp: Date;
  };
  extrinsic: {
    hash: string;
    success: boolean | null;
  };
};

export type TransferCreateInput = Omit<Transfer, 'createdAt'>;

export type TransferFilters = {
  fromAddress?: string;
  toAddress?: string;
  minAmount?: bigint;
  maxAmount?: bigint;
  status?: TransferStatus;
  tokenType?: string;
  fromBlock?: number;
  toBlock?: number;
  fromDate?: Date;
  toDate?: Date;
};

export class TransferRepository extends BaseRepository {
  /**
   * Find transfer by ID
   */
  async findById(id: string): Promise<Transfer | null> {
    return this.prisma.transfer.findUnique({
      where: { id },
    });
  }

  /**
   * Find transfer with full relations
   */
  async findWithRelations(id: string): Promise<TransferWithRelations | null> {
    return this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromAccount: {
          select: {
            address: true,
            identityName: true,
          },
        },
        toAccount: {
          select: {
            address: true,
            identityName: true,
          },
        },
        block: {
          select: {
            number: true,
            timestamp: true,
          },
        },
        extrinsic: {
          select: {
            hash: true,
            success: true,
          },
        },
      },
    });
  }

  /**
   * Get transfers with filters and pagination
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    filters?: TransferFilters;
    orderBy?: 'timestamp' | 'amount' | 'blockNumber';
    orderDirection?: 'asc' | 'desc';
  }): Promise<{ transfers: Transfer[]; total: number }> {
    const { 
      page = 1, 
      limit = 20, 
      filters = {}, 
      orderBy = 'timestamp',
      orderDirection = 'desc' 
    } = params;
    
    const skip = (page - 1) * limit;
    
    const whereClause: any = {};
    
    if (filters.fromAddress) {
      whereClause.fromAddress = filters.fromAddress;
    }
    
    if (filters.toAddress) {
      whereClause.toAddress = filters.toAddress;
    }
    
    if (filters.minAmount || filters.maxAmount) {
      whereClause.amount = {};
      if (filters.minAmount) {
        whereClause.amount.gte = filters.minAmount;
      }
      if (filters.maxAmount) {
        whereClause.amount.lte = filters.maxAmount;
      }
    }
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.tokenType) {
      whereClause.tokenType = filters.tokenType;
    }
    
    if (filters.fromBlock || filters.toBlock) {
      whereClause.blockNumber = {};
      if (filters.fromBlock) {
        whereClause.blockNumber.gte = filters.fromBlock;
      }
      if (filters.toBlock) {
        whereClause.blockNumber.lte = filters.toBlock;
      }
    }
    
    if (filters.fromDate || filters.toDate) {
      whereClause.timestamp = {};
      if (filters.fromDate) {
        whereClause.timestamp.gte = filters.fromDate;
      }
      if (filters.toDate) {
        whereClause.timestamp.lte = filters.toDate;
      }
    }

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { [orderBy]: orderDirection },
      }),
      this.prisma.transfer.count({ where: whereClause }),
    ]);

    return { transfers, total };
  }

  /**
   * Get transfers for an account (both sent and received) - alias for findByAddress
   */
  async findByAccount(address: string, params: {
    page?: number;
    limit?: number;
    type?: 'sent' | 'received' | 'all';
  } = {}): Promise<{ transfers: TransferWithRelations[]; total: number }> {
    const { page = 1, limit = 20, type = 'all' } = params;
    const skip = (page - 1) * limit;

    let whereClause: any = {};
    
    if (type === 'sent') {
      whereClause.fromAddress = address;
    } else if (type === 'received') {
      whereClause.toAddress = address;
    } else {
      whereClause.OR = [
        { fromAddress: address },
        { toAddress: address },
      ];
    }

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          fromAccount: {
            select: {
              address: true,
              identityName: true,
            },
          },
          toAccount: {
            select: {
              address: true,
              identityName: true,
            },
          },
          block: {
            select: {
              number: true,
              timestamp: true,
            },
          },
          extrinsic: {
            select: {
              hash: true,
              success: true,
            },
          },
        },
      }),
      this.prisma.transfer.count({ where: whereClause }),
    ]);

    return { transfers, total };
  }

  /**
   * Get transfers for an address (both sent and received)
   */
  async findByAddress(address: string, params: {
    page?: number;
    limit?: number;
    type?: 'sent' | 'received' | 'all';
  } = {}): Promise<{ transfers: Transfer[]; total: number }> {
    const { page = 1, limit = 20, type = 'all' } = params;
    const skip = (page - 1) * limit;

    let whereClause: any = {};
    
    if (type === 'sent') {
      whereClause.fromAddress = address;
    } else if (type === 'received') {
      whereClause.toAddress = address;
    } else {
      whereClause.OR = [
        { fromAddress: address },
        { toAddress: address },
      ];
    }

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.transfer.count({ where: whereClause }),
    ]);

    return { transfers, total };
  }

  /**
   * Count transfers for an account (both sent and received)
   */
  async countByAccount(address: string): Promise<number> {
    return this.prisma.transfer.count({
      where: {
        OR: [
          { fromAddress: address },
          { toAddress: address },
        ],
      },
    });
  }

  /**
   * Get transfers by extrinsic hash
   */
  async findByExtrinsicHash(extrinsicHash: string): Promise<Transfer[]> {
    return this.prisma.transfer.findMany({
      where: { extrinsicHash },
      orderBy: { extrinsicIndex: 'asc' },
    });
  }

  /**
   * Get transfers by block number
   */
  async findByBlockNumber(blockNumber: number): Promise<Transfer[]> {
    return this.prisma.transfer.findMany({
      where: { blockNumber },
      orderBy: { extrinsicIndex: 'asc' },
    });
  }

  /**
   * Create new transfer
   */
  async create(data: TransferCreateInput): Promise<Transfer> {
    return this.prisma.transfer.create({
      data,
    });
  }

  /**
   * Create multiple transfers efficiently
   */
  async createMany(transfers: TransferCreateInput[]): Promise<{ count: number }> {
    return this.prisma.transfer.createMany({
      data: transfers,
      skipDuplicates: true,
    });
  }

  /**
   * Get transfer statistics
   */
  async getStats(params: {
    fromDate?: Date;
    toDate?: Date;
    address?: string;
  } = {}): Promise<{
    totalTransfers: number;
    totalVolume: bigint;
    averageAmount: number;
    totalFees: bigint;
    successRate: number;
  }> {
    const { fromDate, toDate, address } = params;
    
    const whereClause: any = {};
    
    if (fromDate || toDate) {
      whereClause.timestamp = {};
      if (fromDate) whereClause.timestamp.gte = fromDate;
      if (toDate) whereClause.timestamp.lte = toDate;
    }
    
    if (address) {
      whereClause.OR = [
        { fromAddress: address },
        { toAddress: address },
      ];
    }

    const [total, successful, aggregates] = await Promise.all([
      this.prisma.transfer.count({ where: whereClause }),
      this.prisma.transfer.count({ 
        where: { ...whereClause, status: 'success' } 
      }),
      this.prisma.transfer.aggregate({
        where: whereClause,
        _sum: { amount: true, fees: true },
        _avg: { amount: true },
      }),
    ]);

    return {
      totalTransfers: total,
      totalVolume: aggregates._sum.amount || BigInt(0),
      averageAmount: aggregates._avg.amount || 0,
      totalFees: aggregates._sum.fees || BigInt(0),
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  /**
   * Get daily transfer volume
   */
  async getDailyVolume(params: {
    fromDate: Date;
    toDate: Date;
    address?: string;
  }): Promise<Array<{ date: string; volume: bigint; count: number }>> {
    const { fromDate, toDate, address } = params;
    
    const whereClause: any = {
      timestamp: {
        gte: fromDate,
        lte: toDate,
      },
      status: 'success',
    };
    
    if (address) {
      whereClause.OR = [
        { fromAddress: address },
        { toAddress: address },
      ];
    }

    // Note: This is a simplified version. In production, you might want to use raw SQL
    // for better performance with date grouping
    const transfers = await this.prisma.transfer.findMany({
      where: whereClause,
      select: {
        timestamp: true,
        amount: true,
      },
    });

    // Group by date
    const dailyData = new Map<string, { volume: bigint; count: number }>();
    
    transfers.forEach(transfer => {
      const date = transfer.timestamp.toISOString().split('T')[0];
      const existing = dailyData.get(date) || { volume: BigInt(0), count: 0 };
      dailyData.set(date, {
        volume: existing.volume + transfer.amount,
        count: existing.count + 1,
      });
    });

    return Array.from(dailyData.entries()).map(([date, data]) => ({
      date,
      volume: data.volume,
      count: data.count,
    }));
  }

  /**
   * Get top senders by volume
   */
  async getTopSenders(params: {
    limit?: number;
    fromDate?: Date;
    toDate?: Date;
  } = {}): Promise<Array<{ address: string; volume: bigint; count: number }>> {
    const { limit = 10, fromDate, toDate } = params;
    
    const whereClause: any = { status: 'success' };
    
    if (fromDate || toDate) {
      whereClause.timestamp = {};
      if (fromDate) whereClause.timestamp.gte = fromDate;
      if (toDate) whereClause.timestamp.lte = toDate;
    }

    const result = await this.prisma.transfer.groupBy({
      by: ['fromAddress'],
      where: whereClause,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    });

    return result.map(item => ({
      address: item.fromAddress,
      volume: item._sum.amount || BigInt(0),
      count: item._count,
    }));
  }

  /**
   * Update transfer status
   */
  async updateStatus(id: string, status: TransferStatus): Promise<Transfer> {
    return this.prisma.transfer.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Delete transfer
   */
  async delete(id: string): Promise<Transfer> {
    return this.prisma.transfer.delete({
      where: { id },
    });
  }
} 