import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import blockchainService from './blockchain';
import { 
  Validator, 
  DataSubmission, 
  NetworkStatsSnapshot,
} from '../types/database';

interface SubscriptionOptions {
  appId?: number;
  validatorAddress?: string;
  timeframe?: string;
}

interface ClientSubscription {
  socketId: string;
  rooms: Set<string>;
  filters: Map<string, SubscriptionOptions>;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private clients: Map<string, ClientSubscription> = new Map();
  private isInitialized = false;

  // Subscription counters for monitoring
  private subscriptionStats = {
    validators: 0,
    rollups: 0,
    analytics: 0,
    dataSubmissions: 0,
    total: 0,
  };

  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupEventHandlers();
    this.setupBlockchainSubscriptions();
    this.isInitialized = true;
    logger.info('WebSocket Service: Initialized successfully');
  }

  private setupEventHandlers(): void {
    if (!this.io) {
      return;
    }

    this.io.on('connection', (socket: Socket) => {
      logger.info('WebSocket: Client connected', { socketId: socket.id });
      
      // Initialize client subscription tracking
      this.clients.set(socket.id, {
        socketId: socket.id,
        rooms: new Set(),
        filters: new Map(),
      });

      // ===========================================
      // BASIC SUBSCRIPTIONS (existing)
      // ===========================================

      socket.on('subscribe:blocks', () => {
        this.handleSubscription(socket, 'blocks');
      });

      socket.on('subscribe:extrinsics', () => {
        this.handleSubscription(socket, 'extrinsics');
      });

      socket.on('subscribe:chain', () => {
        this.handleSubscription(socket, 'chain');
      });

      // ===========================================
      // NEW ENHANCED SUBSCRIPTIONS
      // ===========================================

      // Validator subscriptions
      socket.on('subscribe:validators', (options: SubscriptionOptions = {}) => {
        this.handleValidatorSubscription(socket, options);
      });

      socket.on('subscribe:validator', (validatorAddress: string) => {
        this.handleSpecificValidatorSubscription(socket, validatorAddress);
      });

      socket.on('subscribe:staking', () => {
        this.handleStakingSubscription(socket);
      });

      // Rollup subscriptions
      socket.on('subscribe:rollups', () => {
        this.handleRollupSubscription(socket);
      });

      socket.on('subscribe:rollup', (appId: number) => {
        this.handleSpecificRollupSubscription(socket, appId);
      });

      socket.on('subscribe:rollup-leaderboard', () => {
        this.handleRollupLeaderboardSubscription(socket);
      });

      // Analytics subscriptions
      socket.on('subscribe:network-analytics', (timeframe: string = '1h') => {
        this.handleNetworkAnalyticsSubscription(socket, timeframe);
      });

      socket.on('subscribe:gas-tracker', () => {
        this.handleGasTrackerSubscription(socket);
      });

      socket.on('subscribe:data-throughput', () => {
        this.handleDataThroughputSubscription(socket);
      });

      // Data submission subscriptions
      socket.on('subscribe:data-submissions', (options: SubscriptionOptions = {}) => {
        this.handleDataSubmissionSubscription(socket, options);
      });

      socket.on('subscribe:blob-activity', () => {
        this.handleBlobActivitySubscription(socket);
      });

      // ===========================================
      // UNSUBSCRIPTION HANDLERS
      // ===========================================

      socket.on('unsubscribe', (room: string) => {
        this.handleUnsubscription(socket, room);
      });

      socket.on('unsubscribe:all', () => {
        this.handleUnsubscribeAll(socket);
      });

      // ===========================================
      // DISCONNECTION HANDLER
      // ===========================================

      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

      // Send initial connection response
      socket.emit('connected', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        availableSubscriptions: [
          'blocks', 'extrinsics', 'chain',
          'validators', 'validator', 'staking',
          'rollups', 'rollup', 'rollup-leaderboard',
          'network-analytics', 'gas-tracker', 'data-throughput',
          'data-submissions', 'blob-activity',
        ],
      });
    });
  }

  // ===========================================
  // SUBSCRIPTION HANDLERS
  // ===========================================

  private handleSubscription(socket: Socket, room: string): void {
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    this.updateSubscriptionStats(room, 1);
    logger.info('WebSocket: Client subscribed', { 
      socketId: socket.id, 
      room,
    });
  }

  private handleValidatorSubscription(socket: Socket, options: SubscriptionOptions): void {
    const room = 'validators';
    socket.join(room);
    this.addClientToRoom(socket.id, room, options);
    this.updateSubscriptionStats('validators', 1);
    
    logger.info('WebSocket: Client subscribed to validators', { 
      socketId: socket.id, 
      options,
    });

    // Send initial validator data
    this.sendInitialValidatorData(socket);
  }

  private handleSpecificValidatorSubscription(socket: Socket, validatorAddress: string): void {
    const room = `validator:${validatorAddress}`;
    socket.join(room);
    this.addClientToRoom(socket.id, room, { validatorAddress });
    
    logger.info('WebSocket: Client subscribed to specific validator', { 
      socketId: socket.id, 
      validatorAddress,
    });

    // Send initial validator data
    this.sendInitialValidatorDetails(socket, validatorAddress);
  }

  private handleStakingSubscription(socket: Socket): void {
    const room = 'staking';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    
    logger.info('WebSocket: Client subscribed to staking updates', { 
      socketId: socket.id,
    });

    // Send initial staking overview
    this.sendInitialStakingData(socket);
  }

  private handleRollupSubscription(socket: Socket): void {
    const room = 'rollups';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    this.updateSubscriptionStats('rollups', 1);
    
    logger.info('WebSocket: Client subscribed to rollups', { 
      socketId: socket.id,
    });

    // Send initial rollup data
    this.sendInitialRollupData(socket);
  }

  private handleSpecificRollupSubscription(socket: Socket, appId: number): void {
    const room = `rollup:${appId}`;
    socket.join(room);
    this.addClientToRoom(socket.id, room, { appId });
    
    logger.info('WebSocket: Client subscribed to specific rollup', { 
      socketId: socket.id, 
      appId,
    });

    // Send initial rollup details
    this.sendInitialRollupDetails(socket, appId);
  }

  private handleRollupLeaderboardSubscription(socket: Socket): void {
    const room = 'rollup-leaderboard';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    
    logger.info('WebSocket: Client subscribed to rollup leaderboard', { 
      socketId: socket.id,
    });

    // Send initial leaderboard
    this.sendInitialLeaderboard(socket);
  }

  private handleNetworkAnalyticsSubscription(socket: Socket, timeframe: string): void {
    const room = `network-analytics:${timeframe}`;
    socket.join(room);
    this.addClientToRoom(socket.id, room, { timeframe });
    this.updateSubscriptionStats('analytics', 1);
    
    logger.info('WebSocket: Client subscribed to network analytics', { 
      socketId: socket.id, 
      timeframe,
    });

    // Send initial analytics data
    this.sendInitialNetworkAnalytics(socket, timeframe);
  }

  private handleGasTrackerSubscription(socket: Socket): void {
    const room = 'gas-tracker';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    
    logger.info('WebSocket: Client subscribed to gas tracker', { 
      socketId: socket.id,
    });

    // Send initial gas data
    this.sendInitialGasData(socket);
  }

  private handleDataThroughputSubscription(socket: Socket): void {
    const room = 'data-throughput';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    
    logger.info('WebSocket: Client subscribed to data throughput', { 
      socketId: socket.id,
    });

    // Send initial throughput data
    this.sendInitialThroughputData(socket);
  }

  private handleDataSubmissionSubscription(socket: Socket, options: SubscriptionOptions): void {
    const room = 'data-submissions';
    socket.join(room);
    this.addClientToRoom(socket.id, room, options);
    this.updateSubscriptionStats('dataSubmissions', 1);
    
    logger.info('WebSocket: Client subscribed to data submissions', { 
      socketId: socket.id, 
      options,
    });

    // Send initial submission data
    this.sendInitialDataSubmissions(socket, options);
  }

  private handleBlobActivitySubscription(socket: Socket): void {
    const room = 'blob-activity';
    socket.join(room);
    this.addClientToRoom(socket.id, room);
    
    logger.info('WebSocket: Client subscribed to blob activity', { 
      socketId: socket.id,
    });
  }

  // ===========================================
  // UNSUBSCRIPTION HANDLERS
  // ===========================================

  private handleUnsubscription(socket: Socket, room: string): void {
    socket.leave(room);
    this.removeClientFromRoom(socket.id, room);
    this.updateSubscriptionStats(room, -1);
    
    logger.info('WebSocket: Client unsubscribed', { 
      socketId: socket.id, 
      room,
    });
  }

  private handleUnsubscribeAll(socket: Socket): void {
    const client = this.clients.get(socket.id);
    if (client) {
      client.rooms.forEach(room => {
        socket.leave(room);
        this.updateSubscriptionStats(room, -1);
      });
      client.rooms.clear();
      client.filters.clear();
    }
    
    logger.info('WebSocket: Client unsubscribed from all', { 
      socketId: socket.id,
    });
  }

  private handleDisconnection(socket: Socket, reason: string): void {
    const client = this.clients.get(socket.id);
    if (client) {
      client.rooms.forEach(room => {
        this.updateSubscriptionStats(room, -1);
      });
      this.clients.delete(socket.id);
    }
    
    logger.info('WebSocket: Client disconnected', { 
      socketId: socket.id, 
      reason,
    });
  }

  // ===========================================
  // INITIAL DATA SENDERS
  // ===========================================

  private async sendInitialValidatorData(socket: Socket): Promise<void> {
    try {
      const validators = await blockchainService.getValidators();
      socket.emit('validators:initial', {
        validators: validators.slice(0, 20), // Send first 20
        total: validators.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial validator data', { error });
    }
  }

  private async sendInitialValidatorDetails(socket: Socket, validatorAddress: string): Promise<void> {
    try {
      const validator = await blockchainService.getValidatorDetails(validatorAddress);
      if (validator) {
        socket.emit('validator:initial', {
          validator,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('WebSocket: Failed to send initial validator details', { error, validatorAddress });
    }
  }

  private async sendInitialStakingData(socket: Socket): Promise<void> {
    try {
      const stakingOverview = await blockchainService.getStakingOverview();
      socket.emit('staking:initial', {
        overview: stakingOverview,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial staking data', { error });
    }
  }

  private async sendInitialRollupData(socket: Socket): Promise<void> {
    try {
      // TODO: Implement rollup data fetching when database integration is ready
      socket.emit('rollups:initial', {
        rollups: [],
        total: 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial rollup data', { error });
    }
  }

  private async sendInitialRollupDetails(socket: Socket, appId: number): Promise<void> {
    try {
      // TODO: Implement specific rollup details when database integration is ready
      socket.emit('rollup:initial', {
        rollup: null,
        appId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial rollup details', { error, appId });
    }
  }

  private async sendInitialLeaderboard(socket: Socket): Promise<void> {
    try {
      // TODO: Implement leaderboard data when analytics are implemented
      socket.emit('rollup-leaderboard:initial', {
        leaderboard: [],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial leaderboard', { error });
    }
  }

  private async sendInitialNetworkAnalytics(socket: Socket, timeframe: string): Promise<void> {
    try {
      const chainStats = await blockchainService.getChainStats();
      socket.emit('network-analytics:initial', {
        stats: chainStats,
        timeframe,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial network analytics', { error });
    }
  }

  private async sendInitialGasData(socket: Socket): Promise<void> {
    try {
      // TODO: Implement gas data when gas tracking is implemented
      socket.emit('gas-tracker:initial', {
        currentGasPrice: '0',
        trend: [],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial gas data', { error });
    }
  }

  private async sendInitialThroughputData(socket: Socket): Promise<void> {
    try {
      const dataStats = await blockchainService.getDataSubmissionStats();
      socket.emit('data-throughput:initial', {
        stats: dataStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial throughput data', { error });
    }
  }

  private async sendInitialDataSubmissions(socket: Socket, options: SubscriptionOptions): Promise<void> {
    try {
      const submissions = await blockchainService.getDataSubmissions({
        limit: 20,
        appId: options.appId,
      });
      socket.emit('data-submissions:initial', {
        submissions: submissions.submissions,
        total: submissions.total,
        options,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('WebSocket: Failed to send initial data submissions', { error });
    }
  }

  // ===========================================
  // REAL-TIME EVENT EMITTERS
  // ===========================================

  // Emit validator updates
  emitValidatorUpdate(validator: Validator): void {
    if (!this.io) {
      return;
    }
    
    this.io.to('validators').emit('validator:update', {
      validator,
      timestamp: new Date().toISOString(),
    });

    this.io.to(`validator:${validator.address}`).emit('validator:details-update', {
      validator,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit rollup updates
  emitRollupUpdate(appId: number, data: any): void {
    if (!this.io) {
      return;
    }
    
    this.io.to('rollups').emit('rollup:update', {
      appId,
      data,
      timestamp: new Date().toISOString(),
    });

    this.io.to(`rollup:${appId}`).emit('rollup:details-update', {
      appId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit data submission events
  emitDataSubmission(submission: DataSubmission): void {
    if (!this.io) {
      return;
    }
    
    this.io.to('data-submissions').emit('data-submission:new', {
      submission,
      timestamp: new Date().toISOString(),
    });

    this.io.to('blob-activity').emit('blob:new', {
      appId: submission.app_id,
      size: submission.data_size,
      submitter: submission.submitter,
      timestamp: new Date().toISOString(),
    });

    // Update rollup-specific rooms
    this.io.to(`rollup:${submission.app_id}`).emit('rollup:new-submission', {
      submission,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit network analytics updates
  emitNetworkAnalyticsUpdate(stats: NetworkStatsSnapshot): void {
    if (!this.io) {
      return;
    }
    
    // Emit to all analytics rooms
    ['1h', '24h', '7d'].forEach(timeframe => {
      if (this.io) {
        this.io.to(`network-analytics:${timeframe}`).emit('network-analytics:update', {
          stats,
          timeframe,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  // Emit gas price updates
  emitGasPriceUpdate(gasData: any): void {
    if (!this.io) {
      return;
    }
    
    this.io.to('gas-tracker').emit('gas:update', {
      gasData,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit leaderboard updates
  emitLeaderboardUpdate(leaderboard: any[]): void {
    if (!this.io) {
      return;
    }
    
    this.io.to('rollup-leaderboard').emit('leaderboard:update', {
      leaderboard,
      timestamp: new Date().toISOString(),
    });
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private addClientToRoom(socketId: string, room: string, filters?: SubscriptionOptions): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.rooms.add(room);
      if (filters) {
        client.filters.set(room, filters);
      }
    }
  }

  private removeClientFromRoom(socketId: string, room: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.rooms.delete(room);
      client.filters.delete(room);
    }
  }

  private updateSubscriptionStats(room: string, delta: number): void {
    if (room.includes('validator')) {
      this.subscriptionStats.validators += delta;
    } else if (room.includes('rollup')) {
      this.subscriptionStats.rollups += delta;
    } else if (room.includes('analytics') || room.includes('gas') || room.includes('throughput')) {
      this.subscriptionStats.analytics += delta;
    } else if (room.includes('data-submission') || room.includes('blob')) {
      this.subscriptionStats.dataSubmissions += delta;
    }
    
    this.subscriptionStats.total += delta;
  }

  private async setupBlockchainSubscriptions(): Promise<void> {
    try {
      // Subscribe to new blocks and emit updates
      await blockchainService.subscribeToNewBlocks((block) => {
        if (this.io) {
          this.io.to('blocks').emit('block:new', {
            block,
            timestamp: new Date().toISOString(),
          });
        }
      });

      logger.info('WebSocket: Blockchain subscriptions set up successfully');
    } catch (error) {
      logger.error('WebSocket: Failed to set up blockchain subscriptions', { error });
    }
  }

  // ===========================================
  // PUBLIC API METHODS
  // ===========================================

  getStats() {
    return {
      connected_clients: this.clients.size,
      subscription_stats: { ...this.subscriptionStats },
      is_initialized: this.isInitialized,
    };
  }

  getClientDetails() {
    const clientDetails = Array.from(this.clients.entries()).map(([socketId, client]) => ({
      socketId,
      roomCount: client.rooms.size,
      rooms: Array.from(client.rooms),
      filters: Object.fromEntries(client.filters),
    }));

    return clientDetails;
  }

  async shutdown(): Promise<void> {
    if (this.io) {
      this.io.disconnectSockets(true);
      this.clients.clear();
      this.isInitialized = false;
      logger.info('WebSocket Service: Shutdown completed');
    }
  }
}

export default new WebSocketService(); 