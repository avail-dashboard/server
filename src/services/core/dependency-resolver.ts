import { logger, logError } from '../../utils/logger';
import { DependencyResolver } from '../types/self-healing';

/**
 * Simple Dependency Resolver Implementation
 * 
 * Provides loose coupling between services for dependency resolution.
 * Services register their resolver functions and can call each other through this resolver.
 */
export class SimpleDependencyResolver implements DependencyResolver {
  private resolvers: Map<string, (entityId: string) => Promise<any>> = new Map();

  /**
   * Ensure an account exists by calling the registered account resolver
   */
  async ensureAccount(address: string): Promise<any> {
    try {
      logger.debug('DependencyResolver: Ensuring account exists', {
        component: 'dependency-resolver',
        address: address.substring(0, 20) + '...',
      });

      const resolver = this.resolvers.get('account');
      if (!resolver) {
        throw new Error('Account resolver not registered');
      }

      const result = await resolver(address);
      
      logger.debug('DependencyResolver: Account ensured', {
        component: 'dependency-resolver',
        address: address.substring(0, 20) + '...',
      });

      return result;

    } catch (error) {
      logError(error as Error, {
        component: 'dependency-resolver',
        action: 'ensureAccount',
        address: address.substring(0, 20) + '...',
      });
      throw error;
    }
  }

  /**
   * Ensure a block exists by calling the registered block resolver
   */
  async ensureBlock(blockNumber: number): Promise<any> {
    try {
      logger.debug('DependencyResolver: Ensuring block exists', {
        component: 'dependency-resolver',
        blockNumber,
      });

      const resolver = this.resolvers.get('block');
      if (!resolver) {
        throw new Error('Block resolver not registered');
      }

      const result = await resolver(blockNumber.toString());
      
      logger.debug('DependencyResolver: Block ensured', {
        component: 'dependency-resolver',
        blockNumber,
      });

      return result;
    } catch (error) {
      logError(error as Error, { 
        component: 'dependency-resolver',
        action: 'ensureBlock',
        blockNumber,
      });
      throw error;
    }
  }

  /**
   * Ensure a rollup exists by calling the registered rollup resolver
   */
  async ensureRollup(appId: number): Promise<any> {
    try {
      logger.debug('DependencyResolver: Ensuring rollup exists', {
        component: 'dependency-resolver',
        appId,
      });

      const resolver = this.resolvers.get('rollup');
      if (!resolver) {
        throw new Error('Rollup resolver not registered');
      }

      const result = await resolver(appId.toString());
      
      logger.debug('DependencyResolver: Rollup ensured', {
        component: 'dependency-resolver',
        appId,
      });

      return result;

    } catch (error) {
      logError(error as Error, {
        component: 'dependency-resolver',
        action: 'ensureRollup',
        appId,
      });
      throw error;
    }
  }

  /**
   * Register a dependency resolution function for a specific entity type
   */
  registerResolver(entityType: string, resolver: (entityId: string) => Promise<any>): void {
    logger.debug('DependencyResolver: Registering resolver', {
      component: 'dependency-resolver',
      entityType,
    });

    this.resolvers.set(entityType, resolver);
  }

  /**
   * Resolve a dependency by entity type and ID
   */
  async resolve(entityType: string, entityId: string): Promise<any> {
    try {
      logger.debug('DependencyResolver: Resolving dependency', {
        component: 'dependency-resolver',
        entityType,
        entityId: entityType === 'account' ? entityId.substring(0, 20) + '...' : entityId,
      });

      const resolver = this.resolvers.get(entityType);
      if (!resolver) {
        throw new Error(`Resolver for entity type '${entityType}' not registered`);
      }

      const result = await resolver(entityId);
      
      logger.debug('DependencyResolver: Dependency resolved', {
        component: 'dependency-resolver',
        entityType,
        entityId: entityType === 'account' ? entityId.substring(0, 20) + '...' : entityId,
      });

      return result;

    } catch (error) {
      logError(error as Error, {
        component: 'dependency-resolver',
        action: 'resolve',
        entityType,
        entityId: entityType === 'account' ? entityId.substring(0, 20) + '...' : entityId,
      });
      throw error;
    }
  }
}

export const createDependencyResolver = (): SimpleDependencyResolver => {
  return new SimpleDependencyResolver();
}; 