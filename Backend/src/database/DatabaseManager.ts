import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { TableSchema, ColumnDefinition } from '../types';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool | null = null;
  private connected: boolean = false;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'superjoin_db',
        max: 3, // Reduced for free tier
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.connected = true;
      logger.info('PostgreSQL connection pool created');
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      logger.info('PostgreSQL connection pool closed');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool;
  }

  async getConnection(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return await this.pool.connect();
  }

  // Escape identifier for PostgreSQL
  private escapeId(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  // Get list of all user tables (excluding sync tables)
  async listTables(): Promise<string[]> {
    const result = await this.pool!.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name NOT LIKE '_sync_%'
       ORDER BY table_name`
    );
    return result.rows.map((row: any) => row.table_name);
  }

  // Create table from sheet headers
  async createTableFromHeaders(tableName: string, headers: string[]): Promise<void> {
    // Validate table name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error('Invalid table name. Use only letters, numbers, and underscores.');
    }

    // Check if table already exists
    const tables = await this.listTables();
    if (tables.includes(tableName)) {
      throw new Error(`Table ${tableName} already exists`);
    }

    // Build column definitions
    const columnDefs: string[] = [
      `${this.escapeId('id')} SERIAL PRIMARY KEY`
    ];

    for (const header of headers) {
      if (header.toLowerCase() === 'id') continue;
      
      const columnName = header.replace(/[^a-zA-Z0-9_]/g, '_');
      columnDefs.push(`${this.escapeId(columnName)} TEXT`);
    }

    // Add timestamp columns
    columnDefs.push(`${this.escapeId('created_at')} TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    columnDefs.push(`${this.escapeId('updated_at')} TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    const createTableSQL = `
      CREATE TABLE ${this.escapeId(tableName)} (
        ${columnDefs.join(',\n        ')}
      )
    `;

    await this.pool!.query(createTableSQL);
    logger.info(`Created table ${tableName} with ${headers.length} columns`);
  }

  // Get table schema
  async getTableSchema(tableName: string): Promise<TableSchema> {
    const result = await this.pool!.query(
      `SELECT 
        column_name as name,
        data_type as type,
        is_nullable as nullable,
        column_default as "defaultValue"
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    const columnDefs: ColumnDefinition[] = result.rows.map((col: any) => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable === 'YES',
      defaultValue: col.defaultValue,
      key: col.name === 'id' ? 'PRI' : '',
      extra: col.defaultValue?.includes('nextval') ? 'auto_increment' : ''
    }));

    const primaryKey = columnDefs
      .filter(col => col.key === 'PRI' || col.name === 'id')
      .map(col => col.name);

    return {
      tableName,
      columns: columnDefs,
      primaryKey
    };
  }

  // Get all data from a table
  async getTableData(tableName: string, limit?: number): Promise<any[]> {
    const sql = limit 
      ? `SELECT * FROM ${this.escapeId(tableName)} LIMIT $1`
      : `SELECT * FROM ${this.escapeId(tableName)}`;
    
    const params = limit ? [limit] : [];
    const result = await this.pool!.query(sql, params);
    return result.rows;
  }

  // Get row by primary key
  async getRowByPrimaryKey(tableName: string, primaryKey: Record<string, any>): Promise<any | null> {
    const conditions = Object.keys(primaryKey).map((key, i) => `${this.escapeId(key)} = $${i + 1}`).join(' AND ');
    const values = Object.values(primaryKey);
    
    const result = await this.pool!.query(
      `SELECT * FROM ${this.escapeId(tableName)} WHERE ${conditions} LIMIT 1`,
      values
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // Insert row
  async insertRow(tableName: string, data: Record<string, any>): Promise<any> {
    const columns = Object.keys(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = Object.values(data);

    const result = await this.pool!.query(
      `INSERT INTO ${this.escapeId(tableName)} (${columns.map(c => this.escapeId(c)).join(', ')}) 
       VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0];
  }

  // Update row
  async updateRow(tableName: string, primaryKey: Record<string, any>, data: Record<string, any>): Promise<any> {
    const setClauses = Object.keys(data).map((key, i) => `${this.escapeId(key)} = $${i + 1}`).join(', ');
    const whereClause = Object.keys(primaryKey).map((key, i) => `${this.escapeId(key)} = $${i + 1 + Object.keys(data).length}`).join(' AND ');
    
    const values = [...Object.values(data), ...Object.values(primaryKey)];

    const result = await this.pool!.query(
      `UPDATE ${this.escapeId(tableName)} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  // Delete row
  async deleteRow(tableName: string, primaryKey: Record<string, any>): Promise<any> {
    const whereClause = Object.keys(primaryKey).map((key, i) => `${this.escapeId(key)} = $${i + 1}`).join(' AND ');
    const values = Object.values(primaryKey);

    const result = await this.pool!.query(
      `DELETE FROM ${this.escapeId(tableName)} WHERE ${whereClause} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  // PostgreSQL doesn't need triggers - using updated_at column
  async createChangeTrackingTriggers(tableName: string): Promise<void> {
    logger.info(`PostgreSQL using timestamp-based change tracking for ${tableName}`);
  }

  async changeTrackingTriggersExist(_tableName: string): Promise<boolean> {
    return false; // Not using triggers in PostgreSQL
  }

  async ensureChangeTrackingTriggers(_tableName: string): Promise<void> {
    // Not needed for PostgreSQL
  }

  async markLatestRowChangeSynced(
    tableName: string,
    rowId: string | number | null | undefined,
    operation?: 'INSERT' | 'UPDATE' | 'DELETE'
  ): Promise<void> {
    if (rowId === null || rowId === undefined || rowId === '') {
      return;
    }

    const params: (string | number)[] = [tableName, String(rowId)];
    let operationClause = '';

    if (operation) {
      operationClause = ' AND operation = $3';
      params.push(operation);
    }

    await this.pool!.query(
      `UPDATE _sync_changelog SET synced = TRUE, sync_timestamp = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM _sync_changelog
         WHERE table_name = $1 AND row_id = $2 AND synced = FALSE${operationClause}
         ORDER BY timestamp DESC
         LIMIT 1
       )`,
      params
    );
  }

  async dropChangeTrackingTriggers(_tableName: string): Promise<void> {
    // Not used in PostgreSQL version
  }

  // Get unsynced changes
  async getUnsyncedChanges(tableName: string, limit: number = 100): Promise<any[]> {
    const result = await this.pool!.query(
      `SELECT * FROM _sync_changelog 
       WHERE table_name = $1 AND synced = FALSE 
       ORDER BY timestamp ASC 
       LIMIT $2`,
      [tableName, limit]
    );
    return result.rows;
  }

  // Mark changes as synced
  async markChangesSynced(changeIds: number[]): Promise<void> {
    if (changeIds.length === 0) return;

    await this.pool!.query(
      `UPDATE _sync_changelog 
       SET synced = TRUE, sync_timestamp = CURRENT_TIMESTAMP 
       WHERE id = ANY($1::int[])`,
      [changeIds]
    );
  }
}
