import { Pool, PoolClient } from 'pg';
import config from '../config';
import { logQuery, logError } from './logger';
import { retryConfigs, withRetry } from './retry';

interface DatabaseConfig {
  type: 'postgresql';
  url?: string;
  ssl?: boolean | object;
}

interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
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
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 20000,
      query_timeout: 60000,
      statement_timeout: 60000,
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
    }, retryConfigs.database, 'database-connect');
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
    }, retryConfigs.database, 'database-query');
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
    }, retryConfigs.database, 'database-transaction');
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
      query += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    const result = await this.query<T>(query, values);
    return result.rows;
  }

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await this.query<T>(query, values);
    
    return result.rows[0];
  }

  async update<T = any>(
    table: string, 
    data: Record<string, any>, 
    where: Record<string, any>,
  ): Promise<T | null> {
    const dataKeys = Object.keys(data);
    const whereKeys = Object.keys(where);
    const dataValues = Object.values(data);
    const whereValues = Object.values(where);
    
    const setClause = dataKeys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const whereClause = whereKeys.map((key, index) => `${key} = $${dataKeys.length + index + 1}`).join(' AND ');
    
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
    
    return result.rowCount;
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

    const result = await this.query<{ count: string }>(query, values);
    return parseInt(result.rows[0].count, 10);
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
    
    // Get total count
    const total = await this.count(table, where);
    
    // Get paginated data
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

// Singleton instance
const db = new DatabaseService();

export default db;
export { db };
