import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../database/DatabaseManager';
import { asyncHandler } from '../middleware/errorHandler';

export default (dbManager: DatabaseManager) => {
  const router = Router();

  // List all tables
  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    const tables = await dbManager.listTables();

    res.json({
      success: true,
      data: tables
    });
  }));

  // Get table schema
  router.get('/:tableName/schema', asyncHandler(async (req: Request, res: Response) => {
    const { tableName } = req.params;
    const schema = await dbManager.getTableSchema(tableName);

    res.json({
      success: true,
      data: schema
    });
  }));

  // Get table data
  router.get('/:tableName/data', asyncHandler(async (req: Request, res: Response) => {
    const { tableName } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    
    const data = await dbManager.getTableData(tableName, limit);

    res.json({
      success: true,
      data,
      count: data.length
    });
  }));

  // Insert row
  router.post('/:tableName/rows', asyncHandler(async (req: Request, res: Response) => {
    const { tableName } = req.params;
    const rowData = req.body;

    const result = await dbManager.insertRow(tableName, rowData);

    res.status(201).json({
      success: true,
      data: result
    });
  }));

  // Update row
  router.put('/:tableName/rows', asyncHandler(async (req: Request, res: Response) => {
    const { tableName } = req.params;
    const { primaryKey, data } = req.body;

    if (!primaryKey || !data) {
      res.status(400).json({
        success: false,
        error: 'primaryKey and data are required'
      });
      return;
    }

    const result = await dbManager.updateRow(tableName, primaryKey, data);

    res.json({
      success: true,
      data: result
    });
  }));

  // Delete row
  router.delete('/:tableName/rows', asyncHandler(async (req: Request, res: Response) => {
    const { tableName } = req.params;
    const { primaryKey } = req.body;

    if (!primaryKey) {
      return res.status(400).json({
        success: false,
        error: 'primaryKey is required'
      });
    }

    const result = await dbManager.deleteRow(tableName, primaryKey);

    return res.json({
      success: true,
      data: result
    });
  }));

  return router;
};
