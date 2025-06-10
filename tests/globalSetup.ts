// Jest global setup - runs once before all tests
import server from '../src/index';

export default async (): Promise<void> => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  console.log('🧪 Starting test suite...');
  
  try {
    // Initialize server services (database, cache, all services)
    await server.initializeServicesForTesting();
    console.log('✅ Global setup: Services initialized successfully');
    
    // Store server reference for teardown
    (global as any).__SERVER__ = server;
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}; 