import { Account, AccountType } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';

export type AccountCreateInput = {
  address: string;
  balance?: Decimal | null;
  nonce?: number | null;
  currentBalance?: Decimal | null;
  reservedBalance?: Decimal | null;
  frozenBalance?: Decimal | null;
  accountType?: AccountType;
  identityName?: string | null;
  identityInfo?: any;
  firstSeenBlock?: number | null;
  lastActivityBlock?: number | null;
  transactionCount?: number;
  transferCount?: number;
};

export interface IAccountRepository {
  exists(address: string, useCache?: boolean): Promise<boolean>;
  findByAddress(address: string, useCache?: boolean): Promise<Account | null>;
  findByAddressFresh(address: string): Promise<Account | null>;
  create(data: AccountCreateInput): Promise<Account>;
  createIfNotExists(data: AccountCreateInput): Promise<{ account: Account; created: boolean }>;
}

export class AccountRepository extends BaseRepository implements IAccountRepository {
  /**
   * Check if account exists by address with cache support
   */
  async exists(address: string, useCache: boolean = true): Promise<boolean> {
    try {
      const query = {
        where: { address },
        select: { address: true },
      };
      const result = await this.prisma.account.findFirst(
        this.buildCachedQuery(query, useCache, 3600, `account-exists:${address}`)
      );
      return result !== null;
    } catch (error) {
      logger.error('Failed to check account existence', {
        component: 'account-repository',
        address,
        error: (error as Error).message,
      });
      return false; // Assume doesn't exist on error to trigger indexing
    }
  }

  /**
   * Find account by address with cache support
   */
  async findByAddress(address: string, useCache: boolean = true): Promise<Account | null> {
    const query = {
      where: { address },
    };
    return this.prisma.account.findUnique(
      this.buildCachedQuery(query, useCache, 3600) // 1 hour cache
    );
  }

  /**
   * Find account by address - force fresh data
   */
  async findByAddressFresh(address: string): Promise<Account | null> {
    return this.findByAddress(address, false);
  }

  /**
   * Create new account
   */
  async create(data: AccountCreateInput): Promise<Account> {
    return this.prisma.account.create({
      data: {
        address: data.address,
        balance: data.balance,
        nonce: data.nonce,
        currentBalance: data.currentBalance,
        reservedBalance: data.reservedBalance,
        frozenBalance: data.frozenBalance,
        accountType: data.accountType || AccountType.regular,
        identityName: data.identityName,
        identityInfo: data.identityInfo,
        firstSeenBlock: data.firstSeenBlock,
        lastActivityBlock: data.lastActivityBlock,
        transactionCount: data.transactionCount || 0,
        transferCount: data.transferCount || 0,
      },
    });
  }

  /**
   * Create account if it doesn't exist (upsert)
   */
  async createIfNotExists(data: AccountCreateInput): Promise<{ account: Account; created: boolean }> {
    try {
      const existing = await this.findByAddressFresh(data.address);
      if (existing) {
        return { account: existing, created: false };
      }

      const account = await this.create(data);
      return { account, created: true };
    } catch (error) {
      // Handle unique constraint violation - account was created by another process
      if ((error as any).code === 'P2002') {
        const existing = await this.findByAddressFresh(data.address);
        if (existing) {
          return { account: existing, created: false };
        }
      }
      throw error;
    }
  }
} 