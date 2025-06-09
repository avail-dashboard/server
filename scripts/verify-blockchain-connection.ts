#!/usr/bin/env tsx

/**
 * Blockchain Connection Verification Script
 * 
 * This script tests the BlockchainService with real Avail RPC endpoints
 * to verify connectivity and data retrieval capabilities.
 */

import { BlockchainService } from '../src/services/core/blockchain';

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

async function verifyBlockchainConnection(): Promise<void> {
  const blockchainService = new BlockchainService();
  
  try {
    log.info('🚀 Starting Avail Blockchain Connection Verification...');
    
    // Step 1: Start the service
    log.info('Step 1: Starting BlockchainService...');
    await blockchainService.start();
    log.success('BlockchainService started successfully');
    
    // Step 2: Check health
    log.info('Step 2: Checking service health...');
    const health = await blockchainService.getHealth();
    if (health.healthy) {
      log.success('Service is healthy', {
        provider: health.details?.provider,
        chain: health.details?.chain,
        connections: health.details?.connections,
        uptime: health.details?.uptime
      });
    } else {
      log.error('Service is not healthy', health.error);
      return;
    }
    
    // Step 3: Get chain information
    log.info('Step 3: Retrieving chain information...');
    const chainInfo = await blockchainService.getChainInfo();
    log.success('Chain information retrieved', {
      chain: chainInfo.chain,
      nodeName: chainInfo.nodeName,
      nodeVersion: chainInfo.nodeVersion,
      specName: chainInfo.specName,
      specVersion: chainInfo.specVersion,
      tokenSymbol: chainInfo.properties.tokenSymbol,
      tokenDecimals: chainInfo.properties.tokenDecimals
    });
    
    // Step 4: Get latest block
    log.info('Step 4: Retrieving latest finalized block...');
    const latestBlock = await blockchainService.getLatestBlock();
    log.success('Latest block retrieved', {
      number: latestBlock.number,
      hash: latestBlock.hash.substring(0, 20) + '...',
      parentHash: latestBlock.parentHash.substring(0, 20) + '...',
      timestamp: new Date(latestBlock.timestamp).toISOString()
    });
    
    // Step 5: Get a specific block by number
    log.info('Step 5: Retrieving specific block (latest - 10)...');
    const specificBlock = await blockchainService.getBlock(latestBlock.number - 10);
    log.success('Specific block retrieved', {
      number: specificBlock.number,
      hash: specificBlock.hash.substring(0, 20) + '...',
      extrinsicsCount: specificBlock.extrinsics.length
    });
    
    // Step 6: Test API access
    log.info('Step 6: Testing direct API access...');
    const api = await blockchainService.getApi();
    const [totalIssuance, currentEra] = await Promise.all([
      api.query.balances.totalIssuance(),
      api.query.staking.currentEra()
    ]);
    log.success('Direct API calls successful', {
      totalIssuance: totalIssuance.toString(),
      currentEra: currentEra.toString()
    });
    
    // Step 7: Check connection details
    log.info('Step 7: Checking connection details...');
    const connections = blockchainService.getConnections();
    const activeConnections = connections.filter(c => c.isConnected);
    log.success('Connection details', {
      totalProviders: connections.length,
      activeConnections: activeConnections.length,
      providers: activeConnections.map(c => ({
        provider: c.provider,
        url: c.url.substring(0, 30) + '...'
      }))
    });
    
    // Step 8: Check circuit breaker states
    log.info('Step 8: Checking circuit breaker states...');
    const circuitStates = blockchainService.getCircuitBreakerStates();
    const healthyCircuits = circuitStates.filter(s => s.state.state === 'CLOSED');
    log.success('Circuit breaker status', {
      totalCircuits: circuitStates.length,
      healthyCircuits: healthyCircuits.length,
      states: circuitStates.map(s => ({
        url: s.url.substring(0, 30) + '...',
        state: s.state.state,
        failures: s.state.failureCount
      }))
    });
    
    // Step 9: Test metrics
    log.info('Step 9: Checking service metrics...');
    const metrics = blockchainService.getMetrics();
    log.success('Service metrics', {
      requestCount: metrics.requestCount,
      errorCount: metrics.errorCount,
      averageResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
      errorRate: metrics.requestCount > 0 ? 
        `${((metrics.errorCount / metrics.requestCount) * 100).toFixed(2)}%` : '0%'
    });
    
    // Step 10: Test subscription capability (brief test)
    log.info('Step 10: Testing subscription capability...');
    let subscriptionWorking = false;
    const unsubscribe = await blockchainService.subscribeToNewHeads((header) => {
      subscriptionWorking = true;
      log.success('Received new head subscription', {
        blockNumber: header.number.toNumber(),
        hash: header.hash.toString().substring(0, 20) + '...'
      });
    });
    
    // Wait a moment for potential new blocks
    await new Promise(resolve => setTimeout(resolve, 5000));
    await unsubscribe();
    
    if (subscriptionWorking) {
      log.success('Subscription test completed - received real-time data');
    } else {
      log.warn('No new blocks received during subscription test (this is normal if no blocks were produced)');
    }
    
    log.success('🎉 All verification steps completed successfully!');
    log.info('Summary:', {
      chain: chainInfo.chain,
      latestBlock: latestBlock.number,
      provider: health.details?.provider,
      totalRequests: blockchainService.getMetrics().requestCount,
      uptime: health.details?.uptime
    });
    
  } catch (error) {
    log.error('Verification failed', error);
    throw error;
  } finally {
    // Cleanup
    log.info('Cleaning up...');
    await blockchainService.stop();
    log.success('BlockchainService stopped');
  }
}

// Run the verification
if (require.main === module) {
  verifyBlockchainConnection()
    .then(() => {
      log.success('✨ Blockchain connection verification completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      log.error('💥 Blockchain connection verification failed', error);
      process.exit(1);
    });
}

export { verifyBlockchainConnection }; 