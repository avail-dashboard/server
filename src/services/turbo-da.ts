import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import config from '../config';
import { logError, rpcLogger } from '../utils/logger';

export interface TurboSubmissionResponse {
  submission_id: string;
  data_hash: string;
  block_hash?: string;
  block_number?: number;
  tx_hash?: string;
  status: 'pending' | 'submitted' | 'included' | 'finalized' | 'failed';
}

export interface SubmissionInfo {
  submission_id: string;
  data_hash: string;
  data_size: number;
  status: 'pending' | 'submitted' | 'included' | 'finalized' | 'failed';
  created_at: string;
  updated_at: string;
  block_hash?: string;
  block_number?: number;
  tx_hash?: string;
  app_id?: number;
  confirmation_count?: number;
}

export interface PreImageData {
  data: string;
  encoding: 'hex' | 'base64' | 'utf8';
  size: number;
  hash: string;
}

export interface TurboDAStats {
  total_submissions: number;
  pending_submissions: number;
  successful_submissions: number;
  failed_submissions: number;
  average_confirmation_time: number;
  data_throughput: {
    bytes_per_second: number;
    submissions_per_second: number;
  };
}

export class TurboDAService extends EventEmitter {
  private httpClient: AxiosInstance;
  private isInitialized = false;

  constructor() {
    super();
    
    const turboDAConfig = config.dataSources.turboDA;
    
    this.httpClient = axios.create({
      baseURL: turboDAConfig.endpoint,
      timeout: 60000, // Longer timeout for data submissions
      headers: {
        'User-Agent': 'Avail-Explorer/1.0.0',
      },
    });

    this.setupHttpInterceptors();
  }

  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        rpcLogger.debug('Turbo DA HTTP request', {
          method: config.method,
          url: config.url,
          contentType: config.headers?.['Content-Type'],
          dataSize: config.data ? (typeof config.data === 'string' ? config.data.length : Buffer.byteLength(config.data)) : 0,
        });
        return config;
      },
      (error) => {
        logError(error, { component: 'turbo-da-http', action: 'request' });
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        rpcLogger.debug('Turbo DA HTTP response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        logError(error, {
          component: 'turbo-da-http',
          action: 'response',
          status: error.response?.status,
          url: error.config?.url,
        });
        return Promise.reject(error);
      },
    );
  }

  async initialize(): Promise<void> {
    try {
      // Test connection by getting stats (if available)
      try {
        await this.getStats();
      } catch {
        // If stats endpoint doesn't exist, just log and continue
        rpcLogger.info('Turbo DA stats endpoint not available, continuing with basic initialization');
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      rpcLogger.info('Turbo DA Service initialized successfully');
    } catch (error) {
      logError(error as Error, { component: 'turbo-da', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // TURBO DA API METHODS
  // ===========================================

  async submitRawData(data: Buffer, appId = 0): Promise<TurboSubmissionResponse> {
    try {
      const response = await this.httpClient.post('/submit/raw', data, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        params: {
          app_id: appId,
        },
      });
      
      rpcLogger.info('Raw data submitted to Turbo DA', {
        submission_id: response.data.submission_id,
        data_size: data.length,
        app_id: appId,
      });
      
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'submitRawData', dataSize: data.length, appId });
      throw error;
    }
  }

  async submitJsonData(data: object, appId = 0): Promise<TurboSubmissionResponse> {
    try {
      const response = await this.httpClient.post('/submit/json', data, {
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          app_id: appId,
        },
      });
      
      rpcLogger.info('JSON data submitted to Turbo DA', {
        submission_id: response.data.submission_id,
        data_size: JSON.stringify(data).length,
        app_id: appId,
      });
      
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'submitJsonData', dataSize: JSON.stringify(data).length, appId });
      throw error;
    }
  }

  async submitTextData(data: string, appId = 0, encoding: 'utf8' | 'base64' = 'utf8'): Promise<TurboSubmissionResponse> {
    try {
      const buffer = Buffer.from(data, encoding);
      
      const response = await this.httpClient.post('/submit/text', data, {
        headers: {
          'Content-Type': 'text/plain',
        },
        params: {
          app_id: appId,
          encoding,
        },
      });
      
      rpcLogger.info('Text data submitted to Turbo DA', {
        submission_id: response.data.submission_id,
        data_size: buffer.length,
        app_id: appId,
        encoding,
      });
      
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'submitTextData', dataSize: data.length, appId, encoding });
      throw error;
    }
  }

  async fetchPreImage(hash: string): Promise<PreImageData> {
    try {
      const response = await this.httpClient.get(`/preimage/${hash}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'fetchPreImage', hash });
      throw error;
    }
  }

  async getSubmissionInfo(submissionId: string): Promise<SubmissionInfo> {
    try {
      const response = await this.httpClient.get(`/submission/${submissionId}`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getSubmissionInfo', submissionId });
      throw error;
    }
  }

  async getSubmissionStatus(submissionId: string): Promise<{ status: string; block_number?: number }> {
    try {
      const response = await this.httpClient.get(`/submission/${submissionId}/status`);
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getSubmissionStatus', submissionId });
      throw error;
    }
  }

  async getStats(): Promise<TurboDAStats> {
    try {
      const response = await this.httpClient.get('/stats');
      return response.data;
    } catch (error) {
      logError(error as Error, { method: 'getStats' });
      throw error;
    }
  }

  // ===========================================
  // BATCH OPERATIONS
  // ===========================================

  async submitBatchData(dataItems: Array<{
    data: Buffer | object | string;
    type: 'raw' | 'json' | 'text';
    appId?: number;
    encoding?: 'utf8' | 'base64';
  }>): Promise<TurboSubmissionResponse[]> {
    const results: TurboSubmissionResponse[] = [];
    
    for (const item of dataItems) {
      try {
        let result: TurboSubmissionResponse;
        
        switch (item.type) {
          case 'raw':
            result = await this.submitRawData(item.data as Buffer, item.appId);
            break;
          case 'json':
            result = await this.submitJsonData(item.data as object, item.appId);
            break;
          case 'text':
            result = await this.submitTextData(item.data as string, item.appId, item.encoding);
            break;
          default:
            throw new Error(`Unsupported data type: ${item.type}`);
        }
        
        results.push(result);
      } catch (error) {
        logError(error as Error, { method: 'submitBatchData', itemType: item.type });
        // Continue with other items even if one fails
      }
    }
    
    return results;
  }

  async pollSubmissionUntilFinalized(submissionId: string, maxAttempts = 30, intervalMs = 5000): Promise<SubmissionInfo> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const info = await this.getSubmissionInfo(submissionId);
        
        if (info.status === 'finalized') {
          return info;
        }
        
        if (info.status === 'failed') {
          throw new Error(`Submission ${submissionId} failed`);
        }
        
        rpcLogger.debug('Polling submission status', {
          submission_id: submissionId,
          status: info.status,
          attempt: attempts + 1,
        });
        
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        attempts++;
      } catch (error) {
        if (attempts === maxAttempts - 1) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        attempts++;
      }
    }
    
    throw new Error(`Submission ${submissionId} did not finalize within ${maxAttempts} attempts`);
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isReady(): boolean {
    return this.isInitialized;
  }

  async getHealth(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getStats();

      return {
        healthy: true,
        details: {
          service: 'Turbo DA',
          stats,
          initialized: this.isInitialized,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: (error as Error).message },
      };
    }
  }

  async shutdown(): Promise<void> {
    try {
      this.isInitialized = false;
      rpcLogger.info('Turbo DA Service shutdown complete');
    } catch (error) {
      logError(error as Error, { component: 'turbo-da', action: 'shutdown' });
    }
  }
} 