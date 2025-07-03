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
  exists(address: string): Promise<boolean>;
  findByAddress(address: string): Promise<Account | null>;
  create(data: AccountCreateInput): Promise<Account>;
  createIfNotExists(data: AccountCreateInput): Promise<{ account: Account; created: boolean }>;
}

export class AccountRepository extends BaseRepository implements IAccountRepository {
  /**
   * Check if account exists by address - Phase 3 requirement
   */
  async exists(address: string): Promise<boolean> {
    try {
      const result = await this.prisma.account.findFirst({
        where: { address },
        select: { address: true },
      });
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
   * Find account by address
   */
  async findByAddress(address: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { address },
    });
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
      const existing = await this.findByAddress(data.address);
      if (existing) {
        return { account: existing, created: false };
      }

      const account = await this.create(data);
      return { account, created: true };
    } catch (error) {
      // Handle unique constraint violation - account was created by another process
      if ((error as any).code === 'P2002') {
        const existing = await this.findByAddress(data.address);
        if (existing) {
          return { account: existing, created: false };
        }
      }
      throw error;
    }
  }
} 