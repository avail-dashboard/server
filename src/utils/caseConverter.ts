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
export const keysToCamelCase = <T>(obj: T): Record<string, unknown> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj as unknown as Record<string, unknown>;
  }

  const camelCaseObj: Record<string, unknown> = {};
  
  Object.keys(obj as Record<string, unknown>).forEach(key => {
    const camelKey = snakeToCamel(key);
    const value = (obj as Record<string, unknown>)[key];
    
    // Handle nested objects and arrays recursively
    if (Array.isArray(value)) {
      camelCaseObj[camelKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToCamelCase(item) : item,
      );
    } else if (typeof value === 'object' && value !== null) {
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
export const keysToSnakeCase = <T extends Record<string, unknown>>(obj: T): Record<string, unknown> => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const snakeCaseObj: Record<string, unknown> = {};
  
  Object.keys(obj).forEach(key => {
    const snakeKey = camelToSnake(key);
    const value = obj[key];
    
    // Handle nested objects and arrays recursively
    if (Array.isArray(value)) {
      snakeCaseObj[snakeKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToSnakeCase(item as Record<string, unknown>) : item,
      );
    } else if (value !== null && typeof value === 'object') {
      snakeCaseObj[snakeKey] = keysToSnakeCase(value as Record<string, unknown>);
    } else {
      snakeCaseObj[snakeKey] = value;
    }
  });
  
  return snakeCaseObj;
}; 