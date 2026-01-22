/**
 * Client-side Error Handling Utilities
 * Provides error parsing, retry logic, and partial failure handling
 */

import { ErrorCode, isApiError } from '../../api/_lib/utils/errors';
import type { ApiError } from '../../api/_lib/utils/errors';

export interface ParsedError {
  apiError: ApiError;
  isNetworkError: boolean;
  isAuthError: boolean;
  shouldShowToUser: boolean;
}

/**
 * Parse any error into a structured format for UI display
 */
export function parseError(error: unknown): ParsedError {
  // Network errors (fetch failures)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      apiError: {
        code: ErrorCode.NETWORK_ERROR,
        message: 'Unable to connect to server',
        retryable: true,
        httpStatus: 0,
      },
      isNetworkError: true,
      isAuthError: false,
      shouldShowToUser: true,
    };
  }

  // Abort/Timeout errors
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      apiError: {
        code: ErrorCode.TIMEOUT,
        message: 'Request was cancelled',
        retryable: true,
        httpStatus: 0,
      },
      isNetworkError: true,
      isAuthError: false,
      shouldShowToUser: false,
    };
  }

  // API errors (already formatted from server)
  if (isApiError(error)) {
    const isAuth = [
      ErrorCode.UNAUTHORIZED,
      ErrorCode.AUTH_EXPIRED,
      ErrorCode.AUTH_INVALID,
    ].includes((error as any).code);
    return {
      apiError: error,
      isNetworkError: false,
      isAuthError: isAuth,
      shouldShowToUser: true,
    };
  }

  // Standard Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for known error patterns
    if (message === 'auth_error' || message.includes('auth')) {
      return {
        apiError: {
          code: ErrorCode.AUTH_EXPIRED,
          message: 'Authentication failed',
          retryable: false,
          httpStatus: 401,
        },
        isNetworkError: false,
        isAuthError: true,
        shouldShowToUser: true,
      };
    }

    if (message === 'timeout' || message.includes('timeout')) {
      return {
        apiError: {
          code: ErrorCode.TIMEOUT,
          message: 'Request timed out',
          retryable: true,
          httpStatus: 504,
        },
        isNetworkError: true,
        isAuthError: false,
        shouldShowToUser: true,
      };
    }

    if (message === 'rate_limit' || message.includes('rate limit')) {
      return {
        apiError: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests',
          retryable: true,
          httpStatus: 429,
        },
        isNetworkError: false,
        isAuthError: false,
        shouldShowToUser: true,
      };
    }

    if (message.includes('network') || message.includes('failed to fetch')) {
      return {
        apiError: {
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network connection error',
          retryable: true,
          httpStatus: 0,
        },
        isNetworkError: true,
        isAuthError: false,
        shouldShowToUser: true,
      };
    }
  }

  // Unknown errors - create a generic error
  return {
    apiError: {
      code: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      retryable: true,
      httpStatus: 500,
    },
    isNetworkError: false,
    isAuthError: false,
    shouldShowToUser: true,
  };
}

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 200; // Add some jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = (error) => {
      const parsed = parseError(error);
      return parsed.apiError.retryable;
    },
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      // Don't delay after the last attempt
      if (attempt < maxRetries - 1) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay);
        onRetry?.(error, attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Partial result type for handling partial failures
 */
export interface PartialResult<T> {
  data?: T;
  error?: ApiError;
  partial: boolean;
  warnings?: ApiError[];
}

/**
 * Handle partial failures gracefully
 * Use when some parts of the response succeed but others fail
 */
export function handlePartialFailure<T>(
  mainResult: T | undefined,
  errors: {
    groundingError?: ApiError;
    cacheError?: ApiError;
    otherErrors?: ApiError[];
  } = {}
): PartialResult<T> {
  const { groundingError, cacheError, otherErrors = [] } = errors;
  const warnings: ApiError[] = [];

  // Collect non-fatal warnings
  if (groundingError && groundingError.code === ErrorCode.GROUNDING_FAILED) {
    warnings.push(groundingError);
  }

  if (cacheError && cacheError.code === ErrorCode.CACHE_ERROR) {
    warnings.push(cacheError);
  }

  // Add other non-fatal errors as warnings
  for (const error of otherErrors) {
    if (error.httpStatus < 500 || error.code === ErrorCode.GROUNDING_FAILED) {
      warnings.push(error);
    }
  }

  // Main result failed
  if (!mainResult) {
    const fatalError =
      otherErrors.find((e) => e.httpStatus >= 500) ??
      groundingError ??
      cacheError ?? {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to get response',
        retryable: true,
        httpStatus: 500,
      };

    return {
      error: fatalError,
      partial: false,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Main result succeeded with possible warnings
  return {
    data: mainResult,
    partial: warnings.length > 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Error state manager for UI components
 */
export interface ErrorState {
  error: ApiError | null;
  isVisible: boolean;
  retryCount: number;
}

export function createErrorState(): ErrorState {
  return {
    error: null,
    isVisible: false,
    retryCount: 0,
  };
}

export function setError(state: ErrorState, error: unknown): ErrorState {
  const parsed = parseError(error);
  return {
    error: parsed.apiError,
    isVisible: parsed.shouldShowToUser,
    retryCount: state.retryCount,
  };
}

export function dismissError(state: ErrorState): ErrorState {
  return {
    ...state,
    isVisible: false,
  };
}

export function incrementRetry(state: ErrorState): ErrorState {
  return {
    ...state,
    retryCount: state.retryCount + 1,
  };
}

export function clearError(): ErrorState {
  return createErrorState();
}

/**
 * Hook-like error handler for async operations
 * Returns a wrapped function that handles errors automatically
 */
export function withErrorHandler<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  handlers: {
    onError?: (error: ApiError) => void;
    onNetworkError?: (error: ApiError) => void;
    onAuthError?: (error: ApiError) => void;
  } = {}
): (...args: T) => Promise<R | undefined> {
  return async (...args: T): Promise<R | undefined> => {
    try {
      return await fn(...args);
    } catch (error) {
      const parsed = parseError(error);

      if (parsed.isAuthError && handlers.onAuthError) {
        handlers.onAuthError(parsed.apiError);
      } else if (parsed.isNetworkError && handlers.onNetworkError) {
        handlers.onNetworkError(parsed.apiError);
      } else if (handlers.onError) {
        handlers.onError(parsed.apiError);
      }

      return undefined;
    }
  };
}

/**
 * Create a timeout promise that rejects after specified duration
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error: ApiError = {
        code: ErrorCode.TIMEOUT,
        message: message ?? `Operation timed out after ${ms}ms`,
        retryable: true,
        httpStatus: 504,
      };
      reject(error);
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  return Promise.race([promise, createTimeout(ms, message)]);
}

/**
 * Parse error from HTTP response
 */
export async function parseHttpError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json();
    if (isApiError(data)) {
      return data;
    }
    // Legacy error format
    if (data.error && typeof data.error === 'string') {
      return {
        code: mapHttpStatusToErrorCode(response.status),
        message: data.error,
        retryable: response.status >= 500 || response.status === 429,
        httpStatus: response.status,
      };
    }
  } catch {
    // Failed to parse JSON
  }

  return {
    code: mapHttpStatusToErrorCode(response.status),
    message: `HTTP Error ${response.status}`,
    retryable: response.status >= 500 || response.status === 429,
    httpStatus: response.status,
  };
}

/**
 * Map HTTP status code to ErrorCode
 */
function mapHttpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.BAD_REQUEST;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 502:
      return ErrorCode.PROVIDER_ERROR;
    case 503:
      return ErrorCode.PROVIDER_UNAVAILABLE;
    case 504:
      return ErrorCode.TIMEOUT;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  }
}
