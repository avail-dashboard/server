import { Request, Response, NextFunction } from 'express';
import { APIError } from '../types';

/**
 * Async handler wrapper that automatically catches errors and passes them to Express error handler
 * This eliminates the need for try-catch blocks in every route handler
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Enhanced error creators with better context
 */
export const createAPIError = (
  message: string,
  code: string,
  statusCode: number,
  details?: any,
  originalError?: Error,
): APIError => {
  const error = new Error(message) as APIError;
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  
  // Preserve original error stack and properties for debugging
  if (originalError) {
    error.stack = originalError.stack;
    error.cause = originalError;
  }
  
  return error;
};

export const createValidationError = (message: string, field?: string, value?: any): APIError => {
  return createAPIError(
    message,
    'VALIDATION_ERROR',
    400,
    { field, value },
  );
};

export const createNotFoundError = (resource: string, identifier?: string): APIError => {
  return createAPIError(
    `${resource} not found`,
    'NOT_FOUND',
    404,
    { resource, identifier },
  );
};

export const createInternalError = (message: string, originalError?: Error, details?: any): APIError => {
  return createAPIError(
    message,
    'INTERNAL_SERVER_ERROR',
    500,
    details,
    originalError,
  );
};

export const createDatabaseError = (message: string, originalError?: Error, operation?: string): APIError => {
  return createAPIError(
    message,
    'DATABASE_ERROR',
    500,
    { operation, originalMessage: originalError?.message },
    originalError,
  );
};

export const createExternalServiceError = (service: string, originalError?: Error): APIError => {
  return createAPIError(
    `External service error: ${service}`,
    'EXTERNAL_SERVICE_ERROR',
    502,
    { service, originalMessage: originalError?.message },
    originalError,
  );
};

/**
 * Middleware to catch async errors in route handlers
 * Alternative to using asyncHandler wrapper
 */
export const catchAsync = (req: Request, res: Response, next: NextFunction) => {
  // This middleware can be used to wrap entire router if needed
  return next;
}; 