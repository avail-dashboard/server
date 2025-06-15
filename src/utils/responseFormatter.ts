import { APIResponse } from '../types';
import { PaginatedResponse } from '../types/database';

export interface StandardAPIResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: {
    source: string;
    [key: string]: any;
  };
  timestamp?: string;
}

/**
 * Format paginated response with consistent structure
 */
export function formatPaginatedResponse<T>(
  result: PaginatedResponse<T>,
  meta?: { source?: string; [key: string]: any }
): StandardAPIResponse<T[]> {
  return {
    success: true,
    data: result.data,
    pagination: {
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalCount: result.pagination.total_count,
      totalPages: result.pagination.total_pages,
      hasNext: result.pagination.has_next,
      hasPrev: result.pagination.has_prev,
    },
    meta: meta ? { source: 'database', ...meta } : { source: 'database' },
  };
}

/**
 * Format single item response with consistent structure
 */
export function formatSingleResponse<T>(
  data: T,
  meta?: { source?: string; [key: string]: any }
): StandardAPIResponse<T> {
  return {
    success: true,
    data,
    meta: meta ? { source: 'database', ...meta } : { source: 'database' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format error response with consistent structure
 */
export function formatErrorResponse(
  message: string,
  code: string = 'INTERNAL_ERROR',
  statusCode: number = 500
): { success: false; error: { code: string; message: string }; timestamp: string } {
  return {
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };
}