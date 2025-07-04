const { ApiPromise, WsProvider } = require('@polkadot/api');

async function testEraDetection() {
  console.log('🔍 Testing era transition detection...');
  
  const provider = new WsProvider('wss://mainnet-rpc.avail.so/ws');
  const api = await ApiPromise.create({ provider });
  
  // Get current era
  const activeEra = await api.query.staking.activeEra();
  const currentEra = activeEra.unwrap().index.toNumber();
  console.log(`📊 Current era: ${currentEra}`);
  
  // Get current block
  const latestBlock = await api.rpc.chain.getHeader();
  const currentBlock = latestBlock.number.toNumber();
  console.log(`📦 Current block: ${currentBlock}`);
  
  // Check last few blocks for era transition events
  console.log('🔍 Checking recent blocks for staking events...');
  
  for (let i = 0; i < 10; i++) {
    const blockNumber = currentBlock - i;
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const events = await api.query.system.events.at(blockHash);
    
    const stakingEvents = events.filter(({ event }) => 
      event.section === 'staking' && 
      ['NewEra', 'EraPaid', 'EraEnded'].includes(event.method)
    );
    
    if (stakingEvents.length > 0) {
      console.log(`✅ Found staking events in block ${blockNumber}:`);
      stakingEvents.forEach(({ event }) => {
        console.log(`  - ${event.section}.${event.method}: ${JSON.stringify(event.data.toHuman())}`);
      });
    }
  }
  
  // Find the last era transition by checking a wider range
  console.log('🔍 Searching for last era transition...');
  const eraLength = 2400; // Approximate era length in blocks
  const searchStart = currentBlock - eraLength;
  
  for (let blockNumber = currentBlock; blockNumber > searchStart; blockNumber -= 100) {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const events = await api.query.system.events.at(blockHash);
    
    const newEraEvents = events.filter(({ event }) => 
      event.section === 'staking' && event.method === 'NewEra'
    );
    
    if (newEraEvents.length > 0) {
      console.log(`🎯 Found NewEra event in block ${blockNumber}:`);
      newEraEvents.forEach(({ event }) => {
        const eraIndex = event.data[0].toNumber();
        console.log(`  - Era ${eraIndex} started at block ${blockNumber}`);
      });
      break;
    }
  }
  
  await api.disconnect();
}

testEraDetection().catch(console.error);