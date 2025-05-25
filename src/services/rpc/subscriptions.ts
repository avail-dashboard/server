import { EventEmitter } from 'events';
import { RPCConnectionManager } from './connection';
import { logError, rpcLogger } from '../../utils/logger';
import {
  RPCSubscription,
  SubscriptionManager,
  RPCConnection,
} from '../../types/rpc';
import { Block } from '../../types';

export class RPCSubscriptionService extends EventEmitter implements SubscriptionManager {
  subscriptions: Map<string, RPCSubscription> = new Map();
  private connectionManager: RPCConnectionManager;
  private isShuttingDown = false;

  constructor(connectionManager: RPCConnectionManager) {
    super();
    this.connectionManager = connectionManager;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('subscription:created', (subscription: RPCSubscription) => {
      rpcLogger.info(`Subscription created: ${subscription.method}`, {
        subscriptionId: subscription.id,
        method: subscription.method,
      });
    });

    this.on('subscription:data', (subscriptionId: string, data: any) => {
      rpcLogger.debug(`Subscription data received: ${subscriptionId}`, {
        subscriptionId,
        dataType: typeof data,
      });
    });

    this.on('subscription:error', (subscriptionId: string, error: Error) => {
      logError(error, {
        subscriptionId,
        component: 'rpc-subscription',
      });
    });

    this.on('subscription:ended', (subscriptionId: string) => {
      rpcLogger.info(`Subscription ended: ${subscriptionId}`, {
        subscriptionId,
      });
    });
  }

  async subscribe<T>(
    method: string,
    params: any[],
    callback: (data: T) => void,
    errorCallback?: (error: Error) => void,
  ): Promise<string> {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: RPCSubscription = {
      id: subscriptionId,
      method,
      params,
      callback,
      errorCallback,
      isActive: false,
      createdAt: new Date(),
    };

    try {
      const connection = this.connectionManager.getHealthyConnection();
      if (!connection) {
        throw new Error('No healthy RPC connections available for subscription');
      }

      const rpcSubscriptionId = await this.createRPCSubscription(
        connection,
        subscription,
      );

      subscription.subscriptionId = rpcSubscriptionId;
      subscription.isActive = true;
      this.subscriptions.set(subscriptionId, subscription);

      this.emit('subscription:created', subscription);
      return subscriptionId;

    } catch (error) {
      if (errorCallback) {
        errorCallback(error as Error);
      }
      logError(error as Error, {
        method,
        params,
        component: 'rpc-subscription',
        action: 'subscribe',
      });
      throw error;
    }
  }

  private async createRPCSubscription(
    connection: RPCConnection,
    subscription: RPCSubscription,
  ): Promise<string> {
    const { method, params } = subscription;
    
    // Parse subscription method
    const methodParts = method.split('.');
    if (methodParts.length !== 2) {
      throw new Error(`Invalid subscription method format: ${method}`);
    }

    const [module, methodName] = methodParts;
    const rpcModule = (connection.api.rpc as any)[module];
    
    if (!rpcModule) {
      throw new Error(`RPC module not found: ${module}`);
    }

    const rpcMethod = rpcModule[methodName];
    if (!rpcMethod) {
      throw new Error(`RPC method not found: ${method}`);
    }

    // Create subscription
    const unsubscribe = await rpcMethod(...params, (data: any) => {
      if (subscription.isActive) {
        subscription.lastUpdate = new Date();
        subscription.callback(data);
        this.emit('subscription:data', subscription.id, data);
      }
    });

    // Store unsubscribe function
    (subscription as any).unsubscribe = unsubscribe;

    return unsubscribe.toString();
  }

  async unsubscribe(id: string): Promise<boolean> {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return false;
    }

