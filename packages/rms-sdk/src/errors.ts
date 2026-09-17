export class RmsError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly details?: any;
  public readonly requestId?: string;

  constructor(message: string, code: string = 'RMS_ERROR', status?: number, details?: any, requestId?: string) {
    super(message);
    this.name = 'RmsError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, RmsError.prototype);
  }
}

export class RmsAuthError extends RmsError {
  constructor(message: string = 'Authentication failed: Invalid API credentials', details?: any, requestId?: string) {
    super(message, 'UNAUTHORIZED', 401, details, requestId);
    this.name = 'RmsAuthError';
    Object.setPrototypeOf(this, RmsAuthError.prototype);
  }
}

export class RmsPermissionError extends RmsError {
  constructor(message: string = 'Permission denied', details?: any, requestId?: string) {
    super(message, 'FORBIDDEN', 403, details, requestId);
    this.name = 'RmsPermissionError';
    Object.setPrototypeOf(this, RmsPermissionError.prototype);
  }
}

export class RmsNotFoundError extends RmsError {
  constructor(message: string = 'Resource not found', details?: any, requestId?: string) {
    super(message, 'NOT_FOUND', 404, details, requestId);
    this.name = 'RmsNotFoundError';
    Object.setPrototypeOf(this, RmsNotFoundError.prototype);
  }
}

export class RmsValidationError extends RmsError {
  constructor(message: string = 'Validation failed', details?: any, requestId?: string) {
    super(message, 'VALIDATION_ERROR', 400, details, requestId);
    this.name = 'RmsValidationError';
    Object.setPrototypeOf(this, RmsValidationError.prototype);
  }
}

export class RmsConflictError extends RmsError {
  constructor(message: string = 'Conflict: Idempotency or resource state mismatch', details?: any, requestId?: string) {
    super(message, 'CONFLICT', 409, details, requestId);
    this.name = 'RmsConflictError';
    Object.setPrototypeOf(this, RmsConflictError.prototype);
  }
}

export class RmsRateLimitError extends RmsError {
  public readonly retryAfterSeconds?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterSeconds?: number, details?: any, requestId?: string) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details, requestId);
    this.name = 'RmsRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, RmsRateLimitError.prototype);
  }
}

export class RmsServerError extends RmsError {
  constructor(message: string = 'Internal RMS Server Error', status: number = 500, details?: any, requestId?: string) {
    super(message, 'INTERNAL_ERROR', status, details, requestId);
    this.name = 'RmsServerError';
    Object.setPrototypeOf(this, RmsServerError.prototype);
  }
}
