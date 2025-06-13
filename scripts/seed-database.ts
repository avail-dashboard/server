#!/usr/bin/env tsx

/**
 * Database Seeding Script
 * 
 * Seeds the database with initial required data after migrations have been applied.
 * This replaces the old init.sql approach with a clean Prisma-based solution.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function seedDatabase(): Promise<void> {
  try {
    logger.info('🌱 Seeding database with initial data...');

    // Seed sync_state table with initial record
    const existingSyncState = await prisma.syncState.findFirst();
    
    if (!existingSyncState) {
      await prisma.syncState.create({
        data: {
          lastSyncedBlock: 0,
          syncStatus: 'idle',
          syncMode: 'incremental',
        },
      });
      logger.info('✅ Created initial sync_state record');
    } else {
      logger.info('ℹ️  Sync state record already exists, skipping');
    }

    // Add any other initial data here as needed
    // For example, default rollups, admin accounts, etc.

    logger.info('🎉 Database seeding completed successfully!');

  } catch (error) {
    logger.error('💥 Database seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    logger.info('🔌 Database disconnected');
  }
}

// Run the seeding
if (require.main === module) {
  seedDatabase().catch((error) => {
    logger.error('💥 Database seeding execution failed:', error);
    process.exit(1);
  });
}

export default seedDatabase; 