// Domain Services Factory
// Provides factory functions for creating domain service instances

import db from '../../utils/database';
import { blockchainService } from '../core/blockchain';
import { BlockService, createBlockService } from './block';
import { ExtrinsicService, createExtrinsicService } from './extrinsic';
import { DataAvailabilityService, createDataAvailabilityService } from './dataAvailability';

// Export service classes
export { BlockService } from './block';
export { ExtrinsicService } from './extrinsic';
export { DataAvailabilityService } from './dataAvailability';

// Export factory functions
export { createBlockService } from './block';
export { createExtrinsicService } from './extrinsic';
export { createDataAvailabilityService } from './dataAvailability';

// Domain Services Factory Class
export class DomainServiceFactory {
  private static instance: DomainServiceFactory;
  private blockService: BlockService | null = null;
  private extrinsicService: ExtrinsicService | null = null;
  private dataAvailabilityService: DataAvailabilityService | null = null;

  private constructor() {}

  static getInstance(): DomainServiceFactory {
    if (!DomainServiceFactory.instance) {
      DomainServiceFactory.instance = new DomainServiceFactory();
    }
    return DomainServiceFactory.instance;
  }

  // Get or create BlockService instance
  getBlockService(): BlockService {
    if (!this.blockService) {
      this.blockService = createBlockService(db, blockchainService);
    }
    return this.blockService;
  }

  // Get or create ExtrinsicService instance
  getExtrinsicService(): ExtrinsicService {
    if (!this.extrinsicService) {
      this.extrinsicService = createExtrinsicService(db, blockchainService);
    }
    return this.extrinsicService;
  }

  // Get or create DataAvailabilityService instance
  getDataAvailabilityService(): DataAvailabilityService {
    if (!this.dataAvailabilityService) {
      this.dataAvailabilityService = createDataAvailabilityService(db, blockchainService);
    }
    return this.dataAvailabilityService;
  }

  // Reset all services (useful for testing)
  reset(): void {
    this.blockService = null;
    this.extrinsicService = null;
    this.dataAvailabilityService = null;
  }
}

// Export singleton instance
export const domainServiceFactory = DomainServiceFactory.getInstance();

// Convenience functions for getting services
export const getBlockService = () => domainServiceFactory.getBlockService();
export const getExtrinsicService = () => domainServiceFactory.getExtrinsicService();
export const getDataAvailabilityService = () => domainServiceFactory.getDataAvailabilityService(); 