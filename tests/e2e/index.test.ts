// E2E Test Suite for Avail Explorer API Endpoints
// This file imports and runs all endpoint-specific test suites

import './api.blocks.test';
import './api.extrinsics.test';
import './api.data-submissions.test';

describe('E2E Test Suite', () => {
  it('should run all endpoint tests', () => {
    // This test serves as a placeholder to ensure the test suite runs
    // Note: Service initialization/cleanup is handled by Jest global setup/teardown
    expect(true).toBe(true);
  });
}); 