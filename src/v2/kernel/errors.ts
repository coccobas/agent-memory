export class V2Error extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'V2Error';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends V2Error {
  constructor(message: string, details?: Record<string, unknown>) {
    super('V2_VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends V2Error {
  constructor(message: string, details?: Record<string, unknown>) {
    super('V2_NOT_FOUND', message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends V2Error {
  constructor(message: string, details?: Record<string, unknown>) {
    super('V2_CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}
