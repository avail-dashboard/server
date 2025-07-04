// Test script to manually test era processing with mock data
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

async function testManualEra() {
  console.log('🧪 Testing manual era processing...');
  
  const { ApiPromise, WsProvider } = require('@polkadot/api');
  
  // Connect to blockchain
  const provider = new WsProvider('wss://mainnet-rpc.avail.so/ws');
  const api = await ApiPromise.create({ provider });
  
  try {
    // Get current era from blockchain
    const activeEra = await api.query.staking.activeEra();
    const currentEra = activeEra.unwrap().index.toNumber();
    console.log(`📊 Current era on blockchain: ${currentEra}`);
    
    // Create mock event data for era transition
    const mockEraTransitionEvent = {
      section: 'staking',
      method: 'NewEra',
      data: [currentEra], // Current era number
    };
    
    // Create mock block data with era transition event
    const mockBlockData = {
      number: 1500000, // Mock block number
      hash: '0x1234567890abcdef',
      events: [mockEraTransitionEvent],
    };
    
    console.log('🔄 Testing era transition detection...');
    
    // Import our era indexer logic
    const { createEraIndexer } = require('./src/services/domain/era/EraIndexer');
    const { EraRepository } = require('./src/database/repositories/EraRepository');
    const { PrismaClient } = require('@prisma/client');
    
    const prisma = new PrismaClient();
    const eraRepository = new EraRepository(prisma);
    
    // Create a mock blockchain service for testing
    const mockBlockchainService = {
      getApi: () => Promise.resolve(api)
    };
    
    const eraIndexer = createEraIndexer(eraRepository, mockBlockchainService);
    
    // Test era transition detection
    const result = await eraIndexer.detectEraTransition(mockBlockData);
    console.log('📋 Era transition detection result:', result);
    
    if (result.hasTransition) {
      console.log(`✅ Era transition detected: ${result.currentEra} → ${result.newEra}`);
      
      // Test era indexing
      console.log('🏗️  Testing era indexing...');
      const indexResult = await eraIndexer.indexEra(result.newEra);
      console.log('📋 Era indexing result:', indexResult);
    } else {
      console.log('❌ No era transition detected in mock data');
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await api.disconnect();
  }
}

testManualEra().catch(console.error);