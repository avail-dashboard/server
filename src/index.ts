import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

import config from './config';
import { logger } from './utils/logger';
import { initializeCorrelationId } from './utils/correlationId';
import { cache } from './utils/cache';
import { db } from './utils/database';
import { serviceFactory } from './services';

// Middleware imports
import {
  requestTimer,
  responseLogger,
  errorHandler,
  notFoundHandler,
  apiRateLimit,
  securityHeaders,
  healthCheck,
  camelCaseResponse,
  correlationIdMiddleware,
} from './middleware';
import testCamelCaseValidator from './middleware/testCamelCaseValidator';

// Route imports
import blockRoutes from './routes/blocks';
import extrinsicRoutes from './routes/extrinsics';
import chainRoutes from './routes/chain';
import searchRoutes from './routes/search';
import accountRoutes from './routes/accounts';
import dataSubmissionRoutes from './routes/data-submissions';
import validatorRoutes from './routes/validators';
import analyticsRoutes from './routes/analytics';
import rollupRoutes from './routes/rollups';
import transferRoutes from './routes/transfers';

class AvailExplorerServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer | null = null;

  constructor() {
    // Initialize correlation ID context
    initializeCorrelationId();
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Correlation ID middleware (must be first to ensure all logs have correlation ID)
    this.app.use(correlationIdMiddleware);
    
    // Security middleware
    this.app.use(helmet());
    this.app.use(securityHeaders);

    // CORS configuration - support multiple origins from environment
    const corsOrigins = config.server.corsOrigin.split(',').map((origin: string) => origin.trim());
    
    this.app.use(cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) {
          return callback(null, true);
        }
        
        // Check if the origin is in our allowed list
        if (corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        // In development, allow localhost with any port
        if (config.server.isDev && origin.startsWith('http://localhost')) {
          return callback(null, true);
        }
        
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type', 
        'Accept', 
        'Authorization',
        'Cache-Control',
        'Pragma',
      ],
      exposedHeaders: ['X-Total-Count'],
      optionsSuccessStatus: 200,
    }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(requestTimer);
    this.app.use(responseLogger);

    // Body parsing middleware with error handling
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf, _encoding) => {
        // Store raw body for potential debugging
        (req as any).rawBody = buf;
      },
    }));
    
    // JSON parsing error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
        logger.warn('JSON parsing error', {
          url: req.url,
          method: req.method,
          ip: req.ip,
          error: err.message,
        });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body',
          },
        });
      }
      next(err);
    });
    
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    if (config.features.rateLimiting) {
      this.app.use(config.api.prefix, apiRateLimit);
    }
  }

  private setupRoutes(): void {
    // Root health endpoint (outside of API versioning)
    this.app.get('/health', healthCheck);

    // API routes
    const apiRouter = express.Router();

    // Health endpoint under API versioning
    apiRouter.get('/health', healthCheck);

    // Apply camelCase middleware to all API routes
    this.app.use(config.api.prefix, camelCaseResponse);

    // Apply test camelCase validator in TEST environment (must be after camelCaseResponse)
    this.app.use(config.api.prefix, testCamelCaseValidator);

    // Mount API routes
    this.app.use(config.api.prefix, apiRouter);

    // Mount specific routes
    this.app.use(`${config.api.prefix}/blocks`, blockRoutes);
    this.app.use(`${config.api.prefix}/extrinsics`, extrinsicRoutes);
    this.app.use(`${config.api.prefix}/chain`, chainRoutes);
    this.app.use(`${config.api.prefix}/search`, searchRoutes);
    this.app.use(`${config.api.prefix}/accounts`, accountRoutes);
    this.app.use(`${config.api.prefix}/data-submissions`, dataSubmissionRoutes);
    this.app.use(`${config.api.prefix}/validators`, validatorRoutes);
    this.app.use(`${config.api.prefix}/analytics`, analyticsRoutes);
    this.app.use(`${config.api.prefix}/rollups`, rollupRoutes);
    this.app.use(`${config.api.prefix}/transfers`, transferRoutes);
  }

  private setupBullBoard(): void {
    try {
      // Get queue service after services are initialized
      const queueService = serviceFactory.get('queueService') as any;
      if (!queueService || !queueService.queue) {
        logger.warn('Queue service not available, skipping Bull Board setup');
        return;
      }

      // Create Bull Board adapters
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');

      const queues = [new BullAdapter(queueService.queue)];
      
      // Add dead letter queue if available
      if (queueService.deadLetterQueue) {
        queues.push(new BullAdapter(queueService.deadLetterQueue));
      }

      createBullBoard({
        queues,
        serverAdapter: serverAdapter,
      });

      // Mount Bull Board
      this.app.use('/admin/queues', serverAdapter.getRouter());
      
      logger.info('Bull Board dashboard mounted at /admin/queues');
    } catch (error) {
      logger.warn('Failed to setup Bull Board dashboard', { error: (error as Error).message });
    }
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
          reason,
        });
      });
    });

    logger.info('WebSocket: Server initialized');
  }

  private async connectServices(): Promise<void> {
    try {
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

      // Wait for database and cache connections
      await Promise.all(services);

      // Initialize ALL services (core + domain) through ServiceFactory
      try {
        await serviceFactory.initializeAllServices();
        logger.info('Services: All services initialized successfully');

        // Setup Bull Board dashboard after services are initialized
        this.setupBullBoard();
      } catch (error) {
        logger.error('Services: Failed to initialize', { error });
        throw error;
      }

      logger.info('Services: All services connected successfully');
    } catch (error) {
      logger.error('Failed to connect services', { error: (error as Error).message });
      throw error;
    }
  }

  private async disconnectServices(): Promise<void> {
    const disconnections = [];

    // Shutdown all services through ServiceFactory (blockchain, queue, domain services)
    try {
      await serviceFactory.shutdown();
      logger.info('Services: All services shutdown completed');
    } catch (error) {
      logger.error('Services: Shutdown error', { error });
    }

    // Disconnect from cache
    if (config.features.caching) {
      disconnections.push(cache.disconnect());
    }

    // Disconnect from database
    disconnections.push(db.disconnect());

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
          // eslint-disable-next-line no-process-exit
          process.exit(0);
        } catch (error) {
          logger.error('Server: Error during graceful shutdown', { error });
          // eslint-disable-next-line no-process-exit
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Server: Uncaught exception', { error });
      throw error;
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Server: Unhandled promise rejection', { reason, promise });
      throw new Error(`Unhandled promise rejection: ${reason}`);
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
      throw error;
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

  // Public methods for testing - allow tests to use the same service setup
  public async initializeServices(): Promise<void> {
    await this.connectServices();
  }

  public async shutdownServices(): Promise<void> {
    await this.disconnectServices();
  }
}

// Create and export server instance
export const server = new AvailExplorerServer();

// Start server if this file is run directly
if (require.main === module) {
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}

export default server; 