import { Server as SocketServer, Socket } from 'socket.io';
import { SyncOrchestrator } from '../sync/SyncOrchestrator';
import { logger } from '../utils/logger';

export const setupWebSocket = (io: SocketServer, syncOrchestrator: SyncOrchestrator): void => {
  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join sync room
    socket.on('join_sync', (sheetId: string) => {
      socket.join(`sync_${sheetId}`);
      logger.info(`Client ${socket.id} joined sync room: ${sheetId}`);
    });

    // Leave sync room
    socket.on('leave_sync', (sheetId: string) => {
      socket.leave(`sync_${sheetId}`);
      logger.info(`Client ${socket.id} left sync room: ${sheetId}`);
    });

    // Trigger manual sync
    socket.on('trigger_sync', async (sheetId: string) => {
      try {
        await syncOrchestrator.triggerManualSync(sheetId);
        socket.emit('sync_triggered', { sheetId, success: true });
      } catch (error) {
        socket.emit('sync_triggered', {
          sheetId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get sync status
    socket.on('get_sync_status', async (sheetId: string) => {
      try {
        const syncState = await syncOrchestrator.getSyncState(sheetId);
        socket.emit('sync_status', syncState);
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
};
