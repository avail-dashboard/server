import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';
import { Command } from 'commander';

const prisma = new PrismaClient();
const program = new Command();

program
  .option('-b, --block <number>', 'Specify a block number to inspect data for that block only.')
  .parse(process.argv);

const options = program.opts();
const blockNumber = options.block ? parseInt(options.block, 10) : undefined;

async function inspectDatabase() {
  logger.info('Starting database inspection...');
  if (blockNumber !== undefined) {
    logger.info(`Inspecting data for block number: ${blockNumber}`);
  }

  try {
    if (blockNumber !== undefined) {
      const block = await prisma.block.findUnique({
        where: { number: blockNumber },
      });

      if (block) {
        logger.info(`
=================================================`);
        logger.info(`Block Data for Block Number: ${blockNumber}`);
        logger.info(`=================================================`);
        for (const [key, value] of Object.entries(block)) {
          if (value === null || value === '') {
            logger.warn(`${key}: [NULL_OR_EMPTY]`);
          } else {
            logger.info(`${key}: ${value}`);
          }
        }

        // Fetch and display related extrinsics
        const extrinsics = await prisma.extrinsic.findMany({
          where: { blockNumber: blockNumber },
        });
        if (extrinsics.length > 0) {
          logger.info(`\nExtrinsics for Block ${blockNumber}:`);
          for (const extrinsic of extrinsics) {
            logger.info('--- New Extrinsic ---');
            for (const [key, value] of Object.entries(extrinsic)) {
              if (value === null || value === '') {
                logger.warn(`${key}: [NULL_OR_EMPTY]`);
              } else {
                logger.info(`${key}: ${value}`);
              }
            }
          }
        } else {
          logger.info(`No extrinsics found for block number: ${blockNumber}`);
        }

        // Fetch and display related events
        const events = await prisma.event.findMany({
          where: { blockNumber: blockNumber },
        });
        if (events.length > 0) {
          logger.info(`\nEvents for Block ${blockNumber}:`);
          for (const event of events) {
            logger.info('--- New Event ---');
            for (const [key, value] of Object.entries(event)) {
              if (value === null || value === '') {
                logger.warn(`${key}: [NULL_OR_EMPTY]`);
              } else {
                logger.info(`${key}: ${value}`);
              }
            }
          }
        } else {
          logger.info(`No events found for block number: ${blockNumber}`);
        }

        // Fetch and display related data submissions
        const dataSubmissions = await prisma.dataSubmission.findMany({
          where: { blockNumber: blockNumber },
        });
        if (dataSubmissions.length > 0) {
          logger.info(`\nData Submissions for Block ${blockNumber}:`);
          for (const submission of dataSubmissions) {
            logger.info('--- New Data Submission ---');
            for (const [key, value] of Object.entries(submission)) {
              if (value === null || value === '') {
                logger.warn(`${key}: [NULL_OR_EMPTY]`);
              } else {
                logger.info(`${key}: ${value}`);
              }
            }
          }
        } else {
          logger.info(`No data submissions found for block number: ${blockNumber}`);
        }

        // Fetch and display related transfers
        const transfers = await prisma.transfer.findMany({
          where: { blockNumber: blockNumber },
        });
        if (transfers.length > 0) {
          logger.info(`\nTransfers for Block ${blockNumber}:`);
          for (const transfer of transfers) {
            logger.info('--- New Transfer ---');
            for (const [key, value] of Object.entries(transfer)) {
              if (value === null || value === '') {
                logger.warn(`${key}: [NULL_OR_EMPTY]`);
              } else {
                logger.info(`${key}: ${value}`);
              }
            }
          }
        } else {
          logger.info(`No transfers found for block number: ${blockNumber}`);
        }

        // Fetch and display related rewards
        const rewards = await prisma.reward.findMany({
          where: { blockNumber: blockNumber },
        });
        if (rewards.length > 0) {
          logger.info(`\nRewards for Block ${blockNumber}:`);
          for (const reward of rewards) {
            logger.info('--- New Reward ---');
            for (const [key, value] of Object.entries(reward)) {
              if (value === null || value === '') {
                logger.warn(`${key}: [NULL_OR_EMPTY]`);
              } else {
                logger.info(`${key}: ${value}`);
              }
            }
          }
        } else {
          logger.info(`No rewards found for block number: ${blockNumber}`);
        }
      } else {
        logger.info(`No data found for block number: ${blockNumber}`);
      }
    } else {
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
    }
  } catch (error) {
    logger.error('An error occurred during database inspection:', error);
  } finally {
    await prisma.$disconnect();
    logger.info('\nDatabase inspection finished.');
  }
}

inspectDatabase();
