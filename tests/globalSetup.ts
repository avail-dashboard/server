// Jest global setup - runs once before all tests

export default async (): Promise<void> => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Any global setup logic can go here
  console.log('🧪 Starting test suite...');
}; 