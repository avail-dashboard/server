/**
 * Middleware to transform all API responses to camelCase
 */
import { Request, Response, NextFunction } from 'express';
import { keysToCamelCase } from '../utils/caseConverter';

/**
 * Express middleware that transforms all response data to use camelCase keys
 */
export const camelCaseResponse = (req: Request, res: Response, next: NextFunction): void => {
  // Store the original json method
  const originalJson = res.json;

  // Override the json method
  res.json = function (body: any): Response {
    // Transform the response body
    let transformedBody = body;
    
    if (body && typeof body === 'object') {
      // Apply camelCase transformation to the entire response
      transformedBody = keysToCamelCase(body);
    }

    // Call the original json method with the transformed body
    return originalJson.call(this, transformedBody);
  };

  next();
}; 