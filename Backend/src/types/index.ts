export interface SyncConfig {
  sheetId: string;
  sheetName: string;
  tableName: string;
  conflictResolution: 'last_write_wins' | 'manual' | 'sheet_priority' | 'db_priority';
}

export interface SyncState {
  id: number;
  sheetId: string;
  sheetName: string;
  tableName: string;
  lastSyncTimestamp: Date | null;
  lastSheetSync: string | null;
  status: 'active' | 'paused' | 'error';
  errorMessage: string | null;
  conflictResolution: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangelogEntry {
  id: number;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  rowId: string;
  oldData: any;
  newData: any;
  timestamp: Date;
  synced: boolean;
  syncTimestamp: Date | null;
}

export interface Conflict {
  id: number;
  syncStateId: number;
  rowIdentifier: string;
  conflictType: 'concurrent_update' | 'delete_update' | 'schema_mismatch';
  sheetData: any;
  dbData: any;
  sheetTimestamp: Date | null;
  dbTimestamp: Date | null;
  resolution: 'pending' | 'sheet_wins' | 'db_wins' | 'merged' | 'manual';
  resolvedData: any;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnDefinition[];
  primaryKey: string[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: any;
  key: string;
  extra: string;
}

export interface SheetData {
  values: any[][];
  headers: string[];
}

export interface SyncResult {
  success: boolean;
  changesSynced: number;
  conflictsDetected: number;
  errors: string[];
}

export interface ChangeDetectionResult {
  added: any[];
  updated: any[];
  deleted: any[];
}
