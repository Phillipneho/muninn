/**
 * Exception classes for the Muninn SDK.
 */

/**
 * Base exception for all Muninn SDK errors.
 */
export class MuninnError extends Error {
  /** HTTP status code (if applicable) */
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MuninnError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, MuninnError.prototype);
  }
}

/**
 * Raised when authentication fails (invalid API key or JWT).
 */
export class MuninnAuthError extends MuninnError {
  constructor(message: string = 'Invalid API key or JWT') {
    super(message, 401);
    this.name = 'MuninnAuthError';
    Object.setPrototypeOf(this, MuninnAuthError.prototype);
  }
}

/**
 * Raised when usage limit is exceeded.
 */
export class MuninnRateLimitError extends MuninnError {
  constructor(message: string = 'Usage limit exceeded') {
    super(message, 429);
    this.name = 'MuninnRateLimitError';
    Object.setPrototypeOf(this, MuninnRateLimitError.prototype);
  }
}

/**
 * Raised when a requested resource is not found.
 */
export class MuninnNotFoundError extends MuninnError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    this.name = 'MuninnNotFoundError';
    Object.setPrototypeOf(this, MuninnNotFoundError.prototype);
  }
}

/**
 * Raised when the API returns a server error.
 */
export class MuninnServerError extends MuninnError {
  constructor(message: string = 'Internal server error') {
    super(message, 500);
    this.name = 'MuninnServerError';
    Object.setPrototypeOf(this, MuninnServerError.prototype);
  }
}

/**
 * Raised when request validation fails.
 */
export class MuninnValidationError extends MuninnError {
  constructor(message: string = 'Validation error') {
    super(message, 400);
    this.name = 'MuninnValidationError';
    Object.setPrototypeOf(this, MuninnValidationError.prototype);
  }
}

/**
 * Raised when connection to the API fails.
 */
export class MuninnConnectionError extends MuninnError {
  constructor(message: string = 'Failed to connect to Muninn API') {
    super(message, 0);
    this.name = 'MuninnConnectionError';
    Object.setPrototypeOf(this, MuninnConnectionError.prototype);
  }
}