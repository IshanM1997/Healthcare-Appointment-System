// src/utils/apiError.js
// A typed error for expected, user-facing failures (validation, not
// found, forbidden, etc). Anything thrown that ISN'T an ApiError is
// treated as an unexpected 500 by the error-handling middleware.

class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }
}

/**
 * Wraps an async Express handler so thrown errors / rejected promises
 * are forwarded to next() instead of crashing the process.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { ApiError, asyncHandler };
