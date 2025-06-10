// Jest global teardown - runs once after all tests

export default async (): Promise<void> => {
  console.log('🧪 Test suite completed.');
  
  try {
    // Get server reference from global setup
    const server = (global as any).__SERVER__;
    
    if (server) {
      // Shutdown all services (database, cache, all services)
      await server.shutdownServicesForTesting();
      console.log('✅ Global teardown: Services shutdown successfully');
    }
  } catch (error) {
    console.error('❌ Global teardown error:', error);
    // Don't throw here to avoid masking test failures
  }
}; 