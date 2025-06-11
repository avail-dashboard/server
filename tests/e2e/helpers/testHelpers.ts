// Test Helpers for E2E API Tests
import request from 'supertest';
import express from 'express';

export interface TestBlock {
  number: number;
  hash: string;
  parentHash: string;
  stateRoot: string;
  timestamp: string;
}

export interface TestExtrinsic {
  hash: string;
  blockNumber: number;
  extrinsicIndex: number;
  module: string;
  call: string;
  success: boolean;
}

export interface TestDataSubmission {
  extrinsicHash: string;
  blockNumber: number;
  extrinsicIndex: number;
  appId: number;
  dataSize: number;
  success: boolean;
  timestamp: string;
}

/**
 * Get a valid block from the API for testing
 */
export async function getTestBlock(app: express.Application): Promise<TestBlock | null> {
  const response = await request(app)
    .get('/api/blocks?limit=1')
    .expect(200);

  if (response.body.data.blocks.length > 0) {
    return response.body.data.blocks[0];
  }
  return null;
}

/**
 * Get a valid extrinsic from the API for testing
 */
export async function getTestExtrinsic(app: express.Application): Promise<TestExtrinsic | null> {
  const response = await request(app)
    .get('/api/extrinsics?limit=1')
    .expect(200);

  if (response.body.data.extrinsics.length > 0) {
    return response.body.data.extrinsics[0];
  }
  return null;
}

/**
 * Get a valid data submission from the API for testing
 */
export async function getTestDataSubmission(app: express.Application): Promise<TestDataSubmission | null> {
  const response = await request(app)
    .get('/api/data-submissions?limit=1')
    .expect(200);

  if (response.body.data.dataSubmissions.length > 0) {
    return response.body.data.dataSubmissions[0];
  }
  return null;
}

/**
 * Validate that an object has camelCase properties and not snake_case
 */
export function validateCamelCase(obj: any, snakeCaseFields: string[], camelCaseFields: string[]): void {
  // Check that camelCase fields exist
  camelCaseFields.forEach(field => {
    expect(obj).toHaveProperty(field);
  });

  // Check that snake_case fields don't exist
  snakeCaseFields.forEach(field => {
    expect(obj).not.toHaveProperty(field);
  });
}

/**
 * Validate standard API response structure
 */
export function validateApiResponse(response: any, expectedDataKeys: string[]): void {
  expect(response.body).toHaveProperty('success');
  expect(response.body).toHaveProperty('data');
  expect(response.body).toHaveProperty('meta');

  if (response.body.success) {
    expectedDataKeys.forEach(key => {
      expect(response.body.data).toHaveProperty(key);
    });
  } else {
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code');
    expect(response.body.error).toHaveProperty('message');
  }
}

/**
 * Validate pagination metadata
 */
export function validatePaginationMeta(meta: any, expectedPage: number, expectedLimit: number): void {
  expect(meta).toHaveProperty('page', expectedPage);
  expect(meta).toHaveProperty('limit', expectedLimit);
  expect(meta).toHaveProperty('total');
  expect(typeof meta.total).toBe('number');
  expect(meta.total).toBeGreaterThanOrEqual(0);
}

/**
 * Test data for creating mock responses
 */
export const mockTestData = {
  block: {
    number: 1234567,
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    parentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    stateRoot: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
    timestamp: '2024-01-01T12:00:00.000Z',
  },
  extrinsic: {
    hash: '0xextrinsic1234567890abcdef1234567890abcdef1234567890abcdef123456',
    blockNumber: 1234567,
    extrinsicIndex: 2,
    module: 'dataAvailability',
    call: 'submitData',
    success: true,
  },
  dataSubmission: {
    extrinsicHash: '0xextrinsic1234567890abcdef1234567890abcdef1234567890abcdef123456',
    blockNumber: 1234567,
    extrinsicIndex: 2,
    appId: 1,
    dataSize: 1024,
    success: true,
    timestamp: '2024-01-01T12:00:00.000Z',
  },
};

/**
 * Common error response validation
 */
export function validateErrorResponse(response: any, expectedCode: string, expectedMessage?: string): void {
  expect(response.body).toMatchObject({
    success: false,
    error: {
      code: expectedCode,
      message: expect.any(String),
    },
  });

  if (expectedMessage) {
    expect(response.body.error.message).toBe(expectedMessage);
  }
}

/**
 * Validate that array is sorted correctly
 */
export function validateSorting(
  array: any[], 
  field: string, 
  order: 'asc' | 'desc' = 'desc',
): void {
  if (array.length <= 1) {
    return;
  }

  for (let i = 1; i < array.length; i++) {
    const current = array[i][field];
    const previous = array[i - 1][field];

    if (order === 'desc') {
      expect(current).toBeLessThanOrEqual(previous);
    } else {
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  }
}

/**
 * Wait for a specified amount of time (useful for async operations)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random test identifier
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
} 