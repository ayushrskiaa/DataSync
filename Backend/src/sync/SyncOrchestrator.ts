import { DatabaseManager } from '../database/DatabaseManager';
import { RedisClient } from '../services/RedisClient';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { Server as SocketServer } from 'socket.io';
import { logger } from '../utils/logger';
import { SyncConfig, SyncState } from '../types';
import { MySQLToSheetsWorker } from './MySQLToSheetsWorker';
import { SheetsToMySQLWorker } from './SheetsToMySQLWorker';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const EXCLUDED_COLUMNS = new Set(['created_at', 'updated_at']);

export class SyncOrchestrator {
  private dbManager: DatabaseManager;
  private redisClient: RedisClient;
  private googleSheets: GoogleSheetsService;
  private io: SocketServer;
  private activeWorkers: Map<string, { mysqlWorker: MySQLToSheetsWorker; sheetsWorker: SheetsToMySQLWorker }> = new Map();
  private running: boolean = false;

  constructor(dbManager: DatabaseManager, redisClient: RedisClient, io: SocketServer) {
    this.dbManager = dbManager;
    this.redisClient = redisClient;
    this.googleSheets = new GoogleSheetsService();
    this.io = io;
  }

  async initialize(): Promise<void> {
    try {
      if (this.running) {
        logger.warn('Sync Orchestrator already running, skipping initialize');
        return;
      }
      logger.info('Initializing Sync Orchestrator...');
      
      // Load all active sync configurations
      const activeSyncs = await this.getActiveSyncs();
      
      for (const sync of activeSyncs) {
        await this.startSyncWorkers(sync);
      }

      logger.info(`Sync Orchestrator initialized with ${activeSyncs.length} active syncs`);
      this.running = true;
    } catch (error) {
      logger.error('Failed to initialize Sync Orchestrator', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('Sync Orchestrator is not running, skip stop');
      return;
    }
    // Stop all workers
    for (const [sheetId, workers] of this.activeWorkers.entries()) {
      workers.mysqlWorker.stop();
      workers.sheetsWorker.stop();
      logger.info(`Stopped workers for sheet: ${sheetId}`);
    }
    
    this.activeWorkers.clear();
    this.running = false;
    logger.info('Sync Orchestrator stopped');
  }

  async configureSync(config: SyncConfig): Promise<SyncState> {
    try {
      const requestedSheetName = (config.sheetName || 'Sheet1').trim();

      // Validate sheet access and capture canonical sheet title
      const canonicalSheetName = await this.googleSheets.verifySheetExists(
        config.sheetId,
        requestedSheetName
      );

      // Check if sync already exists
      const existing = await this.getSyncState(config.sheetId);
      if (existing) {
        throw new Error(`Sync already configured for sheet: ${config.sheetId}`);
      }

      // Check if table exists, if not create it from sheet headers
      const tables = await this.dbManager.listTables();
      if (!tables.includes(config.tableName)) {
        logger.info(`Table ${config.tableName} does not exist, creating from sheet headers...`);
        
        // Read sheet headers directly using Google Sheets API
        const range = GoogleSheetsService.buildRange(canonicalSheetName, 'A1:ZZ1');
        const response = await this.googleSheets.readSheet(config.sheetId, range);
        
        // The readSheet method extracts headers, so check the headers field
        if (!response || !response.headers || response.headers.length === 0) {
          throw new Error('Sheet is empty or has no headers. Please add column headers in the first row.');
        }

        const headers = response.headers.filter((h: any) => h && h.toString().trim() !== '');
        if (headers.length === 0) {
          throw new Error('No valid headers found in sheet. Please add column names in the first row.');
        }

        // Create table from headers
        await this.dbManager.createTableFromHeaders(config.tableName, headers);
      }

      // Create sync state in database
      const pool = this.dbManager.getPool();
      await pool.query(
        `INSERT INTO _sync_state (sheet_id, sheet_name, table_name, conflict_resolution, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [config.sheetId, canonicalSheetName, config.tableName, config.conflictResolution]
      );

      // Create change tracking triggers (optional - fails on free tier DBs)
      try {
        await this.dbManager.createChangeTrackingTriggers(config.tableName);
      } catch (error: any) {
        // Triggers are nice-to-have but not required - we can use polling instead
        if (error.code === 'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER' || error.errno === 1419) {
          logger.warn(`Could not create triggers for ${config.tableName} - will use polling for change detection`);
        } else {
          // For other errors, log but continue (don't fail sync creation)
          logger.warn(`Trigger creation warning for ${config.tableName}:`, error.message);
        }
      }

      // Get the created sync state
      const syncState = await this.getSyncState(config.sheetId);
      if (!syncState) {
        throw new Error('Failed to create sync state');
      }

      // Initial sync: Copy sheet data to MySQL (reverse direction for new tables)
      await this.performInitialSync(syncState, true);

      // Start sync workers
      await this.startSyncWorkers(syncState);

      logger.info(`Configured sync for sheet ${config.sheetId} ↔ table ${config.tableName}`);
      
      // Notify via WebSocket
      this.io.emit('sync_configured', syncState);

      return syncState;
    } catch (error) {
      logger.error('Failed to configure sync', error);
      throw error;
    }
  }

  private async performInitialSync(syncState: SyncState, fromSheet: boolean = false): Promise<void> {
    logger.info(`Performing initial sync for ${syncState.sheetId}`);

    try {
      if (fromSheet) {
        // New flow: Copy from Sheet to MySQL (for newly created tables)
        const range = GoogleSheetsService.buildRange(syncState.sheetName, 'A:ZZ');
        const sheetData = await this.googleSheets.readSheet(syncState.sheetId, range);
        
        if (!sheetData || !sheetData.values || sheetData.values.length < 2) {
          logger.info('Sheet has no data rows to sync');
          return;
        }

        const headers = sheetData.values[0];
        const dataRows = sheetData.values.slice(1);

        // Get table schema to validate columns
        const schema = await this.dbManager.getTableSchema(syncState.tableName);
        const tableColumns = new Set(schema.columns.map(c => c.name.toLowerCase()));

        let syncedCount = 0;
        for (const row of dataRows) {
          // Skip empty rows
          if (row.every((cell: any) => !cell || cell.toString().trim() === '')) {
            continue;
          }

          // Build row data
          const rowData: Record<string, any> = {};
          for (let i = 0; i < headers.length && i < row.length; i++) {
            const columnName = headers[i]?.toString().replace(/[^a-zA-Z0-9_]/g, '_');
            if (columnName && tableColumns.has(columnName.toLowerCase()) && columnName.toLowerCase() !== 'id') {
              rowData[columnName] = row[i] || null;
            }
          }

          // Insert row if we have data
          if (Object.keys(rowData).length > 0) {
            try {
              await this.dbManager.insertRow(syncState.tableName, rowData);
              syncedCount++;
            } catch (error) {
              logger.warn(`Failed to insert row during initial sync:`, error);
            }
          }
        }

        logger.info(`Initial sync complete: ${syncedCount} rows synced from Google Sheet to MySQL`);
      } else {
        // Original flow: Copy from MySQL to Sheet (for existing tables)
        const schema = await this.dbManager.getTableSchema(syncState.tableName);
        const data = await this.dbManager.getTableData(syncState.tableName);
        const primaryKey = schema.primaryKey[0] || 'id';

        const headers = schema.columns
          .filter(col => !EXCLUDED_COLUMNS.has(col.name) || col.name === primaryKey)
          .map(col => col.name);

        // Format data
        const formattedData = this.googleSheets.formatDataForSheets(data, headers);

        // Clear existing data in sheet
        await this.googleSheets.clearRange(
          syncState.sheetId,
          GoogleSheetsService.buildRange(syncState.sheetName, 'A:ZZ')
        );

        // Write headers and data
        const values = [headers, ...formattedData];
        await this.googleSheets.writeSheet(
          syncState.sheetId,
          GoogleSheetsService.buildRange(syncState.sheetName, 'A1'),
          values
        );

        logger.info(`Initial sync complete: ${data.length} rows synced to Google Sheets`);
      }
    } catch (error) {
      logger.error('Initial sync failed', error);
      throw error;
    }
  }

  private async startSyncWorkers(syncState: SyncState): Promise<void> {
    if (this.activeWorkers.has(syncState.sheetId)) {
      logger.warn(`Workers already running for sheet: ${syncState.sheetId}`);
      return;
    }

    try {
      // Try to ensure triggers exist, but don't fail if we can't create them
      try {
        await this.dbManager.ensureChangeTrackingTriggers(syncState.tableName);
      } catch (triggerError) {
        logger.warn(`Could not ensure triggers for ${syncState.tableName}, continuing without them`);
      }

      // Create workers
      const mysqlWorker = new MySQLToSheetsWorker(
        syncState,
        this.dbManager,
        this.googleSheets,
        this.redisClient,
        this.io
      );

      const sheetsWorker = new SheetsToMySQLWorker(
        syncState,
        this.dbManager,
        this.googleSheets,
        this.redisClient,
        this.io
      );

      // Start workers
      mysqlWorker.start();
      sheetsWorker.start();

      this.activeWorkers.set(syncState.sheetId, { mysqlWorker, sheetsWorker });
      
      logger.info(`Started sync workers for sheet: ${syncState.sheetId}`);
    } catch (error) {
      logger.error(`Failed to start workers for sheet: ${syncState.sheetId}`, error);
      throw error;
    }
  }

  async pauseSync(sheetId: string): Promise<void> {
    const workers = this.activeWorkers.get(sheetId);
    if (workers) {
      workers.mysqlWorker.stop();
      workers.sheetsWorker.stop();
      this.activeWorkers.delete(sheetId);
    }

    await this.dbManager.getPool().query(
      `UPDATE _sync_state SET status = 'paused' WHERE sheet_id = ?`,
      [sheetId]
    );

    this.io.emit('sync_paused', { sheetId });
    logger.info(`Paused sync for sheet: ${sheetId}`);
  }

  async resumeSync(sheetId: string): Promise<void> {
    const syncState = await this.getSyncState(sheetId);
    if (!syncState) {
      throw new Error(`Sync not found for sheet: ${sheetId}`);
    }

    await this.dbManager.getPool().query(
      `UPDATE _sync_state SET status = 'active' WHERE sheet_id = ?`,
      [sheetId]
    );

    await this.startSyncWorkers(syncState);
    
    this.io.emit('sync_resumed', { sheetId });
    logger.info(`Resumed sync for sheet: ${sheetId}`);
  }

  async deleteSyncConfiguration(sheetId: string): Promise<void> {
    // Stop workers
    const workers = this.activeWorkers.get(sheetId);
    if (workers) {
      workers.mysqlWorker.stop();
      workers.sheetsWorker.stop();
      this.activeWorkers.delete(sheetId);
    }

    // Get sync state to drop triggers
    const syncState = await this.getSyncState(sheetId);
    if (syncState) {
      await this.dbManager.dropChangeTrackingTriggers(syncState.tableName);
    }

    // Delete from database
    await this.dbManager.getPool().query(
      `DELETE FROM _sync_state WHERE sheet_id = ?`,
      [sheetId]
    );

    this.io.emit('sync_deleted', { sheetId });
    logger.info(`Deleted sync configuration for sheet: ${sheetId}`);
  }

  async getSyncState(sheetId: string): Promise<SyncState | null> {
    const [rows] = await this.dbManager.getPool().query<RowDataPacket[]>(
      `SELECT * FROM _sync_state WHERE sheet_id = ? LIMIT 1`,
      [sheetId]
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      sheetId: row.sheet_id,
      sheetName: row.sheet_name,
      tableName: row.table_name,
      lastSyncTimestamp: row.last_sync_timestamp,
      lastSheetSync: row.last_sheet_sync,
      status: row.status,
      errorMessage: row.error_message,
      conflictResolution: row.conflict_resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getActiveSyncs(): Promise<SyncState[]> {
    const [rows] = await this.dbManager.getPool().query<RowDataPacket[]>(
      `SELECT * FROM _sync_state WHERE status = 'active'`
    );

    return rows.map(row => ({
      id: row.id,
      sheetId: row.sheet_id,
      sheetName: row.sheet_name,
      tableName: row.table_name,
      lastSyncTimestamp: row.last_sync_timestamp,
      lastSheetSync: row.last_sheet_sync,
      status: row.status,
      errorMessage: row.error_message,
      conflictResolution: row.conflict_resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async getAllSyncs(): Promise<SyncState[]> {
    const [rows] = await this.dbManager.getPool().query<RowDataPacket[]>(
      `SELECT * FROM _sync_state ORDER BY created_at DESC`
    );

    return rows.map(row => ({
      id: row.id,
      sheetId: row.sheet_id,
      sheetName: row.sheet_name,
      tableName: row.table_name,
      lastSyncTimestamp: row.last_sync_timestamp,
      lastSheetSync: row.last_sheet_sync,
      status: row.status,
      errorMessage: row.error_message,
      conflictResolution: row.conflict_resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async getConflicts(sheetId: string): Promise<RowDataPacket[]> {
    const syncState = await this.getSyncState(sheetId);
    if (!syncState) {
      throw new Error(`Sync configuration not found for sheet: ${sheetId}`);
    }

    const [rows] = await this.dbManager.getPool().query<RowDataPacket[]>(
      `SELECT * FROM _sync_conflicts WHERE sync_state_id = ? ORDER BY created_at DESC`,
      [syncState.id]
    );

    return rows;
  }

  async resolveConflict(
    conflictId: number,
    resolution: string,
    resolvedData?: Record<string, unknown>,
    resolvedBy: string = 'manual'
  ): Promise<void> {
    const allowedResolutions = new Set(['sheet_wins', 'db_wins', 'merged', 'manual']);
    if (!allowedResolutions.has(resolution)) {
      throw new Error(`Unsupported conflict resolution value: ${resolution}`);
    }

    const [result] = await this.dbManager.getPool().query<ResultSetHeader>(
      `UPDATE _sync_conflicts 
         SET resolution = ?,
             resolved_data = ?,
             resolved_at = NOW(6),
             resolved_by = ?
       WHERE id = ?`,
      [
        resolution,
        resolvedData ? JSON.stringify(resolvedData) : null,
        resolvedBy,
        conflictId
      ]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Conflict ${conflictId} not found`);
    }
  }

  async triggerManualSync(sheetId: string): Promise<void> {
    const workers = this.activeWorkers.get(sheetId);
    if (!workers) {
      throw new Error(`No active workers for sheet: ${sheetId}`);
    }

    // Trigger both directions
    await Promise.all([
      workers.mysqlWorker.syncNow(),
      workers.sheetsWorker.syncNow()
    ]);

    logger.info(`Manual sync triggered for sheet: ${sheetId}`);
  }

  getGoogleSheetsService(): GoogleSheetsService {
    return this.googleSheets;
  }
}
