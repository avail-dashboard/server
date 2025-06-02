import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';

/**
 * Middleware to validate camelCase in API responses during testing
 * Throws an error if snake_case keys are found in TEST environment
 */

interface ValidationError {
  path: string;
  key: string;
  value: any;
}

function isSnakeCase(key: string): boolean {
  // Check if the key contains underscores and is not a known exception
  const exceptions = ['__typename', '_id', '_source', '__v']; // Common exceptions
  return key.includes('_') && !exceptions.includes(key) && key !== key.toUpperCase();
}

function validateObjectKeys(obj: any, path = 'root'): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (obj === null || obj === undefined) {
    return errors;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      errors.push(...validateObjectKeys(item, `${path}[${index}]`));
    });
    return errors;
  }
  
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const currentPath = path === 'root' ? key : `${path}.${key}`;
      
      if (isSnakeCase(key)) {
        errors.push({
          path: currentPath,
          key,
          value: obj[key],
        });
      }
      
      // Recursively check nested objects
      errors.push(...validateObjectKeys(obj[key], currentPath));
    });
  }
  
  return errors;
}

export const testCamelCaseValidator = (req: Request, res: Response, next: NextFunction) => {
  // Only run in TEST environment
  if (process.env.NODE_ENV !== 'test') {
    return next();
  }
  
  // Store the original json method
  const originalJson = res.json;
  
  // Override the json method to validate before sending
  res.json = function(obj: any) {
    try {
      // Validate the response object for snake_case keys
      const validationErrors = validateObjectKeys(obj);
      
      if (validationErrors.length > 0) {
        const errorMessage = `❌ CAMELCASE VALIDATION FAILED: Found snake_case keys in API response:\n${
          validationErrors.map(error => 
            `  - Path: ${error.path}, Key: "${error.key}", Value: ${JSON.stringify(error.value)}`,
          ).join('\n')
        }\n\nRoute: ${req.method} ${req.originalUrl}`;
        
        logError(new Error(errorMessage), {
          component: 'test-camelcase-validator',
          route: req.originalUrl,
          method: req.method,
          validationErrors,
        });
        
        // Throw error to fail the test
        throw new Error(errorMessage);
      }
      
      // If validation passes, call the original json method
      return originalJson.call(this, obj);
    } catch (error) {
      // Re-throw validation errors
      if (error instanceof Error && error.message.includes('CAMELCASE VALIDATION FAILED')) {
        throw error;
      }
      
      // For other errors, call the original json method
      return originalJson.call(this, obj);
    }
  };
  
  next();
};

export default testCamelCaseValidator; 