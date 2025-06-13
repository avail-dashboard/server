#!/usr/bin/env tsx

/**
 * Schema Verification Script
 * 
 * Checks the actual database schema to verify field types
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function checkSchema(): Promise<void> {
  try {
    logger.info('🔍 Checking database schema...');

    // Query the information schema to check column types
    const result = await prisma.$queryRaw`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'blocks' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    logger.info('📊 Blocks table schema:');
    console.table(result);

    // Specifically check the 'number' field
    const numberField = (result as any[]).find(col => col.column_name === 'number');
    if (numberField) {
      logger.info(`✅ blocks.number field type: ${numberField.data_type}`);
      if (numberField.data_type === 'integer') {
        logger.info('🎉 SUCCESS: blocks.number is correctly set as INTEGER (not BIGINT)!');
      } else {
        logger.warn(`⚠️  WARNING: blocks.number is ${numberField.data_type}, expected integer`);
      }
    } else {
      logger.error('❌ ERROR: blocks.number field not found!');
    }

    // Check if sync_state table exists and has data
    const syncStateCount = await prisma.syncState.count();
    logger.info(`📊 Sync state records: ${syncStateCount}`);

    logger.info('✅ Schema check completed!');

  } catch (error) {
    logger.error('💥 Schema check failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    logger.info('🔌 Database disconnected');
  }
}

// Run the check
if (require.main === module) {
  checkSchema().catch((error) => {
    logger.error('💥 Schema check execution failed:', error);
    process.exit(1);
  });
}

export default checkSchema; 