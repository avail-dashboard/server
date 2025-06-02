import { 
  snakeToCamel, 
  camelToSnake, 
  keysToCamelCase, 
  keysToSnakeCase,
} from '../../../src/utils/caseConverter';

describe('Case Converter Utilities', () => {
  describe('snakeToCamel', () => {
    it('should convert snake_case string to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
      expect(snakeToCamel('parent_hash')).toBe('parentHash');
      expect(snakeToCamel('extrinsic_root')).toBe('extrinsicRoot');
      expect(snakeToCamel('user_id_value')).toBe('userIdValue');
    });

    it('should handle strings without underscores', () => {
      expect(snakeToCamel('hello')).toBe('hello');
      expect(snakeToCamel('world')).toBe('world');
    });

    it('should handle strings with dashes', () => {
      expect(snakeToCamel('hello-world')).toBe('helloWorld');
      expect(snakeToCamel('parent-hash')).toBe('parentHash');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase string to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
      expect(camelToSnake('parentHash')).toBe('parent_hash');
      expect(camelToSnake('extrinsicRoot')).toBe('extrinsic_root');
      expect(camelToSnake('userIdValue')).toBe('user_id_value');
    });

    it('should handle strings without uppercase letters', () => {
      expect(camelToSnake('hello')).toBe('hello');
      expect(camelToSnake('world')).toBe('world');
    });
  });

  describe('keysToCamelCase', () => {
    it('should convert object keys from snake_case to camelCase', () => {
      const input = {
        'user_id': 123,
        'first_name': 'John',
        'last_name': 'Doe',
      };

      const expected = {
        'userId': 123,
        'firstName': 'John',
        'lastName': 'Doe',
      };

      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it('should handle nested objects', () => {
      const input = {
        'user_id': 123,
        'user_details': {
          'first_name': 'John',
          'last_name': 'Doe',
          'address_info': {
            'street_name': 'Main St',
            'zip_code': '12345',
          },
        },
      };

      const expected = {
        'userId': 123,
        'userDetails': {
          'firstName': 'John',
          'lastName': 'Doe',
          'addressInfo': {
            'streetName': 'Main St',
            'zipCode': '12345',
          },
        },
      };

      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it('should handle arrays', () => {
      const input = {
        'user_id': 123,
        'hobbies': ['reading', 'swimming'],
        'previous_addresses': [
          {
            'street_name': 'Old St',
            'zip_code': '54321',
          },
          {
            'street_name': 'Ancient St',
            'zip_code': '98765',
          },
        ],
      };

      const expected = {
        'userId': 123,
        'hobbies': ['reading', 'swimming'],
        'previousAddresses': [
          {
            'streetName': 'Old St',
            'zipCode': '54321',
          },
          {
            'streetName': 'Ancient St',
            'zipCode': '98765',
          },
        ],
      };

      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it('should handle null and undefined values', () => {
      const input = {
        'user_id': null,
        'first_name': undefined,
        'details': null,
      };

      const expected = {
        'userId': null,
        'firstName': undefined,
        'details': null,
      };

      expect(keysToCamelCase(input)).toEqual(expected);
    });

    it('should return non-objects as is', () => {
      // Using type assertions to avoid TypeScript errors
      expect(keysToCamelCase(null as any)).toBeNull();
      expect(keysToCamelCase(undefined as any)).toBeUndefined();
      expect(keysToCamelCase('string' as any)).toBe('string');
      expect(keysToCamelCase(123 as any)).toBe(123);
      expect(keysToCamelCase(true as any)).toBe(true);
    });
  });

  describe('keysToSnakeCase', () => {
    it('should convert object keys from camelCase to snake_case', () => {
      const input = {
        'userId': 123,
        'firstName': 'John',
        'lastName': 'Doe',
      };

      const expected = {
        'user_id': 123,
        'first_name': 'John',
        'last_name': 'Doe',
      };

      expect(keysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle nested objects', () => {
      const input = {
        'userId': 123,
        'userDetails': {
          'firstName': 'John',
          'lastName': 'Doe',
          'addressInfo': {
            'streetName': 'Main St',
            'zipCode': '12345',
          },
        },
      };

      const expected = {
        'user_id': 123,
        'user_details': {
          'first_name': 'John',
          'last_name': 'Doe',
          'address_info': {
            'street_name': 'Main St',
            'zip_code': '12345',
          },
        },
      };

      expect(keysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle arrays', () => {
      const input = {
        'userId': 123,
        'hobbies': ['reading', 'swimming'],
        'previousAddresses': [
          {
            'streetName': 'Old St',
            'zipCode': '54321',
          },
          {
            'streetName': 'Ancient St',
            'zipCode': '98765',
          },
        ],
      };

      const expected = {
        'user_id': 123,
        'hobbies': ['reading', 'swimming'],
        'previous_addresses': [
          {
            'street_name': 'Old St',
            'zip_code': '54321',
          },
          {
            'street_name': 'Ancient St',
            'zip_code': '98765',
          },
        ],
      };

      expect(keysToSnakeCase(input)).toEqual(expected);
    });
  });
}); 