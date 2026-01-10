import { DatabaseManager } from '../database/DatabaseManager';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { RedisClient } from '../services/RedisClient';
import { Server as SocketServer } from 'socket.io';
import { SyncState } from '../types';
import { logger } from '../utils/logger';

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
        return; // Nothing to sync
      }

      logger.info(`Processing ${changes.length} MySQL changes for ${this.syncState.sheetId}`);

      // Get table schema for column mapping
      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const headers = schema.columns.map(col => col.name);
      const primaryKey = schema.primaryKey[0] || 'id';

      // Read current sheet data to find row positions
      const sheetData = await this.googleSheets.readSheet(
        this.syncState.sheetId,
        `${this.syncState.sheetName}!A:ZZ`
      );

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

              updates.push({
                range: `${this.syncState.sheetName}!A${sheetRow}:${this.columnToLetter(headers.length)}${sheetRow}`,
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
}
