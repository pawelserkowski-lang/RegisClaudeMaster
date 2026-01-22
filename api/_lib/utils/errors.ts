/**
 * Error Handling System for RegisClaudeMaster
 * Provides structured error types, codes, and recovery mechanisms
 */

export enum ErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INVALID_MODEL = 'INVALID_MODEL',
  INVALID_PROMPT = 'INVALID_PROMPT',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  ALL_PROVIDERS_FAILED = 'ALL_PROVIDERS_FAILED',
  GROUNDING_FAILED = 'GROUNDING_FAILED',
  CACHE_ERROR = 'CACHE_ERROR',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Auth errors
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  retryAfter?: number; // seconds
  suggestedAction?: string;
  httpStatus: number;
}

interface ErrorConfig {
  message: string;
  httpStatus: number;
  retryable: boolean;
}

export const ERROR_MESSAGES: Record<ErrorCode, ErrorConfig> = {
  [ErrorCode.BAD_REQUEST]: {
    message: 'Invalid request format',
    httpStatus: 400,
    retryable: false,
  },
  [ErrorCode.UNAUTHORIZED]: {
    message: 'Authentication required',
    httpStatus: 401,
    retryable: false,
  },
  [ErrorCode.FORBIDDEN]: {
    message: 'Access denied',
    httpStatus: 403,
    retryable: false,
  },
  [ErrorCode.NOT_FOUND]: {
    message: 'Resource not found',
    httpStatus: 404,
    retryable: false,
  },
  [ErrorCode.RATE_LIMITED]: {
    message: 'Too many requests, please slow down',
    httpStatus: 429,
    retryable: true,
  },
  [ErrorCode.PAYLOAD_TOO_LARGE]: {
    message: 'Request payload too large',
    httpStatus: 413,
    retryable: false,
  },
  [ErrorCode.INVALID_MODEL]: {
    message: 'Selected model is not available',
    httpStatus: 400,
    retryable: false,
  },
  [ErrorCode.INVALID_PROMPT]: {
    message: 'Prompt is empty or invalid',
    httpStatus: 400,
    retryable: false,
  },

  [ErrorCode.INTERNAL_ERROR]: {
    message: 'An unexpected error occurred',
    httpStatus: 500,
    retryable: true,
  },
  [ErrorCode.PROVIDER_ERROR]: {
    message: 'AI provider returned an error',
    httpStatus: 502,
    retryable: true,
  },
  [ErrorCode.PROVIDER_TIMEOUT]: {
    message: 'AI provider took too long to respond',
    httpStatus: 504,
    retryable: true,
  },
  [ErrorCode.PROVIDER_UNAVAILABLE]: {
    message: 'AI provider is temporarily unavailable',
    httpStatus: 503,
    retryable: true,
  },
  [ErrorCode.ALL_PROVIDERS_FAILED]: {
    message: 'All AI providers are currently unavailable',
    httpStatus: 503,
    retryable: true,
  },
  [ErrorCode.GROUNDING_FAILED]: {
    message: 'Web search failed, but AI can still respond',
    httpStatus: 200,
    retryable: false,
  },
  [ErrorCode.CACHE_ERROR]: {
    message: 'Cache operation failed',
    httpStatus: 500,
    retryable: true,
  },

  [ErrorCode.NETWORK_ERROR]: {
    message: 'Network connection error',
    httpStatus: 503,
    retryable: true,
  },
  [ErrorCode.TIMEOUT]: {
    message: 'Request timed out',
    httpStatus: 504,
    retryable: true,
  },

  [ErrorCode.AUTH_EXPIRED]: {
    message: 'Session expired, please refresh',
    httpStatus: 401,
    retryable: false,
  },
  [ErrorCode.AUTH_INVALID]: {
    message: 'Invalid authentication credentials',
    httpStatus: 401,
    retryable: false,
  },
};

/**
 * Get suggested user action for a given error code
 */
export function getSuggestedAction(code: ErrorCode): string | undefined {
  switch (code) {
    case ErrorCode.RATE_LIMITED:
      return 'Wait a moment before trying again';
    case ErrorCode.PROVIDER_UNAVAILABLE:
    case ErrorCode.ALL_PROVIDERS_FAILED:
      return 'Try again in a few minutes or select a different model';
    case ErrorCode.AUTH_EXPIRED:
      return 'Refresh the page to continue';
    case ErrorCode.INVALID_PROMPT:
      return 'Enter a question or message to send';
    case ErrorCode.PAYLOAD_TOO_LARGE:
      return 'Shorten your message and try again';
    case ErrorCode.INVALID_MODEL:
      return 'Select a different model from the dropdown';
    case ErrorCode.NETWORK_ERROR:
      return 'Check your internet connection and try again';
    case ErrorCode.TIMEOUT:
      return 'Try a simpler query or try again later';
    case ErrorCode.PROVIDER_TIMEOUT:
      return 'The AI is busy - try again in a moment';
    case ErrorCode.GROUNDING_FAILED:
      return 'Response generated without web search context';
    default:
      return undefined;
  }
}

