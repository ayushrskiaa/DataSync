import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
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
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'superjoin_db',
        waitForConnections: true,
        connectionLimit: 3, // Reduced from 10 to 3 for free tier DB (max 5 connections)
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        maxIdle: 2, // Keep 2 idle connections max
        idleTimeout: 30000 // Release idle connections after 30s
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      this.connected = true;
      logger.info('MySQL connection pool created');
    } catch (error) {
      logger.error('Failed to connect to MySQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      logger.info('MySQL connection pool closed');
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

  async getConnection(): Promise<PoolConnection> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return await this.pool.getConnection();
  }

  // Get list of all user tables (excluding sync tables)
  async listTables(): Promise<string[]> {
    const [rows] = await this.pool!.query<RowDataPacket[]>(
      `SELECT TABLE_NAME 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME NOT LIKE '_sync_%'
       ORDER BY TABLE_NAME`,
      [process.env.DB_NAME]
    );
    return rows.map(row => row.TABLE_NAME);
  }

  // Create table from sheet headers
  async createTableFromHeaders(tableName: string, headers: string[]): Promise<void> {
    // Validate table name (alphanumeric and underscores only)
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
      '`id` INT AUTO_INCREMENT PRIMARY KEY'
    ];

    for (const header of headers) {
      if (header.toLowerCase() === 'id') continue; // Skip if header is 'id'
      
      const columnName = header.replace(/[^a-zA-Z0-9_]/g, '_'); // Sanitize column name
      columnDefs.push(`${mysql.escapeId(columnName)} TEXT`);
    }

    // Add timestamp columns
    columnDefs.push('`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    columnDefs.push('`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    const createTableSQL = `
      CREATE TABLE ${mysql.escapeId(tableName)} (
        ${columnDefs.join(',\n        ')}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await this.pool!.query(createTableSQL);
    logger.info(`Created table ${tableName} with ${headers.length} columns`);
  }

  // Get table schema with column definitions
  async getTableSchema(tableName: string): Promise<TableSchema> {
    const [columns] = await this.pool!.query<RowDataPacket[]>(
      `SELECT 
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue,
        COLUMN_KEY as \`key\`,
        EXTRA as extra
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME, tableName]
    );

    const columnDefs: ColumnDefinition[] = columns.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable === 'YES',
      defaultValue: col.defaultValue,
      key: col.key,
      extra: col.extra
    }));

    // Get primary key
    const primaryKey = columnDefs
      .filter(col => col.key === 'PRI')
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
      ? `SELECT * FROM ${mysql.escapeId(tableName)} LIMIT ?`
      : `SELECT * FROM ${mysql.escapeId(tableName)}`;
    
    const params = limit ? [limit] : [];
    const [rows] = await this.pool!.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  // Get row by primary key
  async getRowByPrimaryKey(tableName: string, primaryKey: Record<string, any>): Promise<any | null> {
    const conditions = Object.keys(primaryKey).map(key => `${mysql.escapeId(key)} = ?`).join(' AND ');
    const values = Object.values(primaryKey);
    
    const [rows] = await this.pool!.query<RowDataPacket[]>(
      `SELECT * FROM ${mysql.escapeId(tableName)} WHERE ${conditions} LIMIT 1`,
      values
    );
    
    return rows.length > 0 ? rows[0] : null;
  }

  // Insert row
  async insertRow(tableName: string, data: Record<string, any>): Promise<any> {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(data);

    const [result] = await this.pool!.query(
      `INSERT INTO ${mysql.escapeId(tableName)} (${columns.map(c => mysql.escapeId(c)).join(', ')}) 
       VALUES (${placeholders})`,
      values
    );

    return result;
  }

  // Update row
  async updateRow(tableName: string, primaryKey: Record<string, any>, data: Record<string, any>): Promise<any> {
    const setClauses = Object.keys(data).map(key => `${mysql.escapeId(key)} = ?`).join(', ');
    const whereClause = Object.keys(primaryKey).map(key => `${mysql.escapeId(key)} = ?`).join(' AND ');
    
    const values = [...Object.values(data), ...Object.values(primaryKey)];

    const [result] = await this.pool!.query(
      `UPDATE ${mysql.escapeId(tableName)} SET ${setClauses} WHERE ${whereClause}`,
      values
    );

    return result;
  }

  // Delete row
  async deleteRow(tableName: string, primaryKey: Record<string, any>): Promise<any> {
    const whereClause = Object.keys(primaryKey).map(key => `${mysql.escapeId(key)} = ?`).join(' AND ');
    const values = Object.values(primaryKey);

    const [result] = await this.pool!.query(
      `DELETE FROM ${mysql.escapeId(tableName)} WHERE ${whereClause}`,
      values
    );

    return result;
  }

  // Create triggers for change tracking
  async createChangeTrackingTriggers(tableName: string): Promise<void> {
    const schema = await this.getTableSchema(tableName);
    const pkColumn = schema.primaryKey[0] || 'id';

    // Drop existing triggers if any
    await this.dropChangeTrackingTriggers(tableName);

    // Create AFTER INSERT trigger
    await this.pool!.query(`
      CREATE TRIGGER ${mysql.escapeId(`${tableName}_after_insert`)}
      AFTER INSERT ON ${mysql.escapeId(tableName)}
      FOR EACH ROW
      BEGIN
        INSERT INTO _sync_changelog (table_name, operation, row_id, new_data, timestamp)
        VALUES (
          '${tableName}',
          'INSERT',
          CAST(NEW.${mysql.escapeId(pkColumn)} AS CHAR),
          JSON_OBJECT(${schema.columns.map(col => 
            `'${col.name}', NEW.${mysql.escapeId(col.name)}`
          ).join(', ')}),
          NOW(6)
        );
      END
    `);

    // Create AFTER UPDATE trigger
    await this.pool!.query(`
      CREATE TRIGGER ${mysql.escapeId(`${tableName}_after_update`)}
      AFTER UPDATE ON ${mysql.escapeId(tableName)}
      FOR EACH ROW
      BEGIN
        INSERT INTO _sync_changelog (table_name, operation, row_id, old_data, new_data, timestamp)
        VALUES (
          '${tableName}',
          'UPDATE',
          CAST(NEW.${mysql.escapeId(pkColumn)} AS CHAR),
          JSON_OBJECT(${schema.columns.map(col => 
            `'${col.name}', OLD.${mysql.escapeId(col.name)}`
          ).join(', ')}),
          JSON_OBJECT(${schema.columns.map(col => 
            `'${col.name}', NEW.${mysql.escapeId(col.name)}`
          ).join(', ')}),
          NOW(6)
        );
      END
    `);

    // Create AFTER DELETE trigger
    await this.pool!.query(`
      CREATE TRIGGER ${mysql.escapeId(`${tableName}_after_delete`)}
      AFTER DELETE ON ${mysql.escapeId(tableName)}
      FOR EACH ROW
      BEGIN
        INSERT INTO _sync_changelog (table_name, operation, row_id, old_data, timestamp)
        VALUES (
          '${tableName}',
          'DELETE',
          CAST(OLD.${mysql.escapeId(pkColumn)} AS CHAR),
          JSON_OBJECT(${schema.columns.map(col => 
            `'${col.name}', OLD.${mysql.escapeId(col.name)}`
          ).join(', ')}),
          NOW(6)
        );
      END
    `);

    logger.info(`Created change tracking triggers for table: ${tableName}`);
  }

  async changeTrackingTriggersExist(tableName: string): Promise<boolean> {
    const triggerNames = [
      `${tableName}_after_insert`,
      `${tableName}_after_update`,
      `${tableName}_after_delete`
    ];

    const [rows] = await this.pool!.query<RowDataPacket[]>(
      `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = ?
         AND EVENT_OBJECT_TABLE = ?
         AND TRIGGER_NAME IN (?, ?, ?)`,
      [process.env.DB_NAME, tableName, ...triggerNames]
    );

    return rows.length === triggerNames.length;
  }

  async ensureChangeTrackingTriggers(tableName: string): Promise<void> {
    try {
      const exists = await this.changeTrackingTriggersExist(tableName);
      if (!exists) {
        logger.warn(`Missing change tracking triggers for table: ${tableName}, recreating...`);
        await this.createChangeTrackingTriggers(tableName);
      }
    } catch (error: any) {
      // If trigger operations fail, log but don't crash the app
      if (error.code === 'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER' || error.errno === 1419) {
        logger.warn(`Could not ensure triggers for ${tableName} due to database privileges. Continuing without triggers.`);
      } else {
        logger.error(`Error ensuring triggers for ${tableName}`, error);
      }
      // Don't re-throw - allow app to continue without triggers
    }
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
      operationClause = ' AND operation = ?';
      params.push(operation);
    }

    await this.pool!.query(
      `UPDATE _sync_changelog SET synced = TRUE, sync_timestamp = NOW(6)
       WHERE id IN (
         SELECT id FROM (
           SELECT id FROM _sync_changelog
           WHERE table_name = ? AND row_id = ? AND synced = FALSE${operationClause}
           ORDER BY timestamp DESC
           LIMIT 1
         ) AS recent_change
       )`,
      params
    );
  }

  // Drop triggers
  async dropChangeTrackingTriggers(tableName: string): Promise<void> {
    try {
      await this.pool!.query(`DROP TRIGGER IF EXISTS ${mysql.escapeId(`${tableName}_after_insert`)}`);
      await this.pool!.query(`DROP TRIGGER IF EXISTS ${mysql.escapeId(`${tableName}_after_update`)}`);
      await this.pool!.query(`DROP TRIGGER IF EXISTS ${mysql.escapeId(`${tableName}_after_delete`)}`);
    } catch (error) {
      logger.error(`Error dropping triggers for ${tableName}`, error);
    }
  }

  // Get unsynced changes from changelog
  async getUnsyncedChanges(tableName: string, limit: number = 100): Promise<any[]> {
    const [rows] = await this.pool!.query<RowDataPacket[]>(
      `SELECT * FROM _sync_changelog 
       WHERE table_name = ? AND synced = FALSE 
       ORDER BY timestamp ASC 
       LIMIT ?`,
      [tableName, limit]
    );
    return rows;
  }

  // Mark changes as synced
  async markChangesSynced(changeIds: number[]): Promise<void> {
    if (changeIds.length === 0) return;

    await this.pool!.query(
      `UPDATE _sync_changelog 
       SET synced = TRUE, sync_timestamp = NOW(6) 
       WHERE id IN (?)`,
      [changeIds]
    );
  }
}
