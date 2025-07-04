// Test script to manually test era processing
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

async function testEraProcessing() {
  console.log('🧪 Testing era processing functionality...');
  
  // Import our services  
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    // Test 1: Check current era from database
    const currentDbEra = await prisma.era.findFirst({
      where: { active: true },
      orderBy: { number: 'desc' }
    });
    console.log('📊 Current era in DB:', currentDbEra?.number || 'None');
    
    // Test 2: Create a test era manually
    const testEraNumber = currentDbEra ? currentDbEra.number + 1 : 365;
    
    console.log(`🏗️  Creating test era ${testEraNumber}...`);
    
    const testEra = await prisma.era.create({
      data: {
        number: testEraNumber,
        startBlock: 1000000,
        endBlock: null,
        totalStaked: '1000000000000000000000000',
        validatorCount: 100,
        active: true
      }
    });
    
    console.log('✅ Test era created:', testEra);
    
    // Test 3: Check era count
    const eraCount = await prisma.era.count();
    console.log(`📈 Total eras in database: ${eraCount}`);
    
    // Test 4: List all eras
    const allEras = await prisma.era.findMany({
      orderBy: { number: 'desc' },
      take: 5
    });
    console.log('📋 Recent eras:');
    allEras.forEach(era => {
      console.log(`  Era ${era.number}: blocks ${era.startBlock}-${era.endBlock || 'current'}, active: ${era.active}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testEraProcessing().catch(console.error);