/**
 * Create a structured API error object
 */
export function createApiError(
  code: ErrorCode,
  details?: Record<string, unknown>,
  customMessage?: string
): ApiError {
  const base = ERROR_MESSAGES[code];
  return {
    code,
    message: customMessage ?? base.message,
    details,
    retryable: base.retryable,
    httpStatus: base.httpStatus,
    suggestedAction: getSuggestedAction(code),
  };
}

/**
 * Create an API error with retryAfter time
 */
export function createRateLimitError(
  retryAfter: number,
  details?: Record<string, unknown>
): ApiError {
  const error = createApiError(ErrorCode.RATE_LIMITED, details);
  error.retryAfter = retryAfter;
  return error;
}

/**
 * Application Error class for throwing structured errors
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;
  public retryAfter?: number;

  constructor(
    code: ErrorCode,
    details?: Record<string, unknown>,
    customMessage?: string
  ) {
    const base = ERROR_MESSAGES[code];
    super(customMessage ?? base.message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = base.httpStatus;
    this.retryable = base.retryable;
    this.details = details;
  }

  /**
   * Set retry after time (for rate limit errors)
   */
  withRetryAfter(seconds: number): this {
    this.retryAfter = seconds;
    return this;
  }

  /**
   * Convert to JSON for API response
   */
  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      httpStatus: this.httpStatus,
      suggestedAction: getSuggestedAction(this.code),
    };
  }
}

/**
 * Get recovery suggestions for displaying to the user
 */
export function getRecoverySuggestions(error: ApiError): string[] {
  const suggestions: string[] = [];

  if (error.retryable) {
    suggestions.push('Try the request again');
  }

  if (error.code === ErrorCode.ALL_PROVIDERS_FAILED) {
    suggestions.push('Check if your internet connection is working');
    suggestions.push('Try selecting a specific model instead of Auto');
  }

  if (error.code === ErrorCode.RATE_LIMITED && error.retryAfter) {
    suggestions.push(`Wait ${error.retryAfter} seconds before retrying`);
  } else if (error.code === ErrorCode.RATE_LIMITED) {
    suggestions.push('Wait 60 seconds before retrying');
  }

  if (error.code === ErrorCode.NETWORK_ERROR) {
    suggestions.push('Check your internet connection');
    suggestions.push('Try refreshing the page');
  }

  if (error.code === ErrorCode.TIMEOUT) {
    suggestions.push('Try a shorter or simpler query');
  }

  if (error.suggestedAction && !suggestions.includes(error.suggestedAction)) {
    suggestions.push(error.suggestedAction);
  }

  return suggestions;
}

/**
 * Check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if an object is a valid ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'httpStatus' in error &&
    typeof (error as ApiError).code === 'string' &&
    typeof (error as ApiError).message === 'string' &&
    typeof (error as ApiError).httpStatus === 'number'
  );
}

/**
 * Convert an unknown error to an AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('abort')) {
      return new AppError(ErrorCode.TIMEOUT, { originalMessage: error.message });
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new AppError(ErrorCode.NETWORK_ERROR, {
        originalMessage: error.message,
      });
    }

    if (message.includes('401') || message.includes('unauthorized')) {
      return new AppError(ErrorCode.UNAUTHORIZED, {
        originalMessage: error.message,
      });
    }

    if (message.includes('429') || message.includes('rate limit')) {
      return new AppError(ErrorCode.RATE_LIMITED, {
        originalMessage: error.message,
      });
    }

    return new AppError(ErrorCode.INTERNAL_ERROR, {
      originalMessage: error.message,
    });
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, {
    originalError: String(error),
  });
}

/**
 * Create a JSON Response with error
 */
export function createErrorResponse(
  error: AppError | ApiError,
  headers?: Headers
): Response {
  const apiError = isAppError(error) ? error.toJSON() : error;
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(apiError), {
    status: apiError.httpStatus,
    headers: responseHeaders,
  });
}

/**
 * Wrap async handler with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
  getHeaders?: (...args: T) => Headers
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const appError = toAppError(error);
      const headers = getHeaders?.(...args);
      return createErrorResponse(appError, headers);
    }
  };
}
