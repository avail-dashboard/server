import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function inspectDatabase() {
  logger.info('Starting database inspection...');

  try {
    const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    `;

    for (const { tablename } of tableNames) {
      logger.info(`
=================================================`);
      logger.info(`Table: ${tablename}`);
      logger.info(`=================================================`);

      const records = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`);

      if (records.length === 0) {
        logger.info('No records found in this table.');
        continue;
      }

      for (const record of records) {
        logger.info('--- New Row ---');
        for (const [key, value] of Object.entries(record)) {
          if (value === null || value === '') {
            logger.warn(`${key}: [NULL_OR_EMPTY]`);
          } else {
            logger.info(`${key}: ${value}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error('An error occurred during database inspection:', error);
  } finally {
    await prisma.$disconnect();
    logger.info('\nDatabase inspection finished.');
  }
}

inspectDatabase();
