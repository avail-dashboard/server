// Simple Service Container - Replaces Complex ServiceFactory
// No dependency injection, no factories, no complex orchestration

import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

// Core Services
import { AvailBlockchainService } from './core/avail-blockchain';
import { AvailConnectionManager } from './core/avail-connection-manager';

// API Services (use factory functions for correct instantiation)
import { createBlockApiService } from './domain/block';
import { createExtrinsicService } from './domain/extrinsic';
import { createDataSubmissionApiService } from './domain/dataSubmission';
import { createAccountApiService } from './domain/account';
import { createValidatorApiService } from './domain/validator';
import { createTransferApiService } from './domain/transfer';
import { createSearchService } from './domain/search';
import { createChainService } from './domain/chain';
import { createAnalyticsService } from './analytics/analytics';

// Database repositories (keep for API services)
import { 
  blockRepository,
  dataSubmissionRepository,
  extrinsicRepository,
  validatorRepository,
  transferRepository,
  accountRepository,
} from '../database/repositories';

// Mappers for API services
import {
  BlockMapper,
  ExtrinsicMapper,
  DataSubmissionMapper,
} from '../mappers';

/**
 * Ultra-Simple Service Container
 * Direct instantiation - no factories, no DI, no complexity
 */
export class SimpleServiceContainer {
  private blockchain: AvailBlockchainService;
  private connectionManager: AvailConnectionManager;
  private db: PrismaClient;
  
  // API Services (initialized in initialize method)
  private blockApi!: any;
  private extrinsicApi!: any;
  private dataSubmissionApi!: any;
  private accountApi!: any;
  private validatorApi!: any;
  private transferApi!: any;
  private searchApi!: any;
  private chainApi!: any;
  private analyticsApi!: any;
  
  constructor() {
    // Simple direct instantiation
    this.db = new PrismaClient();
    this.connectionManager = new AvailConnectionManager([]);
    this.blockchain = new AvailBlockchainService();
  }
  
  async initialize(): Promise<void> {
    try {
      logger.info('🔧 Initializing simplified services...');
      
      // Just connect to blockchain - no complex orchestration
      await this.blockchain.start();
      
      // Initialize API services using factory functions with basic dependencies
      // (Some may fail, but the container will still work for basic functionality)
      try {
        this.blockApi = createBlockApiService(blockRepository, this.blockchain, new BlockMapper());
        this.extrinsicApi = createExtrinsicService(extrinsicRepository, new ExtrinsicMapper(), this.blockchain, validatorRepository);
        this.dataSubmissionApi = createDataSubmissionApiService(dataSubmissionRepository, this.blockchain, new DataSubmissionMapper());
        this.accountApi = createAccountApiService(accountRepository, this.blockchain, transferRepository, extrinsicRepository, validatorRepository);
        this.validatorApi = createValidatorApiService(validatorRepository, this.blockchain, blockRepository, transferRepository, extrinsicRepository, accountRepository);
        this.transferApi = createTransferApiService(transferRepository, accountRepository, extrinsicRepository);
        this.searchApi = createSearchService(blockRepository, extrinsicRepository, accountRepository, validatorRepository);
        this.chainApi = createChainService(this.blockchain);
        this.analyticsApi = createAnalyticsService(this.blockchain, blockRepository, extrinsicRepository, transferRepository, validatorRepository, dataSubmissionRepository);
        logger.info('✅ All API services initialized');
      } catch (error) {
        logger.warn('⚠️ Some API services failed to initialize, but core functionality available', { error });
      }
      
      logger.info('✅ Simple services initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize simple services:', error);
      throw error;
    }
  }
  
  // Simple service access - no complex lookup
  getServices() {
    return {
      blockchain: this.blockchain,
      db: this.db,
      
      // API services ready to use
      blocks: this.blockApi,
      extrinsics: this.extrinsicApi,
      dataSubmissions: this.dataSubmissionApi,
      accounts: this.accountApi,
      validators: this.validatorApi,
      transfers: this.transferApi,
      search: this.searchApi,
      chain: this.chainApi,
      analytics: this.analyticsApi,
    };
  }
  
  // Simple cleanup
  async shutdown(): Promise<void> {
    try {
      if (this.blockchain) {
        await this.blockchain.stop();
      }
      if (this.db) {
        await this.db.$disconnect();
      }
      logger.info('✅ Services shutdown complete');
    } catch (error) {
      logger.error('❌ Error during service shutdown:', error);
    }
  }
}

// Export simple instance - no singleton complexity
export const simpleServices = new SimpleServiceContainer();