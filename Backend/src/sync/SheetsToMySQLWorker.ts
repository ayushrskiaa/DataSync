import { DatabaseManager } from "../database/DatabaseManager";
import { GoogleSheetsService } from "../services/GoogleSheetsService";
import { RedisClient } from "../services/RedisClient";
import { Server as SocketServer } from "socket.io";
import { SyncState, ChangeDetectionResult, SheetRowChange } from "../types";
import { logger } from "../utils/logger";
import { areRowsEqual, cleanRowForDb } from "../utils/dataUtils";

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
   */
  private async sync(): Promise<void> {
    const lockKey = `sheets_to_mysql_${this.syncState.sheetId}`;
    const lockAcquired = await this.redisClient.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      return;
    }

    try {
      await this.refreshSyncStateTimestamps(); // Load latest timestamps

      const sheetRange = GoogleSheetsService.buildRange(this.syncState.sheetName, "A:ZZ");
      const sheetData = await this.googleSheets.readSheet(this.syncState.sheetId, sheetRange);

      if (!sheetData.headers || sheetData.headers.length === 0) {
        return;
      }

      const currentData = this.googleSheets.parseDataFromSheets(sheetData.values, sheetData.headers);
      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const primaryKey = schema.primaryKey[0] || "id";
      const schemaColumns = schema.columns.map(col => col.name);

      // Validate Primary Key
      const primaryKeyColumnIndex = sheetData.headers.findIndex(header => header === primaryKey);
      const pkColumn = schema.columns.find(col => col.name === primaryKey);
      const isAutoIncrement = pkColumn?.extra.toLowerCase().includes('auto_increment');
      
      if (primaryKeyColumnIndex === -1 && !isAutoIncrement) {
        logger.error(`Primary key ${primaryKey} missing in sheet`);
        return;
      }
      
      const primaryKeyColumnLetter = primaryKeyColumnIndex !== -1 
        ? this.columnToLetter(primaryKeyColumnIndex + 1)
        : null;

      // START SNAPSHOT LOGIC
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

      // DETECT CHANGES
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

        // PROCESS INSERTS
        for (const change of changes.added) {
          const { row, rowIndex } = change;
          try {
            const cleanedRow = cleanRowForDb(row, schemaColumns); // Clean using utils

            // Check if row actually exists (race condition check)
            if (this.hasPrimaryKeyValue(row[primaryKey])) {
              const pk = { [primaryKey]: row[primaryKey] };
              const existing = await this.dbManager.getRowByPrimaryKey(this.syncState.tableName, pk);

              if (existing) {
                // It exists, so it's technically an update or a duplicate.
                // Use robust check to see if we really need to update.
                if (areRowsEqual(existing, cleanedRow)) {
                  continue; // Metadata match, ignore
                }
                
                // Update it
                await this.dbManager.updateRow(this.syncState.tableName, pk, cleanedRow);
                await this.dbManager.markLatestRowChangeSynced(this.syncState.tableName, row[primaryKey], 'UPDATE');
                continue;
              }
            }

            // Perform Insert
            const result = await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
            
            // If we generated an ID, record it to update the Sheet later
            if (!this.hasPrimaryKeyValue(row[primaryKey]) && result?.id) {
               pendingPrimaryKeyUpdates.push({ rowIndex, value: result.id });
               row[primaryKey] = result.id; // UPDATE IN-MEMORY ROW FOR SNAPSHOT
            }

            const insertedPk = this.hasPrimaryKeyValue(row[primaryKey]) ? row[primaryKey] : result?.id;
            await this.dbManager.markLatestRowChangeSynced(this.syncState.tableName, insertedPk, 'INSERT');

          } catch (error) {
            logger.error(`Failed to insert row from sheet row ${rowIndex}`, { error });
          }
        }

        // PROCESS UPDATES
        for (const change of changes.updated) {
          const { row, rowIndex } = change;
          try {
            if (!this.hasPrimaryKeyValue(row[primaryKey])) continue;

            const cleanedRow = cleanRowForDb(row, schemaColumns);
            const pk = { [primaryKey]: row[primaryKey] };
            const existing = await this.dbManager.getRowByPrimaryKey(this.syncState.tableName, pk);

            if (existing) {
                // Robust Check
                if (areRowsEqual(existing, cleanedRow)) continue;

                const hasConflict = await this.detectConflict(existing, cleanedRow, this.syncState);
                if (hasConflict) {
                  await this.handleConflict(existing, cleanedRow, row[primaryKey]);
                } else {
                  await this.dbManager.updateRow(this.syncState.tableName, pk, cleanedRow);
                  await this.dbManager.markLatestRowChangeSynced(this.syncState.tableName, row[primaryKey], 'UPDATE');
                }
            } else {
                // Fallback to insert if not found
                await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
                await this.dbManager.markLatestRowChangeSynced(this.syncState.tableName, row[primaryKey], 'INSERT');
            }
          } catch (error) {
            logger.error(`Failed to update row from sheet row ${rowIndex}`, { error });
          }
        }

        // PROCESS DELETES
        for (const row of changes.deleted) {
          try {
            if (!this.hasPrimaryKeyValue(row[primaryKey])) continue;
            const pk = { [primaryKey]: row[primaryKey] };
            await this.dbManager.deleteRow(this.syncState.tableName, pk);
            await this.dbManager.markLatestRowChangeSynced(this.syncState.tableName, row[primaryKey], 'DELETE');
          } catch (error) {
             logger.error(`Failed to delete row`, { row, error });
          }
        }

        await connection.query('COMMIT');

        // CRITICAL: Update snapshot with data that INCLUDES the new IDs
        await this.storeSnapshot(currentData);

        // Update Sheet with new IDs if any
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

        // Update Config Timestamp
        await this.dbManager.getPool().query(
          `UPDATE _sync_config SET last_sync_timestamp = CURRENT_TIMESTAMP WHERE sheet_id = $1`,
          [this.syncState.sheetId]
        );
        
        // Notify Frontend
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
      // Error Handling
       await this.dbManager.getPool().query(
        `UPDATE _sync_config SET error_message = $1 WHERE sheet_id = $2`,
        [error instanceof Error ? error.message : String(error), this.syncState.sheetId]
      );
    } finally {
      await this.redisClient.releaseLock(lockKey);
    }
  }

  // --- HELPER METHODS ---

  private detectChanges(oldData: any[], newData: any[], primaryKey: string): ChangeDetectionResult {
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
        const oldRow = oldMap.get(key);
        // Use DataUtils for comparison
        if (oldRow && !areRowsEqual(oldRow, row)) {
             updated.push({ row, rowIndex });
        } else if (!oldRow) {
             added.push({ row, rowIndex }); // Should theoretically be an insert or external add
        }
      } else {
        added.push({ row, rowIndex });
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
    return require('crypto').createHash('md5').update(JSON.stringify(data)).digest('hex');
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
    if (result.rows.length > 0) {
       const record = result.rows[0];
       this.syncState.lastSyncTimestamp = record.last_sync_timestamp ? new Date(record.last_sync_timestamp) : null;
    }
  }

  private async detectConflict(dbRow: any, _sheetRow: any, syncState: SyncState): Promise<boolean> {
     const lastSync = syncState.lastSyncTimestamp;
     if (!lastSync || !dbRow?.updated_at) return false;
     return new Date(dbRow.updated_at) > lastSync;
  }

  private async handleConflict(dbRow: any, sheetRow: any, rowId: any): Promise<void> {
    logger.warn(`Conflict detected for row ${rowId}`);
    // Simplified conflict logging
    await this.dbManager.getPool().query(
      `INSERT INTO _sync_conflicts (sheet_id, table_name, row_id, conflict_type, sheet_data, db_data, resolution_strategy) VALUES ($1, $2, $3, 'concurrent_update', $4, $5, 'sheet_wins')`,
      [this.syncState.sheetId, this.syncState.tableName, String(rowId), JSON.stringify(sheetRow), JSON.stringify(dbRow)]
    );
    
    // Default to strict 'sheet_wins' for now as requested by user logic preference usually
     await this.dbManager.updateRow(this.syncState.tableName, { [Object.keys(dbRow)[0]]: rowId }, sheetRow);
  }
}
