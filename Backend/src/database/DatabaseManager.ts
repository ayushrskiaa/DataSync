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

      // Initialize schema
      await this.initializeSchema();
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

  private async initializeSchema(): Promise<void> {
    try {
      logger.info('Initializing database schema...');
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');

        // Sync configuration table
        await client.query(`
          CREATE TABLE IF NOT EXISTS _sync_config (
            id SERIAL PRIMARY KEY,
            sheet_id VARCHAR(255) UNIQUE NOT NULL,
            sheet_name VARCHAR(255) NOT NULL,
            table_name VARCHAR(255) NOT NULL,
            sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK (sync_direction IN ('bidirectional', 'sheet_to_db', 'db_to_sheet')),
            conflict_resolution VARCHAR(50) DEFAULT 'last_write_wins' CHECK (conflict_resolution IN ('last_write_wins', 'manual')),
            is_active BOOLEAN DEFAULT TRUE,
            last_sync_timestamp TIMESTAMP,
            last_sheet_sync TIMESTAMP,
            status VARCHAR(50),
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Migration: Add missing columns if they don't exist (for existing tables)
        try {
          await client.query(`ALTER TABLE _sync_config ADD COLUMN IF NOT EXISTS last_sheet_sync TIMESTAMP`);
          await client.query(`ALTER TABLE _sync_config ADD COLUMN IF NOT EXISTS status VARCHAR(50)`);
          await client.query(`ALTER TABLE _sync_config ADD COLUMN IF NOT EXISTS error_message TEXT`);
          
          // Rename last_sync_at to last_sync_timestamp if needed
          const checkCol = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = '_sync_config' AND column_name = 'last_sync_at'
          `);
          if (checkCol.rows.length > 0) {
            await client.query(`ALTER TABLE _sync_config RENAME COLUMN last_sync_at TO last_sync_timestamp`);
          }
        } catch (migrationError) {
          logger.warn('Schema migration failed (ignoring if columns exist)', migrationError);
        }

        // Changelog table
        await client.query(`
          CREATE TABLE IF NOT EXISTS _sync_changelog (
            id BIGSERIAL PRIMARY KEY,
            table_name VARCHAR(255) NOT NULL,
            operation VARCHAR(10) CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')) NOT NULL,
            row_id VARCHAR(255) NOT NULL,
            old_data JSONB,
            new_data JSONB,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            synced BOOLEAN DEFAULT FALSE,
            sync_timestamp TIMESTAMP
          );
        `);

        // Indexes for changelog
        await client.query(`CREATE INDEX IF NOT EXISTS idx_changelog_table_synced ON _sync_changelog(table_name, synced);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON _sync_changelog(timestamp);`);

        // Conflicts table
        await client.query(`
          CREATE TABLE IF NOT EXISTS _sync_conflicts (
            id BIGSERIAL PRIMARY KEY,
            sheet_id VARCHAR(255) NOT NULL,
            table_name VARCHAR(255) NOT NULL,
            row_id VARCHAR(255) NOT NULL,
            conflict_type VARCHAR(50) NOT NULL,
            sheet_data JSONB,
            db_data JSONB,
            resolved BOOLEAN DEFAULT FALSE,
            resolution_strategy VARCHAR(50),
            resolved_at TIMESTAMP,
            resolved_data JSONB,
            resolved_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Indexes for conflicts
        await client.query(`CREATE INDEX IF NOT EXISTS idx_conflicts_sheet_resolved ON _sync_conflicts(sheet_id, resolved);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_conflicts_created ON _sync_conflicts(created_at);`);

        // Create timestamp update function
        await client.query(`
          CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ language 'plpgsql';
        `);

        // Create trigger for _sync_config
        await client.query(`
          DROP TRIGGER IF EXISTS update_sync_config_updated_at ON _sync_config;
          CREATE TRIGGER update_sync_config_updated_at
              BEFORE UPDATE ON _sync_config
              FOR EACH ROW
              EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query('COMMIT');
        logger.info('Database schema initialized successfully');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to initialize database schema', error);
      throw error;
    }
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
    
    if (columns.length === 0) {
      const result = await this.pool!.query(
        `INSERT INTO ${this.escapeId(tableName)} DEFAULT VALUES RETURNING *`
      );
      return result.rows[0];
    }

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

  // --------------------------------------------------------------------------
  // Trigger Management (Unused in PostgreSQL Implementation)
  // 
  // PostgreSQL handles updates via the `update_updated_at_column` function created 
  // in initializeSchema(). The complex change tracking tables are populated by 
  // workers or polling, not by database triggers in this specific implementation 
  // to maximize compatibility with managed hosting services.
  // --------------------------------------------------------------------------

  async createChangeTrackingTriggers(tableName: string): Promise<void> {
    logger.info(`PostgreSQL using timestamp-based change tracking for ${tableName}`);
  }

  async changeTrackingTriggersExist(_tableName: string): Promise<boolean> {
    return false; 
  }

  async ensureChangeTrackingTriggers(_tableName: string): Promise<void> {
    // No-op for PostgreSQL
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
