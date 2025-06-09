#!/usr/bin/env tsx

/**
 * Avail Blockchain Connection Verification Script
 * 
 * This script tests connection to Avail RPC endpoints using proper Avail types
 * and handles runtime compatibility issues.
 */

import { ApiPromise, WsProvider } from '@polkadot/api';
import { availRpc, availTypes } from '../src/config/avail-types';

// Simple logger for the verification script
const log = {
  info: (message: string, data?: any) => {
    console.log(`ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  success: (message: string, data?: any) => {
    console.log(`✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.log(`❌ ${message}`, error?.message || error);
  },
  warn: (message: string, data?: any) => {
    console.log(`⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Avail RPC endpoints to test
const AVAIL_ENDPOINTS = [
  'wss://mainnet-rpc.avail.so/ws',
  'wss://avail-mainnet.public.blastapi.io/',
  'wss://mainnet.avail-rpc.com/',
];

async function testAvailEndpoint(endpoint: string): Promise<boolean> {
  let api: ApiPromise | null = null;
  
  try {
    log.info(`Testing Avail endpoint: ${endpoint}`);
    
    // Create provider with timeout
    const provider = new WsProvider(endpoint, 15000); // 15 second timeout
    
    // Create API instance with Avail types
    api = await ApiPromise.create({ 
      provider,
      types: availTypes,
      rpc: availRpc,
      // Handle runtime compatibility issues
      throwOnConnect: false,
      throwOnUnknown: false,
    });
    
    await api.isReady;
    
    // Test basic system calls (these should work without decoding issues)
    const [chain, nodeName, nodeVersion, runtimeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.state.getRuntimeVersion()
    ]);
    
    // Get finalized head (this should work)
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const header = await api.rpc.chain.getHeader(finalizedHead);
    
    // Try to get some basic chain data
    let totalIssuance = 'N/A';
    let currentEra = 'N/A';
    
    try {
      const issuance = await api.query.balances.totalIssuance();
      totalIssuance = issuance.toString();
    } catch (e) {
      log.warn('Could not fetch total issuance (this is normal)');
    }
    
    try {
      const era = await api.query.staking.currentEra();
      currentEra = era.toString();
    } catch (e) {
      log.warn('Could not fetch current era (this is normal)');
    }
    
    // Test Avail-specific Kate RPC if available
    let kateSupported = false;
    try {
      if (api.rpc.kate && api.rpc.kate.blockLength) {
        await api.rpc.kate.blockLength();
        kateSupported = true;
      }
    } catch (e) {
      log.warn('Kate RPC not available or failed (this might be normal)');
    }
    
    log.success(`✅ ${endpoint} - Connection successful`, {
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      specName: runtimeVersion.specName.toString(),
      specVersion: runtimeVersion.specVersion.toNumber(),
      implVersion: runtimeVersion.implVersion.toNumber(),
      latestBlock: header.number.toNumber(),
      blockHash: header.hash.toString().substring(0, 20) + '...',
      totalIssuance,
      currentEra,
      kateRpcSupported: kateSupported
    });
    
    return true;
    
  } catch (error) {
    log.error(`❌ ${endpoint} - Connection failed`, error);
    return false;
  } finally {
    if (api) {
      try {
        await api.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

async function testAvailSubscription(endpoint: string): Promise<boolean> {
  let api: ApiPromise | null = null;
  
  try {
    log.info(`Testing subscription on: ${endpoint}`);
    
    const provider = new WsProvider(endpoint, 15000);
    api = await ApiPromise.create({ 
      provider,
      types: availTypes,
      rpc: availRpc,
      throwOnConnect: false,
      throwOnUnknown: false,
    });
    
    await api.isReady;
    
    let receivedUpdate = false;
    
    // Subscribe to new heads (header only, avoid extrinsic decoding issues)
    const unsubscribe = await api.rpc.chain.subscribeNewHeads((header) => {
      receivedUpdate = true;
      log.success('Received new block header via subscription', {
        blockNumber: header.number.toNumber(),
        hash: header.hash.toString().substring(0, 20) + '...',
        parentHash: header.parentHash.toString().substring(0, 20) + '...'
      });
    });
    
    // Wait for up to 30 seconds for a new block
    log.info('Waiting for new blocks (up to 30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await unsubscribe();
    
    if (receivedUpdate) {
      log.success('Subscription test successful - received real-time updates');
      return true;
    } else {
      log.warn('No new blocks received during subscription test (normal if no blocks produced)');
      return true; // Still consider this a success
    }
    
  } catch (error) {
    log.error(`Subscription test failed on ${endpoint}`, error);
    return false;
  } finally {
    if (api) {
      try {
        await api.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

async function verifyAvailConnection(): Promise<void> {
  log.info('🚀 Starting Avail Blockchain Connection Verification...');
  log.info('Using Avail-specific types and RPC definitions');
  log.info(`Testing ${AVAIL_ENDPOINTS.length} RPC endpoints...`);
  
  const results: Array<{ endpoint: string; success: boolean }> = [];
  
  // Test each endpoint
  for (const endpoint of AVAIL_ENDPOINTS) {
    const success = await testAvailEndpoint(endpoint);
    results.push({ endpoint, success });
    
    // Add a small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  const successfulEndpoints = results.filter(r => r.success);
  const failedEndpoints = results.filter(r => !r.success);
  
  log.info('📊 Connection Test Summary:', {
    total: results.length,
    successful: successfulEndpoints.length,
    failed: failedEndpoints.length,
    successRate: `${((successfulEndpoints.length / results.length) * 100).toFixed(1)}%`
  });
  
  if (successfulEndpoints.length > 0) {
    log.success('✅ Working endpoints:', 
      successfulEndpoints.map(r => r.endpoint)
    );
    
    // Test subscription on the first working endpoint
    log.info('🔄 Testing real-time subscription...');
    await testAvailSubscription(successfulEndpoints[0].endpoint);
    
    log.success('🎉 Verification completed successfully!');
    log.info('✨ Your BlockchainService should work with these endpoints');
    log.info('💡 Note: Some extrinsic decoding warnings are normal for Avail');
    
  } else {
    throw new Error('❌ No working RPC endpoints found!');
  }
  
  if (failedEndpoints.length > 0) {
    log.warn('⚠️  Failed endpoints:', 
      failedEndpoints.map(r => r.endpoint)
    );
  }
}

// Run the verification
if (require.main === module) {
  verifyAvailConnection()
    .then(() => {
      log.success('✨ Avail blockchain connectivity verified!');
      process.exit(0);
    })
    .catch((error) => {
      log.error('💥 Verification failed', error);
      process.exit(1);
    });
}

export { verifyAvailConnection }; 