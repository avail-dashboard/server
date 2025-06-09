// Jest global teardown - runs once after all tests

export default async (): Promise<void> => {
  // Any global cleanup logic can go here
  console.log('🧪 Test suite completed.');
}; 