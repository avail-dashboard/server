#!/usr/bin/env node

import { HybridRPCTestService } from './services/hybrid-rpc-test';

async function runHybridTest() {
  console.log('🚀 Starting Hybrid RPC Test Suite');
  console.log('=====================================\n');

  const testService = new HybridRPCTestService();
  
  try {
    // Initialize the test service
    console.log('⏳ Initializing test service...');
    await testService.initialize();
    
    // Run comprehensive test
    console.log('🧪 Running comprehensive tests...\n');
    const results = await testService.runComprehensiveTest();
    
    // Print results
    console.log('📊 TEST RESULTS');
    console.log('================');
    
    console.log('\n🔧 CAPABILITIES DETECTED:');
    console.log('-------------------------');
    const caps = results.capabilities;
    console.log(`Polkadot SDK - Basic RPC: ${caps.polkadotSDK.basicRPC ? '✅' : '❌'}`);
    console.log(`Polkadot SDK - Chain Queries: ${caps.polkadotSDK.chainQueries ? '✅' : '❌'}`);
    console.log(`Polkadot SDK - Account Queries: ${caps.polkadotSDK.accountQueries ? '✅' : '❌'}`);
    console.log(`Polkadot SDK - Block Queries: ${caps.polkadotSDK.blockQueries ? '✅' : '❌'}`);
    console.log(`Avail Specific - Data Availability: ${caps.availSpecific.dataAvailability ? '✅' : '❌'}`);
    console.log(`Avail Specific - Application Data: ${caps.availSpecific.applicationData ? '✅' : '❌'}`);
    console.log(`Avail Specific - Proofs: ${caps.availSpecific.proofs ? '✅' : '❌'}`);
    
    console.log('\n⚖️  COMPARISON TESTS:');
    console.log('---------------------');
    results.comparisons.forEach(test => {
      const winnerIcon = {
        'polkadot': '🟦',
        'avail': '🟩',
        'both': '🟨',
        'neither': '🟥',
      }[test.winner];
      
      console.log(`${winnerIcon} ${test.feature}: ${test.winner.toUpperCase()}`);
      if (test.performance.polkadotTime !== undefined) {
        console.log(`   └─ Polkadot: ${test.performance.polkadotTime}ms`);
      }
      if (test.performance.availTime !== undefined) {
        console.log(`   └─ Avail: ${test.performance.availTime}ms`);
      }
      if (test.polkadotError) {
        console.log(`   └─ Polkadot Error: ${test.polkadotError}`);
      }
      if (test.availError) {
        console.log(`   └─ Avail Error: ${test.availError}`);
      }
    });
    
    console.log('\n🎯 AVAIL-SPECIFIC TESTS:');
    console.log('------------------------');
    results.availSpecific.forEach(test => {
      const winnerIcon = test.winner === 'avail' ? '✅' : '❌';
      console.log(`${winnerIcon} ${test.feature}`);
      if (test.performance.availTime !== undefined) {
        console.log(`   └─ Time: ${test.performance.availTime}ms`);
      }
      if (test.availError) {
        console.log(`   └─ Error: ${test.availError}`);
      }
    });
    
    console.log('\n📈 SUMMARY:');
    console.log('-----------');
    const { summary } = results;
    const total = summary.polkadotWins + summary.availWins + summary.bothWork + summary.neitherWork;
    
    console.log(`Total Tests: ${total}`);
    console.log(`🟦 Polkadot SDK Wins: ${summary.polkadotWins}`);
    console.log(`🟩 Avail RPC Wins: ${summary.availWins}`);
    console.log(`🟨 Both Work: ${summary.bothWork}`);
    console.log(`🟥 Neither Work: ${summary.neitherWork}`);
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('-------------------');
    
    if (summary.bothWork > 0) {
      console.log('✅ HYBRID APPROACH VIABLE: Both Polkadot SDK and Avail RPC can work together');
      console.log('   → Use Polkadot SDK for standard operations (better performance)');
      console.log('   → Use Avail RPC for Avail-specific features (data availability, proofs)');
    }
    
    if (summary.polkadotWins > 0) {
      console.log('✅ POLKADOT SDK BENEFITS: Additional capabilities detected');
      console.log('   → Better type safety and developer experience');
      console.log('   → Direct blockchain access without RPC overhead');
    }
    
    if (summary.availWins > 0) {
      console.log('✅ AVAIL-SPECIFIC FEATURES: Custom functionality available');
      console.log('   → Data availability proofs');
      console.log('   → Application data queries');
      console.log('   → Kate commitment verification');
    }
    
    if (summary.neitherWork === total) {
      console.log('❌ CRITICAL: No working connections detected');
      console.log('   → Check network connectivity');
      console.log('   → Verify RPC endpoints are accessible');
      console.log('   → Check configuration settings');
    }
    
    console.log('\n🏗️  IMPLEMENTATION STRATEGY:');
    console.log('-----------------------------');
    console.log('1. Primary: Use Polkadot SDK for standard queries (blocks, accounts, chain state)');
    console.log('2. Secondary: Use Avail RPC for Avail-specific operations');
    console.log('3. Fallback: Avail RPC as backup when Polkadot SDK fails');
    console.log('4. Caching: Implement intelligent caching layer');
    console.log('5. Monitoring: Add health checks and performance monitoring');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw new Error('Test execution failed');
  } finally {
    try {
      await testService.shutdown();
      console.log('\n✅ Test service shut down successfully');
    } catch (error) {
      console.error('Warning: Error during shutdown:', error);
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runHybridTest().catch(error => {
    console.error('Fatal error:', error);
    throw new Error('Fatal test error');
  });
}

export { runHybridTest }; 