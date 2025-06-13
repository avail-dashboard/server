#!/usr/bin/env tsx
/**
 * Database Migration: Add Data Submissions and Rollups Tables
 * 
 * This script safely adds the missing data_submissions and rollups tables
 * to existing Avail Explorer databases that were created before these tables existed.
 * 
 * Usage:
 *   npm run db:migrate:data-submissions
 *   or directly: tsx scripts/migrate-add-data-submissions.ts
 */

import { logger } from '../src/utils/logger';
import db from '../src/utils/database';

interface MigrationResult {
  success: boolean;
  message: string;
  tableName?: string;
  error?: string;
}

class DataSubmissionsMigration {
  private results: MigrationResult[] = [];

  async run(): Promise<void> {
    try {
      logger.info('🚀 Starting Data Submissions Migration...');
      
      // Connect to database
      await db.connect();
      logger.info('✅ Database connected');

      // Check current state
      await this.checkCurrentState();

      // Execute migrations
      await this.createDataSubmissionsTable();
      await this.createRollupsTable();
      await this.createIndexes();
      await this.updateGrants();

      // Validate migrations
      await this.validateMigrations();

      // Summary
      this.printSummary();

      logger.info('✅ Data Submissions Migration completed successfully');

    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  private async checkCurrentState(): Promise<void> {
    logger.info('🔍 Checking current database state...');

    try {
      // Check if tables already exist
      const dataSubmissionsExists = await this.tableExists('data_submissions');
      const rollupsExists = await this.tableExists('rollups');

      logger.info(`📊 Current state:
  - data_submissions table: ${dataSubmissionsExists ? '✅ EXISTS' : '❌ MISSING'}
  - rollups table: ${rollupsExists ? '✅ EXISTS' : '❌ MISSING'}`);

      if (dataSubmissionsExists && rollupsExists) {
        logger.info('🎉 All tables already exist. Migration not needed.');
        return;
      }

    } catch (error) {
      logger.error('❌ Failed to check current state:', error);
      throw error;
    }
  }

  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `, [tableName]);

      return result.rows[0].exists;
    } catch (error) {
      logger.error(`❌ Failed to check if table ${tableName} exists:`, error);
      throw error;
    }
  }

  private async createDataSubmissionsTable(): Promise<void> {
    logger.info('📝 Creating data_submissions table...');

    try {
      const exists = await this.tableExists('data_submissions');
      if (exists) {
        this.results.push({
          success: true,
          message: 'Table already exists',
          tableName: 'data_submissions'
        });
        return;
      }

      await db.query(`
        CREATE TABLE data_submissions (
          id SERIAL PRIMARY KEY,
          extrinsic_hash VARCHAR(66) UNIQUE NOT NULL,
          block_number BIGINT REFERENCES blocks(number),
          extrinsic_index INTEGER,
          app_id INTEGER NOT NULL,
          rollup_name VARCHAR(255),
          data_size BIGINT NOT NULL,
          data_hash VARCHAR(66) NOT NULL,
          submitter VARCHAR(48) NOT NULL,
          timestamp BIGINT NOT NULL,
          success BOOLEAN NOT NULL DEFAULT true,
          blob_data BYTEA,
          kate_commitment VARCHAR(255),
          proof JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.results.push({
        success: true,
        message: 'Table created successfully',
        tableName: 'data_submissions'
      });

      logger.info('✅ data_submissions table created');

    } catch (error) {
      const errorMsg = `Failed to create data_submissions table: ${error}`;
      logger.error('❌ ' + errorMsg);
      this.results.push({
        success: false,
        message: errorMsg,
        tableName: 'data_submissions',
        error: String(error)
      });
      throw error;
    }
  }

  private async createRollupsTable(): Promise<void> {
    logger.info('📝 Creating rollups table...');

    try {
      const exists = await this.tableExists('rollups');
      if (exists) {
        this.results.push({
          success: true,
          message: 'Table already exists',
          tableName: 'rollups'
        });
        return;
      }

      await db.query(`
        CREATE TABLE rollups (
          app_id INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          first_seen_block BIGINT,
          last_active_block BIGINT,
          total_submissions INTEGER DEFAULT 0,
          total_data_size BIGINT DEFAULT 0,
          total_fees_paid BIGINT DEFAULT 0,
          website VARCHAR(255),
          logo_url VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.results.push({
        success: true,
        message: 'Table created successfully',
        tableName: 'rollups'
      });

      logger.info('✅ rollups table created');

    } catch (error) {
      const errorMsg = `Failed to create rollups table: ${error}`;
      logger.error('❌ ' + errorMsg);
      this.results.push({
        success: false,
        message: errorMsg,
        tableName: 'rollups',
        error: String(error)
      });
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    logger.info('🔗 Creating indexes...');

    const indexes = [
      { name: 'idx_data_submissions_block', sql: 'CREATE INDEX IF NOT EXISTS idx_data_submissions_block ON data_submissions(block_number);' },
      { name: 'idx_data_submissions_app_id', sql: 'CREATE INDEX IF NOT EXISTS idx_data_submissions_app_id ON data_submissions(app_id);' },
      { name: 'idx_data_submissions_submitter', sql: 'CREATE INDEX IF NOT EXISTS idx_data_submissions_submitter ON data_submissions(submitter);' },
      { name: 'idx_data_submissions_timestamp', sql: 'CREATE INDEX IF NOT EXISTS idx_data_submissions_timestamp ON data_submissions(timestamp);' },
      { name: 'idx_data_submissions_hash', sql: 'CREATE INDEX IF NOT EXISTS idx_data_submissions_hash ON data_submissions(extrinsic_hash);' },
      { name: 'idx_rollups_name', sql: 'CREATE INDEX IF NOT EXISTS idx_rollups_name ON rollups(name);' },
      { name: 'idx_rollups_last_active', sql: 'CREATE INDEX IF NOT EXISTS idx_rollups_last_active ON rollups(last_active_block);' }
    ];

    for (const index of indexes) {
      try {
        await db.query(index.sql);
        logger.info(`✅ Index created: ${index.name}`);
      } catch (error) {
        logger.error(`❌ Failed to create index ${index.name}:`, error);
        // Don't throw - indexes are not critical for basic functionality
      }
    }
  }

  private async updateGrants(): Promise<void> {
    logger.info('🔐 Updating user grants...');

    try {
      await db.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO avail_user;');
      await db.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO avail_user;');
      logger.info('✅ User grants updated');
    } catch (error) {
      logger.error('❌ Failed to update grants:', error);
      // Don't throw - grants might already be in place
    }
  }

  private async validateMigrations(): Promise<void> {
    logger.info('🔍 Validating migrations...');

    // Check that tables exist
    const dataSubmissionsExists = await this.tableExists('data_submissions');
    const rollupsExists = await this.tableExists('rollups');

    if (!dataSubmissionsExists) {
      throw new Error('data_submissions table was not created successfully');
    }

    if (!rollupsExists) {
      throw new Error('rollups table was not created successfully');
    }

    // Check that tables have expected columns
    await this.validateTableStructure('data_submissions', [
      'id', 'extrinsic_hash', 'block_number', 'app_id', 'data_size'
    ]);

    await this.validateTableStructure('rollups', [
      'app_id', 'name', 'total_submissions'
    ]);

    logger.info('✅ Migration validation passed');
  }

  private async validateTableStructure(tableName: string, requiredColumns: string[]): Promise<void> {
    try {
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
      `, [tableName]);

      const existingColumns = result.rows.map(row => row.column_name);
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        throw new Error(`Table ${tableName} is missing columns: ${missingColumns.join(', ')}`);
      }

    } catch (error) {
      logger.error(`❌ Failed to validate table structure for ${tableName}:`, error);
      throw error;
    }
  }

  private printSummary(): void {
    logger.info('\n📋 Migration Summary:');
    logger.info('==========================================');
    
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      logger.info(`${status} ${result.tableName}: ${result.message}`);
      if (result.error) {
        logger.error(`   Error: ${result.error}`);
      }
    });

    const successCount = this.results.filter(r => r.success).length;
    const totalCount = this.results.length;

    logger.info('==========================================');
    logger.info(`🎯 Results: ${successCount}/${totalCount} operations successful`);
  }
}

// Main execution
async function main(): Promise<void> {
  const migration = new DataSubmissionsMigration();
  await migration.run();
}

// Handle script execution
if (require.main === module) {
  main().catch((error) => {
    logger.error('💥 Migration script failed:', error);
    process.exit(1);
  });
}

export default DataSubmissionsMigration;