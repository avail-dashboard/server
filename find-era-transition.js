const { ApiPromise, WsProvider } = require('@polkadot/api');

async function findEraTransition() {
  console.log('🔍 Finding era transition blocks...');
  
  const provider = new WsProvider('wss://mainnet-rpc.avail.so/ws');
  const api = await ApiPromise.create({ provider });
  
  try {
    // Get current era and block
    const activeEra = await api.query.staking.activeEra();
    const currentEra = activeEra.unwrap().index.toNumber();
    const latestBlock = await api.rpc.chain.getHeader();
    const currentBlock = latestBlock.number.toNumber();
    
    console.log(`📊 Current era: ${currentEra}, Current block: ${currentBlock}`);
    
    // Calculate approximate block where previous era started
    // Era length is approximately 2400 blocks in Avail
    const approximateEraLength = 2400;
    const searchStart = currentBlock - approximateEraLength;
    
    console.log(`🔍 Searching from block ${searchStart} to ${currentBlock} for era transitions...`);
    
    // Search in chunks to avoid overwhelming the RPC
    const chunkSize = 50;
    let foundTransition = false;
    
    for (let start = currentBlock; start > searchStart && !foundTransition; start -= chunkSize) {
      const end = Math.max(start - chunkSize + 1, searchStart);
      console.log(`Checking blocks ${end} to ${start}...`);
      
      for (let blockNumber = start; blockNumber >= end; blockNumber--) {
        try {
          const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
          const events = await api.query.system.events.at(blockHash);
          
          const eraEvents = events.filter(({ event }) => 
            event.section === 'staking' && 
            ['NewEra', 'EraPaid', 'EraEnded'].includes(event.method)
          );
          
          if (eraEvents.length > 0) {
            console.log(`🎯 Found era transition events in block ${blockNumber}:`);
            eraEvents.forEach(({ event }) => {
              console.log(`  - ${event.section}.${event.method}: ${JSON.stringify(event.data.toHuman())}`);
            });
            
            // Get block range for this era
            const eraStartBlock = blockNumber;
            const eraEndBlock = blockNumber + approximateEraLength;
            
            console.log(`\n✅ Recommended sync range for era testing:`);
            console.log(`   From: ${eraStartBlock - 10}`);
            console.log(`   To: ${Math.min(eraEndBlock, currentBlock)}`);
            console.log(`\n💡 Run this command to sync era transition blocks:`);
            console.log(`   npm run sync:range -- --from ${eraStartBlock - 10} --to ${eraStartBlock + 50} --batch-size 10`);
            
            foundTransition = true;
            break;
          }
        } catch (error) {
          console.log(`Error checking block ${blockNumber}: ${error.message}`);
        }
      }
    }
    
    if (!foundTransition) {
      console.log('❌ No era transitions found in the searched range');
      console.log('💡 Try syncing around era boundaries. Typical era blocks for recent eras:');
      
      // Calculate some era start blocks based on current era
      for (let era = currentEra; era > currentEra - 3; era--) {
        const estimatedBlock = currentBlock - ((currentEra - era) * approximateEraLength);
        console.log(`   Era ${era}: around block ${estimatedBlock}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await api.disconnect();
  }
}

findEraTransition().catch(console.error);