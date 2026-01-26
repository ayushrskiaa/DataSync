import { DatabaseManager } from '../database/DatabaseManager';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { RedisClient } from '../services/RedisClient';
import { Server as SocketServer } from 'socket.io';
import { SyncState } from '../types';
import { logger } from '../utils/logger';
import { areRowsEqual, normalizeValue } from '../utils/dataUtils';

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
    const lockKey = `mysql_to_sheets_${this.syncState.sheetId}`;
    const lockAcquired = await this.redisClient.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      return;
    }

    try {
      // 1. Try Triggers first (Performance optimization)
      const changes = await this.dbManager.getUnsyncedChanges(
        this.syncState.tableName,
        this.batchSize
      );

      if (changes.length > 0) {
        logger.info(`Processing ${changes.length} MySQL changes for ${this.syncState.sheetId}`);
        await this.processTriggerChanges(changes);
      } else {
        // 2. Fallback to Polling (Robustness)
        await this.pollingBasedSync();
      }

    } catch (error) {
      logger.error(`MySQL→Sheets sync failed for ${this.syncState.sheetId}`, error);
      
      // Update error status
      await this.dbManager.getPool().query(
        `UPDATE _sync_config SET status = 'error', error_message = $1 WHERE sheet_id = $2`,
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

  // --- TRIGGER BASED SYNC ---
  private async processTriggerChanges(changes: any[]): Promise<void> {
     // Trigger logic is inherently risky if we mix modes, but if we trust it...
     // Since user asked for "Simple and Functional", relying on Polling is safer.
     // However, let's keep this but reuse the 'Apply' logic.
     
     // Currently, the existing trigger logic is complex. 
     // Let's SIMPLIFY: triggers just tell us *something* changed. 
     // We can use that to trigger a polling sync! 
     // This guarantees consistency.
     
     // BUT, to respect the "batch" logic, we might want to process them. 
     // Let's stick to the existing robust logic but cleaner.
     
     const schema = await this.dbManager.getTableSchema(this.syncState.tableName);

     
     // Use the helper to apply changes
     // We need to convert 'changes' structure to { inserts, updates, deletes }
     const structuredChanges = {
        inserts: changes.filter(c => c.operation === 'INSERT').map(c => c.new_data),
        updates: changes.filter(c => c.operation === 'UPDATE').map(c => c.new_data),
        deletes: changes.filter(c => c.operation === 'DELETE').map(c => c.old_data),
     };
     
     await this.applyChangesToSheet(structuredChanges, schema);
     
     const changeIds = changes.map(c => c.id);
     await this.dbManager.markChangesSynced(changeIds);
     await this.updateSyncStateAndSnapshot();
  }


  // --- POLLING BASED SYNC ---
  private async pollingBasedSync(): Promise<void> {
    try {
      const currentMySQLData = await this.dbManager.getTableData(this.syncState.tableName);
      const cachedSnapshot = await this.redisClient.getCache<any[]>(
        `mysql_snapshot_${this.syncState.sheetId}`
      );

      if (!cachedSnapshot) {
        // First run? Just init cache. treating all as inserts might be dangerous if sheet exists.
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
      
      // Update Cache
      await this.redisClient.setCache(
        `mysql_snapshot_${this.syncState.sheetId}`,
        currentMySQLData, // New state is the current DB state
        3600
      );

      await this.updateSyncStateAndSnapshot();

    } catch (error) {
       logger.error(`Polling-based sync failed for ${this.syncState.sheetId}`, error);
       throw error;
    }
  }

  private async updateSyncStateAndSnapshot() {
      // Update timestamp
      await this.dbManager.getPool().query(
        `UPDATE _sync_config SET last_sync_timestamp = NOW() WHERE sheet_id = $1`,
        [this.syncState.sheetId]
      );

      // Update Sheet Snapshot (Echo Prevention)
      const updatedSheetData = await this.googleSheets.readSheet(
        this.syncState.sheetId,
        GoogleSheetsService.buildRange(this.syncState.sheetName, 'A:ZZ')
      );
      const parsedSheetData = this.googleSheets.parseDataFromSheets(
        updatedSheetData.values,
        updatedSheetData.headers
      );
      
      const snapshot = {
          timestamp: new Date(),
          data: parsedSheetData,
          hash: this.hashData(parsedSheetData)
      };

      await this.redisClient.setCache(
        `sheet_snapshot_${this.syncState.sheetId}`,
        snapshot,
        3600
      );
      
      this.io.to(`sync_${this.syncState.sheetId}`).emit('data_changed', {
        source: 'mysql',
        timestamp: new Date()
      });
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
      if (row[primaryKey] != null) oldMap.set(String(row[primaryKey]), row);
    }

    const newMap = new Map<string, any>();
    for (const row of newData) {
      const pkValue = row[primaryKey];
      if (pkValue != null) {
        const key = String(pkValue);
        newMap.set(key, row);

        if (!oldMap.has(key)) {
          inserts.push(row);
        } else {
             const oldRow = oldMap.get(key);
             if (!areRowsEqual(oldRow, row)) {
               updates.push(row);
             }
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

    const rowsToAppend: any[][] = [];
    const updatesToApply: any[] = [...changes.updates];

    // Filter inserts - check if they already exist in the sheet
    if (changes.inserts.length > 0) {
      for (const row of changes.inserts) {
        const pkValue = row[primaryKey];
        const rowIndex = this.findRowIndexByPrimaryKey(
          sheetData.values,
          sheetData.headers,
          primaryKey,
          pkValue
        );

        if (rowIndex !== -1) {
          // It exists! Check if we really need to update it (avoid redundant writes)
          // But to be safe against echo, we treat it as an update if values differ,
          // OR just ignore if values are same.
          // Let's add to updatesToApply to force consistency (database wins)
           updatesToApply.push(row);
        } else {
          // Genuine new row
          const rowData = headers.map((col: string) =>
            normalizeValue(row[col])
          );
          rowsToAppend.push(rowData);
        }
      }
    }

    // Handle Appends
    if (rowsToAppend.length > 0) {
      await this.googleSheets.appendRows(
        this.syncState.sheetId,
        this.syncState.sheetName,
        rowsToAppend
      );
      logger.info(`Appended ${rowsToAppend.length} rows to Google Sheets`);
    }

    // Handle Updates
    if (updatesToApply.length > 0) {
      const updates = [];
      for (const row of updatesToApply) {
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
            normalizeValue(row[col])
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

    // Handle Deletes
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
        // Optimize delete: if contiguous, could be batch, but sort desc is safe
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

    if (mysqlData.length > 0) {
      const rowsToAppend = mysqlData.map(row =>
        headers.map((col: string) => normalizeValue(row[col]))
      );
      await this.googleSheets.appendRows(
        this.syncState.sheetId,
        this.syncState.sheetName,
        rowsToAppend
      );
    }
  }

  // --- HELPERS ---
  
  private hashData(data: any[]): string {
     return require('crypto').createHash('md5').update(JSON.stringify(data)).digest('hex');
  }





  private findRowIndexByPrimaryKey(
    rows: any[][],
    headers: string[],
    pkColumn: string,
    pkValue: any
  ): number {
    const pkIndex = headers.indexOf(pkColumn);
    if (pkIndex === -1) return -1;
    // Use loose equality for safety in finding keys
    return rows.findIndex(row => String(row[pkIndex]) == String(pkValue));
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
