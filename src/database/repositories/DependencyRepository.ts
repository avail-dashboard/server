import { DependencyTracking, DependencyResolutionHistory, DependencyStatus } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export interface CreateDependencyTrackingData {
  entityType: string;
  entityId: string;
  dependencyType: string;
  dependencyId: string;
  priority?: number;
  metadata?: any;
}

export interface UpdateDependencyTrackingData {
  status?: DependencyStatus;
  attempts?: number;
  lastAttempt?: Date;
  resolvedAt?: Date;
  failureReason?: string;
  metadata?: any;
}

export interface CreateResolutionHistoryData {
  trackingId: string;
  action: string;
  result: string;
  details?: any;
  processingTime?: number;
  errorMessage?: string;
}

export interface DependencyTrackingWithHistory extends DependencyTracking {
  resolutionHistory: DependencyResolutionHistory[];
}

export class DependencyRepository extends BaseRepository {
  constructor() {
    super();
  }

  // ===== DEPENDENCY TRACKING CRUD =====

  async createDependencyTracking(data: CreateDependencyTrackingData): Promise<DependencyTracking> {
    return this.prisma.dependencyTracking.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId,
        dependencyType: data.dependencyType,
        dependencyId: data.dependencyId,
        priority: data.priority || 1,
        metadata: data.metadata,
      },
    });
  }

  async getDependencyTrackingById(id: string): Promise<DependencyTrackingWithHistory | null> {
    return this.prisma.dependencyTracking.findUnique({
      where: { id },
      include: {
        resolutionHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async updateDependencyTracking(id: string, data: UpdateDependencyTrackingData): Promise<DependencyTracking> {
    return this.prisma.dependencyTracking.update({
      where: { id },
      data,
    });
  }

  async deleteDependencyTracking(id: string): Promise<DependencyTracking> {
    return this.prisma.dependencyTracking.delete({
      where: { id },
    });
  }

  // ===== DEPENDENCY QUERIES =====

  async getPendingDependencies(limit: number = 100): Promise<DependencyTracking[]> {
    return this.prisma.dependencyTracking.findMany({
      where: {
        status: 'pending',
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  async getDependenciesByEntity(entityType: string, entityId: string): Promise<DependencyTracking[]> {
    return this.prisma.dependencyTracking.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        resolutionHistory: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 history entries
        },
      },
    });
  }

  async getDependenciesByStatus(status: DependencyStatus, limit: number = 100): Promise<DependencyTracking[]> {
    return this.prisma.dependencyTracking.findMany({
      where: { status },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  async getFailedDependencies(maxAttempts: number = 5): Promise<DependencyTracking[]> {
    return this.prisma.dependencyTracking.findMany({
      where: {
        OR: [
          { status: 'failed' },
          {
            status: 'pending',
            attempts: { gte: maxAttempts },
          },
        ],
      },
      orderBy: { lastAttempt: 'desc' },
    });
  }

  async getTimeoutDependencies(timeoutMinutes: number = 30): Promise<DependencyTracking[]> {
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    return this.prisma.dependencyTracking.findMany({
      where: {
        status: 'processing',
        lastAttempt: { lt: timeoutThreshold },
      },
      orderBy: { lastAttempt: 'asc' },
    });
  }

  // ===== DEPENDENCY RESOLUTION HISTORY =====

  async createResolutionHistory(data: CreateResolutionHistoryData): Promise<DependencyResolutionHistory> {
    return this.prisma.dependencyResolutionHistory.create({
      data,
    });
  }

  async getResolutionHistory(trackingId: string, limit: number = 50): Promise<DependencyResolutionHistory[]> {
    return this.prisma.dependencyResolutionHistory.findMany({
      where: { trackingId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ===== BATCH OPERATIONS =====

  async markDependencyAsProcessing(id: string): Promise<DependencyTracking> {
    return this.updateDependencyTracking(id, {
      status: 'processing',
      lastAttempt: new Date(),
      attempts: { increment: 1 } as any,
    });
  }

  async markDependencyAsResolved(id: string, metadata?: any): Promise<DependencyTracking> {
    return this.updateDependencyTracking(id, {
      status: 'resolved',
      resolvedAt: new Date(),
      metadata,
    });
  }

  async markDependencyAsFailed(id: string, reason: string, metadata?: any): Promise<DependencyTracking> {
    return this.updateDependencyTracking(id, {
      status: 'failed',
      failureReason: reason,
      metadata,
    });
  }

  async markTimeoutDependencies(timeoutMinutes: number = 30): Promise<number> {
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    const result = await this.prisma.dependencyTracking.updateMany({
      where: {
        status: 'processing',
        lastAttempt: { lt: timeoutThreshold },
      },
      data: {
        status: 'timeout',
        failureReason: `Processing timeout after ${timeoutMinutes} minutes`,
      },
    });

    return result.count;
  }

  // ===== STATISTICS =====

  async getDependencyStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    resolved: number;
    failed: number;
    timeout: number;
    skipped: number;
  }> {
    const stats = await this.prisma.dependencyTracking.groupBy({
      by: ['status'],
      _count: true,
    });

    const result = {
      total: 0,
      pending: 0,
      processing: 0,
      resolved: 0,
      failed: 0,
      timeout: 0,
      skipped: 0,
    };

    stats.forEach(stat => {
      result[stat.status] = stat._count;
      result.total += stat._count;
    });

    return result;
  }

  async getEntityDependencyCount(entityType: string, entityId: string): Promise<number> {
    return this.prisma.dependencyTracking.count({
      where: {
        entityType,
        entityId,
      },
    });
  }

  // ===== CLEANUP =====

  async cleanupResolvedDependencies(olderThanDays: number = 30): Promise<number> {
    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const result = await this.prisma.dependencyTracking.deleteMany({
      where: {
        status: 'resolved',
        resolvedAt: { lt: threshold },
      },
    });

    return result.count;
  }

  async cleanupOldHistory(olderThanDays: number = 90): Promise<number> {
    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const result = await this.prisma.dependencyResolutionHistory.deleteMany({
      where: {
        createdAt: { lt: threshold },
      },
    });

    return result.count;
  }
} 