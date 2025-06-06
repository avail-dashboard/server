import { Pool, PoolClient } from 'pg';
import config from '../config';
import { logQuery, logError } from './logger';

interface DatabaseConfig {
  type: 'postgresql';
  url?: string;
  ssl?: boolean | object;
}

interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// Simple retry utility
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context: string = 'operation',
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        logError(lastError, { 
          component: 'database', 
          context, 
          attempt, 
          maxRetries,
          message: `Failed after ${maxRetries} attempts`,
        });
        throw lastError;
      }
      
      logError(lastError, { 
        component: 'database', 
        context, 
        attempt, 
        maxRetries,
        message: `Attempt ${attempt} failed, retrying in ${delayMs}ms`,
      });
      
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError!;
}

class DatabaseService {
  private pgPool: Pool | null = null;
  private isConnected: boolean = false;
  private dbConfig: DatabaseConfig;

  constructor() {
    this.dbConfig = {
      type: 'postgresql',
      url: config.database.url,
    };
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.pgPool = new Pool({
      connectionString: this.dbConfig.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.setupPgEventHandlers();
  }

  private setupPgEventHandlers(): void {
    if (!this.pgPool) {return;}

    this.pgPool.on('error', (error) => {
      this.isConnected = false;
      logError(error, { component: 'database' });
    });
  }

  async connect(): Promise<void> {
    return withRetry(async () => {
      // Ensure pool is initialized
      if (!this.pgPool) {
        this.initializeDatabase();
      }
      
      // Actually test the connection by acquiring a client
      const client = await this.pgPool!.connect();
      client.release(); // Release immediately after testing
      
      this.isConnected = true;
      console.log('Database: Connected to PostgreSQL');
    }, 3, 2000, 'database-connect');
  }

  async disconnect(): Promise<void> {
    try {
      if (this.pgPool) {
        await this.pgPool.end();
      }
      console.log('Database: Disconnected from PostgreSQL');
      this.isConnected = false;
    } catch (err) {
      logError(err as Error, { component: 'database', action: 'disconnect' });
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();

    return withRetry(async () => {
      const result = await this.executePostgreSQLQuery<T>(text, params);

      const duration = Date.now() - start;
      logQuery(text, duration, result.rowCount);
      
      return result;
    }, 2, 1000, 'database-query');
  }

  private async executePostgreSQLQuery<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const result = await this.pgPool.query(text, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
    };
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return withRetry(async () => {
      return this.postgresTransaction(callback);
    }, 2, 1000, 'database-transaction');
  }

  private async postgresTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      logError(err as Error, { component: 'database', action: 'transaction' });
      throw err;
    } finally {
      client.release();
    }
  }

  // Simple health check method
  async checkHealth(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as health_check');
      return true;
    } catch (error) {
      logError(error as Error, { 
        component: 'database', 
        action: 'health-check',
        message: 'Database health check failed',
      });
      return false;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  // Helper methods for common operations
  async findOne<T = any>(table: string, where: Record<string, any>): Promise<T | null> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    
    const query = `SELECT * FROM ${table} WHERE ${conditions} LIMIT 1`;
    const result = await this.query<T>(query, values);
    
    return result.rows[0] || null;
  }

  async findMany<T = any>(
    table: string, 
    where?: Record<string, any>, 
    options?: {
      orderBy?: string;
      order?: 'ASC' | 'DESC';
      limit?: number;
      offset?: number;
    },
  ): Promise<T[]> {
    let query = `SELECT * FROM ${table}`;
    const values: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const keys = Object.keys(where);
      const conditions = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
      query += ` WHERE ${conditions}`;
      values.push(...Object.values(where));
    }

    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
    }

    if (options?.limit) {
      query += ` LIMIT $${values.length + 1}`;
      values.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${values.length + 1}`;
      values.push(options.offset);
    }

    const result = await this.query<T>(query, values);
    return result.rows;
  }

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await this.query<T>(query, values);
    
    return result.rows[0];
  }

  async update<T = any>(
    table: string, 
    data: Record<string, any>, 
    where: Record<string, any>,
  ): Promise<T | null> {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);

    const setClause = dataKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const whereClause = whereKeys.map((key, index) => `${key} = $${dataValues.length + index + 1}`).join(' AND ');

    const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const result = await this.query<T>(query, [...dataValues, ...whereValues]);
    
    return result.rows[0] || null;
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');

    const query = `DELETE FROM ${table} WHERE ${conditions}`;
    const result = await this.query(query, values);
    
    return result.rowCount || 0;
  }

  async count(table: string, where?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${table}`;
    const values: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const keys = Object.keys(where);
      const conditions = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');
      query += ` WHERE ${conditions}`;
      values.push(...Object.values(where));
    }

    const result = await this.query<{ count: string | number }>(query, values);
    const count = result.rows[0].count;
    return typeof count === 'string' ? parseInt(count, 10) : count;
  }

  async paginate<T = any>(
    table: string,
    page: number = 1,
    limit: number = 20,
    where?: Record<string, any>,
    orderBy?: string,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{
    data: T[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const offset = (page - 1) * limit;
    const total = await this.count(table, where);
    const totalPages = Math.ceil(total / limit);

    const data = await this.findMany<T>(table, where, {
      orderBy,
      order,
      limit,
      offset,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

// Create database service instance
export const db = new DatabaseService();

// Database migration utilities
export const createTables = async (): Promise<void> => {
  const queries = [
    // Blocks table
    `CREATE TABLE IF NOT EXISTS blocks (
      number BIGINT PRIMARY KEY,
      hash VARCHAR(66) UNIQUE NOT NULL,
      parent_hash VARCHAR(66),
      state_root VARCHAR(66),
      timestamp BIGINT NOT NULL,
      extrinsics_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes for blocks table
    'CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash)',

    // Extrinsics table
    `CREATE TABLE IF NOT EXISTS extrinsics (
      id SERIAL PRIMARY KEY,
      hash VARCHAR(66) UNIQUE NOT NULL,
      block_number BIGINT REFERENCES blocks(number),
      extrinsic_index INTEGER,
      module VARCHAR(50),
      call VARCHAR(50),
      success BOOLEAN,
      timestamp BIGINT,
      signer VARCHAR(48),
      fee BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes for extrinsics table
    'CREATE INDEX IF NOT EXISTS idx_extrinsics_block ON extrinsics(block_number)',
    'CREATE INDEX IF NOT EXISTS idx_extrinsics_hash ON extrinsics(hash)',
    'CREATE INDEX IF NOT EXISTS idx_extrinsics_signer ON extrinsics(signer)',
    'CREATE INDEX IF NOT EXISTS idx_extrinsics_timestamp ON extrinsics(timestamp)',

    // Accounts table
    `CREATE TABLE IF NOT EXISTS accounts (
      address VARCHAR(48) PRIMARY KEY,
      balance BIGINT,
      nonce INTEGER,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes for accounts table
    'CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts(balance)',

    // Watchlists table
    `CREATE TABLE IF NOT EXISTS watchlists (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255),
      address VARCHAR(48),
      label VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes for watchlists table
    'CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id)',
  ];

  for (const query of queries) {
    try {
      await db.query(query);
    } catch (err) {
      logError(err as Error, { component: 'database', action: 'createTables', query });
      throw err;
    }
  }

  console.log('Database: Tables created successfully (PostgreSQL)');
};

export default db; 