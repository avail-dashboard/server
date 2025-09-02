import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

/**
 * Centralized timestamp utility for getting real blockchain timestamps
 * from the extrinsic_data table (timestamp.set extrinsics)
 */
export class TimestampService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get real timestamp for a block from extrinsic_data table (timestamp.set extrinsics)
   */
  async getBlockTimestamp(blockNumber: bigint | number): Promise<string | null> {
    try {
      const blockNum = BigInt(blockNumber);
      const result = await this.prisma.$queryRaw<Array<{ block_timestamp: Date }>>`
        SELECT to_timestamp((method_args->0)::bigint / 1000.0) as block_timestamp
        FROM extrinsic_data
        WHERE method_pallet = 'timestamp'
          AND method_name = 'set'
          AND extrinsic_index = 0
          AND block_number = ${blockNum}
        LIMIT 1
      `;
      
      if (result && result.length > 0) {
        return result[0].block_timestamp.toISOString();
      }
      return null;
    } catch (error) {
      logger.warn(`Failed to get timestamp for block ${blockNumber}`, {
        component: 'timestamp-service',
        blockNumber: blockNumber.toString(),
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get timestamps for multiple blocks efficiently
   */
  async getBlockTimestamps(blockNumbers: (bigint | number)[]): Promise<Map<string, string | null>> {
    if (blockNumbers.length === 0) return new Map();

    try {
      const blockNums = blockNumbers.map(n => BigInt(n));
      const result = await this.prisma.$queryRaw<Array<{ block_number: bigint; block_timestamp: Date }>>`
        SELECT 
          block_number,
          to_timestamp((method_args->0)::bigint / 1000.0) as block_timestamp
        FROM extrinsic_data
        WHERE method_pallet = 'timestamp'
          AND method_name = 'set'
          AND extrinsic_index = 0
          AND block_number = ANY(${blockNums}::bigint[])
      `;
      
      const timestampMap = new Map<string, string | null>();
      
      // Initialize all requested blocks with null
      blockNumbers.forEach(blockNum => {
        timestampMap.set(blockNum.toString(), null);
      });
      
      // Fill in the found timestamps
      result.forEach(row => {
        timestampMap.set(row.block_number.toString(), row.block_timestamp.toISOString());
      });
      
      return timestampMap;
    } catch (error) {
      logger.warn(`Failed to get timestamps for multiple blocks`, {
        component: 'timestamp-service',
        blockCount: blockNumbers.length,
        error: (error as Error).message,
      });
      
      // Return map with all nulls on error
      const errorMap = new Map<string, string | null>();
      blockNumbers.forEach(blockNum => {
        errorMap.set(blockNum.toString(), null);
      });
      return errorMap;
    }
  }

  /**
   * Get timestamp with fallback to current time
   */
  async getBlockTimestampWithFallback(blockNumber: bigint | number): Promise<string> {
    const timestamp = await this.getBlockTimestamp(blockNumber);
    return timestamp || new Date().toISOString();
  }
}

// Factory function for creating TimestampService instances
export const createTimestampService = (prisma: PrismaClient): TimestampService => {
  return new TimestampService(prisma);
};

// Singleton instance for common usage (can be used with default prisma client)
let timestampServiceInstance: TimestampService | null = null;

export const getTimestampService = (prisma: PrismaClient): TimestampService => {
  if (!timestampServiceInstance || timestampServiceInstance['prisma'] !== prisma) {
    timestampServiceInstance = new TimestampService(prisma);
  }
  return timestampServiceInstance;
};

// Utility functions for direct usage without service instance
export const getBlockTimestamp = async (
  prisma: PrismaClient, 
  blockNumber: bigint | number
): Promise<string | null> => {
  const service = getTimestampService(prisma);
  return service.getBlockTimestamp(blockNumber);
};

export const getBlockTimestamps = async (
  prisma: PrismaClient, 
  blockNumbers: (bigint | number)[]
): Promise<Map<string, string | null>> => {
  const service = getTimestampService(prisma);
  return service.getBlockTimestamps(blockNumbers);
};

export const getBlockTimestampWithFallback = async (
  prisma: PrismaClient, 
  blockNumber: bigint | number
): Promise<string> => {
  const service = getTimestampService(prisma);
  return service.getBlockTimestampWithFallback(blockNumber);
};