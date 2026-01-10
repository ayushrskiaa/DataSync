import { Router, Request, Response } from 'express';
import { SyncOrchestrator } from '../sync/SyncOrchestrator';
import { asyncHandler } from '../middleware/errorHandler';
import { RowDataPacket } from 'mysql2/promise';

export default (syncOrchestrator: SyncOrchestrator) => {
  const router = Router();

  // Configure new sync
  router.post('/configure', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId, sheetName, tableName, conflictResolution } = req.body;

    if (!sheetId || !tableName) {
      return res.status(400).json({
        success: false,
        error: 'sheetId and tableName are required'
      });
    }

    const syncState = await syncOrchestrator.configureSync({
      sheetId,
      sheetName: sheetName || 'Sheet1',
      tableName,
      conflictResolution: conflictResolution || 'last_write_wins'
    });

    return res.status(201).json({
      success: true,
      data: syncState
    });
  }));

  // Get sync status
  router.get('/status/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    const syncState = await syncOrchestrator.getSyncState(sheetId);

    if (!syncState) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }

    return res.json({
      success: true,
      data: syncState
    });
  }));

  // Get all syncs
  router.get('/list', asyncHandler(async (_req: Request, res: Response) => {
    const syncs = await syncOrchestrator.getAllSyncs();

    res.json({
      success: true,
      data: syncs
    });
  }));

  // Pause sync
  router.post('/pause/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    await syncOrchestrator.pauseSync(sheetId);

    res.json({
      success: true,
      message: 'Sync paused successfully'
    });
  }));

  // Resume sync
  router.post('/resume/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    await syncOrchestrator.resumeSync(sheetId);

    res.json({
      success: true,
      message: 'Sync resumed successfully'
    });
  }));

  // Delete sync configuration
  router.delete('/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    await syncOrchestrator.deleteSyncConfiguration(sheetId);

    res.json({
      success: true,
      message: 'Sync configuration deleted successfully'
    });
  }));

  // Trigger manual sync
  router.post('/trigger/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    await syncOrchestrator.triggerManualSync(sheetId);

    res.json({
      success: true,
      message: 'Manual sync triggered successfully'
    });
  }));

  // Get conflicts for a sync
  router.get('/conflicts/:sheetId', asyncHandler(async (req: Request, res: Response) => {
    const { sheetId } = req.params;
    
    const syncState = await syncOrchestrator.getSyncState(sheetId);
    if (!syncState) {
      return res.status(404).json({
        success: false,
        error: 'Sync configuration not found'
      });
    }

    const pool = syncOrchestrator['dbManager'].getPool();
    const [conflicts] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM _sync_conflicts WHERE sync_state_id = ? ORDER BY created_at DESC`,
      [syncState.id]
    );

    return res.json({
      success: true,
      data: conflicts
    });
  }));

  // Resolve conflict
  router.post('/resolve-conflict', asyncHandler(async (req: Request, res: Response) => {
    const { conflictId, resolution, resolvedData } = req.body;

    if (!conflictId || !resolution) {
      return res.status(400).json({
        success: false,
        error: 'conflictId and resolution are required'
      });
    }

    const pool = syncOrchestrator['dbManager'].getPool();
    await pool.query(
      `UPDATE _sync_conflicts 
       SET resolution = ?, resolved_data = ?, resolved_at = NOW(6), resolved_by = 'manual'
       WHERE id = ?`,
      [resolution, JSON.stringify(resolvedData), conflictId]
    );

    return res.json({
      success: true,
      message: 'Conflict resolved successfully'
    });
  }));

  return router;
};
