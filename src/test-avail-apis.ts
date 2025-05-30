import { UnifiedAvailService } from './services/unified-avail';
import { rpcLogger } from './utils/logger';

async function testAvailAPIs() {
  console.log('🚀 Testing Complete Avail API Integration...\n');
  
  const availService = new UnifiedAvailService();
  
  try {
    // Initialize all services
    console.log('📡 Initializing all Avail services...');
    await availService.initialize();
    console.log('✅ All services initialized!\n');
    
    // Test health status
    console.log('🏥 Checking health status...');
    const health = await availService.getHealthStatus();
    console.log('Health Status:', JSON.stringify(health, null, 2));
    console.log(`Overall Health: ${health.overall ? '✅ HEALTHY' : '❌ UNHEALTHY'}\n`);
    
    // Test individual service health
    console.log('🔍 Individual Service Health:');
    Object.entries(health.services).forEach(([service, status]) => {
      console.log(`  ${service}: ${status.healthy ? '✅' : '❌'} ${status.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    });
    console.log();
    
    // Test RPC service (existing functionality)
    if (health.services.rpc.healthy) {
      try {
        console.log('🔗 Testing RPC Service...');
        const latestBlocks = await availService.getLatestBlocks();
        console.log(`✅ RPC: Retrieved ${latestBlocks.blocks.length} latest blocks`);
      } catch (error) {
        console.log(`❌ RPC: ${(error as Error).message}`);
      }
    }
    
    // Test Light Client service
    if (health.services.lightClient.healthy) {
      try {
        console.log('💡 Testing Light Client Service...');
        const status = await availService.lightClient.getStatus();
        console.log(`✅ Light Client: Network ${status.network}, Latest block ${status.blocks.latest}`);
      } catch (error) {
        console.log(`❌ Light Client: ${(error as Error).message}`);
      }
    }
    
    // Test Bridge service
    if (health.services.bridge.healthy) {
      try {
        console.log('🌉 Testing Bridge Service...');
        const bridgeInfo = await availService.bridge.getBridgeInfo();
        console.log(`✅ Bridge: Chain ${bridgeInfo.availChainName}, Contract ${bridgeInfo.bridgeContractAddress}`);
      } catch (error) {
        console.log(`❌ Bridge: ${(error as Error).message}`);
      }
    }
    
    // Test Nexus service
    if (health.services.nexus.healthy) {
      try {
        console.log('🎯 Testing Nexus Service...');
        const nexusHealth = await availService.nexus.checkHealth();
        console.log(`✅ Nexus: Status ${nexusHealth.status}`);
      } catch (error) {
        console.log(`❌ Nexus: ${(error as Error).message}`);
      }
    }
    
    // Test Turbo DA service
    if (health.services.turboDA.healthy) {
      try {
        console.log('⚡ Testing Turbo DA Service...');
        const stats = await availService.turboDA.getStats();
        console.log(`✅ Turbo DA: ${stats.total_submissions} total submissions`);
      } catch (error) {
        console.log(`❌ Turbo DA: ${(error as Error).message}`);
      }
    }
    
    console.log('\n🎉 API Integration Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   Total Services: 5`);
    console.log(`   Healthy Services: ${Object.values(health.services).filter(s => s.healthy).length}`);
    console.log(`   Overall Status: ${health.overall ? '✅ ALL SYSTEMS GO' : '⚠️ SOME ISSUES DETECTED'}`);
    
    if (health.overall) {
      console.log('\n🚀 Your API issues should now be resolved!');
      console.log('   You now have access to:');
      console.log('   • Reliable Light Client API for blocks and data');
      console.log('   • Bridge API for cross-chain operations');
      console.log('   • Nexus API for enhanced queries');
      console.log('   • Turbo DA for optimized data submissions');
      console.log('   • Smart routing between services for best performance');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message);
  } finally {
    await availService.shutdown();
  }
}

// Run the test
if (require.main === module) {
  testAvailAPIs().catch(console.error);
}

export { testAvailAPIs }; 