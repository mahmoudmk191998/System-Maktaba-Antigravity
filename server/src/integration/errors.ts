/**
 * RMS REST API Client SDK Custom Errors
 */

export class RmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RmsError';
  }
}

export class RmsApiError extends RmsError {
  public statusCode: number;
  public code: string;
  public details?: any;
  public requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code: string = 'API_ERROR',
    details?: any,
    requestId?: string
  ) {
    super(message);
    this.name = 'RmsApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export class RmsAuthError extends RmsApiError {
  constructor(message: string = 'Authentication failed', details?: any, requestId?: string) {
    super(message, 401, 'UNAUTHORIZED', details, requestId);
    this.name = 'RmsAuthError';
  }
}

export class RmsForbiddenError extends RmsApiError {
  constructor(message: string = 'Access forbidden', details?: any, requestId?: string) {
    super(message, 403, 'FORBIDDEN', details, requestId);
    this.name = 'RmsForbiddenError';
  }
}

export class RmsNotFoundError extends RmsApiError {
  constructor(message: string = 'Resource not found', details?: any, requestId?: string) {
    super(message, 404, 'NOT_FOUND', details, requestId);
    this.name = 'RmsNotFoundError';
  }
}

export class RmsConflictError extends RmsApiError {
  constructor(message: string = 'Conflict error', details?: any, requestId?: string) {
    super(message, 409, 'CONFLICT', details, requestId);
    this.name = 'RmsConflictError';
  }
}

export class RmsValidationError extends RmsApiError {
  constructor(message: string = 'Validation failed', details?: any, requestId?: string) {
    super(message, 400, 'VALIDATION_ERROR', details, requestId);
    this.name = 'RmsValidationError';
  }
}

export class RmsRateLimitError extends RmsApiError {
  public retryAfter?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    details?: any,
    requestId?: string
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details, requestId);
    this.name = 'RmsRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class RmsNetworkError extends RmsError {
  public originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'RmsNetworkError';
    this.originalError = originalError;
  }
}

export class RmsTimeoutError extends RmsNetworkError {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'RmsTimeoutError';
  }
}
