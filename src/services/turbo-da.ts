import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import config from '../config';
import { 
  logError, 
  rpcLogger,
  logAvailHttpRequest,
  logAvailHttpResponse,
  logAvailConnectionState,
  logAvailPerformanceMetric,
  logAvailServiceHealth,
  logAvailDataSubmission,
} from '../utils/logger';

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
  private baseURL: string;
  private timeout: number;

  constructor() {
    super();
    
    const turboDAConfig = config.dataSources.turboDA;
    this.baseURL = turboDAConfig.apiEndpoint;
    this.timeout = turboDAConfig.timeout;
    
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
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
        logAvailHttpRequest(
          'turboDA',
          config.method?.toUpperCase() || 'GET',
          `${this.baseURL}${config.url}`,
          config.params || config.data,
          config.headers as Record<string, string>,
        );
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
        const responseSize = JSON.stringify(response.data).length;
        logAvailHttpResponse(
          'turboDA',
          response.config.method?.toUpperCase() || 'GET',
          `${this.baseURL}${response.config.url}`,
          response.status,
          0, // Duration will be calculated in individual methods
          responseSize,
          true,
        );
        return response;
      },
      (error) => {
        const responseSize = error.response?.data ? JSON.stringify(error.response.data).length : 0;
        logAvailHttpResponse(
          'turboDA',
          error.config?.method?.toUpperCase() || 'GET',
          `${this.baseURL}${error.config?.url}`,
          error.response?.status || 0,
          0,
          responseSize,
          false,
          error.message,
        );
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
    const startTime = Date.now();
    try {
      logAvailConnectionState('turboDA', this.baseURL, 'connecting');
      
      // Test connection with stats endpoint (optional)
      try {
        await this.getStats();
        logAvailConnectionState('turboDA', this.baseURL, 'connected');
      } catch {
        // Stats endpoint might not be available, but service can still work
        logAvailConnectionState('turboDA', this.baseURL, 'connected', { 
          note: 'Stats endpoint not available, but service is functional',
        });
        rpcLogger.info('Turbo DA stats endpoint not available, continuing with basic initialization');
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'initialize', duration, true);
      rpcLogger.info('Turbo DA Service initialized successfully');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'initialize', duration, false);
      logAvailConnectionState('turboDA', this.baseURL, 'error', { error: (error as Error).message });
      logError(error as Error, { component: 'turbo-da', action: 'initialize' });
      throw error;
    }
  }

  // ===========================================
  // TURBO DA API METHODS
  // ===========================================

  async submitRawData(data: Buffer): Promise<TurboSubmissionResponse> {
    const startTime = Date.now();
    const dataSize = data.length;
    try {
      logAvailHttpRequest('turboDA', 'POST', `${this.baseURL}/submit/raw`, { dataSize });
      
      const response = await this.httpClient.post('/submit/raw', data, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });
      
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'POST', `${this.baseURL}/submit/raw`, 200, duration, responseSize, true);
      logAvailDataSubmission('turboDA', 0, dataSize, response.data.submissionId, undefined, true);
      logAvailPerformanceMetric('turboDA', 'submitRawData', duration, true, { 
        dataSize,
        submissionId: response.data.submissionId,
      });
      
      rpcLogger.info('Raw data submitted to Turbo DA', {
        submissionId: response.data.submissionId,
        dataSize,
        duration: `${duration}ms`,
      });
      
      // Transform response to match TurboSubmissionResponse interface
      return {
        submission_id: response.data.submissionId || response.data.submission_id,
        data_hash: response.data.dataHash || response.data.data_hash || '',
        status: response.data.status || 'pending',
        block_hash: response.data.blockHash || response.data.block_hash,
        block_number: response.data.blockNumber || response.data.block_number,
        tx_hash: response.data.txHash || response.data.tx_hash,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailDataSubmission('turboDA', 0, dataSize, undefined, undefined, false, (error as Error).message);
      logAvailPerformanceMetric('turboDA', 'submitRawData', duration, false, { dataSize });
      logError(error as Error, { method: 'submitRawData', dataSize });
      throw error;
    }
  }

  async submitJsonData(data: any): Promise<TurboSubmissionResponse> {
    const startTime = Date.now();
    const dataString = JSON.stringify(data);
    const dataSize = Buffer.byteLength(dataString, 'utf8');
    try {
      logAvailHttpRequest('turboDA', 'POST', `${this.baseURL}/submit/json`, data);
      
      const response = await this.httpClient.post('/submit/json', data);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'POST', `${this.baseURL}/submit/json`, 200, duration, responseSize, true);
      logAvailDataSubmission('turboDA', 0, dataSize, response.data.submissionId, undefined, true);
      logAvailPerformanceMetric('turboDA', 'submitJsonData', duration, true, { 
        dataSize,
        submissionId: response.data.submissionId,
      });
      
      rpcLogger.info('JSON data submitted to Turbo DA', {
        submissionId: response.data.submissionId,
        dataSize,
        duration: `${duration}ms`,
      });
      
      // Transform response to match TurboSubmissionResponse interface
      return {
        submission_id: response.data.submissionId || response.data.submission_id,
        data_hash: response.data.dataHash || response.data.data_hash || '',
        status: response.data.status || 'pending',
        block_hash: response.data.blockHash || response.data.block_hash,
        block_number: response.data.blockNumber || response.data.block_number,
        tx_hash: response.data.txHash || response.data.tx_hash,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailDataSubmission('turboDA', 0, dataSize, undefined, undefined, false, (error as Error).message);
      logAvailPerformanceMetric('turboDA', 'submitJsonData', duration, false, { dataSize });
      logError(error as Error, { method: 'submitJsonData', dataSize });
      throw error;
    }
  }

  async submitTextData(text: string): Promise<TurboSubmissionResponse> {
    const startTime = Date.now();
    const dataSize = Buffer.byteLength(text, 'utf8');
    try {
      logAvailHttpRequest('turboDA', 'POST', `${this.baseURL}/submit/text`, { text });
      
      const response = await this.httpClient.post('/submit/text', { text });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'POST', `${this.baseURL}/submit/text`, 200, duration, responseSize, true);
      logAvailDataSubmission('turboDA', 0, dataSize, response.data.submissionId, undefined, true);
      logAvailPerformanceMetric('turboDA', 'submitTextData', duration, true, { 
        dataSize,
        submissionId: response.data.submissionId,
      });
      
      rpcLogger.info('Text data submitted to Turbo DA', {
        submissionId: response.data.submissionId,
        dataSize,
        duration: `${duration}ms`,
      });
      
      // Transform response to match TurboSubmissionResponse interface
      return {
        submission_id: response.data.submissionId || response.data.submission_id,
        data_hash: response.data.dataHash || response.data.data_hash || '',
        status: response.data.status || 'pending',
        block_hash: response.data.blockHash || response.data.block_hash,
        block_number: response.data.blockNumber || response.data.block_number,
        tx_hash: response.data.txHash || response.data.tx_hash,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailDataSubmission('turboDA', 0, dataSize, undefined, undefined, false, (error as Error).message);
      logAvailPerformanceMetric('turboDA', 'submitTextData', duration, false, { dataSize });
      logError(error as Error, { method: 'submitTextData', dataSize });
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

  async getSubmissionStatus(submissionId: string): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('turboDA', 'GET', `${this.baseURL}/status/${submissionId}`, { submissionId });
      
      const response = await this.httpClient.get(`/status/${submissionId}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'GET', `${this.baseURL}/status/${submissionId}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('turboDA', 'getSubmissionStatus', duration, true, { 
        submissionId,
        status: response.data.status,
        responseSize,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'getSubmissionStatus', duration, false, { submissionId });
      logError(error as Error, { method: 'getSubmissionStatus', submissionId });
      throw error;
    }
  }

  async getSubmissionData(submissionId: string): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('turboDA', 'GET', `${this.baseURL}/data/${submissionId}`, { submissionId });
      
      const response = await this.httpClient.get(`/data/${submissionId}`);
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'GET', `${this.baseURL}/data/${submissionId}`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('turboDA', 'getSubmissionData', duration, true, { 
        submissionId,
        responseSize,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'getSubmissionData', duration, false, { submissionId });
      logError(error as Error, { method: 'getSubmissionData', submissionId });
      throw error;
    }
  }

  async getStats(): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('turboDA', 'GET', `${this.baseURL}/stats`);
      
      const response = await this.httpClient.get('/stats');
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'GET', `${this.baseURL}/stats`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('turboDA', 'getStats', duration, true, { responseSize });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'getStats', duration, false);
      logError(error as Error, { method: 'getStats' });
      throw error;
    }
  }

  async getSubmissions(params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<any> {
    const startTime = Date.now();
    try {
      logAvailHttpRequest('turboDA', 'GET', `${this.baseURL}/submissions`, params);
      
      const response = await this.httpClient.get('/submissions', { params });
      const duration = Date.now() - startTime;
      const responseSize = JSON.stringify(response.data).length;
      
      logAvailHttpResponse('turboDA', 'GET', `${this.baseURL}/submissions`, 200, duration, responseSize, true);
      logAvailPerformanceMetric('turboDA', 'getSubmissions', duration, true, { 
        responseSize,
        submissionCount: response.data.submissions?.length || 0,
        ...params,
      });
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'getSubmissions', duration, false, params);
      logError(error as Error, { method: 'getSubmissions', params });
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
          result = await this.submitRawData(item.data as Buffer);
          break;
        case 'json':
          result = await this.submitJsonData(item.data as object);
          break;
        case 'text':
          result = await this.submitTextData(item.data as string);
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

  async pollSubmissionStatus(
    submissionId: string,
    maxAttempts: number = 10,
    intervalMs: number = 5000,
  ): Promise<any> {
    const startTime = Date.now();
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        logAvailPerformanceMetric('turboDA', 'pollSubmissionStatus', 0, true, { 
          submissionId,
          attempt: attempts,
          maxAttempts,
        });
        
        rpcLogger.debug('Polling submission status', {
          submissionId,
          attempt: attempts,
          maxAttempts,
        });
        
        const status = await this.getSubmissionStatus(submissionId);
        
        if (status.status === 'completed' || status.status === 'failed') {
          const duration = Date.now() - startTime;
          logAvailPerformanceMetric('turboDA', 'pollSubmissionStatusComplete', duration, true, { 
            submissionId,
            finalStatus: status.status,
            attempts,
          });
          return status;
        }
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logAvailPerformanceMetric('turboDA', 'pollSubmissionStatusComplete', duration, false, { 
          submissionId,
          attempts,
          error: (error as Error).message,
        });
        logError(error as Error, { method: 'pollSubmissionStatus', submissionId, attempts });
        throw error;
      }
    }
    
    const duration = Date.now() - startTime;
    const timeoutError = new Error(`Polling timeout after ${maxAttempts} attempts`);
    logAvailPerformanceMetric('turboDA', 'pollSubmissionStatusComplete', duration, false, { 
      submissionId,
      attempts,
      error: 'timeout',
    });
    throw timeoutError;
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  isReady(): boolean {
    return this.isInitialized;
  }

  async getServiceHealth(): Promise<{ healthy: boolean; details: any }> {
    const startTime = Date.now();
    try {
      const stats = await this.getStats();
      const duration = Date.now() - startTime;

      const healthDetails = {
        stats,
        endpoint: this.baseURL,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('turboDA', true, healthDetails);
      
      return {
        healthy: true,
        details: healthDetails,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const healthDetails = { 
        error: (error as Error).message,
        endpoint: this.baseURL,
        responseTime: `${duration}ms`,
      };

      logAvailServiceHealth('turboDA', false, healthDetails);
      
      return {
        healthy: false,
        details: healthDetails,
      };
    }
  }

  async shutdown(): Promise<void> {
    const startTime = Date.now();
    try {
      // No persistent connections to close for HTTP-only service
      this.isInitialized = false;
      
      const duration = Date.now() - startTime;
      logAvailConnectionState('turboDA', this.baseURL, 'disconnected', { reason: 'shutdown' });
      logAvailPerformanceMetric('turboDA', 'shutdown', duration, true);
      rpcLogger.info('Turbo DA Service shutdown complete');
    } catch (error) {
      const duration = Date.now() - startTime;
      logAvailPerformanceMetric('turboDA', 'shutdown', duration, false);
      logError(error as Error, { component: 'turbo-da', action: 'shutdown' });
    }
  }
} 