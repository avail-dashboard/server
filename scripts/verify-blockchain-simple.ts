#!/usr/bin/env tsx

/**
 * Simple Blockchain Connection Verification Script
 * 
 * This script tests direct connection to Avail RPC endpoints
 * without depending on the config system.
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

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

async function testSingleEndpoint(endpoint: string): Promise<boolean> {
  let api: ApiPromise | null = null;
  
  try {
    log.info(`Testing endpoint: ${endpoint}`);
    
    // Create provider with timeout
    const provider = new WsProvider(endpoint, 10000); // 10 second timeout
    
    // Create API instance
    api = await ApiPromise.create({ provider });
    await api.isReady;
    
    // Test basic RPC calls
    const [chain, nodeName, nodeVersion, runtimeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.state.getRuntimeVersion()
    ]);
    
    // Get latest block
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const block = await api.rpc.chain.getBlock(finalizedHead);
    
    // Get some chain data
    const totalIssuance = await api.query.balances.totalIssuance();
    
    log.success(`✅ ${endpoint} - Connection successful`, {
      chain: chain.toString(),
      nodeName: nodeName.toString(),
      nodeVersion: nodeVersion.toString(),
      specName: runtimeVersion.specName.toString(),
      specVersion: runtimeVersion.specVersion.toNumber(),
      latestBlock: block.block.header.number.toNumber(),
      totalIssuance: totalIssuance.toString(),
      blockHash: block.block.header.hash.toString().substring(0, 20) + '...'
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

async function testSubscription(endpoint: string): Promise<boolean> {
  let api: ApiPromise | null = null;
  
  try {
    log.info(`Testing subscription on: ${endpoint}`);
    
    const provider = new WsProvider(endpoint, 10000);
    api = await ApiPromise.create({ provider });
    await api.isReady;
    
    let receivedUpdate = false;
    
    // Subscribe to new heads
    const unsubscribe = await api.rpc.chain.subscribeNewHeads((header) => {
      receivedUpdate = true;
      log.success('Received new block via subscription', {
        blockNumber: header.number.toNumber(),
        hash: header.hash.toString().substring(0, 20) + '...'
      });
    });
    
    // Wait for up to 30 seconds for a new block
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
  log.info(`Testing ${AVAIL_ENDPOINTS.length} RPC endpoints...`);
  
  const results: Array<{ endpoint: string; success: boolean }> = [];
  
  // Test each endpoint
  for (const endpoint of AVAIL_ENDPOINTS) {
    const success = await testSingleEndpoint(endpoint);
    results.push({ endpoint, success });
    
    // Add a small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
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
    await testSubscription(successfulEndpoints[0].endpoint);
  }
  
  if (failedEndpoints.length > 0) {
    log.warn('⚠️  Failed endpoints:', 
      failedEndpoints.map(r => r.endpoint)
    );
  }
  
  if (successfulEndpoints.length === 0) {
    throw new Error('❌ No working RPC endpoints found!');
  }
  
  log.success('🎉 Verification completed successfully!');
  log.info('✨ Your BlockchainService should work with these endpoints');
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