    try {
      subscription.isActive = false;
      
      // Call unsubscribe function if available
      const unsubscribeFn = (subscription as any).unsubscribe;
      if (unsubscribeFn && typeof unsubscribeFn === 'function') {
        await unsubscribeFn();
      }

      this.subscriptions.delete(id);
      this.emit('subscription:ended', id);
      
      rpcLogger.info(`Subscription unsubscribed: ${id}`, {
        subscriptionId: id,
        method: subscription.method,
      });

      return true;
    } catch (error) {
      logError(error as Error, {
        subscriptionId: id,
        component: 'rpc-subscription',
        action: 'unsubscribe',
      });
      return false;
    }
  }

  async unsubscribeAll(): Promise<void> {
    const subscriptionIds = Array.from(this.subscriptions.keys());
    
    rpcLogger.info(`Unsubscribing from ${subscriptionIds.length} subscriptions`);

    const unsubscribePromises = subscriptionIds.map(id => this.unsubscribe(id));
    await Promise.allSettled(unsubscribePromises);

    this.subscriptions.clear();
  }

  getActiveSubscriptions(): RPCSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  getSubscriptionById(id: string): RPCSubscription | undefined {
    return this.subscriptions.get(id);
  }

  getSubscriptionsByMethod(method: string): RPCSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      sub => sub.method === method && sub.isActive,
    );
  }

  // ===========================================
  // BLOCKCHAIN-SPECIFIC SUBSCRIPTIONS
  // ===========================================

  async subscribeToNewBlocks(callback: (block: Block) => void): Promise<string> {
    return this.subscribe(
      'chain.subscribeNewHeads',
      [],
      (header: any) => {
        // Transform header to Block format
        const block: Block = {
          number: BigInt(header.number.toString()),
          hash: header.hash.toString(),
          parentHash: header.parentHash.toString(),
          stateRoot: header.stateRoot.toString(),
          timestamp: BigInt(Date.now()),
          extrinsicsCount: 0, // Will be updated when full block is fetched
          extrinsicsRoot: header.extrinsicsRoot.toString(),
          size: 0,
          finalized: false,
        };
        callback(block);
      },
      (error) => {
        logError(error, { component: 'block-subscription' });
      },
    );
  }

  async subscribeToFinalizedBlocks(callback: (block: Block) => void): Promise<string> {
    return this.subscribe(
      'chain.subscribeFinalizedHeads',
      [],
      (header: any) => {
        const block: Block = {
          number: BigInt(header.number.toString()),
          hash: header.hash.toString(),
          parentHash: header.parentHash.toString(),
          stateRoot: header.stateRoot.toString(),
          timestamp: BigInt(Date.now()),
          extrinsicsCount: 0,
          extrinsicsRoot: header.extrinsicsRoot.toString(),
          size: 0,
          finalized: true,
        };
        callback(block);
      },
      (error) => {
        logError(error, { component: 'finalized-block-subscription' });
      },
    );
  }

  async subscribeToAccountBalance(
    address: string,
    callback: (balance: { free: string; reserved: string }) => void,
  ): Promise<string> {
    return this.subscribe(
      'state.subscribeStorage',
      [[`0x${Buffer.from('System Account').toString('hex')}${address}`]],
      (changes: any) => {
        if (changes && changes.length > 0) {
          const accountData = changes[0][1];
          if (accountData) {
            const decoded = JSON.parse(accountData);
            callback({
              free: decoded.data.free,
              reserved: decoded.data.reserved,
            });
          }
        }
      },
      (error) => {
        logError(error, { component: 'balance-subscription', address });
      },
    );
  }

  async subscribeToRuntimeVersion(
    callback: (version: any) => void,
  ): Promise<string> {
    return this.subscribe(
      'state.subscribeRuntimeVersion',
      [],
      callback,
      (error) => {
        logError(error, { component: 'runtime-version-subscription' });
      },
    );
  }

  // ===========================================
  // AVAIL-SPECIFIC SUBSCRIPTIONS
  // ===========================================

  async subscribeToDataAvailability(
    callback: (data: any) => void,
  ): Promise<string> {
    return this.subscribe(
      'kate.subscribeDataAvailability',
      [],
      callback,
      (error) => {
        logError(error, { component: 'data-availability-subscription' });
      },
    );
  }

  async subscribeToApplicationData(
    appId: number,
    callback: (data: any) => void,
  ): Promise<string> {
    return this.subscribe(
      'kate.subscribeApplicationData',
      [appId],
      callback,
      (error) => {
        logError(error, { component: 'app-data-subscription', appId });
      },
    );
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  getSubscriptionStats(): {
    total: number;
    active: number;
    byMethod: Record<string, number>;
  } {
    const allSubscriptions = Array.from(this.subscriptions.values());
    const activeSubscriptions = allSubscriptions.filter(sub => sub.isActive);
    
    const byMethod: Record<string, number> = {};
    activeSubscriptions.forEach(sub => {
        byMethod[sub.method] = (byMethod[sub.method] || 0) + 1;
    });

    return {
      total: allSubscriptions.length,
      active: activeSubscriptions.length,
      byMethod,
    };
  }

  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    
    rpcLogger.info('Cleaning up RPC subscriptions');
    
    await this.unsubscribeAll();
    this.removeAllListeners();
    
    rpcLogger.info('RPC subscription cleanup complete');
  }
} 