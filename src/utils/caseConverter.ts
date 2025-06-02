/**
 * Utility functions for converting object keys between different case styles
 */

/**
 * Converts a snake_case string to camelCase
 * @param str The string to convert
 * @returns The camelCase version of the string
 */
export const snakeToCamel = (str: string): string => {
  return str.replace(/([-_][a-z])/g, (group) => 
    group.toUpperCase()
      .replace('-', '')
      .replace('_', ''),
  );
};

/**
 * Converts a camelCase string to snake_case
 * @param str The string to convert
 * @returns The snake_case version of the string
 */
export const camelToSnake = (str: string): string => {
  return str.replace(/([A-Z])/g, (group) => `_${group.toLowerCase()}`);
};

/**
 * Recursively transforms all keys in an object from snake_case to camelCase
 * @param obj The object to transform
 * @returns A new object with all keys in camelCase
 */
export const keysToCamelCase = <T extends Record<string, any>>(obj: T): Record<string, any> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const camelCaseObj: Record<string, any> = {};
  
  Object.keys(obj).forEach(key => {
    const camelKey = snakeToCamel(key);
    const value = obj[key];
    
    // Handle nested objects and arrays recursively
    if (Array.isArray(value)) {
      camelCaseObj[camelKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToCamelCase(item) : item,
      );
    } else if (value !== null && typeof value === 'object') {
      camelCaseObj[camelKey] = keysToCamelCase(value);
    } else {
      camelCaseObj[camelKey] = value;
    }
  });
  
  return camelCaseObj;
};

/**
 * Recursively transforms all keys in an object from camelCase to snake_case
 * @param obj The object to transform
 * @returns A new object with all keys in snake_case
 */
export const keysToSnakeCase = <T extends Record<string, any>>(obj: T): Record<string, any> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const snakeCaseObj: Record<string, any> = {};
  
  Object.keys(obj).forEach(key => {
    const snakeKey = camelToSnake(key);
    const value = obj[key];
    
    // Handle nested objects and arrays recursively
    if (Array.isArray(value)) {
      snakeCaseObj[snakeKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToSnakeCase(item) : item,
      );
    } else if (value !== null && typeof value === 'object') {
      snakeCaseObj[snakeKey] = keysToSnakeCase(value);
    } else {
      snakeCaseObj[snakeKey] = value;
    }
  });
  
  return snakeCaseObj;
}; 