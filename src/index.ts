import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import config from './config';
import { logger } from './utils/logger';
import { cache } from './utils/cache';
import { db, createTables } from './utils/database';
import blockchainService from './services/blockchain';

// Middleware imports
import {
  requestTimer,
  responseLogger,
  errorHandler,
  notFoundHandler,
  apiRateLimit,
  securityHeaders,
  healthCheck,
  metricsHandler,
} from './middleware';

// Route imports
import blockRoutes from './routes/blocks';
import extrinsicRoutes from './routes/extrinsics';
import chainRoutes from './routes/chain';
import searchRoutes from './routes/search';
// import accountRoutes from './routes/accounts';
// import validatorRoutes from './routes/validators';
// import analyticsRoutes from './routes/analytics';

class AvailExplorerServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(securityHeaders);

    // CORS configuration
    this.app.use(cors({
      origin: config.server.corsOrigin,
      credentials: false,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(requestTimer);
    this.app.use(responseLogger);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    if (config.features.rateLimiting) {
      this.app.use(config.api.prefix, apiRateLimit);
    }
  }

  private setupRoutes(): void {
    // Health check routes (no rate limiting)
    this.app.get('/health', healthCheck);
    this.app.get('/metrics', metricsHandler);

    // API routes
    const apiRouter = express.Router();

    // Health endpoint under API versioning
    apiRouter.get('/health', healthCheck);

    // Temporary basic routes for testing
    apiRouter.get('/', (req, res) => {
      res.json({
        success: true,
        data: {
          message: 'Avail Blockchain Explorer API',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Mount API routes
    this.app.use(config.api.prefix, apiRouter);

    // Mount specific routes
    this.app.use(`${config.api.prefix}/blocks`, blockRoutes);
    this.app.use(`${config.api.prefix}/extrinsics`, extrinsicRoutes);
    this.app.use(`${config.api.prefix}/chain`, chainRoutes);
    this.app.use(`${config.api.prefix}/search`, searchRoutes);

    // Future route mounting (uncomment when routes are created)
    // this.app.use(`${config.api.prefix}/accounts`, accountRoutes);
    // this.app.use(`${config.api.prefix}/validators`, validatorRoutes);
    // this.app.use(`${config.api.prefix}/analytics`, analyticsRoutes);
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Error handling middleware (must be last)
    this.app.use(errorHandler);
  }

  private setupWebSocket(): void {
    if (!config.features.websockets || !this.server) {
      return;
    }

    this.io = new SocketIOServer(this.server, {
      cors: config.websocket.cors,
      pingTimeout: config.websocket.pingTimeout,
      pingInterval: config.websocket.pingInterval,
    });

    this.io.on('connection', (socket) => {
      logger.info('WebSocket: Client connected', { socketId: socket.id });

      // Handle client subscriptions
      socket.on('subscribe:blocks', () => {
        socket.join('blocks');
        logger.info('WebSocket: Client subscribed to blocks', { socketId: socket.id });
      });

      socket.on('subscribe:extrinsics', () => {
        socket.join('extrinsics');
        logger.info('WebSocket: Client subscribed to extrinsics', { socketId: socket.id });
      });

      socket.on('subscribe:chain', () => {
        socket.join('chain');
        logger.info('WebSocket: Client subscribed to chain stats', { socketId: socket.id });
      });

      socket.on('unsubscribe:all', () => {
        socket.leave('blocks');
        socket.leave('extrinsics');
        socket.leave('chain');
        logger.info('WebSocket: Client unsubscribed from all', { socketId: socket.id });
      });

      socket.on('disconnect', (reason) => {
        logger.info('WebSocket: Client disconnected', { 
          socketId: socket.id, 
          reason 
        });
      });
    });

    logger.info('WebSocket: Server initialized');
  }

  private async connectServices(): Promise<void> {
    const services = [];

    // Connect to Redis cache
    if (config.features.caching) {
      services.push(
        cache.connect().catch(err => {
          logger.error('Failed to connect to Redis cache', { error: err.message });
          throw err;
        }),
      );
    }

    // Connect to PostgreSQL database
    services.push(
      db.connect().catch(err => {
        logger.error('Failed to connect to PostgreSQL database', { error: err.message });
        throw err;
      }),
    );

    // Blockchain service initializes automatically in constructor
    // No explicit connection needed as it's handled internally

    // Wait for all critical services
    await Promise.all(services);

    // Create database tables if they don't exist
    try {
      await createTables();
      logger.info('Database: Tables verified/created successfully');
    } catch (error) {
      logger.error('Database: Failed to create tables', { error });
      throw error;
    }

    logger.info('Services: All services connected successfully');
  }

  private async disconnectServices(): Promise<void> {
    const disconnections = [];

    // Disconnect from cache
    if (config.features.caching) {
      disconnections.push(cache.disconnect());
    }

    // Disconnect from database
    disconnections.push(db.disconnect());

    // Disconnect from blockchain service
    disconnections.push(blockchainService.shutdown());

    await Promise.all(disconnections);
    logger.info('Services: All services disconnected');
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Server: Received ${signal}, initiating graceful shutdown`);
        
        try {
          // Close HTTP server
          if (this.server) {
            await new Promise<void>((resolve) => {
              this.server.close(() => {
                logger.info('Server: HTTP server closed');
                resolve();
              });
            });
          }

          // Close WebSocket server
          if (this.io) {
            this.io.close();
            logger.info('Server: WebSocket server closed');
          }

          // Disconnect from services
          await this.disconnectServices();

          logger.info('Server: Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Server: Error during graceful shutdown', { error });
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Server: Uncaught exception', { error });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Server: Unhandled promise rejection', { reason, promise });
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Connect to all services
      await this.connectServices();

      // Create HTTP server
      this.server = createServer(this.app);

      // Setup WebSocket if enabled
      this.setupWebSocket();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start server
      await new Promise<void>((resolve) => {
        this.server.listen(config.server.port, () => {
          logger.info(`Server: Started on port ${config.server.port}`, {
            port: config.server.port,
            env: config.server.env,
            cors: config.server.corsOrigin,
            features: {
              websockets: config.features.websockets,
              caching: config.features.caching,
              rateLimiting: config.features.rateLimiting,
              analytics: config.features.analytics,
            },
          });
          resolve();
        });
      });

    } catch (error) {
      logger.error('Server: Failed to start', { error });
      process.exit(1);
    }
  }

  // Method to emit WebSocket events (to be used by background jobs)
  public emitToRoom(room: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(room).emit(event, data);
    }
  }

  // Getter for the Express app (useful for testing)
  public getApp(): express.Application {
    return this.app;
  }
}

// Create and export server instance
export const server = new AvailExplorerServer();

// Start server if this file is run directly
if (require.main === module) {
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default server; 