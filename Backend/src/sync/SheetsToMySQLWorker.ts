import { DatabaseManager } from "../database/DatabaseManager";
import { GoogleSheetsService } from "../services/GoogleSheetsService";
import { RedisClient } from "../services/RedisClient";
import { Server as SocketServer } from "socket.io";
import { SyncState, ChangeDetectionResult, SheetRowChange, TableSchema } from "../types";
import { logger } from "../utils/logger";

interface SheetSnapshot {
  timestamp: Date;
  data: any[];
  hash: string;
}

export class SheetsToMySQLWorker {
  private syncState: SyncState;
  private dbManager: DatabaseManager;
  private googleSheets: GoogleSheetsService;
  private redisClient: RedisClient;
  private io: SocketServer;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private syncInterval: number;
  private lastSnapshot: SheetSnapshot | null = null;

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
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL_MS || "2000");
  }

  start(): void {
    if (this.running) {
      logger.warn(`Sheets->MySQL worker already running for ${this.syncState.sheetId}`);
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
    logger.info(`Sheets->MySQL worker started for ${this.syncState.sheetId}`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info(`Sheets->MySQL worker stopped for ${this.syncState.sheetId}`);
  }

  async syncNow(): Promise<void> {
    await this.sync();
  }

  /**
   * Main sync loop for Sheets to MySQL direction.
   * Acquired a lock, checks for changes in the sheet since the last snapshot,
   * and applies inserts/updates/deletes to the database.
   */
  private async sync(): Promise<void> {
    const lockKey = `sheets_to_mysql_${this.syncState.sheetId}`;
    const lockAcquired = await this.redisClient.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      logger.debug(`Could not acquire lock for ${lockKey}, skipping sync`);
      return;
    }

    try {
      await this.refreshSyncStateTimestamps();

      const sheetRange = GoogleSheetsService.buildRange(this.syncState.sheetName, "A:ZZ");
      const sheetData = await this.googleSheets.readSheet(this.syncState.sheetId, sheetRange);

      if (!sheetData.headers || sheetData.headers.length === 0) {
        logger.warn(`Sheet ${this.syncState.sheetId} has no headers, skipping sync`);
        return;
      }

      const currentData = this.googleSheets.parseDataFromSheets(sheetData.values, sheetData.headers);
      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const primaryKey = schema.primaryKey[0] || "id";
      const schemaColumns = schema.columns.map(col => col.name);

      // Check if primary key column exists in sheet
      const primaryKeyColumnIndex = sheetData.headers.findIndex(header => header === primaryKey);
      
      // Check if primary key is auto-increment (doesn't need to be in sheet)
      const pkColumn = schema.columns.find(col => col.name === primaryKey);
      const isAutoIncrement = pkColumn?.extra.toLowerCase().includes('auto_increment');
      
      if (primaryKeyColumnIndex === -1 && !isAutoIncrement) {
        throw new Error(
          `Primary key column "${primaryKey}" is missing from sheet "${this.syncState.sheetName}". ` +
            "Column names must exactly match the database schema."
        );
      }
      
      const primaryKeyColumnLetter = primaryKeyColumnIndex !== -1 
        ? this.columnToLetter(primaryKeyColumnIndex + 1)
        : null;

      const cachedSnapshot = await this.redisClient.getCache<SheetSnapshot>(
        `sheet_snapshot_${this.syncState.sheetId}`
      );

      if (cachedSnapshot) {
        this.lastSnapshot = {
          ...cachedSnapshot,
          timestamp: new Date(cachedSnapshot.timestamp)
        };
      }

      if (!this.lastSnapshot) {
        await this.storeSnapshot(currentData);
        logger.info(`Initial snapshot stored for ${this.syncState.sheetId}`);
        return;
      }

      const changes = this.detectChanges(this.lastSnapshot.data, currentData, primaryKey);
      if (changes.added.length === 0 && changes.updated.length === 0 && changes.deleted.length === 0) {
        return;
      }

      logger.info(
        `Detected ${changes.added.length} inserts, ${changes.updated.length} updates, ${changes.deleted.length} deletes`
      );

      const connection = await this.dbManager.getConnection();

      try {
        await connection.query('BEGIN');
        const pendingPrimaryKeyUpdates: Array<{ rowIndex: number; value: any }> = [];

        for (const change of changes.added) {
          const { row, rowIndex } = change;

          try {
            const cleanedRow = this.cleanRowData(row, schemaColumns);

            if (this.hasPrimaryKeyValue(row[primaryKey])) {
              const pk = { [primaryKey]: row[primaryKey] };
              const existing = await this.dbManager.getRowByPrimaryKey(this.syncState.tableName, pk);

              if (existing) {
                if (this.rowsEqual(existing, cleanedRow)) {
                  continue;
                }

                await this.dbManager.updateRow(this.syncState.tableName, pk, cleanedRow);
                  await this.dbManager.markLatestRowChangeSynced(
                    this.syncState.tableName,
                    row[primaryKey],
                    'UPDATE'
                  );
                continue;
              }
            }

            const missingRequired = this.findMissingRequiredColumns(row, schema, primaryKey);
            if (missingRequired.length > 0) {
              logger.warn(
                `Skipping insert for sheet row ${rowIndex} due to missing required columns: ${missingRequired.join(", ")}`
              );
              continue;
            }

            const result = await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
            const insertedPk = this.hasPrimaryKeyValue(row[primaryKey]) ? row[primaryKey] : result?.id;
            await this.dbManager.markLatestRowChangeSynced(
              this.syncState.tableName,
              insertedPk,
              'INSERT'
            );

            if (!this.hasPrimaryKeyValue(row[primaryKey]) && result?.id) {
              pendingPrimaryKeyUpdates.push({ rowIndex, value: result.id });
              row[primaryKey] = result.id;
            }
          } catch (error) {
            logger.error(`Failed to insert row from sheet row ${rowIndex}`, { error });
          }
        }

        for (const change of changes.updated) {
          const { row, rowIndex } = change;

          try {
            if (!this.hasPrimaryKeyValue(row[primaryKey])) {
              logger.warn(
                `Skipping update for sheet row ${rowIndex} because primary key "${primaryKey}" is missing`
              );
              continue;
            }

            const cleanedRow = this.cleanRowData(row, schemaColumns);
            const pk = { [primaryKey]: row[primaryKey] };
            const existing = await this.dbManager.getRowByPrimaryKey(this.syncState.tableName, pk);

            if (existing) {
              const hasConflict = await this.detectConflict(existing, cleanedRow, this.syncState);
              if (hasConflict) {
                await this.handleConflict(existing, cleanedRow, row[primaryKey]);
              } else {
                await this.dbManager.updateRow(this.syncState.tableName, pk, cleanedRow);
                await this.dbManager.markLatestRowChangeSynced(
                  this.syncState.tableName,
                  row[primaryKey],
                  'UPDATE'
                );
              }
            } else {
              const result = await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
              const insertedPk = this.hasPrimaryKeyValue(row[primaryKey]) ? row[primaryKey] : result?.id;
              await this.dbManager.markLatestRowChangeSynced(
                this.syncState.tableName,
                insertedPk,
                'INSERT'
              );
              if (result?.id) {
                pendingPrimaryKeyUpdates.push({ rowIndex, value: result.id });
              }
            }
          } catch (error) {
            logger.error(`Failed to update row from sheet row ${rowIndex}`, { error });
          }
        }

        for (const row of changes.deleted) {
          try {
            if (!this.hasPrimaryKeyValue(row[primaryKey])) {
              continue;
            }

            const pk = { [primaryKey]: row[primaryKey] };
            await this.dbManager.deleteRow(this.syncState.tableName, pk);
            await this.dbManager.markLatestRowChangeSynced(
              this.syncState.tableName,
              row[primaryKey],
              'DELETE'
            );
          } catch (error) {
            logger.error(`Failed to delete row`, { row, error });
          }
        }

        await connection.query('COMMIT');
        await this.storeSnapshot(currentData);

        if (pendingPrimaryKeyUpdates.length > 0 && primaryKeyColumnLetter) {
          const updates = pendingPrimaryKeyUpdates.map(update => ({
            range: GoogleSheetsService.buildRange(
              this.syncState.sheetName,
              `${primaryKeyColumnLetter}${update.rowIndex}:${primaryKeyColumnLetter}${update.rowIndex}`
            ),
            values: [[update.value]]
          }));

          await this.googleSheets.updateCells(this.syncState.sheetId, updates);
        }

        await this.dbManager.getPool().query(
          `UPDATE _sync_config SET last_sync_timestamp = CURRENT_TIMESTAMP WHERE sheet_id = $1`,
          [this.syncState.sheetId]
        );
        const now = new Date();
        this.syncState.lastSheetSync = now.toISOString();
        this.syncState.lastSyncTimestamp = now;

        this.io.to(`sync_${this.syncState.sheetId}`).emit("data_changed", {
          source: "sheets",
          changeCount: changes.added.length + changes.updated.length + changes.deleted.length,
          timestamp: new Date()
        });

        logger.info(`Sheets->MySQL sync completed for ${this.syncState.sheetId}`);
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error(`Sheets->MySQL sync failed for ${this.syncState.sheetId}`, error);

      await this.dbManager.getPool().query(
        `UPDATE _sync_config SET error_message = $1 WHERE sheet_id = $2  `,
        [error instanceof Error ? error.message : String(error), this.syncState.sheetId]
      );

      this.io.to(`sync_${this.syncState.sheetId}`).emit("sync_error", {
        source: "sheets",
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await this.redisClient.releaseLock(lockKey);
    }
  }

  /**
   * Compares the current sheet data with the stored snapshot to identify
   * Added, Updated, and Deleted rows.
   */
  private detectChanges(
    oldData: any[],
    newData: any[],
    primaryKey: string
  ): ChangeDetectionResult {
    const added: SheetRowChange[] = [];
    const updated: SheetRowChange[] = [];
    const deleted: any[] = [];

    const oldMap = new Map<string, any>();
    for (const row of oldData) {
      if (this.hasPrimaryKeyValue(row[primaryKey])) {
        oldMap.set(String(row[primaryKey]), row);
      }
    }

    const newMap = new Map<string, SheetRowChange>();
    newData.forEach((row, index) => {
      const rowIndex = index + 2;
      const key = this.hasPrimaryKeyValue(row[primaryKey]) ? String(row[primaryKey]) : null;

      if (key) {
        newMap.set(key, { row, rowIndex });
      }

      if (!key) {
        added.push({ row, rowIndex });
        return;
      }

      const oldRow = oldMap.get(key);
      if (!oldRow) {
        added.push({ row, rowIndex });
      } else if (JSON.stringify(oldRow) !== JSON.stringify(row)) {
        updated.push({ row, rowIndex });
        // Keeping debug log for traceability
        logger.debug(`Row ${rowIndex} changed:`, { 
            old: oldRow, 
            new: row,
            diff: this.findObjectDiff(oldRow, row) 
        });
      }
    });

    for (const [key, oldRow] of oldMap.entries()) {
      if (!newMap.has(key)) {
        deleted.push(oldRow);
      }
    }

    return { added, updated, deleted };
  }

  private async storeSnapshot(data: any[]): Promise<void> {
    const snapshot: SheetSnapshot = {
      timestamp: new Date(),
      data,
      hash: this.hashData(data)
    };

    this.lastSnapshot = snapshot;
    await this.redisClient.setCache(
      `sheet_snapshot_${this.syncState.sheetId}`,
      snapshot,
      3600
    );
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

  private cleanRowData(row: any, validColumns: string[]): Record<string, any> {
    const ignoredColumns = new Set(["created_at", "updated_at"]);
    const cleaned: Record<string, any> = {};

    for (const col of validColumns) {
      if (ignoredColumns.has(col)) {
        continue;
      }

      if (col in row) {
        const value = row[col];
        cleaned[col] = value === "" ? null : value;
      }
    }

    return cleaned;
  }

  /**
   * Compares a database row with a sheet row, normalizing values to ensure
   * type differences (e.g., string "1" vs number 1) don't trigger false positives.
   */
  private rowsEqual(dbRow: any, newRow: Record<string, any>): boolean {
    for (const [column, sheetValue] of Object.entries(newRow)) {
      const dbValue = dbRow[column];
      if (this.normalizeValue(dbValue) !== this.normalizeValue(sheetValue)) {
        return false;
      }
    }
    return true;
  }

  private normalizeValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const str = String(value).trim();
    
    // Normalize booleans
    if (str.toLowerCase() === 'true') return 'true';
    if (str.toLowerCase() === 'false') return 'false';
    
    return str;
  }

  private findMissingRequiredColumns(row: any, schema: TableSchema, primaryKey: string): string[] {
    return schema.columns
      .filter(col => {
        if (col.name === primaryKey && (col.extra || "").includes("auto_increment")) {
          return false;
        }
        return !col.nullable && col.defaultValue === null;
      })
      .filter(col => !this.hasPrimaryKeyValue(row[col.name]))
      .map(col => col.name);
  }

  private hasPrimaryKeyValue(value: any): boolean {
    return value !== null && value !== undefined && value !== "";
  
  }

  private columnToLetter(column: number): string {
    let temp = column;
    let letter = "";
    while (temp > 0) {
      const mod = (temp - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      temp = Math.floor((temp - mod) / 26);
    }
    return letter;
  }

  private async refreshSyncStateTimestamps(): Promise<void> {
    const result = await this.dbManager.getPool().query(
      `SELECT last_sync_timestamp, last_sheet_sync FROM _sync_config WHERE id = $1`,
      [this.syncState.id]
    );
    const rows = result.rows;

    if (rows.length > 0) {
      const record = rows[0];
      this.syncState.lastSyncTimestamp = record.last_sync_timestamp
        ? new Date(record.last_sync_timestamp)
        : null;
      this.syncState.lastSheetSync = record.last_sheet_sync
        ? new Date(record.last_sheet_sync).toISOString()
        : null;
    }
  }

  private async detectConflict(
    dbRow: any,
    _sheetRow: any,
    syncState: SyncState
  ): Promise<boolean> {
    const lastSync = syncState.lastSyncTimestamp;
    if (!lastSync || !dbRow?.updated_at) {
      return false;
    }

    const dbUpdateTime = new Date(dbRow.updated_at);
    return dbUpdateTime > lastSync;
  }

  private async handleConflict(
    dbRow: any,
    sheetRow: any,
    rowId: any
  ): Promise<void> {
    logger.warn(`Conflict detected for row ${rowId}`);

    const resolutionStatus = this.mapConflictResolutionStatus();

    await this.dbManager.getPool().query(
      `INSERT INTO _sync_conflicts
       (sheet_id, row_identifier, conflict_type, sheet_data, db_data, resolution_strategy)
       VALUES ($1, $2, 'concurrent_update', $3, $4, $5)`,
      [
        this.syncState.sheetId,
        String(rowId),
        JSON.stringify(sheetRow),
        JSON.stringify(dbRow),
        resolutionStatus
      ]
    );

    switch (this.syncState.conflictResolution) {
      case "last_write_wins":
      case "sheet_priority":
        await this.dbManager.updateRow(
          this.syncState.tableName,
          { [Object.keys(dbRow)[0]]: rowId },
          sheetRow
        );
        await this.dbManager.markLatestRowChangeSynced(
          this.syncState.tableName,
          rowId,
          'UPDATE'
        );
        break;
      case "db_priority":
        logger.info(`DB priority: keeping database version for row ${rowId}`);
        break;
      case "manual":
        this.io.to(`sync_${this.syncState.sheetId}`).emit("conflict_detected", {
          rowId,
          sheetData: sheetRow,
          dbData: dbRow
        });
        break;
    }
  }

  private mapConflictResolutionStatus(): "pending" | "sheet_wins" | "db_wins" {
    switch (this.syncState.conflictResolution) {
      case "manual":
        return "pending";
      case "db_priority":
        return "db_wins";
      case "sheet_priority":
      case "last_write_wins":
      default:
        return "sheet_wins";
    }
  }

  private findObjectDiff(obj1: any, obj2: any): any {
    const diff: any = {};
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
    for (const key of keys) {
        if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
            diff[key] = { old: obj1[key], new: obj2[key] };
        }
    }
    return diff;
  }
}
