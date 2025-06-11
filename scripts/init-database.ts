#!/usr/bin/env tsx

/**
 * Database Initialization Script
 * 
 * This script reads and executes the complete init.sql file,
 * making it the single source of truth for database schema.
 */

import { logger } from '../src/utils/logger';
import db from '../src/utils/database';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Parse SQL file into executable statements
 * Handles multi-line CREATE TABLE statements properly
 */
function parseSQLFile(sqlContent: string): string[] {
  // Remove comments and empty lines
  const cleanContent = sqlContent
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
    .join('\n');

  // Split on semicolons but be smart about it
  // This handles multi-line statements properly
  const statements: string[] = [];
  let currentStatement = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    const prevChar = i > 0 ? cleanContent[i - 1] : '';

    // Handle quotes
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }

    currentStatement += char;

    // Split on semicolon only if not in quotes
    if (char === ';' && !inQuotes) {
      const statement = currentStatement.trim();
      if (statement.length > 1) { // More than just the semicolon
        statements.push(statement.slice(0, -1).trim()); // Remove the semicolon
      }
      currentStatement = '';
    }
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(stmt => stmt.length > 0);
}

async function initializeDatabase(): Promise<void> {
  try {
    logger.info('🔧 Initializing database schema from init.sql...');

    // Connect to database
    await db.connect();
    logger.info('✅ Database connected');

    // Read and parse the SQL initialization file
    const sqlPath = join(__dirname, '..', 'init.sql');
    logger.info(`📄 Reading SQL file: ${sqlPath}`);
    
    const sqlContent = readFileSync(sqlPath, 'utf8');
    const statements = parseSQLFile(sqlContent);
    
    logger.info(`📄 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    let successful = 0;
    let skipped = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          logger.debug(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
          await db.query(statement);
          successful++;
        } catch (error: any) {
          // Skip errors for IF NOT EXISTS statements and other benign errors
          if (error.message?.includes('already exists') || 
              error.message?.includes('duplicate key') ||
              error.message?.includes('does not exist')) {
            logger.debug(`Skipped statement ${i + 1}: ${error.message}`);
            skipped++;
          } else {
            logger.warn(`Statement ${i + 1} warning: ${error.message}`);
            logger.debug(`Failed statement: ${statement}`);
            // Continue execution for non-critical errors
          }
        }
      }
    }

    logger.info(`📊 Execution complete: ${successful} successful, ${skipped} skipped`);

    // Verify tables exist
    logger.info('🔍 Verifying tables...');
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(row => row.table_name);
    logger.info('📊 Existing tables:', tables);

    // Check for required tables
    const requiredTables = ['blocks', 'extrinsics', 'events', 'accounts', 'sync_state', 'watchlists'];
    const missingTables = requiredTables.filter(table => !tables.includes(table));

    if (missingTables.length > 0) {
      logger.error('❌ Missing required tables:', missingTables);
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    logger.info('✅ All required tables exist');

    // Check sync_state table has initial data
    const syncStateResult = await db.query('SELECT COUNT(*) as count FROM sync_state');
    const syncStateCount = parseInt(syncStateResult.rows[0].count);
    
    logger.info(`📊 Sync state records: ${syncStateCount}`);

    logger.info('🎉 Database initialization completed successfully!');
    logger.info('💡 Schema source: init.sql (single source of truth)');

  } catch (error) {
    logger.error('💥 Database initialization failed:', error);
    throw error;
  } finally {
    await db.disconnect();
    logger.info('🔌 Database disconnected');
  }
}

// Run the initialization
if (require.main === module) {
  initializeDatabase().catch((error) => {
    logger.error('💥 Database initialization execution failed:', error);
    // Let the error bubble up naturally
    throw error;
  });
} 