const { spawn } = require('child_process');
const http = require('http');

// Simple test to verify the stats endpoint works
async function testStatsEndpoint() {
  console.log('🧪 Testing Data Submissions Stats Endpoint Fix...\n');
  
  try {
    // Start the server
    console.log('📡 Starting server...');
    const serverProcess = spawn('npm', ['start'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    // Wait for server to start
    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
    
    console.log('🔍 Testing /api/data-submissions/stats endpoint...');
    
    // Test the stats endpoint
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/data-submissions/stats',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.setTimeout(10000, () => {
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
    
    console.log(`📊 Response Status: ${response.statusCode}`);
    console.log(`📋 Response Headers:`, response.headers);
    
    try {
      const jsonResponse = JSON.parse(response.body);
      console.log(`📈 Response Body:`, JSON.stringify(jsonResponse, null, 2));
      
      if (response.statusCode === 200 && jsonResponse.success) {
        console.log('\n✅ SUCCESS: Stats endpoint is working correctly!');
        console.log('✅ No more 500 errors');
        console.log('✅ Proper JSON response structure');
        
        if (jsonResponse.data) {
          console.log('✅ Stats data structure looks correct:');
          console.log(`   - Total Submissions: ${jsonResponse.data.totalSubmissions}`);
          console.log(`   - Total Data Size: ${jsonResponse.data.totalDataSize}`);
          console.log(`   - Unique Apps: ${jsonResponse.data.uniqueApps}`);
          console.log(`   - Unique Submitters: ${jsonResponse.data.uniqueSubmitters}`);
          console.log(`   - Average Size: ${jsonResponse.data.averageSize}`);
          console.log(`   - Submissions Today: ${jsonResponse.data.submissionsToday}`);
          console.log(`   - Data Size Today: ${jsonResponse.data.dataSizeToday}`);
        }
      } else {
        console.log('\n❌ ISSUE: Unexpected response');
        if (jsonResponse.error) {
          console.log(`❌ Error: ${jsonResponse.error.message}`);
        }
      }
    } catch (parseError) {
      console.log('\n❌ ISSUE: Could not parse JSON response');
      console.log('Raw response:', response.body);
    }
    
    // Test the data submissions list endpoint too
    console.log('\n🔍 Testing /api/data-submissions endpoint...');
    
    const listOptions = {
      ...options,
      path: '/api/data-submissions?limit=5'
    };
    
    const listResponse = await new Promise((resolve, reject) => {
      const req = http.request(listOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => reject(new Error('Request timeout')));
      req.end();
    });
    
    console.log(`📊 List Response Status: ${listResponse.statusCode}`);
    
    if (listResponse.statusCode === 200) {
      const listJson = JSON.parse(listResponse.body);
      console.log('✅ Data submissions list endpoint working');
      console.log(`✅ Found ${listJson.data?.length || 0} submissions`);
    }
    
    // Kill the server
    serverProcess.kill('SIGTERM');
    
  } catch (error) {
    console.log('\n❌ TEST FAILED:', error.message);
    console.log('This might be due to:');
    console.log('- Database not running (server will exit if database unavailable)');
    console.log('- Server configuration issues');
    console.log('- Network connectivity problems');
    console.log('- Server exited due to database unavailability (fail-fast approach)');
  }
}

// Run the test
testStatsEndpoint().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test failed with error:', error);
  process.exit(1);
}); 