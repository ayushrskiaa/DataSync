import { DatabaseManager } from '../database/DatabaseManager';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { RedisClient } from '../services/RedisClient';
import { Server as SocketServer } from 'socket.io';
import { SyncState } from '../types';
import { logger } from '../utils/logger';

const EXCLUDED_COLUMNS = new Set(['created_at', 'updated_at']);

export class MySQLToSheetsWorker {
  private syncState: SyncState;
  private dbManager: DatabaseManager;
  private googleSheets: GoogleSheetsService;
  private redisClient: RedisClient;
  private io: SocketServer;
  private intervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private syncInterval: number;
  private batchSize: number;

  constructor(
    syncState: SyncState,
    dbManager: DatabaseManager,
    googleSheets: GoogleSheetsService,
    redisClient: RedisClient,
    io: SocketServer
  ) {
    this.syncState = syncState;
    this.dbManager = dbManager;
    this.googleSheets = googleSheets;
    this.redisClient = redisClient;
    this.io = io;
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL_MS || '2000');
    this.batchSize = parseInt(process.env.BATCH_SIZE || '100');
  }

  start(): void {
    if (this.running) {
      logger.warn(`MySQL→Sheets worker already running for ${this.syncState.sheetId}`);
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
    logger.info(`MySQL→Sheets worker started for ${this.syncState.sheetId}`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info(`MySQL→Sheets worker stopped for ${this.syncState.sheetId}`);
  }

  async syncNow(): Promise<void> {
    await this.sync();
  }

  private async sync(): Promise<void> {
    // Acquire lock to prevent concurrent syncs
    const lockKey = `mysql_to_sheets_${this.syncState.sheetId}`;
    const lockAcquired = await this.redisClient.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      logger.debug(`Could not acquire lock for ${lockKey}, skipping sync`);
      return;
    }

    try {
      // Get unsynced changes from changelog
      const changes = await this.dbManager.getUnsyncedChanges(
        this.syncState.tableName,
        this.batchSize
      );

      if (changes.length === 0) {
        // ⚠️ CRITICAL: No triggers available - use polling fallback
        await this.pollingBasedSync();
        return;
      }

      logger.info(`Processing ${changes.length} MySQL changes for ${this.syncState.sheetId}`);

      // Get table schema for column mapping
      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const primaryKey = schema.primaryKey[0] || 'id';
      const headers = schema.columns
        .filter(col => !EXCLUDED_COLUMNS.has(col.name) || col.name === primaryKey)
        .map(col => col.name);

      // Read current sheet data to find row positions
      let sheetData = await this.googleSheets.readSheet(
        this.syncState.sheetId,
        GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
      );

      if (!this.headersMatch(sheetData.headers, headers)) {
        logger.info(`Sheet headers changed for ${this.syncState.sheetId}, rebuilding sheet to enforce column visibility`);
        await this.rebuildSheet(headers);
        sheetData = await this.googleSheets.readSheet(
          this.syncState.sheetId,
          GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
        );
      }

      const updates: Array<{ range: string; values: any[][] }> = [];
      const rowsToAppend: any[][] = [];
      const rowsToDelete: number[] = [];

      for (const change of changes) {
        try {
          if (change.operation === 'INSERT') {
            // Append new row
            const rowData = headers.map(col => {
              const value = change.new_data[col];
              return value === null || value === undefined ? '' : value;
            });
            rowsToAppend.push(rowData);

          } else if (change.operation === 'UPDATE') {
            // Find row by primary key
            const pkValue = change.new_data[primaryKey];
            const rowIndex = this.findRowIndexByPrimaryKey(
              sheetData.values,
              sheetData.headers,
              primaryKey,
              pkValue
            );

            if (rowIndex !== -1) {
              // Update existing row (rowIndex is 0-based, sheet rows are 1-based + 1 for header)
              const sheetRow = rowIndex + 2;
              const rowData = headers.map(col => {
                const value = change.new_data[col];
                return value === null || value === undefined ? '' : value;
              });

              const cellRange = `A${sheetRow}:${this.columnToLetter(headers.length)}${sheetRow}`;
              updates.push({
                range: GoogleSheetsService.buildRange(this.syncState.sheetName, cellRange),
                values: [rowData]
              });
            } else {
              // Row not found, treat as insert
              const rowData = headers.map(col => {
                const value = change.new_data[col];
                return value === null || value === undefined ? '' : value;
              });
              rowsToAppend.push(rowData);
            }

          } else if (change.operation === 'DELETE') {
            // Find and mark row for deletion
            const pkValue = change.old_data[primaryKey];
            const rowIndex = this.findRowIndexByPrimaryKey(
              sheetData.values,
              sheetData.headers,
              primaryKey,
              pkValue
            );

            if (rowIndex !== -1) {
              rowsToDelete.push(rowIndex + 2); // +2 for header and 1-based indexing
            }
          }
        } catch (error) {
          logger.error(`Failed to process change ${change.id}`, error);
        }
      }

      // Apply updates
      if (updates.length > 0) {
        await this.googleSheets.updateCells(this.syncState.sheetId, updates);
        logger.info(`Updated ${updates.length} rows in Google Sheets`);
      }

      // Append new rows
      if (rowsToAppend.length > 0) {
        await this.googleSheets.appendRows(
          this.syncState.sheetId,
          this.syncState.sheetName,
          rowsToAppend
        );
        logger.info(`Appended ${rowsToAppend.length} rows to Google Sheets`);
      }

      // Delete rows (delete from bottom to top to avoid index shifting)
      if (rowsToDelete.length > 0) {
        const sheetId = await this.googleSheets.getSheetIdByName(
          this.syncState.sheetId,
          this.syncState.sheetName
        );

        for (const rowNum of rowsToDelete.sort((a, b) => b - a)) {
          await this.googleSheets.deleteRows(this.syncState.sheetId, sheetId, rowNum - 1, rowNum);
        }
        logger.info(`Deleted ${rowsToDelete.length} rows from Google Sheets`);
      }

      // Mark changes as synced
      const changeIds = changes.map(c => c.id);
      await this.dbManager.markChangesSynced(changeIds);

      // Update sync timestamp
      await this.dbManager.getPool().query(
        `UPDATE _sync_state SET last_sync_timestamp = NOW(6) WHERE sheet_id = ?`,
        [this.syncState.sheetId]
      );

      // Emit sync event
      this.io.to(`sync_${this.syncState.sheetId}`).emit('data_changed', {
        source: 'mysql',
        changeCount: changes.length,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`MySQL→Sheets sync failed for ${this.syncState.sheetId}`, error);
      
      // Update error status
      await this.dbManager.getPool().query(
        `UPDATE _sync_state SET status = 'error', error_message = ? WHERE sheet_id = ?`,
        [error instanceof Error ? error.message : String(error), this.syncState.sheetId]
      );

      this.io.to(`sync_${this.syncState.sheetId}`).emit('sync_error', {
        source: 'mysql',
        error: error instanceof Error ? error.message : String(error)
      });

    } finally {
      await this.redisClient.releaseLock(lockKey);
    }
  }

  private headersMatch(currentHeaders: string[], desiredHeaders: string[]): boolean {
    if (!currentHeaders || currentHeaders.length !== desiredHeaders.length) {
      return false;
    }

    return desiredHeaders.every((header, index) => currentHeaders[index] === header);
  }

  private async rebuildSheet(headers: string[]): Promise<void> {
    const rows = await this.dbManager.getTableData(this.syncState.tableName);
    const formattedRows = this.googleSheets.formatDataForSheets(rows, headers);
    const payload = [headers, ...formattedRows];

    await this.googleSheets.clearRange(
      this.syncState.sheetId,
      GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
    );

    await this.googleSheets.writeSheet(
      this.syncState.sheetId,
      GoogleSheetsService.buildRange(this.syncState.sheetName, 'A1'),
      payload
    );
  }

  private findRowIndexByPrimaryKey(
    rows: any[][],
    headers: string[],
    pkColumn: string,
    pkValue: any
  ): number {
    const pkIndex = headers.indexOf(pkColumn);
    if (pkIndex === -1) return -1;

    return rows.findIndex(row => String(row[pkIndex]) === String(pkValue));
  }

  private columnToLetter(column: number): string {
    let temp: number;
    let letter = '';
    while (column > 0) {
      temp = (column - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      column = (column - temp - 1) / 26;
    }
    return letter;
  }

  /**
   * ⚠️ CRITICAL POLLING FALLBACK - DO NOT REMOVE
   * Used when MySQL TRIGGER privilege is not available
   */
  private async pollingBasedSync(): Promise<void> {
    try {
      const currentMySQLData = await this.dbManager.getTableData(this.syncState.tableName);
      const cachedSnapshot = await this.redisClient.getCache<any[]>(
        `mysql_snapshot_${this.syncState.sheetId}`
      );

      if (!cachedSnapshot) {
        await this.fullSync(currentMySQLData);
        await this.redisClient.setCache(
          `mysql_snapshot_${this.syncState.sheetId}`,
          currentMySQLData,
          3600
        );
        return;
      }

      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const primaryKey = schema.primaryKey[0] || 'id';
      const changes = this.detectMySQLChanges(cachedSnapshot, currentMySQLData, primaryKey);

      if (changes.inserts.length === 0 && changes.updates.length === 0 && changes.deletes.length === 0) {
        return;
      }

      logger.info(`MySQL polling detected ${changes.inserts.length} inserts, ${changes.updates.length} updates, ${changes.deletes.length} deletes`);

      await this.applyChangesToSheet(changes, schema);
      await this.redisClient.setCache(
        `mysql_snapshot_${this.syncState.sheetId}`,
        currentMySQLData,
        3600
      );

      // ⚠️ CRITICAL: Update sheet snapshot to prevent infinite loop with Sheets→MySQL
      const updatedSheetData = await this.googleSheets.readSheet(
        this.syncState.sheetId,
        GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
      );
      const parsedSheetData = this.googleSheets.parseDataFromSheets(
        updatedSheetData.values,
        updatedSheetData.headers
      );
      await this.redisClient.setCache(
        `sheet_snapshot_${this.syncState.sheetId}`,
        { timestamp: new Date(), data: parsedSheetData, hash: this.hashData(parsedSheetData) },
        3600
      );

      this.io.to(`sync_${this.syncState.sheetId}`).emit('data_changed', {
        source: 'mysql',
        changeCount: changes.inserts.length + changes.updates.length + changes.deletes.length,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(`Polling-based sync failed for ${this.syncState.sheetId}`, error);
    }
  }

  private detectMySQLChanges(
    oldData: any[],
    newData: any[],
    primaryKey: string
  ): { inserts: any[]; updates: any[]; deletes: any[] } {
    const inserts: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];

    const oldMap = new Map<string, any>();
    for (const row of oldData) {
      const pkValue = row[primaryKey];
      if (pkValue !== null && pkValue !== undefined) {
        oldMap.set(String(pkValue), row);
      }
    }

    const newMap = new Map<string, any>();
    for (const row of newData) {
      const pkValue = row[primaryKey];
      if (pkValue !== null && pkValue !== undefined) {
        const key = String(pkValue);
        newMap.set(key, row);

        if (!oldMap.has(key)) {
          inserts.push(row);
        } else if (JSON.stringify(oldMap.get(key)) !== JSON.stringify(row)) {
          updates.push(row);
        }
      }
    }

    for (const [key, oldRow] of oldMap.entries()) {
      if (!newMap.has(key)) {
        deletes.push(oldRow);
      }
    }

    return { inserts, updates, deletes };
  }

  private async applyChangesToSheet(
    changes: { inserts: any[]; updates: any[]; deletes: any[] },
    schema: any
  ): Promise<void> {
    const primaryKey = schema.primaryKey[0] || 'id';
    const headers = schema.columns
      .filter((col: any) => !EXCLUDED_COLUMNS.has(col.name) || col.name === primaryKey)
      .map((col: any) => col.name);

    const sheetData = await this.googleSheets.readSheet(
      this.syncState.sheetId,
      GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
    );

    // Handle inserts
    if (changes.inserts.length > 0) {
      const rowsToAppend = changes.inserts.map(row =>
        headers.map((col: string) => (row[col] === null || row[col] === undefined ? '' : row[col]))
      );
      await this.googleSheets.appendRows(
        this.syncState.sheetId,
        this.syncState.sheetName,
        rowsToAppend
      );
      logger.info(`Appended ${rowsToAppend.length} rows to Google Sheets`);
    }

    // Handle updates
    if (changes.updates.length > 0) {
      const updates = [];
      for (const row of changes.updates) {
        const pkValue = row[primaryKey];
        const rowIndex = this.findRowIndexByPrimaryKey(
          sheetData.values,
          sheetData.headers,
          primaryKey,
          pkValue
        );

        if (rowIndex !== -1) {
          const sheetRow = rowIndex + 2;
          const rowData = headers.map((col: string) =>
            row[col] === null || row[col] === undefined ? '' : row[col]
          );
          const cellRange = `A${sheetRow}:${this.columnToLetter(headers.length)}${sheetRow}`;
          updates.push({
            range: GoogleSheetsService.buildRange(this.syncState.sheetName, cellRange),
            values: [rowData]
          });
        }
      }

      if (updates.length > 0) {
        await this.googleSheets.updateCells(this.syncState.sheetId, updates);
        logger.info(`Updated ${updates.length} rows in Google Sheets`);
      }
    }

    // Handle deletes
    if (changes.deletes.length > 0) {
      const rowsToDelete: number[] = [];
      for (const row of changes.deletes) {
        const pkValue = row[primaryKey];
        const rowIndex = this.findRowIndexByPrimaryKey(
          sheetData.values,
          sheetData.headers,
          primaryKey,
          pkValue
        );

        if (rowIndex !== -1) {
          rowsToDelete.push(rowIndex + 2);
        }
      }

      if (rowsToDelete.length > 0) {
        rowsToDelete.sort((a, b) => b - a);
        for (const rowNumber of rowsToDelete) {
          await this.googleSheets.deleteRows(this.syncState.sheetId, 0, rowNumber - 1, rowNumber);
        }
        logger.info(`Deleted ${rowsToDelete.length} rows from Google Sheets`);
      }
    }
  }

  private async fullSync(mysqlData: any[]): Promise<void> {
    const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
    const primaryKey = schema.primaryKey[0] || 'id';
    const headers = schema.columns
      .filter((col: any) => !EXCLUDED_COLUMNS.has(col.name) || col.name === primaryKey)
      .map((col: any) => col.name);

    const sheetData = await this.googleSheets.readSheet(
      this.syncState.sheetId,
      GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
    );

    if (sheetData.values.length === 0 && mysqlData.length > 0) {
      const rowsToAppend = mysqlData.map(row =>
        headers.map((col: string) => (row[col] === null || row[col] === undefined ? '' : row[col]))
      );
      await this.googleSheets.appendRows(
        this.syncState.sheetId,
        this.syncState.sheetName,
        rowsToAppend
      );
    }

    logger.info(`Full sync completed: ${mysqlData.length} rows synced to Google Sheets`);
  }

  private hashData(data: any[]): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }
}
