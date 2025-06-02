# CamelCase Standardization for Avail Explorer API

## Overview

This document outlines the standardization of camelCase naming conventions across the Avail Explorer API. This change ensures consistent naming patterns in all API responses, improving developer experience and maintaining best practices.

## Why camelCase?

CamelCase has become the standard naming convention in JavaScript/TypeScript and many modern APIs for several reasons:

1. **JavaScript Compatibility**: camelCase is the conventional variable naming pattern in JavaScript, making API responses more naturally compatible with frontend JavaScript code.
2. **Framework Consistency**: Most modern frontend frameworks and libraries (React, Vue, Angular) work best with camelCase properties.
3. **Readability**: camelCase offers good readability while eliminating the need for special characters.
4. **Reduced Transformation**: Frontend developers no longer need to transform property names, reducing potential bugs and improving development velocity.

## Implementation Details

### 1. ESLint Rules

We've added ESLint rules to enforce camelCase variable names throughout the codebase:

```javascript
'@typescript-eslint/naming-convention': [
  'error',
  {
    selector: 'default',
    format: ['camelCase'],
  },
  // Additional configurations...
]
```

### 2. Case Conversion Utilities

We've created utility functions in `src/utils/caseConverter.ts` to handle conversion between different naming conventions:

- `snakeToCamel`: Converts snake_case strings to camelCase
- `camelToSnake`: Converts camelCase strings to snake_case
- `keysToCamelCase`: Recursively transforms all keys in an object from snake_case to camelCase
- `keysToSnakeCase`: Recursively transforms all keys in an object from camelCase to snake_case

### 3. Middleware Approach

We've implemented a middleware solution in `src/middleware/camelCaseResponse.ts` that automatically converts all API responses to camelCase. This middleware:

- Intercepts outgoing API responses
- Transforms response data keys to camelCase
- Applies the transformation recursively to nested objects and arrays

The middleware is applied globally to all API routes in `src/index.ts`:

```typescript
// Apply camelCase middleware to all API routes
this.app.use(config.api.prefix, camelCaseResponse);
```

### 4. Route Handler Updates

Individual route handlers have been updated to use the utility functions for converting data received from external sources to camelCase, ensuring consistent responses.

### 5. Documentation Updates

The API documentation has been updated to reflect the camelCase standard in all JSON response examples.

## Testing

1. **Unit Tests**: We've added comprehensive unit tests for the case conversion utilities in `tests/unit/utils/caseConverter.test.ts`.
2. **API Tests**: The integration tests for API routes verify that responses maintain camelCase formatting.

To run specific test suites:

```bash
# Test case conversion utilities
npm run test:camelcase

# Test API routes
npm run test:api
```

## Benefits

- **Consistency**: All API responses now use camelCase properties
- **Improved Developer Experience**: Frontend developers can work with responses directly without transformation
- **Reduced Bugs**: Eliminating manual case conversion reduces potential for errors
- **Best Practices**: Follows JavaScript ecosystem conventions and best practices

## Backward Compatibility

While the internal conversion is robust, developers should be aware that all API responses now use camelCase property names instead of snake_case. If consumers were specifically depending on snake_case responses, they will need to update their code accordingly.

## Example Response

Before:
```json
{
  "success": true,
  "data": {
    "block_number": 12345,
    "parent_hash": "0x...",
    "extrinsics_count": 10
  }
}
```

After:
```json
{
  "success": true,
  "data": {
    "blockNumber": 12345,
    "parentHash": "0x...",
    "extrinsicsCount": 10
  }
}
``` 