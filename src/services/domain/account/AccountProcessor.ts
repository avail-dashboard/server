/**
 * Account Processor
 * 
 * Handles account processing and self-healing operations including:
 * - Address extraction from blockchain data
 * - Account entity creation and validation
 * - Address format validation for Avail blockchain
 * - Base entity management (accounts have no dependencies)
 * 
 * This processor focuses purely on account creation and address management,
 * separate from API operations and blockchain queries.
 */

import { logger, logError } from '../../../utils/logger';
import { Account } from '@prisma/client';
import { SelfHealingProcessor, ExtractedEntity, ENTITY_TYPES } from '../../types/self-healing';
import { BlockData, ExtrinsicData } from '../../types/blockchain';
import db from '../../../utils/database';

/**
 * AccountProcessor - Self-healing processor for account entities
 * 
 * Responsible for extracting account addresses from blockchain data and ensuring
 * all discovered addresses have corresponding account records in the database.
 * Accounts are the base entity type with no dependencies.
 */
export class AccountProcessor implements SelfHealingProcessor {

  /**
   * Validate if a string is a valid Avail address
   * Avail uses Substrate SS58 format
   */
  private isValidAvailAddress(address: string): boolean {
    try {
      // Basic validation: address should be a string and have reasonable length
      if (!address || typeof address !== 'string') {
        return false;
      }
      
      // Avail addresses typically start with '5' and are 47-48 characters long
      if (address.length < 40 || address.length > 50) {
        return false;
      }
      
      // Should start with '5' for SS58 format
      if (!address.startsWith('5')) {
        return false;
      }
      
      // Basic character validation (base58 characters)
      const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]+$/;
      return base58Regex.test(address);
      
    } catch {
      return false;
    }
  }

  /**
   * Check if an extrinsic is a transfer operation
   */
  private isTransferExtrinsic(extrinsic: ExtrinsicData): boolean {
    return extrinsic.method.section === 'balances' && 
           ['transfer', 'transferKeepAlive', 'transferAll'].includes(extrinsic.method.method);
  }

  /**
   * Extract transfer destination address from transfer extrinsic
   */
  private extractTransferDestination(extrinsic: ExtrinsicData): string | null {
    try {
      if (!this.isTransferExtrinsic(extrinsic)) {
        return null;
      }

      const args = extrinsic.method.args;
      
      // Different transfer methods have different argument structures
      if (extrinsic.method.method === 'transfer' || extrinsic.method.method === 'transferKeepAlive') {
        // transfer(dest, value) or transferKeepAlive(dest, value)
        return args.dest || args.destination || null;
      }
      
      if (extrinsic.method.method === 'transferAll') {
        // transferAll(dest, keepAlive)
        return args.dest || args.destination || null;
      }

      return null;
    } catch (error) {
      logger.warn('AccountProcessor: Failed to extract transfer destination', {
        component: 'account-processor',
        extrinsicHash: extrinsic.hash,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Extract addresses from extrinsic method arguments
   * This is a generic method that looks for address-like strings in arguments
   */
  private extractAddressesFromArgs(args: Record<string, any>): string[] {
    const addresses: string[] = [];
    
    try {
      const extractFromValue = (value: any): void => {
        if (typeof value === 'string' && this.isValidAvailAddress(value)) {
          addresses.push(value);
        } else if (Array.isArray(value)) {
          value.forEach(extractFromValue);
        } else if (value && typeof value === 'object') {
          Object.values(value).forEach(extractFromValue);
        }
      };

      Object.values(args).forEach(extractFromValue);
    } catch {
      // Ignore errors in argument parsing - this is best-effort extraction
    }

    return addresses;
  }

  /**
   * Extract account addresses from block data
   * 
   * Extracts addresses from:
   * - Block validator (block author)
   * - Extrinsic signers
   * - Transfer destinations (balances.transfer calls)
   * - Other extrinsic arguments that contain addresses
   */
  async extractFromBlock(blockData: BlockData): Promise<ExtractedEntity[]> {
    const addresses = new Set<string>();
    
    try {
      logger.debug('AccountProcessor: Extracting addresses from block', { 
        component: 'account-processor',
        blockNumber: blockData.number,
        extrinsicCount: blockData.extrinsics.length,
      });

      // 1. Extract block validator (block author)
      if (blockData.validator && this.isValidAvailAddress(blockData.validator)) {
        addresses.add(blockData.validator);
        logger.debug('AccountProcessor: Added block validator address', {
          component: 'account-processor',
          blockNumber: blockData.number,
          validator: blockData.validator.substring(0, 20) + '...',
        });
      }

      // 2. Extract from extrinsics
      blockData.extrinsics.forEach((extrinsic, index) => {
        try {
          // Extract extrinsic signer
          if (extrinsic.signer && this.isValidAvailAddress(extrinsic.signer)) {
            addresses.add(extrinsic.signer);
          }

          // Extract transfer destinations
          if (this.isTransferExtrinsic(extrinsic)) {
            const destination = this.extractTransferDestination(extrinsic);
            if (destination && this.isValidAvailAddress(destination)) {
              addresses.add(destination);
            }
          }

          // Extract other addresses from extrinsic arguments
          const argAddresses = this.extractAddressesFromArgs(extrinsic.method.args);
          argAddresses.forEach(addr => {
            if (this.isValidAvailAddress(addr)) {
              addresses.add(addr);
            }
          });

        } catch (error) {
          logger.warn('AccountProcessor: Failed to extract addresses from extrinsic', {
            component: 'account-processor',
            blockNumber: blockData.number,
            extrinsicIndex: index,
            error: (error as Error).message,
          });
          // Continue processing other extrinsics
        }
      });

      // Convert to ExtractedEntity array
      const entities: ExtractedEntity[] = Array.from(addresses).map(address => ({
        type: ENTITY_TYPES.ACCOUNT,
        id: address,
        data: {
          address,
          blockNumber: blockData.number,
          extractedFrom: 'block_processing',
        },
        dependencies: [], // Accounts have no dependencies
      }));

      logger.debug('AccountProcessor: Address extraction complete', {
        component: 'account-processor',
        blockNumber: blockData.number,
        addressCount: entities.length,
      });

      return entities;

    } catch (error) {
      logger.error('AccountProcessor: Failed to extract addresses from block', {
        component: 'account-processor',
        blockNumber: blockData.number,
        error: (error as Error).message,
      });
      
      // Return empty array on error - don't fail the entire block processing
      return [];
    }
  }

  /**
   * Process extracted account entities
   * 
   * For each extracted address, ensure the account exists in the database
   * Uses the ensureAccountExists method for consistent account creation
   */
  async processExtractedEntities(entities: ExtractedEntity[]): Promise<Account[]> {
    const results: Account[] = [];
    
    try {
      logger.debug('AccountProcessor: Processing extracted account entities', { 
        component: 'account-processor',
        entityCount: entities.length,
      });

      for (const entity of entities) {
        try {
          // Ensure dependencies are resolved first
          await this.ensureDependencies(entity);
          
          // Process the account entity
          const account = await this.ensureAccountExists(entity.data.address);
          results.push(account);
          
          logger.debug('AccountProcessor: Account processed successfully', {
            component: 'account-processor',
            address: entity.data.address.substring(0, 20) + '...',
            entityType: entity.type,
            blockNumber: entity.data.blockNumber,
          });

        } catch (error) {
          logger.error('AccountProcessor: Failed to process account entity', {
            component: 'account-processor',
            entityId: entity.id,
            entityType: entity.type,
            error: (error as Error).message,
          });
          // Continue processing other entities - don't fail the entire batch
        }
      }

      logger.debug('AccountProcessor: Account entity processing complete', {
        component: 'account-processor',
        totalEntities: entities.length,
        successfullyProcessed: results.length,
        failed: entities.length - results.length,
      });

      return results;

    } catch (error) {
      logger.error('AccountProcessor: Failed to process extracted entities', {
        component: 'account-processor',
        entityCount: entities.length,
        error: (error as Error).message,
      });
      
      // Return partial results on error
      return results;
    }
  }

  /**
   * Ensure account dependencies exist
   * 
   * Accounts are the base entity type and have no dependencies.
   * This method is a no-op but is required by the SelfHealingProcessor interface.
   */
  async ensureDependencies(entity: ExtractedEntity): Promise<void> {
    // No-op: accounts have no dependencies - they are the base entity type
    logger.debug('AccountProcessor: ensureDependencies called (no dependencies required)', { 
      component: 'account-processor',
      entityType: entity.type,
      entityId: entity.id.substring(0, 20) + '...',
    });
  }

  /**
   * Helper method for other services to ensure account exists
   * 
   * This is the main public method that other domain processors can use
   * to ensure an account record exists before creating dependent entities.
   */
  async ensureAccountExists(address: string): Promise<Account> {
    try {
      logger.debug('AccountProcessor: Ensuring account exists', { 
        component: 'account-processor',
        address: address.substring(0, 20) + '...',
      });

      // Try to get existing account
      const result = await db.query<Account>(
        'SELECT * FROM accounts WHERE address = $1',
        [address],
      );

      if (result.rows.length > 0) {
        logger.debug('AccountProcessor: Account already exists', {
          component: 'account-processor',
          address: address.substring(0, 20) + '...',
        });
        return result.rows[0];
      }

      // Create new account record
      const newAccount = await db.query<Account>(
        `INSERT INTO accounts (address, last_updated) 
         VALUES ($1, CURRENT_TIMESTAMP) 
         RETURNING *`,
        [address],
      );

      logger.info('AccountProcessor: Created new account', {
        component: 'account-processor',
        address: address.substring(0, 20) + '...',
      });

      return newAccount.rows[0];

    } catch (error) {
      logError(error as Error, { 
        component: 'account-processor', 
        action: 'ensureAccountExists',
        address: address.substring(0, 20) + '...',
      });
      throw error;
    }
  }
}

/**
 * Factory function to create AccountProcessor instances
 */
export const createAccountProcessor = (): AccountProcessor => {
  return new AccountProcessor();
}; 