import './config/env';
import express, { Application } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { logger } from './utils/logger';
import { DatabaseManager } from './database/DatabaseManager';
import { RedisClient } from './services/RedisClient';
import { SyncOrchestrator } from './sync/SyncOrchestrator';
import syncRoutes from './routes/sync.routes';
import tableRoutes from './routes/table.routes';
import authRoutes from './routes/auth.routes';
import { setupWebSocket } from './websocket/socketHandler';
import { errorHandler } from './middleware/errorHandler';

const PORT = process.env.PORT || 3001;

class App {
  private app: Application;
  private httpServer;
  private io: SocketServer;
  private dbManager: DatabaseManager;
  private redisClient: RedisClient;
  private syncOrchestrator: SyncOrchestrator;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketServer(this.httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    this.dbManager = DatabaseManager.getInstance();
    this.redisClient = RedisClient.getInstance();
    this.syncOrchestrator = new SyncOrchestrator(this.dbManager, this.redisClient, this.io);
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: this.dbManager.isConnected() ? 'connected' : 'disconnected',
        redis: this.redisClient.isConnected() ? 'connected' : 'disconnected'
      });
    });

    // API routes
    this.app.use('/api/sync', syncRoutes(this.syncOrchestrator));
    this.app.use('/api/tables', tableRoutes(this.dbManager));
    this.app.use('/api/auth', authRoutes);

    // Error handling
    this.app.use(errorHandler);
  }

  private setupWebSocketHandlers(): void {
    setupWebSocket(this.io, this.syncOrchestrator);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing application...');

      // Connect to database
      await this.dbManager.connect();
      logger.info('Database connected');

      // Connect to Redis
      await this.redisClient.connect();
      logger.info('Redis connected');

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocketHandlers();

      // Start sync orchestrator
      await this.syncOrchestrator.initialize();
      logger.info('Sync orchestrator initialized');

    } catch (error) {
      logger.error('Failed to initialize application', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    await this.initialize();

    this.httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully...');

    try {
      // Stop accepting new connections
      this.httpServer.close();

      // Stop sync orchestrator
      await this.syncOrchestrator.stop();

      // Close database connections
      await this.dbManager.disconnect();

      // Close Redis connection
      await this.redisClient.disconnect();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start application
const app = new App();
app.start().catch((error) => {
  logger.error('Failed to start application', error);
  process.exit(1);
});
