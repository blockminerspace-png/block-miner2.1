/**
 * Typed HTTP errors for API responses (centralized monolith error surface).
 * Controllers/services throw these; the API error handler maps them to JSON + status.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super(400, "BAD_REQUEST", message, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", details?: Record<string, unknown>) {
    super(401, "UNAUTHORIZED", message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super(403, "FORBIDDEN", message, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found", details?: Record<string, unknown>) {
    super(404, "NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super(409, "CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export class ValidationError extends HttpError {
  constructor(message = "Validation failed", details?: Record<string, unknown>) {
    super(422, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class RateLimitedError extends HttpError {
  constructor(message = "Too many requests", details?: Record<string, unknown>) {
    super(429, "RATE_LIMITED", message, details);
    this.name = "RateLimitedError";
  }
}

export class InternalError extends HttpError {
  constructor(message = "Internal server error", details?: Record<string, unknown>) {
    super(500, "INTERNAL_ERROR", message, details);
    this.name = "InternalError";
  }
}
