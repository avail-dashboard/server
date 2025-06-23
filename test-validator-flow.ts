#!/usr/bin/env tsx

import { logger } from './src/utils/logger';
import db from './src/utils/database';
import { AvailBlockchainService } from './src/services/core/avail-blockchain';
import { createEnhancedProcessorService } from './src/services/domain/EnhancedProcessor';
import { ValidatorRepository } from './src/database/repositories/ValidatorRepository';
import { TransferRepository } from './src/database/repositories/TransferRepository';
import { EraRepository } from './src/database/repositories/EraRepository';

async function testValidatorFlow() {
  const blockchain = new AvailBlockchainService();
  
  try {
    logger.info('🔬 Testing complete validator creation and block storage flow...');
    
    await db.connect();
    await blockchain.start();
    
    // Initialize repositories
    const validatorRepository = new ValidatorRepository();
    const transferRepository = new TransferRepository();
    const eraRepository = new EraRepository();
    
    // Create enhanced processor
    const processor = createEnhancedProcessorService(
      db,
      blockchain,
      validatorRepository,
      transferRepository,
      eraRepository,
    );
    
    await processor.start();
    
    // Test with a known block that has a validator
    const blockNumber = 1051050;
    const blockData = await blockchain.getBlock(blockNumber);
    
    logger.info(`📦 Block ${blockNumber} data:`, {
      hash: blockData.hash,
      number: blockData.number,
      validator: blockData.validator,
      hasValidator: !!blockData.validator,
      extrinsicsCount: blockData.extrinsics.length,
      eventsCount: blockData.events.length,
    });
    
    if (!blockData.validator) {
      throw new Error('Block does not have a validator address');
    }
    
    // Check initial state
    const initialValidatorCount = await db.query('SELECT COUNT(*) as count FROM validators');
    const initialAccountCount = await db.query('SELECT COUNT(*) as count FROM accounts');
    const initialBlockCount = await db.query('SELECT COUNT(*) as count FROM blocks WHERE number = $1', [blockNumber]);
    
    logger.info('📊 Initial state:', {
      validators: initialValidatorCount.rows[0].count,
      accounts: initialAccountCount.rows[0].count,
      blocksWithThisNumber: initialBlockCount.rows[0].count,
    });
    
    // Process the block (this should create account -> validator -> block)
    logger.info('🔄 Processing block through enhanced processor...');
    await processor.processBlock(blockData);
    
    // Check final state
    const finalValidatorCount = await db.query('SELECT COUNT(*) as count FROM validators');
    const finalAccountCount = await db.query('SELECT COUNT(*) as count FROM accounts');
    const finalBlockCount = await db.query('SELECT COUNT(*) as count FROM blocks WHERE number = $1', [blockNumber]);
    const blockWithValidator = await db.query('SELECT validator_address FROM blocks WHERE number = $1', [blockNumber]);
    
    logger.info('📊 Final state:', {
      validators: finalValidatorCount.rows[0].count,
      accounts: finalAccountCount.rows[0].count,
      blocksWithThisNumber: finalBlockCount.rows[0].count,
      blockValidatorAddress: blockWithValidator.rows[0]?.validator_address,
    });
    
    // Verify the validator was created
    const createdValidator = await validatorRepository.findByStashAddress(blockData.validator);
    logger.info('✅ Validator created:', {
      found: !!createdValidator,
      address: createdValidator?.stashAddress?.substring(0, 20) + '...' || 'N/A',
      blocksProduced: createdValidator?.blocksProduced || 0,
    });
    
    // Verify the account was created
    const accountResult = await db.query('SELECT * FROM accounts WHERE address = $1', [blockData.validator]);
    logger.info('✅ Account created:', {
      found: accountResult.rows.length > 0,
      address: accountResult.rows[0]?.address?.substring(0, 20) + '...' || 'N/A',
    });
    
    // Verify the block was stored with validator reference
    const blockResult = await db.query('SELECT * FROM blocks WHERE number = $1', [blockNumber]);
    logger.info('✅ Block stored:', {
      found: blockResult.rows.length > 0,
      number: blockResult.rows[0]?.number || 'N/A',
      validatorAddress: blockResult.rows[0]?.validator_address?.substring(0, 20) + '...' || 'N/A',
    });
    
    logger.info('🎉 Validator flow test completed successfully!');
    
    await processor.stop();
    await blockchain.stop();
    await db.disconnect();
    
  } catch (error) {
    logger.error('❌ Validator flow test failed:', error);
    throw error;
  }
}

testValidatorFlow(); 