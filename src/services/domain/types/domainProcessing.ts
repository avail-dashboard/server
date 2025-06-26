/**
 * Domain Processing Types for Phase 3
 * 
 * Types for enhanced domain processing coordination and orchestration
 */

import { BlockData } from '../../types/blockchain';

export interface DomainProcessingMetadata {
  extrinsicsCount: number;
  eventsCount: number;
  processingComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedProcessingTime: number;
  hasValidatorExtrinsics?: boolean;
  hasLargeDataSubmissions?: boolean;
  requiresSequentialProcessing?: boolean;
}

export interface IndexingWithDomainResult {
  blockData: BlockData;
  readyForDomainProcessing: boolean;
  domainProcessingMetadata: DomainProcessingMetadata;
}

export interface ServiceResult {
  serviceName: string;
  success: boolean;
  extractedCount?: number;
  processedCount?: number;
  processingTime: number;
  error?: string;
  retryAttempts?: number;
}

export interface DomainProcessingResult {
  blockNumber: number;
  totalServices: number;
  successfulServices: number;
  failedServices: number;
  totalProcessingTime: number;
  strategy: 'PARALLEL' | 'SEQUENTIAL';
  serviceResults: ServiceResult[];
  overallSuccess: boolean;
  correlationId?: string;
}

export interface DomainProcessingStrategy {
  type: 'PARALLEL' | 'SEQUENTIAL';
  reason: string;
  expectedDuration: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DomainProcessorConfig {
  enableParallelProcessing: boolean;
  maxRetryAttempts: number;
  timeoutMs: number;
  criticalServices: string[];
  sequentialThreshold: {
    extrinsicsCount: number;
    eventsCount: number;
  };
}

export interface ExtractedEntities {
  accounts: any[];
  validators: any[];
  transfers: any[];
  dataSubmissions: any[];
  [key: string]: any[];
}

export interface ProcessingContext {
  blockNumber: number;
  correlationId?: string;
  startTime: number;
  strategy: 'PARALLEL' | 'SEQUENTIAL';
  metadata: DomainProcessingMetadata;
}

export const DEFAULT_DOMAIN_PROCESSOR_CONFIG: DomainProcessorConfig = {
  enableParallelProcessing: true,
  maxRetryAttempts: 3,
  timeoutMs: 30000,
  criticalServices: ['account', 'validator'],
  sequentialThreshold: {
    extrinsicsCount: 50,
    eventsCount: 200,
  },
}; 