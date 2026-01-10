import { DatabaseManager } from '../database/DatabaseManager';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { RedisClient } from '../services/RedisClient';
import { Server as SocketServer } from 'socket.io';
import { SyncState, ChangeDetectionResult } from '../types';
import { logger } from '../utils/logger';

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
  private running: boolean = false;
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
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL_MS || '2000');
  }

  start(): void {
    if (this.running) {
      logger.warn(`Sheets→MySQL worker already running for ${this.syncState.sheetId}`);
      return;
    }

    this.running = true;
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
    logger.info(`Sheets→MySQL worker started for ${this.syncState.sheetId}`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info(`Sheets→MySQL worker stopped for ${this.syncState.sheetId}`);
  }

  async syncNow(): Promise<void> {
    await this.sync();
  }

  private async sync(): Promise<void> {
    // Acquire lock to prevent concurrent syncs
    const lockKey = `sheets_to_mysql_${this.syncState.sheetId}`;
    const lockAcquired = await this.redisClient.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      logger.debug(`Could not acquire lock for ${lockKey}, skipping sync`);
      return;
    }

    try {
      // Read current sheet data
      const sheetData = await this.googleSheets.readSheet(
        this.syncState.sheetId,
        `${this.syncState.sheetName}!A:ZZ`
      );

      // Parse data
      const currentData = this.googleSheets.parseDataFromSheets(
        sheetData.values,
        sheetData.headers
      );

      // Get table schema
      const schema = await this.dbManager.getTableSchema(this.syncState.tableName);
      const primaryKey = schema.primaryKey[0] || 'id';

      // Check for changes
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
        // First sync - just store snapshot
        await this.storeSnapshot(currentData);
        logger.info(`Initial snapshot stored for ${this.syncState.sheetId}`);
        return;
      }

      // Detect changes
      const changes = this.detectChanges(this.lastSnapshot.data, currentData, primaryKey);

      if (changes.added.length === 0 && changes.updated.length === 0 && changes.deleted.length === 0) {
        return; // No changes detected
      }

      logger.info(
        `Detected ${changes.added.length} inserts, ${changes.updated.length} updates, ${changes.deleted.length} deletes`
      );

      // Apply changes to MySQL
      const connection = await this.dbManager.getConnection();
      
      try {
        await connection.beginTransaction();

        // Process inserts
        for (const row of changes.added) {
          try {
            const cleanedRow = this.cleanRowData(row, schema.columns.map(c => c.name));
            await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
          } catch (error) {
            logger.error(`Failed to insert row`, { row, error });
          }
        }

        // Process updates
        for (const row of changes.updated) {
          try {
            const cleanedRow = this.cleanRowData(row, schema.columns.map(c => c.name));
            const pk = { [primaryKey]: row[primaryKey] };
            
            // Check if row exists
            const existing = await this.dbManager.getRowByPrimaryKey(
              this.syncState.tableName,
              pk
            );

            if (existing) {
              // Check for conflicts
              const hasConflict = await this.detectConflict(
                existing,
                cleanedRow,
                this.syncState
              );

              if (hasConflict) {
                await this.handleConflict(existing, cleanedRow, row[primaryKey]);
              } else {
                await this.dbManager.updateRow(this.syncState.tableName, pk, cleanedRow);
              }
            } else {
              // Row doesn't exist, treat as insert
              await this.dbManager.insertRow(this.syncState.tableName, cleanedRow);
            }
          } catch (error) {
            logger.error(`Failed to update row`, { row, error });
          }
        }

        // Process deletes
        for (const row of changes.deleted) {
          try {
            const pk = { [primaryKey]: row[primaryKey] };
            await this.dbManager.deleteRow(this.syncState.tableName, pk);
          } catch (error) {
            logger.error(`Failed to delete row`, { row, error });
          }
        }

        await connection.commit();

        // Update snapshot
        await this.storeSnapshot(currentData);

        // Update sync state
        await this.dbManager.getPool().query(
          `UPDATE _sync_state SET last_sheet_sync = NOW() WHERE sheet_id = ?`,
          [this.syncState.sheetId]
        );

        // Emit sync event
        this.io.to(`sync_${this.syncState.sheetId}`).emit('data_changed', {
          source: 'sheets',
          changeCount: changes.added.length + changes.updated.length + changes.deleted.length,
          timestamp: new Date()
        });

        logger.info(`Sheets→MySQL sync completed for ${this.syncState.sheetId}`);

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error) {
      logger.error(`Sheets→MySQL sync failed for ${this.syncState.sheetId}`, error);

      // Update error status
      await this.dbManager.getPool().query(
        `UPDATE _sync_state SET status = 'error', error_message = ? WHERE sheet_id = ?`,
        [error instanceof Error ? error.message : String(error), this.syncState.sheetId]
      );

      this.io.to(`sync_${this.syncState.sheetId}`).emit('sync_error', {
        source: 'sheets',
        error: error instanceof Error ? error.message : String(error)
      });

    } finally {
      await this.redisClient.releaseLock(lockKey);
    }
  }

  private detectChanges(
    oldData: any[],
    newData: any[],
    primaryKey: string
  ): ChangeDetectionResult {
    const added: any[] = [];
    const updated: any[] = [];
    const deleted: any[] = [];

    // Create maps for efficient lookup
    const oldMap = new Map(oldData.map(row => [String(row[primaryKey]), row]));
    const newMap = new Map(newData.map(row => [String(row[primaryKey]), row]));

    // Find added and updated rows
    for (const [key, newRow] of newMap.entries()) {
      if (!oldMap.has(key)) {
        added.push(newRow);
      } else {
        const oldRow = oldMap.get(key);
        if (JSON.stringify(oldRow) !== JSON.stringify(newRow)) {
          updated.push(newRow);
        }
      }
    }

    // Find deleted rows
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
      3600 // 1 hour TTL
    );
  }

  private hashData(data: any[]): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private cleanRowData(row: any, validColumns: string[]): Record<string, any> {
    const ignoredColumns = new Set(['created_at', 'updated_at']);
    const cleaned: Record<string, any> = {};
    for (const col of validColumns) {
      if (ignoredColumns.has(col)) {
        continue;
      }
      if (col in row) {
        const value = row[col];
        // Convert empty strings to null
        cleaned[col] = value === '' ? null : value;
      }
    }
    return cleaned;
  }

  private async detectConflict(
    dbRow: any,
    _sheetRow: any,
    syncState: SyncState
  ): Promise<boolean> {
    // Check if database row was modified after last sync
    const lastSync = syncState.lastSyncTimestamp;
    if (!lastSync) return false;

    // If row has updated_at timestamp, check if it's newer than last sync
    if (dbRow.updated_at) {
      const dbUpdateTime = new Date(dbRow.updated_at);
      if (dbUpdateTime > lastSync) {
        return true; // Concurrent modification detected
      }
    }

    return false;
  }

  private async handleConflict(
    dbRow: any,
    sheetRow: any,
    rowId: any
  ): Promise<void> {
    logger.warn(`Conflict detected for row ${rowId}`);

    // Log conflict to database
    await this.dbManager.getPool().query(
      `INSERT INTO _sync_conflicts 
       (sync_state_id, row_identifier, conflict_type, sheet_data, db_data, sheet_timestamp, db_timestamp, resolution)
       VALUES (?, ?, 'concurrent_update', ?, ?, NOW(6), NOW(6), ?)`,
      [
        this.syncState.id,
        String(rowId),
        JSON.stringify(sheetRow),
        JSON.stringify(dbRow),
        this.syncState.conflictResolution === 'manual' ? 'pending' : this.syncState.conflictResolution
      ]
    );

    // Apply conflict resolution strategy
    switch (this.syncState.conflictResolution) {
      case 'last_write_wins':
        // Sheet wins (it's the most recent change)
        await this.dbManager.updateRow(
          this.syncState.tableName,
          { [Object.keys(dbRow)[0]]: rowId },
          sheetRow
        );
        break;

      case 'sheet_priority':
        // Sheet always wins
        await this.dbManager.updateRow(
          this.syncState.tableName,
          { [Object.keys(dbRow)[0]]: rowId },
          sheetRow
        );
        break;

      case 'db_priority':
        // DB wins, revert sheet (this would need additional implementation)
        logger.info(`DB priority: keeping database version for row ${rowId}`);
        break;

      case 'manual':
        // Emit conflict event for manual resolution
        this.io.to(`sync_${this.syncState.sheetId}`).emit('conflict_detected', {
          rowId,
          sheetData: sheetRow,
          dbData: dbRow
        });
        break;
    }
  }
}
