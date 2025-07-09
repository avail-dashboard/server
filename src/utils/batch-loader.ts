import { logger } from './logger';

/**
 * Batch Loader utility to prevent N+1 query problems
 * Groups multiple individual requests into batched operations
 */
export class BatchLoader<K, V> {
  private batchPromise: Promise<Map<K, V | Error>> | null = null;
  private batch: K[] = [];
  
  constructor(
    private batchLoadFn: (keys: K[]) => Promise<Map<K, V>>,
    private options: {
      maxBatchSize?: number;
      batchTimeoutMs?: number;
      cacheKeyFn?: (key: K) => string;
    } = {},
  ) {
    this.options = {
      maxBatchSize: 100,
      batchTimeoutMs: 10,
      ...options,
    };
  }

  /**
   * Load a single item, batching with other concurrent requests
   */
  async load(key: K): Promise<V | null> {
    return new Promise<V | null>((resolve, reject) => {
      this.batch.push(key);

      if (this.batchPromise === null) {
        this.batchPromise = new Promise<Map<K, V | Error>>((resolveBatch) => {
          // Wait for more requests or timeout
          setTimeout(() => {
            this.executeBatch().then(resolveBatch).catch(resolveBatch);
          }, this.options.batchTimeoutMs);
        });
      }

      this.batchPromise
        .then((results) => {
          const result = results.get(key);
          if (result instanceof Error) {
            reject(result);
          } else {
            resolve(result || null);
          }
        })
        .catch(reject);
    });
  }

  /**
   * Load multiple items in a single batch
   */
  async loadMany(keys: K[]): Promise<(V | null)[]> {
    const promises = keys.map(key => this.load(key));
    return Promise.all(promises);
  }

  /**
   * Execute the current batch
   */
  private async executeBatch(): Promise<Map<K, V | Error>> {
    const keysToLoad = [...this.batch];
    this.batch = [];
    this.batchPromise = null;

    if (keysToLoad.length === 0) {
      return new Map();
    }

    try {
      logger.debug('BatchLoader: Executing batch', {
        component: 'batch-loader',
        batchSize: keysToLoad.length,
      });

      // Remove duplicates while preserving order
      const uniqueKeys = Array.from(new Set(keysToLoad));
      
      const results = await this.batchLoadFn(uniqueKeys);
      
      // Ensure all keys have a result (null if not found)
      const finalResults = new Map<K, V | Error>();
      for (const key of keysToLoad) {
        if (results.has(key)) {
          finalResults.set(key, results.get(key) as V);
        } else {
          finalResults.set(key, null as unknown as V); // Will be converted to null in load()
        }
      }

      return finalResults;
    } catch (error) {
      logger.error('BatchLoader: Batch execution failed', {
        component: 'batch-loader',
        error: (error as Error).message,
        batchSize: keysToLoad.length,
      });

      // Return error for all keys in the batch
      const errorResults = new Map<K, V | Error>();
      for (const key of keysToLoad) {
        errorResults.set(key, error as Error);
      }
      return errorResults;
    }
  }

  /**
   * Clear any pending batches
   */
  clearCache(): void {
    this.batch = [];
    this.batchPromise = null;
  }
}

/**
 * Create a batch loader for database operations
 */
export function createBatchLoader<K, V>(
  batchLoadFn: (keys: K[]) => Promise<Map<K, V>>,
  options?: {
    maxBatchSize?: number;
    batchTimeoutMs?: number;
    cacheKeyFn?: (key: K) => string;
  },
): BatchLoader<K, V> {
  return new BatchLoader(batchLoadFn, options);
}

/**
 * Helper function to convert array results to Map for batch loaders
 */
export function arrayToMap<K, V>(
  items: V[], 
  keyFn: (item: V) => K,
): Map<K, V> {
  const map = new Map<K, V>();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return map;
}